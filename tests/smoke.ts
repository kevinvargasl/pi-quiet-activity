import assert from "node:assert/strict";
import type { AssistantMessage } from "../node_modules/@earendil-works/pi-ai/dist/types.d.ts";
import type { ExtensionAPI } from "../node_modules/@earendil-works/pi-coding-agent/dist/index.d.ts";
import {
	AssistantMessageComponent,
	initTheme,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { toolActivityLabel } from "../activity/labels.ts";
import quietActivity from "../index.ts";

type EventHandler = (event: unknown, ctx: TestContext) => unknown;

interface TestContext {
	mode: "tui";
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
}

interface RenderFixture {
	process: AssistantMessageComponent;
	tool: ToolExecutionComponent;
}

function createHarness(): Harness {
	const events = new Map<string, EventHandler>();
	const state: Harness["state"] = {};
	let shortcutKey: string | undefined;
	let toggle: Harness["toggle"] | undefined;
	const fakePi = {
		registerShortcut(key: string, options: { handler: Harness["toggle"] }) {
			shortcutKey = key;
			toggle = options.handler;
		},
		registerCommand() {},
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
	return { ctx, events, state, toggle };
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
}

function assertFinalResponsePrompt(harness: Harness): void {
	const result = emit(harness, "before_agent_start", {
		systemPrompt: "base prompt",
	}) as { systemPrompt: string };
	assert.match(result.systemPrompt, /^base prompt\n\n/);
	assert.match(result.systemPrompt, /self-contained final response/);
	assert.match(result.systemPrompt, /earlier tool-calling turns/);
}

function assertActivityDisplay(harness: Harness): void {
	emit(harness, "agent_start");
	assert.equal(harness.state.workingMessage, "Working...");

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
		toolName: "mcp_call",
		args: { tool: "some-tool" },
	});
	assert.equal(harness.state.workingMessage, "Calling some-tool...");

	emit(harness, "tool_execution_end", { toolCallId: "mcp-1" });
	assert.equal(harness.state.workingMessage, "Writing 1234.csv...");
	emit(harness, "tool_execution_end", { toolCallId: "write-1" });
	emit(harness, "tool_execution_end", { toolCallId: "read-1" });
	assert.equal(harness.state.workingMessage, "Working...");
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
	final.updateContent(finalMessage, true);
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
	return { process: processComponent, tool };
}

function assertToggle(harness: Harness, fixture: RenderFixture): void {
	harness.toggle(harness.ctx);
	assert.equal(harness.state.notification, "Quiet activity disabled.");
	assert.equal(
		emit(harness, "before_agent_start", { systemPrompt: "base prompt" }),
		undefined,
	);
	assert(fixture.process.render(100).length > 0);
	assert(fixture.tool.render(100).length > 0);

	harness.toggle(harness.ctx);
	assert.equal(harness.state.notification, "Quiet activity enabled.");
	assert.deepEqual(fixture.tool.render(100), []);
}

export default function smokeTest(_pi: ExtensionAPI): void {
	initTheme();
	assertSafeActivityLabels();
	const harness = createHarness();
	emit(harness, "session_start");
	assertActivityDisplay(harness);
	assertFinalResponsePrompt(harness);
	const fixture = assertQuietRendering();
	assertToggle(harness, fixture);
	emit(harness, "session_shutdown");
	assert(fixture.tool.render(100).length > 0);
}
