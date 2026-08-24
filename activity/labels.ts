const MAX_DETAIL_LENGTH = 72;
const ANSI_SEQUENCE =
	/\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g;
const CONTROL_CHARACTERS =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g;
const BEARER_TOKEN = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_ASSIGNMENT =
	/\b(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&]+)/gi;
const SENSITIVE_FLAG =
	/(--?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|pwd)\b(?:=|\s)+)(?:"[^"]*"|'[^']*'|[^\s]+)/gi;

type ToolArguments = Record<string, unknown>;

interface ActivitySpec {
	action: string;
	fallback: string;
	keys: readonly string[];
}

const ACTIVITY_SPECS: Record<string, ActivitySpec> = {
	read: {
		action: "Reading",
		fallback: "Reading a file",
		keys: ["path", "file"],
	},
	write: {
		action: "Writing",
		fallback: "Writing a file",
		keys: ["path", "file"],
	},
	edit: {
		action: "Editing",
		fallback: "Editing a file",
		keys: ["path", "file"],
	},
	bash: { action: "Running", fallback: "Running a command", keys: ["command"] },
	grep: {
		action: "Searching files for",
		fallback: "Searching files",
		keys: ["query", "pattern"],
	},
	search: {
		action: "Searching files for",
		fallback: "Searching files",
		keys: ["query", "pattern"],
	},
	find: {
		action: "Finding",
		fallback: "Finding files",
		keys: ["pattern", "query", "path"],
	},
	web_search: {
		action: "Searching the web for",
		fallback: "Searching the web",
		keys: ["query", "queries"],
	},
	source_check: {
		action: "Checking",
		fallback: "Checking sources",
		keys: ["claim"],
	},
	fetch_content: {
		action: "Fetching",
		fallback: "Fetching content",
		keys: ["url", "urls"],
	},
	mcp_call: {
		action: "Calling",
		fallback: "Calling an MCP tool",
		keys: ["tool", "toolName", "name", "server"],
	},
};

const STATIC_LABELS: Record<string, string> = {
	get_search_content: "Reading search results",
	todo: "Updating tasks",
	ask_user_question: "Preparing a question",
};

function asArguments(value: unknown): ToolArguments {
	return typeof value === "object" && value !== null
		? (value as ToolArguments)
		: {};
}

function shorten(value: string): string {
	const oneLine = value
		.replace(ANSI_SEQUENCE, "")
		.replace(CONTROL_CHARACTERS, "")
		.replace(/\s+/g, " ")
		.replace(BEARER_TOKEN, "$1 [redacted]")
		.replace(SENSITIVE_ASSIGNMENT, "$1$2[redacted]")
		.replace(SENSITIVE_FLAG, "$1[redacted]")
		.trim();
	return oneLine.length <= MAX_DETAIL_LENGTH
		? oneLine
		: `${oneLine.slice(0, MAX_DETAIL_LENGTH - 3)}...`;
}

function firstString(value: unknown): string | undefined {
	if (typeof value === "string" && value.trim()) return shorten(value);
	if (!Array.isArray(value)) return undefined;
	const match = value.find(
		(item): item is string => typeof item === "string" && Boolean(item.trim()),
	);
	return match ? shorten(match) : undefined;
}

function findDetail(
	args: ToolArguments,
	keys: readonly string[],
): string | undefined {
	for (const key of keys) {
		const value = firstString(args[key]);
		if (value) return value;
	}
	return undefined;
}

function formatSpec(spec: ActivitySpec, args: ToolArguments): string {
	const value = findDetail(args, spec.keys);
	return value ? `${spec.action} ${value}` : spec.fallback;
}

function mcpActivityLabel(args: ToolArguments): string {
	const server = findDetail(args, ["server", "serverName"]);
	const tool = findDetail(args, ["tool", "toolName"]);
	if (tool) return `Calling MCP ${server ? `${server}/${tool}` : tool}`;
	if (server) return `Using MCP ${server}`;

	const search = findDetail(args, ["search"]);
	if (search) return `Searching MCP for ${search}`;

	const target = findDetail(args, ["describe", "instructions", "name"]);
	return target ? `Inspecting MCP ${target}` : "Using MCP";
}

export function toolActivityLabel(toolName: string, rawArgs: unknown): string {
	const name = toolName.toLowerCase();
	const staticLabel = STATIC_LABELS[name];
	if (staticLabel) return staticLabel;

	const args = asArguments(rawArgs);
	if (name === "mcp") return mcpActivityLabel(args);

	const spec = ACTIVITY_SPECS[name];
	if (spec) return formatSpec(spec, args);

	if (name.startsWith("mcp_")) {
		const target = findDetail(args, ["tool", "toolName", "name"]);
		return target ? `Calling ${target}` : `Calling ${shorten(toolName)}`;
	}
	return `Using ${shorten(toolName)}`;
}
