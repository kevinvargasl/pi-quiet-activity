# Quiet Activity

A global Pi extension that reduces an agent run to one activity indicator and the final answer.

## Quiet mode

While the agent works, the activity line follows the current operation:

```text
User: Do this.
Working...
Reading abc.ts...
Writing 1234.csv...
Calling MCP context7/resolve-library-id...
```

Built-in file, shell, search, web, MCP, task, and question tools receive concise labels. MCP proxy calls include the server and tool when those fields are available. Unknown tools display `Using <tool-name>...`. Long details are normalized to one line and truncated. Terminal control sequences are removed, and common credentials in commands or URLs are redacted.

The TUI hides:

- thinking/reasoning blocks
- intermediate assistant narration attached to tool-using turns
- all built-in and extension tool calls/results
- the final answer while it is still streaming

When the agent settles, the working line disappears and the finalized text blocks from the last assistant turn appear. The extension does not add anything to the footer.

Some models, including Claude Opus 5 through GitHub Copilot, can put useful details in a tool-calling turn and finish with only a short phrase. Quiet mode now asks the model to repeat those details in a self-contained final response. Rendering stays display-only. Tool execution and saved session data are unchanged, but the extra instruction is part of the model's system prompt while quiet mode is enabled in the TUI.

## Toggle

Press:

```text
F9
```

This shortcut is not assigned by Pi's default keybindings and works in Windows and macOS terminals. On a Mac keyboard configured to use the top row for media controls, press `Fn+F9`. It toggles between quiet mode and Pi's normal transcript. A brief notification reports only whether quiet activity is enabled or disabled; no permanent footer indicator is added. The setting persists across restarts in:

```text
~/.pi/agent/extension-data/quiet-activity/config.json
```

You can also use:

```text
/quiet-activity
/quiet-activity on
/quiet-activity off
/quiet-activity toggle
/quiet-activity status
```

## Test a short final response

Run the same prompt once with quiet mode off and once with it on:

```text
/quiet-activity off
/quiet-activity on
```

Use a new session for each run so the second answer does not depend on the first. If the quiet answer is still shorter, inspect the shape of the latest saved assistant messages without printing their contents:

```bash
latest=$(ls -t ~/.pi/agent/sessions/*/*.jsonl | head -1)
jq -c '
  select(.type == "message" and .message.role == "assistant") |
  {
    provider: .message.provider,
    model: .message.model,
    stopReason: .message.stopReason,
    blocks: [.message.content[] | {
      type,
      chars: ((.text // .thinking // "") | length)
    }]
  }
' "$latest"
```

This separates two cases:

- Long `text` blocks in a `toolUse` message mean the model relied on narration that quiet mode hid. The self-contained-final-response instruction is meant to fix this.
- A long `thinking` block followed by a short `text` block means the normal TUI was showing reasoning, not a longer final answer. Quiet mode hides reasoning by design. Press `F9` when you need to inspect it.

## Installation

Install the pinned release from GitHub:

```bash
pi install git:github.com/kevinvargasl/pi-quiet-activity@v1.2.0
```

To try the current main branch without installing it:

```bash
pi -e git:github.com/kevinvargasl/pi-quiet-activity
```

Run `/reload` in an existing Pi session after installation, or restart Pi.

## Compatibility

The extension patches Pi's exported `AssistantMessageComponent` and `ToolExecutionComponent` render methods for the current TUI session. It restores the original methods during session shutdown/reload.

Renderer extensions that patch the same component prototypes may conflict. Turning quiet mode off restores normal rendering through whatever renderer was active when this extension loaded.
