# codexx

`codexx` is a small companion CLI for people who switch Codex CLI model providers.

GitHub: https://github.com/justinzzc/codexx

Codex sessions are still there after you switch providers, but the normal
`codex resume` picker can feel like a locked drawer: sessions created under a
different `model_provider` may no longer appear in the list you are looking at.
`codexx` opens that drawer from the outside. It scans Codex's local session
metadata, finds sessions for the current working directory, and lets you resume
them across providers.

[中文 README](./README.zh-CN.md)

## What It Solves

You work in the same project, but switch between providers:

```powershell
model_provider = "openai"
model_provider = "custom"
```

Later, `codex resume` only shows sessions visible to the current provider. That
makes an older conversation look lost even though its JSONL session file still
exists in `~/.codex/sessions`.

`codexx resume` reads those files directly, filters them by `cwd`, and shows the
matching sessions from every provider.

## Install

```powershell
npm install -g @metav_xly/codexx
```

Requires Node.js 18 or newer and the official `codex` CLI on your PATH.

## Quick Start

Run it from inside a project:

```powershell
codexx resume
```

Example output:

```text
 1. 2026-06-03T01:19:15.977Z  [custom]  Fix missing resume session  019e8b10-...
 2. 2026-06-02T03:07:57.494Z  [openai]  Analyze current architecture  019e864d-...
 3. 2026-06-01T10:17:09.954Z  [openai]  Validate Lark CLI adapter  019e82af-...

Select session number:
```

Pick a session and `codexx` calls Codex with the provider recorded in that
session:

```powershell
codex -c model_provider="openai" resume <session-id>
```

## Native Picker Mode

The default `codexx resume` list is intentionally simple. If you want Codex's
original resume UI, previews, and expansion behavior, use native mode:

```powershell
codexx resume --native
```

It first asks which provider you want:

```text
 1. [openai]  3 sessions
 2. [custom]  1 sessions

Select provider number:
```

After that, it enters Codex's own picker:

```powershell
codex -c model_provider="openai" resume
```

You can skip the provider prompt:

```powershell
codexx resume --native --provider openai
```

## Commands

```powershell
codexx resume
codexx resume --latest
codexx resume --latest --dry-run
codexx resume --provider openai
codexx resume --cwd C:\path\to\project
codexx resume --native
codexx resume --native --provider custom
```

## Options

| Option | Description |
| --- | --- |
| `--cwd <path>` | Match sessions for a specific working directory. Defaults to the current directory. |
| `--provider <name>` | Filter to one provider. In `--native` mode, skips the provider picker. |
| `--latest` | Resume the most recently updated matching session. |
| `--native` | Select a provider, then enter Codex's native `resume` picker. |
| `--dry-run` | Print the `codex` command instead of running it. |
| `--no-provider-override` | Resume by session id without passing `model_provider=...`. |
| `--codex-command <command>` | Use a custom Codex executable name/path. Defaults to `codex`. |
| `--codex-home <path>` | Use a custom Codex home directory. Defaults to `CODEX_HOME` or `~/.codex`. |

## How Titles Work

`codexx` prefers Codex's `session_index.jsonl` title when available. For newer
sessions that are not indexed there, it falls back to the first real user
message inside the session JSONL file. It skips injected setup text such as
`AGENTS.md` instructions, environment context, skill payloads, and interrupted
turn markers.

## Notes

`codexx` does not modify Codex sessions. It only reads local metadata and then
delegates the actual resume operation back to the official `codex` CLI.

The tool relies on Codex's local session file format. If Codex changes that
format in the future, `codexx` may need an update.
