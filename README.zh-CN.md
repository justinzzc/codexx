# codexx

`codexx` 是一个给 Codex CLI 准备的小工具，专门解决「切换 provider 之后，resume 找不到旧会话」这个问题。

GitHub 仓库：https://github.com/justinzzc/codexx

那些会话通常并没有丢。它们还在 `~/.codex/sessions` 里，只是 Codex 原生的
`resume` 列表会受当前 `model_provider` 影响，看起来像是某些会话突然消失了。
`codexx` 做的事情很简单：从本地 session 元数据里把当前项目相关的会话找出来，不管它们属于哪个 provider。

[English README](./README.md)

## 它解决什么问题

你可能会在同一个项目里来回切换 provider：

```powershell
model_provider = "openai"
model_provider = "custom"
```

切完之后再执行：

```powershell
codex resume
```

旧会话可能不出现在列表里。这个时候 `codexx resume` 会直接扫描
`~/.codex/sessions/**/*.jsonl`，按当前工作目录 `cwd` 过滤，把所有 provider 下的匹配会话都列出来。

默认情况下，`codexx` 会隐藏 helper/subagent 这类子代理线程，让列表更接近普通用户会话。
如果你确实想查看这些底层线程，可以加 `--include-subagents`。

## 安装

```powershell
npm install -g @metav_xly/codexx
```

需要 Node.js 18 或更高版本，并且官方 `codex` CLI 已经在 PATH 中。

## 快速开始

在项目目录中运行：

```powershell
codexx resume
```

示例输出：

```text
Matched cwd: C:\path\to\project
Found 3 sessions.

 1. 2026-06-03T01:19:15.977Z  [custom]  为什么 resume 找不到旧会话  019e8b10-...
 2. 2026-06-02T03:07:57.494Z  [openai]  分析当前架构  019e864d-...
 3. 2026-06-01T10:17:09.954Z  [openai]  检验飞书 CLI adapter  019e82af-...

Select session number:
```

选中后，`codexx` 会使用该 session 记录里的 provider 调用官方 Codex：

```powershell
codex -c model_provider="openai" resume <session-id>
```

## 原生选择界面模式

默认的 `codexx resume` 是一个轻量列表，方便跨 provider 直接找 session。
如果你想进入 Codex 原来的 resume 界面，使用原生的展开、预览等交互，可以运行：

```powershell
codexx resume --native
```

它会先让你选择 provider，并在每个 provider 下面展示最多 3 条最近会话摘要：

```text
 1. [openai]  3 sessions
    - 2026-06-02T03:07:57.494Z  分析当前架构
    - 2026-06-01T10:17:09.954Z  检验飞书 CLI adapter
    - 2026-06-01T07:46:12.435Z  生成架构图
 2. [custom]  1 sessions
    - 2026-06-03T01:19:15.977Z  修复 resume 找不到旧会话

Select provider number:
```

然后进入 Codex 自己的选择界面：

```powershell
codex -c model_provider="openai" resume
```

也可以直接指定 provider，跳过外层选择：

```powershell
codexx resume --native --provider openai
```

## 常用命令

```powershell
codexx resume
codexx resume --latest
codexx resume --latest --dry-run
codexx resume --provider openai
codexx resume --include-subagents
codexx resume --cwd C:\path\to\project
codexx resume --native
codexx resume --native --provider custom
```

## 参数说明

| 参数 | 说明 |
| --- | --- |
| `--cwd <path>` | 指定要匹配的工作目录。默认是当前目录。 |
| `--provider <name>` | 只显示某个 provider 的会话。在 `--native` 模式下会跳过 provider 选择。 |
| `--include-subagents` | 包含 helper/subagent 子代理线程。默认隐藏，避免普通 resume 列表被底层线程刷屏。 |
| `--latest` | 直接恢复最近更新的匹配会话。 |
| `--native` | 先选择 provider，然后进入 Codex 原生 `resume` 界面。 |
| `--dry-run` | 只打印将要执行的 `codex` 命令，不真正执行。 |
| `--no-provider-override` | 用 session id 恢复，但不传入 `model_provider=...`。 |
| `--codex-command <command>` | 指定 Codex 可执行文件名或路径。默认是 `codex`。 |
| `--codex-home <path>` | 指定 Codex home 目录。默认使用 `CODEX_HOME` 或 `~/.codex`。 |

## 标题如何提取

`codexx` 会优先使用 Codex 的 `session_index.jsonl` 里的标题。
如果新 session 没有写入这个索引，它会从对应 JSONL 文件里取第一条真实用户消息作为标题。

为了避免标题变成一大段系统上下文，它会跳过这些自动注入内容：

```text
AGENTS.md instructions
environment_context
skill payload
plugins payload
turn_aborted marker
```

## 注意事项

`codexx` 不会修改 Codex 的 session 文件。它只读取本地元数据，然后把真正的恢复操作交回官方 `codex` CLI。

这个工具依赖 Codex 当前的本地 session JSONL 格式。如果未来 Codex 修改了 session 存储格式，`codexx` 也需要相应更新。
