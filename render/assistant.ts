import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";

type AssistantRender = typeof AssistantMessageComponent.prototype.render;
type AssistantUpdate = typeof AssistantMessageComponent.prototype.updateContent;
type EnabledCheck = () => boolean;

const ELAPSED_METADATA = Symbol.for("pi-quiet-activity.elapsed");

interface RenderState {
	originalMessage: AssistantMessage;
	renderedMessage: AssistantMessage;
	isStreaming: boolean;
	elapsed?: string;
}

interface RuntimeState {
	hasToolCalls: boolean;
	isStreaming: boolean;
	lastMessage?: AssistantMessage;
	[ELAPSED_METADATA]?: string;
}

type ElapsedMessage = AssistantMessage & {
	[ELAPSED_METADATA]?: string;
};

interface RenderMethods {
	render: AssistantRender;
	update: AssistantUpdate;
}

interface PatchState {
	components: Map<AssistantMessageComponent, RenderState>;
	originals?: RenderMethods;
	patches?: RenderMethods;
}

function getRuntimeState(component: AssistantMessageComponent): RuntimeState {
	// SAFETY: Pi's AssistantMessageComponent owns these runtime fields; the symbol
	// metadata is private to this extension and does not overlap Pi's properties.
	return component as unknown as RuntimeState;
}

function getMessageElapsed(message?: AssistantMessage): string | undefined {
	return (message as ElapsedMessage | undefined)?.[ELAPSED_METADATA];
}

function getElapsed(component: AssistantMessageComponent): string | undefined {
	const runtime = getRuntimeState(component);
	return runtime[ELAPSED_METADATA] ?? getMessageElapsed(runtime.lastMessage);
}

function setElapsed(
	component: AssistantMessageComponent,
	message: AssistantMessage,
	elapsed: string,
): void {
	getRuntimeState(component)[ELAPSED_METADATA] = elapsed;
	(message as ElapsedMessage)[ELAPSED_METADATA] = elapsed;
}

export interface AssistantRenderPatch {
	install(): void;
	refresh(): void;
	finish(elapsed: string): void;
	uninstall(): void;
}

function removeThinking(message: AssistantMessage): AssistantMessage {
	if (!message.content.some((part) => part.type === "thinking")) return message;
	return {
		...message,
		content: message.content.filter((part) => part.type !== "thinking"),
	};
}

function shouldHide(
	state: PatchState,
	isEnabled: EnabledCheck,
	component: AssistantMessageComponent,
): boolean {
	if (!isEnabled()) return false;
	const runtime = getRuntimeState(component);
	const isStreaming =
		state.components.get(component)?.isStreaming ?? runtime.isStreaming;
	return isStreaming || runtime.hasToolCalls;
}

function createPatches(
	state: PatchState,
	isEnabled: EnabledCheck,
	originals: RenderMethods,
): RenderMethods {
	return {
		update: function updateContent(
			this: AssistantMessageComponent,
			...args: Parameters<AssistantUpdate>
		): void {
			const [message, requestedStreaming] = args;
			const runtime = getRuntimeState(this);
			const previous = state.components.get(this);
			const originalMessage =
				message === previous?.renderedMessage ? previous.originalMessage : message;
			const isStreaming = requestedStreaming ?? runtime.isStreaming;
			const renderedMessage = isEnabled()
				? removeThinking(originalMessage)
				: originalMessage;

			state.components.set(this, {
				originalMessage,
				renderedMessage,
				isStreaming,
				elapsed: previous?.elapsed ?? getElapsed(this),
			});
			originals.update.call(this, renderedMessage, isStreaming);
		},
		render: function render(
			this: AssistantMessageComponent,
			...args: Parameters<AssistantRender>
		): string[] {
			if (shouldHide(state, isEnabled, this)) return [];
			const lines = originals.render.call(this, ...args);
			const elapsed = state.components.get(this)?.elapsed ?? getElapsed(this);
			return isEnabled() && elapsed ? [elapsed, ...lines] : lines;
		},
	};
}

function finish(state: PatchState, elapsed: string): void {
	const entries = Array.from(state.components.entries());
	for (let index = entries.length - 1; index >= 0; index -= 1) {
		const [component, renderState] = entries[index];
		const runtime = getRuntimeState(component);
		if (renderState.isStreaming || runtime.hasToolCalls) continue;
		renderState.elapsed = elapsed;
		setElapsed(component, renderState.originalMessage, elapsed);
		state.originals?.update.call(
			component,
			renderState.renderedMessage,
			renderState.isStreaming,
		);
		return;
	}
}

function install(state: PatchState, isEnabled: EnabledCheck): void {
	if (state.originals) return;

	const prototype = AssistantMessageComponent.prototype;
	const originals = {
		render: prototype.render,
		update: prototype.updateContent,
	};
	const patches = createPatches(state, isEnabled, originals);
	state.originals = originals;
	state.patches = patches;
	prototype.updateContent = patches.update;
	prototype.render = patches.render;
}

function refresh(state: PatchState, isEnabled: EnabledCheck): void {
	const update = state.originals?.update;
	if (!update) return;

	for (const [component, renderState] of state.components) {
		renderState.renderedMessage = isEnabled()
			? removeThinking(renderState.originalMessage)
			: renderState.originalMessage;
		update.call(component, renderState.renderedMessage, renderState.isStreaming);
	}
}

function uninstall(state: PatchState): void {
	const { originals, patches } = state;
	if (!originals || !patches) return;

	try {
		for (const [component, renderState] of state.components) {
			originals.update.call(
				component,
				renderState.originalMessage,
				renderState.isStreaming,
			);
		}
	} finally {
		const prototype = AssistantMessageComponent.prototype;
		if (prototype.updateContent === patches.update)
			prototype.updateContent = originals.update;
		if (prototype.render === patches.render) prototype.render = originals.render;

		state.components.clear();
		state.originals = undefined;
		state.patches = undefined;
	}
}

export function createAssistantRenderPatch(
	isEnabled: EnabledCheck,
): AssistantRenderPatch {
	const state: PatchState = { components: new Map() };
	return {
		install: () => install(state, isEnabled),
		refresh: () => refresh(state, isEnabled),
		finish: (elapsed) => finish(state, elapsed),
		uninstall: () => uninstall(state),
	};
}
