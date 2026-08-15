import type { AssistantMessage } from "@earendil-works/pi-ai";
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";

type AssistantRender = typeof AssistantMessageComponent.prototype.render;
type AssistantUpdate = typeof AssistantMessageComponent.prototype.updateContent;
type EnabledCheck = () => boolean;

interface RenderState {
	originalMessage: AssistantMessage;
	renderedMessage: AssistantMessage;
	isStreaming: boolean;
}

interface RuntimeState {
	hasToolCalls: boolean;
	isStreaming: boolean;
}

interface RenderMethods {
	render: AssistantRender;
	update: AssistantUpdate;
}

interface PatchState {
	components: Map<AssistantMessageComponent, RenderState>;
	originals?: RenderMethods;
	patches?: RenderMethods;
}

export interface AssistantRenderPatch {
	install(): void;
	refresh(): void;
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
	const runtime = component as unknown as RuntimeState;
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
			const runtime = this as unknown as RuntimeState;
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
			});
			originals.update.call(this, renderedMessage, isStreaming);
		},
		render: function render(
			this: AssistantMessageComponent,
			...args: Parameters<AssistantRender>
		): string[] {
			return shouldHide(state, isEnabled, this)
				? []
				: originals.render.call(this, ...args);
		},
	};
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
		uninstall: () => uninstall(state),
	};
}
