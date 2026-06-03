# codexx

Resume Codex CLI sessions for the current working directory across model providers.

Codex stores session metadata in `~/.codex/sessions/**/*.jsonl`. `codexx resume`
reads those session metadata records, filters by `cwd`, and shows sessions from
all providers instead of only the currently configured provider.

## Install

From this directory:

```powershell
npm install -g .
```

After publishing to npm:

```powershell
npm install -g codexx
```

## Usage

```powershell
codexx resume
codexx resume --latest
codexx resume --latest --dry-run
codexx resume --native
codexx resume --native --provider openai
codexx resume --provider openai
codexx resume --cwd C:\path\to\project
```

By default, `codexx` resumes with the provider recorded in the session metadata:

```powershell
codex -c model_provider="openai" resume <session-id>
```

Disable that behavior with:

```powershell
codexx resume --no-provider-override
```

Use Codex's native resume picker after selecting a provider:

```powershell
codexx resume --native
```
