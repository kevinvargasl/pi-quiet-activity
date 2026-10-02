import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mock } from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	AssistantMessageComponent,
	initTheme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { toolActivityLabel } from "../activity/labels.ts";
import { formatElapsedTime } from "../activity/timer.ts";
import quietActivity from "../index.ts";

type EventHandler = (event: unknown, ctx: TestContext) => unknown;

interface TestContext {
	mode: "tui" | "rpc" | "json" | "print";
	ui: {
		theme: { fg(name: string, text: string): string };
		setWorkingMessage(message?: string): void;
		setWorkingVisible(): void;
		setStatus(): never;
		notify(message: string): void;
	};
	isIdle(): boolean;
}

interface Harness {
	ctx: TestContext;
	events: Map<string, EventHandler>;
	state: { notification?: string; workingMessage?: string };
	toggle: (ctx: TestContext) => void;
	command: (args: string, ctx: TestContext) => Promise<void>;
}

interface RenderFixture {
	final: AssistantMessageComponent;
	finalMessage: AssistantMessage;
	process: AssistantMessageComponent;
	tool: ToolExecutionComponent;
}

function createHarness(): Harness {
	const events = new Map<string, EventHandler>();
	const state: Harness["state"] = {};
	let shortcutKey: string | undefined;
	let toggle: Harness["toggle"] | undefined;
	let command: Harness["command"] | undefined;
	const fakePi = {
		registerShortcut(key: string, options: { handler: Harness["toggle"] }) {
			shortcutKey = key;
			toggle = options.handler;
		},
		registerCommand(_name: string, options: { handler: Harness["command"] }) {
			command = options.handler;
		},
		on(name: string, handler: EventHandler) {
			events.set(name, handler);
		},
	} as unknown as ExtensionAPI;
	const ctx: TestContext = {
		mode: "tui",
		ui: {
			theme: { fg: (_name, text) => text },
			setWorkingMessage: (message) => {
				state.workingMessage = message;
			},
			setWorkingVisible() {},
			setStatus(): never {
				throw new Error("quiet activity must not use the footer");
			},
			notify: (message) => {
				state.notification = message;
			},
		},
		isIdle: () => true,
	};

	quietActivity(fakePi);
	assert.equal(shortcutKey, "f9");
	assert(toggle);
	assert(command);
	return { ctx, events, state, toggle, command };
}

function emit(harness: Harness, name: string, event: unknown = {}): unknown {
	return harness.events.get(name)?.(event, harness.ctx);
}

function assertSafeActivityLabels(): void {
	const label = toolActivityLabel("bash", {
		command: "API_KEY=supersecret curl https://example.test?token=abc\u001b[2J",
	});
	assert.doesNotMatch(label, /supersecret|abc|\u001b/);
	assert.match(label, /\[redacted\]/);

	assert.equal(
		toolActivityLabel("mcp", { server: "context7" }),
		"Using MCP context7",
	);
	assert.equal(
		toolActivityLabel("mcp", {
			server: "context7",
			tool: "resolve-library-id",
		}),
		"Calling MCP context7/resolve-library-id",
	);
	assert.equal(
		toolActivityLabel("mcp", { tool: "context7_resolve_library_id" }),
		"Calling MCP context7_resolve_library_id",
	);
}

function assertElapsedTimeFormatting(): void {
	assert.equal(formatElapsedTime(45_999), "45s");
	assert.equal(formatElapsedTime(83_000), "1m 23s");
	assert.equal(formatElapsedTime(7_920_000), "2h 12m");
}

function assertFinalResponsePrompt(harness: Harness): void {
	const result = emit(harness, "before_agent_start", {
		systemPrompt: "base prompt",
	}) as { systemPrompt: string };
	assert.match(result.systemPrompt, /^base prompt\n\n/);
	assert.match(result.systemPrompt, /self-contained final response/);
	assert.match(result.systemPrompt, /earlier tool-calling turns/);

	const event = {
		systemPrompt: "base prompt",
		systemPromptOptions: { sections: { another_extension: "Keep me" } as Record<string, string> },
	};
	assert.equal(emit(harness, "before_agent_start", event), undefined);
	assert.equal(event.systemPrompt, "base prompt");
	assert.equal(event.systemPromptOptions.sections.another_extension, "Keep me");
	assert.match(event.systemPromptOptions.sections.quiet_activity!, /self-contained final response/);
	const sections = { ...event.systemPromptOptions.sections };
	emit(harness, "before_agent_start", event);
	assert.deepEqual(event.systemPromptOptions.sections, sections);

	for (const mode of ["rpc", "json", "print"] as const) {
		harness.ctx.mode = mode;
		emit(harness, "before_agent_start", event);
		assert.deepEqual(event.systemPromptOptions.sections, { another_extension: "Keep me" });
		assert.equal(emit(harness, "before_agent_start", { systemPrompt: "base" }), undefined);
	}
	harness.ctx.mode = "tui";
}

function assertActivityDisplay(harness: Harness): void {
	// Labels without the optional timer retain their previous format.
	void harness.command("timer off", harness.ctx);
	emit(harness, "agent_start");
	assert.equal(harness.state.workingMessage, "Working");

	emit(harness, "tool_execution_start", {
		toolCallId: "read-1",
		toolName: "read",
		args: { path: "abc.ts" },
	});
	assert.equal(harness.state.workingMessage, "Reading abc.ts...");

	emit(harness, "tool_execution_start", {
		toolCallId: "write-1",
		toolName: "write",
		args: { path: "1234.csv" },
	});
	assert.equal(harness.state.workingMessage, "Writing 1234.csv...");

	emit(harness, "tool_execution_start", {
		toolCallId: "mcp-1",
		toolName: "mcp",
		args: { server: "context7", tool: "resolve-library-id" },
	});
	assert.equal(
		harness.state.workingMessage,
		"Calling MCP context7/resolve-library-id...",
	);

	emit(harness, "tool_execution_end", { toolCallId: "mcp-1" });
	assert.equal(harness.state.workingMessage, "Writing 1234.csv...");
	emit(harness, "tool_execution_end", { toolCallId: "write-1" });
	emit(harness, "tool_execution_end", { toolCallId: "read-1" });
	assert.equal(harness.state.workingMessage, "Working");
	void harness.command("timer on", harness.ctx);
}

function assertLiveTimer(): void {
	mock.timers.enable({ apis: ["Date", "setInterval"], now: 1000 });
	const harness = createHarness();
	const configPath = join(
		process.env.PI_CODING_AGENT_DIR!,
		"extension-data",
		"quiet-activity",
		"config.json",
	);
	const config = () => JSON.parse(readFileSync(configPath, "utf8"));
	let updates = 0;
	const setWorkingMessage = harness.ctx.ui.setWorkingMessage;
	harness.ctx.ui.setWorkingMessage = (message) => {
		updates += 1;
		setWorkingMessage(message);
	};
	function tickWithoutUpdates(ms: number): void {
		const previous = updates;
		mock.timers.tick(ms);
		assert.equal(updates, previous, "stopped timers must not update the UI");
	}
	try {
		emit(harness, "session_start");
		assert.equal(harness.state.workingMessage, "Working");
		tickWithoutUpdates(1000);
		assert.equal(harness.state.workingMessage, "Working");
		emit(harness, "agent_start");
		assert.equal(harness.state.workingMessage, "(0s) Working");
		mock.timers.tick(2000);
		assert.equal(harness.state.workingMessage, "(2s) Working");
		emit(harness, "tool_execution_start", {
			toolCallId: "read-timer",
			toolName: "read",
			args: { path: "abc.ts" },
		});
		mock.timers.tick(1000);
		assert.equal(harness.state.workingMessage, "(3s) Reading abc.ts...");
		emit(harness, "tool_execution_end", { toolCallId: "read-timer" });
		assert.equal(harness.state.workingMessage, "(3s) Working");
		emit(harness, "agent_start");
		mock.timers.tick(1000);
		assert.equal(harness.state.workingMessage, "(4s) Working");

		void harness.command("timer off", harness.ctx);
		assert.equal(config().timerEnabled, false);
		assert.equal(config().enabled, true);
		assert.equal(harness.state.workingMessage, "Working");
		tickWithoutUpdates(1000);
		assert.equal(harness.state.workingMessage, "Working");
		const reloaded = createHarness();
		void reloaded.command("timer status", reloaded.ctx);
		assert.match(reloaded.state.notification!, /timer is off/);
		void harness.command("off", harness.ctx);
		assert.equal(config().timerEnabled, false);
		void harness.command("on", harness.ctx);
		assert.equal(harness.state.workingMessage, "Working");
		void harness.command("timer", harness.ctx);
		assert.equal(harness.state.workingMessage, "(5s) Working");
		assert.equal(config().timerEnabled, true);
		void harness.command("timer toggle", harness.ctx);
		assert.equal(harness.state.workingMessage, "Working");
		void harness.command("timer on", harness.ctx);
		void harness.command("off", harness.ctx);
		tickWithoutUpdates(1000);
		assert.equal(harness.state.workingMessage, undefined);
		void harness.command("on", harness.ctx);
		assert.equal(harness.state.workingMessage, "(6s) Working");
		void harness.command("timer invalid", harness.ctx);
		assert.match(harness.state.notification!, /Usage:/);
		assert.equal(config().timerEnabled, true);

		emit(harness, "agent_settled");
		tickWithoutUpdates(2000);
		assert.equal(harness.state.workingMessage, undefined);
		emit(harness, "agent_start");
		assert.equal(harness.state.workingMessage, "(0s) Working");
		mock.timers.tick(83_000);
		assert.equal(harness.state.workingMessage, "(1m 23s) Working");
		emit(harness, "session_shutdown");
		tickWithoutUpdates(2000);
		assert.equal(harness.state.workingMessage, undefined);
	} finally {
		emit(harness, "session_shutdown");
		mock.timers.reset();
	}
}

function assistantMessage(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"],
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "test",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

function assertQuietRendering(): RenderFixture {
	const finalMessage = assistantMessage(
		[
			{ type: "text", text: "full response first paragraph" },
			{ type: "thinking", thinking: "secret process" },
			{ type: "text", text: "final answer" },
		],
		"stop",
	);
	const processMessage = assistantMessage(
		[
			{ type: "text", text: "intermediate narration" },
			{ type: "toolCall", id: "call-1", name: "smoke_tool", arguments: {} },
		],
		"toolUse",
	);

	const final = new AssistantMessageComponent(finalMessage);
	const finalRendered = final.render(100).join("\n");
	assert.match(finalRendered, /full response first paragraph/);
	assert.match(finalRendered, /final answer/);
	assert.doesNotMatch(finalRendered, /secret process/);
	// Pi 1.0 rebuilds content on invalidation, thinking visibility, and padding
	// changes. Quiet mode must keep the original message for normal rendering.
	for (const padding of [0, 1]) {
		final.setOutputPad(padding);
		for (const hideThinking of [true, false]) {
			final.setHideThinkingBlock(hideThinking);
			final.invalidate();
			for (const width of [24, 100]) {
				const rendered = final.render(width).join("\n");
				assert.match(rendered, /final answer/);
				assert.doesNotMatch(rendered, /secret process|Thinking\.\.\./);
			}
		}
	}
	assert(finalMessage.content.some((part) => part.type === "thinking"));
	final.updateContent(finalMessage, true);
	final.invalidate();
	assert.deepEqual(final.render(100), []);
	final.updateContent(finalMessage, false);

	const processComponent = new AssistantMessageComponent(processMessage);
	assert.deepEqual(processComponent.render(100), []);
	const tool = new ToolExecutionComponent(
		"smoke_tool",
		"call-1",
		{},
		undefined,
		undefined,
		{ requestRender() {} } as never,
		process.cwd(),
	);
	assert.deepEqual(tool.render(100), []);
	return { final, finalMessage, process: processComponent, tool };
}

function assertToggle(harness: Harness, fixture: RenderFixture): void {
	harness.toggle(harness.ctx);
	assert.equal(harness.state.notification, undefined);
	const event = {
		systemPromptOptions: { sections: { quiet_activity: "old instruction", other: "Keep" } },
	};
	assert.equal(emit(harness, "before_agent_start", event), undefined);
	assert.deepEqual(event.systemPromptOptions.sections, { other: "Keep" });
	assert.equal(
		emit(harness, "before_agent_start", { systemPrompt: "base prompt" }),
		undefined,
	);
	assert(fixture.process.render(100).length > 0);
	assert(fixture.tool.render(100).length > 0);
	assert.match(fixture.final.render(100).join("\n"), /secret process/);

	harness.toggle(harness.ctx);
	assert.equal(harness.state.notification, undefined);
	assert.deepEqual(fixture.tool.render(100), []);

	for (const args of ["off", "on", "toggle", ""]) {
		void harness.command(args, harness.ctx);
		assert.equal(harness.state.notification, undefined);
	}
	void harness.command("status", harness.ctx);
	assert.match(harness.state.notification!, /Quiet activity is enabled/);
}

function assertReloadRestoresElapsed(fixture: RenderFixture): void {
	// Pi rebuilds transcript components after shutdown and before the reloaded
	// extension receives session_start.
	const restoredFinal = new AssistantMessageComponent(fixture.finalMessage);
	const reloaded = createHarness();
	emit(reloaded, "session_start", { reason: "reload" });
	assert.match(restoredFinal.render(100).join("\n"), /^Worked for 1m 23s\n/);
	emit(reloaded, "session_shutdown", { reason: "reload" });
}

function assertNonTuiLifecycle(): void {
	const originalRender = AssistantMessageComponent.prototype.render;
	const originalUpdate = AssistantMessageComponent.prototype.updateContent;
	const originalToolRender = ToolExecutionComponent.prototype.render;

	for (const mode of ["rpc", "json", "print"] as const) {
		const harness = createHarness();
		harness.ctx.mode = mode;
		harness.ctx.ui.setWorkingMessage = () => {
			throw new Error(`must not change the working indicator in ${mode} mode`);
		};
		harness.ctx.ui.setWorkingVisible = () => {
			throw new Error(`must not change the working indicator in ${mode} mode`);
		};
		emit(harness, "session_start");
		emit(harness, "agent_start");
		emit(harness, "tool_execution_start", {
			toolCallId: "read-1",
			toolName: "read",
			args: { path: "abc.ts" },
		});
		emit(harness, "tool_execution_end", { toolCallId: "read-1" });
		emit(harness, "agent_settled");
		assert.equal(AssistantMessageComponent.prototype.render, originalRender);
		assert.equal(AssistantMessageComponent.prototype.updateContent, originalUpdate);
		assert.equal(ToolExecutionComponent.prototype.render, originalToolRender);
		emit(harness, "session_shutdown");
	}
}

export default function smokeTest(_pi: ExtensionAPI): void {
	initTheme();
	assertNonTuiLifecycle();
	assertSafeActivityLabels();
	assertElapsedTimeFormatting();
	assertLiveTimer();
	const harness = createHarness();
	emit(harness, "session_start");
	assertActivityDisplay(harness);
	assertFinalResponsePrompt(harness);
	const fixture = assertQuietRendering();
	const now = Date.now;
	try {
		Date.now = () => now() + 83_000;
		// Pi can start another low-level run before the final settled event.
		emit(harness, "agent_start");
		emit(harness, "agent_settled");
		assert.match(fixture.final.render(100).join("\n"), /^Worked for 1m 23s\n/);
	} finally {
		Date.now = now;
	}
	assertToggle(harness, fixture);
	emit(harness, "session_shutdown", { reason: "reload" });
	assert(fixture.tool.render(100).length > 0);
	assert.doesNotMatch(fixture.final.render(100).join("\n"), /^Worked for /);
	assertReloadRestoresElapsed(fixture);
}
