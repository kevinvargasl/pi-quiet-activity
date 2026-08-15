import type {
	ExtensionContext,
	ToolExecutionEndEvent,
	ToolExecutionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { toolActivityLabel } from "./labels.ts";

export interface ActivityDisplay {
	reset(ctx: ExtensionContext): void;
	clear(): void;
	start(event: ToolExecutionStartEvent, ctx: ExtensionContext): void;
	end(event: ToolExecutionEndEvent, ctx: ExtensionContext): void;
	refresh(ctx: ExtensionContext): void;
	restore(ctx: ExtensionContext): void;
}

export function createActivityDisplay(
	isEnabled: () => boolean,
): ActivityDisplay {
	const active = new Map<string, string>();

	function text(): string {
		const activity = Array.from(active.values()).at(-1);
		if (!activity) return "Working...";
		return `${activity}${activity.endsWith("...") ? "" : "..."}`;
	}

	function refresh(ctx: ExtensionContext): void {
		if (ctx.mode !== "tui") return;
		ctx.ui.setWorkingMessage(isEnabled() ? text() : undefined);
		ctx.ui.setWorkingVisible(true);
	}

	return {
		reset(ctx) {
			active.clear();
			refresh(ctx);
		},
		clear: () => active.clear(),
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
			if (ctx.mode !== "tui") return;
			ctx.ui.setWorkingMessage();
			ctx.ui.setWorkingVisible(true);
		},
	};
}
