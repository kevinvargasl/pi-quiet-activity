# Quiet Activity

A global Pi extension that reduces an agent run to one activity indicator and the final answer.

## Quiet mode

While the agent works, the activity line follows the current operation:

```text
User: Do this.
Working...
Reading abc.ts...
Writing 1234.csv...
Calling some-tool...
```

Built-in file, shell, search, web, MCP, task, and question tools receive concise labels. Unknown tools display `Using <tool-name>...`. Long details are normalized to one line and truncated. Terminal control sequences are removed, and common credentials in commands or URLs are redacted.

The TUI hides:

- thinking/reasoning blocks
- intermediate assistant narration attached to tool-using turns
- all built-in and extension tool calls/results
- the final answer while it is still streaming

When the agent settles, the working line disappears and the finalized text-only assistant response appears. The extension does not add anything to the footer.

This is display-only. Tool execution, model context, and saved session data are unchanged.

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

## Installation

Install the pinned release from GitHub:

```bash
pi install git:github.com/kevinvargasl/pi-quiet-activity@v1.0.1
```

To try the current main branch without installing it:

```bash
pi -e git:github.com/kevinvargasl/pi-quiet-activity
```

Run `/reload` in an existing Pi session after installation, or restart Pi.

## Compatibility

The extension patches Pi's exported `AssistantMessageComponent` and `ToolExecutionComponent` render methods for the current TUI session. It restores the original methods during session shutdown/reload.

Renderer extensions that patch the same component prototypes may conflict. Turning quiet mode off restores normal rendering through whatever renderer was active when this extension loaded.
