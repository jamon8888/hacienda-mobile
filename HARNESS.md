# Hacienda Mobile — Agent Harness Setup

This repo ships a multi-agent coding harness. This file documents the **current, working** state
after the harness was installed and verified on this machine (see CLAUDE.md for the older docs and
known pre-existing issues).

## What's installed

| Tool | Version | Install | Status |
|------|---------|---------|--------|
| `opencode` (opencode-ai) | 1.18.18 | `npm install -g opencode-ai@1.18.18` | ✅ verified (boots + replies) |
| `basemind` | 0.23.1 | `npm install -g basemind@0.23.1` | ✅ index built (435 files) |
| Node deps | (React Native 0.76, etc.) | `corepack yarn install` | ✅ in `node_modules` |
| `xberg`, `crawlberg` | 1.0.12 / 1.1.2 | cargo | ✅ present in `~/.cargo/bin` |

> ⚠️ **Always use `corepack yarn <cmd>`**, never bare `yarn` (the `/usr/bin/yarn` here is an
> unrelated Debian tool). Confirmed: `corepack yarn --version` → `1.22.22`.

## The 12 agents

Agents are modern **markdown** files, one per agent, in `.opencode/agents/` (opencode ≥ 1 discovers
`.opencode/agents/*.md`):

| File | Mode | Specialty |
|------|------|-----------|
| `default.md` | primary | General React Native dev |
| `cactus-inference.md` | subagent | llama.cpp / GGUF optimization |
| `database.md` | subagent | WatermelonDB schema / queries |
| `embedding.md` | subagent | Multilingual embeddings, vector search |
| `mobx.md` | subagent | MobX 6 state management |
| `nativewind.md` | subagent | NativeWind / Tailwind theming |
| `react-native.md` | subagent | Navigation / gestures / native |
| `tools-manager.md` | subagent | Agentic tool calling |
| `typescript.md` | subagent | Type safety / TS errors |
| `ui.md` | subagent | React Native UI / Paper / Phosphor |
| `vectordb.md` | subagent | ObjectBox / HNSW semantic search |
| `watermelondb.md` | subagent | WatermelonDB repo wiring |

Each file's frontmatter uses `description`, `mode`, `model`, and `tools` (boolean map), and the
body is the system prompt. `contextFiles` from the old JSON are appended as a "Relevant files"
section in the body.

> **Model note:** the original config referenced `anthropic/claude-3.5-sonnet`, but no Anthropic
> key is configured. The agents are wired to the free **OpenCode Go** endpoint
> (`opencode-go/deepseek-v4-pro`). To use a paid model, run `opencode providers login anthropic`
> and edit the `model:` line in the relevant `.opencode/agents/*.md`.

## Usage

```bash
# From the repo root, boot the interactive TUI (default primary agent):
opencode

# Run a one-shot task with a specific agent on the free model:
opencode run --agent typescript --model opencode-go/deepseek-v4-flash "Fix TS errors in src/utils/Embedder/"

# List all registered agents:
opencode agent list

# Basemind code intelligence (0.23.1 uses `basemind query <op>` — matches AGENTS.md / CLAUDE.md):
basemind scan --root .
basemind query list-files
basemind query search "ModelStore"
basemind query grep "CactusLmWrapper"
basemind query outline src/store/ModelStore.ts
basemind query references "loadNewModel"
basemind query call-graph "loadNewModel"
basemind query architecture-map
basemind git recent-changes
basemind git touching src/store/ModelStore.ts
```

## Notes / gotchas

- **Subagents are invoked by a primary agent**, not directly. `opencode run --agent <subagent>`
  falls back to the primary `build`/`default` agent with a warning. Primary agent: `default`.
- **basemind needs a CPU-hint config on this machine.** This is an Intel Core **i5-2400S
  (Sandy Bridge, SSE4.2, no AVX2)**. basemind's released binaries ship the ONNX Runtime, which
  requires AVX2; the **document/image OCR + embedding tier** crashes with **SIGILL (illegal
  instruction)** during `scan` and leaves the code index empty. Two required settings:
  1. Stay on **basemind 0.23.1** (the version AGENTS.md/CLAUDE.md are written against).
  2. Keep **`[documents] enabled = false`** in `basemind.toml` (already set). This bypasses the
     ONNX path entirely; the tree-sitter code index builds fine (435 files, verified).
  Re-enabling document RAG / OCR on this CPU will crash the scan. Enable it again only on an
  AVX2-capable machine.
- The old-format configs (`config.json`, `.opencode/agent/*.json`) use an outdated opencode schema
  and are **not** read by opencode 1.18.18. They are kept for reference only; the active harness
  lives in `.opencode/agents/`.

## Pre-existing typecheck failures (not caused by this setup)

Run `corepack yarn typecheck`. As of the current branch it reports **12 errors** (drifts from the
38 documented in CLAUDE.md), all in the transcription/Xberg feature:

- `src/screens/WorkspaceChat/PromptInput/Actions/Settings/Files/index.tsx`
- `src/screens/WorkspaceChat/PromptInput/Actions/TranscriptionOptionsSheet/index.tsx`
- `src/screens/WorkspaceSettings/DocumentsSettings.tsx`

Failures are `XbergStore`/`XbergClient` missing `transcriptionModel`,
`transcriptionLanguage`, `setTranscriptionOptions`, `getTranscriptionEngine`.
