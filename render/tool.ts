import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { LiveRun } from "./live.ts";

type ToolRender = typeof ToolExecutionComponent.prototype.render;

export interface ToolRenderPatch {
	install(): void;
	uninstall(): void;
}

function getToolCallId(component: ToolExecutionComponent): string {
	// SAFETY: Pi's ToolExecutionComponent stores the call id in this runtime
	// field; the extension only reads it.
	return (component as unknown as { toolCallId: string }).toolCallId;
}

export function createToolRenderPatch(
	isEnabled: () => boolean,
	live: LiveRun,
): ToolRenderPatch {
	let original: ToolRender | undefined;
	let patch: ToolRender | undefined;

	return {
		install() {
			if (original) return;
			const prototype = ToolExecutionComponent.prototype;
			original = prototype.render;
			patch = function render(
				this: ToolExecutionComponent,
				...args: Parameters<ToolRender>
			): string[] {
				const hidden = isEnabled() && !live.showsToolCall(getToolCallId(this));
				return hidden ? [] : (original?.call(this, ...args) ?? []);
			};
			prototype.render = patch;
		},
		uninstall() {
			if (original && patch && ToolExecutionComponent.prototype.render === patch) {
				ToolExecutionComponent.prototype.render = original;
			}
			original = undefined;
			patch = undefined;
		},
	};
}
