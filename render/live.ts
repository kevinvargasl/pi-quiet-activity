import type { AssistantMessage } from "@earendil-works/pi-ai";

export interface LiveRun {
	start(startedAt: number): void;
	end(): void;
	track(message: AssistantMessage): void;
	showsMessage(message: AssistantMessage): boolean;
	showsToolCall(toolCallId: string): boolean;
}

// Pi rebuilds transcript components after compaction, so the run is matched by
// message timestamp and tool call id instead of component identity.
export function createLiveRun(isLiveEnabled: () => boolean): LiveRun {
	let since: number | undefined;
	const toolCallIds = new Set<string>();
	const includes = (message: AssistantMessage) =>
		since !== undefined && message.timestamp >= since;

	return {
		start(startedAt) {
			// A cancelled or failed run stays open and folds with the next
			// completed run.
			since ??= startedAt;
		},
		end() {
			since = undefined;
			toolCallIds.clear();
		},
		track(message) {
			if (!includes(message)) return;
			for (const part of message.content) {
				if (part.type === "toolCall") toolCallIds.add(part.id);
			}
		},
		showsMessage: (message) => isLiveEnabled() && includes(message),
		showsToolCall: (toolCallId) =>
			isLiveEnabled() && toolCallIds.has(toolCallId),
	};
}
