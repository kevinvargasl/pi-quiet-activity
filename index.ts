import type {
	AgentStartEvent,
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	SessionShutdownEvent,
	SessionStartEvent,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	createActivityDisplay,
	type ActivityDisplay,
} from "./activity/display.ts";
import { formatElapsedTime } from "./activity/timer.ts";
import {
	createQuietRenderPatcher,
	type QuietRenderPatcher,
} from "./render/index.ts";

const SHORTCUT = "f9";
const FINAL_RESPONSE_INSTRUCTION =
	"Quiet activity hides text from assistant turns that call tools. After tool use finishes, provide a self-contained final response. Repeat any result or explanation the user needs from earlier tool-calling turns.";
const CONFIG_PATH = join(
	process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent"),
	"extension-data",
	"quiet-activity",
	"config.json",
);

type QuietMode = "enabled" | "disabled";

interface QuietState {
	mode: { current: QuietMode };
	timer: { enabled: boolean };
	activity: ActivityDisplay;
	renderer: QuietRenderPatcher;
	startedAt?: number;
}

function loadSettings(): { mode: QuietMode; timerEnabled: boolean } {
	try {
		const config = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as {
			enabled?: unknown;
			timerEnabled?: unknown;
		};
		return {
			mode: config.enabled === false ? "disabled" : "enabled",
			timerEnabled: config.timerEnabled !== false,
		};
	} catch {
		return { mode: "enabled", timerEnabled: true };
	}
}

function saveSettings(state: QuietState): boolean {
	try {
		mkdirSync(dirname(CONFIG_PATH), { recursive: true });
		const settings = {
			enabled: state.mode.current === "enabled",
			timerEnabled: state.timer.enabled,
		};
		writeFileSync(
			CONFIG_PATH,
			`${JSON.stringify(settings, null, 2)}\n`,
			"utf8",
		);
		return true;
	} catch {
		return false;
	}
}

function createState(): QuietState {
	const settings = loadSettings();
	const mode = { current: settings.mode };
	const timer = { enabled: settings.timerEnabled };
	const isEnabled = () => mode.current === "enabled";
	return {
		mode,
		timer,
		activity: createActivityDisplay(isEnabled, () => timer.enabled),
		renderer: createQuietRenderPatcher(isEnabled),
	};
}

function changeMode(
	state: QuietState,
	mode: QuietMode,
	ctx: ExtensionContext,
): void {
	state.mode.current = mode;
	state.renderer.refresh();
	state.activity.refresh(ctx);

	if (!saveSettings(state)) {
		ctx.ui.notify(`Could not save ${CONFIG_PATH}`, "warning");
	}
}

function toggle(state: QuietState, ctx: ExtensionContext): void {
	changeMode(
		state,
		state.mode.current === "enabled" ? "disabled" : "enabled",
		ctx,
	);
}

function handleCommand(
	state: QuietState,
	args: string,
	ctx: ExtensionContext,
): void {
	const command = args.trim().toLowerCase();
	if (command === "timer" || command.startsWith("timer ")) {
		handleTimerCommand(state, command.slice(5).trim(), ctx);
		return;
	}
	switch (command || "toggle") {
		case "status":
			ctx.ui.notify(
				`Quiet activity is ${state.mode.current}. Timer is ${state.timer.enabled ? "on" : "off"}. Toggle: ${SHORTCUT}`,
			);
			return;
		case "on":
			changeMode(state, "enabled", ctx);
			return;
		case "off":
			changeMode(state, "disabled", ctx);
			return;
		case "toggle":
			toggle(state, ctx);
			return;
		default:
			ctx.ui.notify(
				"Usage: /quiet-activity [on|off|toggle|status|timer [on|off|toggle|status]]",
				"warning",
			);
	}
}

function handleTimerCommand(
	state: QuietState,
	args: string,
	ctx: ExtensionContext,
): void {
	switch (args || "toggle") {
		case "status":
			ctx.ui.notify(
				`Quiet activity timer is ${state.timer.enabled ? "on" : "off"}.`,
			);
			return;
		case "on":
			state.timer.enabled = true;
			break;
		case "off":
			state.timer.enabled = false;
			break;
		case "toggle":
			state.timer.enabled = !state.timer.enabled;
			break;
		default:
			ctx.ui.notify(
				"Usage: /quiet-activity timer [on|off|toggle|status]",
				"warning",
			);
			return;
	}
	state.activity.refresh(ctx);
	if (!saveSettings(state)) {
		ctx.ui.notify(`Could not save ${CONFIG_PATH}`, "warning");
	}
}

function register(pi: ExtensionAPI, state: QuietState): void {
	pi.registerShortcut(SHORTCUT, {
		description: "Toggle quiet activity / normal agent output",
		handler: (ctx: ExtensionContext) => toggle(state, ctx),
	});
	pi.registerCommand("quiet-activity", {
		description:
			"Control quiet display or live timer: on, off, toggle, or status",
		handler: (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			handleCommand(state, args, ctx);
			return Promise.resolve();
		},
	});
	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		if (ctx.mode === "tui") state.renderer.install();
		state.activity.reset(ctx);
	});
	pi.on(
		"before_agent_start",
		(event: BeforeAgentStartEvent, ctx: ExtensionContext) => {
			const enabled = ctx.mode === "tui" && state.mode.current === "enabled";
			// Structured sections preserve Pi's transcript-backed prompt updates and
			// cached prefixes instead of forcing a replacement of the whole prompt.
			const sections = event.systemPromptOptions?.sections;
			if (sections) {
				if (enabled) {
					sections.quiet_activity = FINAL_RESPONSE_INSTRUCTION;
				} else {
					delete sections.quiet_activity;
				}
				return;
			}
			// Compatibility with Pi versions predating structured prompt options.
			if (enabled) {
				return {
					systemPrompt: `${event.systemPrompt}\n\n${FINAL_RESPONSE_INSTRUCTION}`,
				};
			}
		},
	);
	pi.on("agent_start", (_event: AgentStartEvent, ctx: ExtensionContext) => {
		// Retries and boundary-requested continuations belong to the same run.
		state.startedAt ??= Date.now();
		state.activity.reset(ctx, state.startedAt);
	});
	pi.on(
		"tool_execution_start",
		(event: ToolExecutionStartEvent, ctx: ExtensionContext) =>
			state.activity.start(event, ctx),
	);
	pi.on(
		"tool_execution_end",
		(event: ToolExecutionEndEvent, ctx: ExtensionContext) =>
			state.activity.end(event, ctx),
	);
	pi.on("agent_settled", (_event, ctx) => {
		state.activity.clear(ctx);
		if (state.startedAt === undefined) return;
		const elapsed = formatElapsedTime(Date.now() - state.startedAt);
		state.renderer.finish(ctx.ui.theme.fg("dim", `Worked for ${elapsed}`));
		state.startedAt = undefined;
	});
	pi.on(
		"session_shutdown",
		(_event: SessionShutdownEvent, ctx: ExtensionContext) => {
			state.activity.restore(ctx);
			state.renderer.uninstall();
			state.startedAt = undefined;
		},
	);
}

export default function quietActivityExtension(pi: ExtensionAPI): void {
	register(pi, createState());
}
