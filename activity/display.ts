import type {
	ExtensionContext,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { toolActivityLabel } from "./labels.ts";
import { formatElapsedTime } from "./timer.ts";

export interface ActivityDisplay {
	reset(ctx: ExtensionContext, startedAt?: number): void;
	clear(ctx: ExtensionContext): void;
	start(event: ToolExecutionStartEvent, ctx: ExtensionContext): void;
	end(event: ToolExecutionEndEvent, ctx: ExtensionContext): void;
	refresh(ctx: ExtensionContext): void;
	restore(ctx: ExtensionContext): void;
}

export function createActivityDisplay(
	isEnabled: () => boolean,
	isTimerEnabled: () => boolean,
): ActivityDisplay {
	const active = new Map<string, string>();
	let startedAt: number | undefined;
	let interval: ReturnType<typeof setInterval> | undefined;

	function stopTimer(): void {
		if (interval !== undefined) clearInterval(interval);
		interval = undefined;
	}

	function text(): string {
		const activity = Array.from(active.values()).at(-1);
		let label = "Working";
		if (activity) {
			label = activity.endsWith("...") ? activity : `${activity}...`;
		}
		return isTimerEnabled() && startedAt !== undefined
			? `(${formatElapsedTime(Date.now() - startedAt)}) ${label}`
			: label;
	}

	function refresh(ctx: ExtensionContext): void {
		const shouldTick =
			ctx.mode === "tui" &&
			isEnabled() &&
			isTimerEnabled() &&
			startedAt !== undefined;
		if (!shouldTick) {
			stopTimer();
		} else if (interval === undefined) {
			interval = setInterval(() => refresh(ctx), 1000);
			interval.unref();
		}
		if (ctx.mode !== "tui") return;
		ctx.ui.setWorkingMessage(isEnabled() ? text() : undefined);
		ctx.ui.setWorkingVisible(true);
	}

	return {
		reset(ctx, runStartedAt) {
			stopTimer();
			startedAt = runStartedAt;
			active.clear();
			refresh(ctx);
		},
		clear(ctx) {
			active.clear();
			startedAt = undefined;
			stopTimer();
			if (ctx.mode === "tui") ctx.ui.setWorkingMessage();
		},
		start(event, ctx) {
			active.delete(event.toolCallId);
			active.set(event.toolCallId, toolActivityLabel(event.toolName, event.args));
			refresh(ctx);
		},
		end(event, ctx) {
			active.delete(event.toolCallId);
			refresh(ctx);
		},
		refresh,
		restore(ctx) {
			active.clear();
			startedAt = undefined;
			stopTimer();
			if (ctx.mode !== "tui") return;
			ctx.ui.setWorkingMessage();
			ctx.ui.setWorkingVisible(true);
		},
	};
}
