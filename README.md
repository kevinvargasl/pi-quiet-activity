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

Built-in file, shell (including PowerShell), search, web, MCP, task, and question tools receive concise labels. Codemode displays `Running a script...` without exposing script contents; its nested tool calls temporarily show their own activity, then restore the parent label. Tool discovery displays `Finding tools for <query>...`. Native MCP names such as `mcp__context7__resolve-library-id` display `Calling MCP context7/resolve-library-id...`; proxy calls include the server and tool when those fields are available. Unknown tools display `Using <tool-name>...`. Long details are normalized to one line and truncated. Terminal control sequences are removed, and common credentials in commands or URLs are redacted.

The TUI hides:

- thinking/reasoning blocks
- intermediate assistant narration attached to tool-using turns
- all built-in and extension tool calls/results
- the final answer while it is still streaming

When the agent settles, the working line disappears and a compact elapsed time appears in dimmed text before the finalized answer, such as `Worked for 45s`, `Worked for 1m 23s`, or `Worked for 2h 12m`. On Pi 1.1 or newer, cancelling a run stops the timer without adding a completion line or changing an earlier answer's elapsed time. Pi's own cancellation notice remains visible when present. The extension does not add anything to the footer.

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
pi install npm:pi-quiet-activity@1.4.1
```

To try the current main branch without installing it:

```bash
pi -e git:github.com/kevinvargasl/pi-quiet-activity
```

Run `/reload` in an existing Pi session after installation, or restart Pi.

## Compatibility

The extension patches Pi's exported `AssistantMessageComponent` and `ToolExecutionComponent` render methods for the current TUI session. It restores the original methods during session shutdown/reload.

Smoke-tested with Pi 1.2.0 (Node.js 22.19 or newer). Pi 1.0+ defaults to fullscreen; quiet mode uses the same transcript components in fullscreen and regular TUI modes. RPC, JSON, and print modes keep their normal output.

The final-response instruction uses a structured prompt section so Pi can preserve cached prefixes when updating instructions (where supported by the model). Older versions without structured sections retain the previous prompt fallback. Elapsed time spans automatic retries and continuations until `agent_settled`.

Renderer extensions that patch the same component prototypes may conflict. Turning quiet mode off restores normal rendering through whatever renderer was active when this extension loaded.

### Recent Pi releases

Reviewed [Pi's release notes through 1.2.0](https://github.com/earendil-works/pi/blob/v1.2.0/packages/coding-agent/CHANGELOG.md):

- **Pi 1.1: cancellation-aware settlement.** The extension now uses `agent_settled.aborted` to avoid marking cancelled runs as completed or overwriting an earlier answer's duration. Older hosts without the flag retain the previous settlement behavior.
- **Pi 1.2: extension-triggered prompt setup.** Pi now runs `before_agent_start` for custom-message runs and keeps structured prompt sections after tool calls. The existing quiet-response instruction works for both user and custom-message runs; regression tests cover both.
- **Codemode and native MCP tools.** Activity labels now cover scripts, tool discovery, and native MCP names, with tests for nested and parallel tool activity.
- **Tool renderer API (`registerToolRenderer`, Pi 1.0.1+).** Evaluated but not adopted: empty renderers do not suppress tool-result images, and registered renderers also affect HTML exports. Keeping the TUI-only component patch preserves complete tool hiding and unchanged exports.
- **Program status (Pi 1.1+) and tool durations.** Pi already reports terminal/dashboard status itself; no duplicate reporting is needed. Per-tool `durationMs` does not replace the run timer, which includes retries and continuations.

These development dependencies do not upgrade your running Pi host. Update Pi separately and restart it to get the host-side fixes.

## Development

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
```

Development dependencies pin Pi 1.2.0 for reproducible compatibility checks; published peer dependencies remain host-provided. The smoke tests cover rendering, content invalidation, toggling, user/custom-run prompt sections, native MCP and nested codemode activity, live timer updates and persistence, elapsed time across retries, cancellation without stale-answer changes, timer cleanup on settle/reload, and non-TUI lifecycle handling.
