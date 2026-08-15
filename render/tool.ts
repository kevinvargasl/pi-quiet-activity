import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";

type ToolRender = typeof ToolExecutionComponent.prototype.render;

export interface ToolRenderPatch {
	install(): void;
	uninstall(): void;
}

export function createToolRenderPatch(
	isEnabled: () => boolean,
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
				return isEnabled() ? [] : (original?.call(this, ...args) ?? []);
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
