# Quiet Activity

A global Pi extension that reduces an agent run to one activity indicator with a live elapsed timer and the final answer.

![Quiet Activity showing live working status in Pi](https://raw.githubusercontent.com/kevinvargasl/pi-quiet-activity/main/assets/pi-quiet-activity-demo.gif)

## Quiet mode

While the agent works, the activity line follows the current operation:

```text
User: Do this.
(0s) Working
(2s) Reading abc.ts...
(5s) Writing 1234.csv...
(8s) Calling MCP context7/resolve-library-id...
```

Built-in file, shell, search, web, MCP, task, and question tools receive concise labels. MCP proxy calls include the server and tool when those fields are available. Unknown tools display `Using <tool-name>...`. Long details are normalized to one line and truncated. Terminal control sequences are removed, and common credentials in commands or URLs are redacted.

The TUI hides:

- thinking/reasoning blocks
- intermediate assistant narration attached to tool-using turns
- all built-in and extension tool calls/results
- the final answer while it is still streaming

When the agent settles, the working line disappears and a compact elapsed time appears in dimmed text before the finalized answer, such as `Worked for 45s`, `Worked for 1m 23s`, or `Worked for 2h 12m`. The extension does not add anything to the footer.

![Elapsed time displayed before the final answer](https://raw.githubusercontent.com/kevinvargasl/pi-quiet-activity/main/assets/elapsed-time-message.png)

Some models, including Claude Opus 5 through GitHub Copilot, can put useful details in a tool-calling turn and finish with only a short phrase. Quiet mode now asks the model to repeat those details in a self-contained final response. Rendering stays display-only. Tool execution and saved session data are unchanged, but the extra instruction is part of the model's system prompt while quiet mode is enabled in the TUI.

## Toggle

Press:

```text
F9
```

This shortcut is not assigned by Pi's default keybindings and works in Windows and macOS terminals. On a Mac keyboard configured to use the top row for media controls, press `Fn+F9`. It toggles between quiet mode and Pi's normal transcript. Toggling is silent; no notification or permanent footer indicator is added. Use `/quiet-activity status` to check the mode. A warning still appears if the setting cannot be saved. The setting persists across restarts in:

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

## Live timer

The timer appears on the **left** of the working message and tool activity labels:

```text
(5s) Working
(12s) Reading src/index.ts...
(1m 23s) Running npm test...
```

It is **on by default** and updates every second while the agent works. Elapsed time spans the entire run, including tool calls, automatic retries, and continuations—not just the current operation. It resets for the next run and stops updating when the agent settles or the session shuts down.

Control the timer independently of quiet mode:

```text
/quiet-activity timer
/quiet-activity timer off
/quiet-activity timer on
/quiet-activity timer toggle
/quiet-activity timer status
```

`/quiet-activity timer` also toggles it. Changes take effect immediately and persist in the same config file as quiet mode:

```json
{
  "enabled": true,
  "timerEnabled": true
}
```

Existing configs without `timerEnabled` default to having the timer on. Turning it off removes only the live prefix, leaving labels such as `Working` and `Reading src/index.ts...`. The final `Worked for …` line is unchanged. Normal mode (F9 off) keeps Pi's default working message. `/quiet-activity status` reports both the quiet-mode and timer settings.

## Installation

Install the latest release from npm:

```bash
pi install npm:pi-quiet-activity
```

To pin this release:

```bash
pi install npm:pi-quiet-activity@1.4.0
```

To try the current main branch without installing it:

```bash
pi -e git:github.com/kevinvargasl/pi-quiet-activity
```

Run `/reload` in an existing Pi session after installation, or restart Pi.

## Compatibility

The extension patches Pi's exported `AssistantMessageComponent` and `ToolExecutionComponent` render methods for the current TUI session. It restores the original methods during session shutdown/reload.

Smoke-tested with Pi 1.0.0 (Node.js 22.19 or newer). Pi 1.0 defaults to fullscreen; quiet mode uses the same transcript components in fullscreen and regular TUI modes. RPC, JSON, and print modes keep their normal output.

The final-response instruction uses a structured prompt section so Pi can preserve cached prefixes when updating instructions (where supported by the model). Older versions without structured sections retain the previous prompt fallback. Elapsed time spans automatic retries and continuations until `agent_settled`.

Renderer extensions that patch the same component prototypes may conflict. Turning quiet mode off restores normal rendering through whatever renderer was active when this extension loaded.

## Development

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
```

Development dependencies pin Pi 1.0.0 for reproducible compatibility checks; published peer dependencies remain host-provided. The smoke tests cover rendering, content invalidation, toggling, prompt sections, activity labels, live timer updates and persistence, elapsed time across retries, timer cleanup on settle/reload, and non-TUI lifecycle handling.
