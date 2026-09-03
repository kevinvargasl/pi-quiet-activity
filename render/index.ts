import { createAssistantRenderPatch } from "./assistant.ts";
import { createToolRenderPatch } from "./tool.ts";

export interface QuietRenderPatcher {
	install(): void;
	refresh(): void;
	finish(elapsed: string): void;
	uninstall(): void;
}

export function createQuietRenderPatcher(
	isEnabled: () => boolean,
): QuietRenderPatcher {
	const assistant = createAssistantRenderPatch(isEnabled);
	const tool = createToolRenderPatch(isEnabled);

	return {
		install() {
			assistant.install();
			tool.install();
		},
		refresh: () => assistant.refresh(),
		finish: (elapsed) => assistant.finish(elapsed),
		uninstall() {
			assistant.uninstall();
			tool.uninstall();
		},
	};
}
