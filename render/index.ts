import { createAssistantRenderPatch } from "./assistant.ts";
import { createLiveRun } from "./live.ts";
import { createToolRenderPatch } from "./tool.ts";

export interface QuietRenderPatcher {
	install(): void;
	refresh(): void;
	startRun(startedAt: number): void;
	foldRun(): void;
	finish(elapsed: string): void;
	uninstall(): void;
}

export function createQuietRenderPatcher(
	isEnabled: () => boolean,
	isLiveEnabled: () => boolean,
): QuietRenderPatcher {
	const live = createLiveRun(isLiveEnabled);
	const assistant = createAssistantRenderPatch(isEnabled, live);
	const tool = createToolRenderPatch(isEnabled, live);

	return {
		install() {
			assistant.install();
			tool.install();
		},
		refresh: () => assistant.refresh(),
		startRun: (startedAt) => live.start(startedAt),
		foldRun() {
			live.end();
			assistant.refresh();
		},
		finish: (elapsed) => assistant.finish(elapsed),
		uninstall() {
			assistant.uninstall();
			tool.uninstall();
			live.end();
		},
	};
}
