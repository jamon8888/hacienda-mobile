# CLAUDE.md — AnythingLLM Mobile

> **Rule**: Use `basemind` for code intelligence BEFORE grep/read/git. It's the default, not a preference.

## Quick Start

```bash
# Start opencode with agent harness
opencode --config .opencode/config.json

# Or use specific agents
opencode --agent cactus-inference    # llama.cpp/GGUF optimization
opencode --agent embedding           # Multilingual embeddings
opencode --agent vectordb            # ObjectBox/HNSW search
opencode --agent watermelondb        # Schema/migrations
opencode --agent mobx                # State management
opencode --agent react-native        # Navigation/gestures/native
opencode --agent nativewind          # Tailwind/MD3 theming
opencode --agent tools-manager       # Agentic tool calling
opencode --agent typescript          # Type safety
opencode --agent database            # WatermelonDB queries
opencode --agent ui                  # React Native UI
```

## Agent Registry (12 Agents)

| Agent                | Specialty                   | Key Context Files                                    |
| -------------------- | --------------------------- | ---------------------------------------------------- |
| **cactus-inference** | llama.cpp/GGUF optimization | ModelStore, CactusLmWrapper, GenieWrapper, NPU/Metal |
| **embedding**        | Multilingual embeddings     | E5-small/base, CamemBERT, Nomic v2 MoE, Matryoshka   |
| **vectordb**         | ObjectBox/HNSW search       | runSemanticSearch, bulkInsert, workspace isolation   |
| **tools-manager**    | Agentic tool calling        | webSearch, calendar, summarization, recursive loop   |
| **watermelondb**     | Schema/migrations           | Workspace, Thread, Chat, Document, embeddingConfig   |
| **mobx**             | State management            | ModelStore, UIStore, persistence, AppState           |
| **react-native**     | Navigation/gestures/native  | Reanimated, GestureHandler, KeyboardController       |
| **nativewind**       | Tailwind/MD3 theming        | Dark mode, SafeView, TopBar, ChatHistory             |
| **typescript**       | Type safety                 | Strict mode, NativeEventEmitter, decorators          |
| **database**         | WatermelonDB queries        | Reactive queries, associations, migrations           |
| **ui**               | React Native UI             | Paper, Phosphor, navigation, screens                 |
| **default**          | Generalist                  | Full codebase knowledge                              |

## Basemind Code Intelligence (Mandatory)

### Before Any Code Task

```bash
# 1. Search symbols (not grep)
basemind query search "CactusLmWrapper"

# 2. Find references
basemind query references "initLlama"

# 3. Call graph
basemind query call-graph "loadNewModel"

# 4. File outline
basemind query outline src/utils/Embedder/onDevice/multilingual.ts

# 5. Architecture map
basemind query architecture-map

# 6. Git history
basemind git hot-files
basemind git commits-touching src/store/ModelStore.ts
basemind git blame-symbol "MultilingualEmbedderProvider"
```

### Symbol Operations

| Operation       | Command                                                                       | Use Case            |
| --------------- | ----------------------------------------------------------------------------- | ------------------- |
| Search          | `basemind query search "EmbeddingProvider"`                                   | Find all embeddings |
| References      | `basemind query references "getEmbeddingProvider"`                            | Who calls this?     |
| Callers         | `basemind query callers "src/utils/Embedder/factory.ts:getEmbeddingProvider"` | Direct callers      |
| Goto Definition | `basemind query goto-definition src/hooks/useAttachments.tsx:52`              | Jump to def         |
| Implementations | `basemind query implementations "EmbeddingProvider"`                          | All implementers    |

### Code Search

```bash
# Semantic search (needs --features code-search)
basemind query search-code "multilingual embedding model"

# Keyword search
basemind query search-code --mode keyword "GGUF"

# Hybrid (default)
basemind query search-code "cactus inference optimization"
```

### File Discovery

```bash
# List indexed files
basemind query list-files --filter "src/utils/Embedder/**"

# Fuzzy find
basemind query find-files "multilingual"

# Dependents (who imports this)
basemind query dependents "src/utils/Embedder/types.ts"
```

### Git Intelligence

```bash
# Hot files (churn)
basemind git hot-files

# Commits touching a file
basemind git commits-touching src/store/ModelStore.ts

# Search commit history
basemind git search "embedding"

# Blame a symbol
basemind git blame-symbol "MultilingualEmbedderProvider"

# Symbol history
basemind git symbol-history "getEmbeddingProvider"
```

### Real-time

```bash
# Watch mode (run in background)
basemind watch &

# MCP server for AI agents
basemind serve
```

## Safety Workflow

### Before Making Changes

1. **Map the territory** - `basemind query search "symbol"` + `references`
2. **Understand impact** - `basemind query call-graph "function"` + `architecture-map`
3. **Check history** - `basemind git commits-touching "file"` + `hot-files`
4. **Verify types** - Run `yarn typecheck` after changes

### Common Patterns

```bash
# Adding new embedding model
basemind query search "MULTILINGUAL_EMBEDDING_MODELS"
basemind query references "MultilingualEmbedderProvider"
basemind query outline src/utils/Embedder/onDevice/multilingual.ts

# Fixing TypeScript error
basemind query search "NativeEventEmitter"
basemind query references "emit"
basemind query goto-definition src/store/UIStore.ts:91

# Optimizing inference
basemind query search "n_batch"
basemind query call-graph "initLlama"
basemind git commits-touching src/store/ModelStore.ts
```

## Agent Invocation Examples

```bash
# Cactus inference optimization
opencode --agent cactus-inference "Reduce n_batch/n_ubatch for 3B model on 4GB RAM device. Show call graph from initLlama."

# Embedding model addition
opencode --agent embedding "Add bge-m3 (1024 dims) to defaults.ts and MultilingualEmbedderProvider. Update factory."

# VectorDB dimension fix
opencode --agent vectordb "Fix dimension mismatch: multilingual-e5-small outputs 384 but VectorDB expects 768"

# Tool loop safety
opencode --agent tools-manager "Add max iterations (5) to toolCallLoop in OnDeviceProvider.chat()"

# TypeScript fix
opencode --agent typescript "Fix NativeEventEmitter.emit typing in UIStore and Workspace.ts"

# Database migration
opencode --agent watermelondb "Add embeddingConfig column migration for workspaces table v2"

# MobX persistence
opencode --agent mobx "Fix ModelStore downloadManager callback typing for onProgress"

# NativeWind theming
opencode --agent nativewind "Add new semantic color for thinking bubble border in theme.ts"

# React Native gesture
opencode --agent react-native "Fix KeyboardController interaction with BottomSheet in PromptInput"
```

## Project Commands

```bash
# Type check (run after changes)
yarn typecheck

# Lint
yarn lint

# Format
yarn format

# Tests
yarn test

# Android
yarn android

# iOS (macOS)
cd ios && pod install && cd .. && npx react-native run-ios
```

## Key Code Areas

### Embedding System (NEW)

- **Models**: `src/utils/models/defaults.ts` - 4 multilingual + 1 English-only
- **Providers**: `src/utils/Embedder/` - Factory, OnDevice, Multilingual
- **Integration**: `useAttachments`, `baseOpenAILikeProvider.getContextTexts`
- **Workspace Config**: `embeddingConfig` on Workspace model

### Database

- **Models**: Workspace, WorkspaceThread, WorkspaceChat, Document
- **VectorDB**: ObjectBox wrapper for semantic search
- **Migrations**: Version tracking for model list

### UI

- **Screens**: WorkspaceChat, WorkspaceSettings (with Embedding), Onboarding
- **Components**: SafeView, TopBar, WorkspaceDrawer
- **Styling**: NativeWind className, dark mode first

### State

- **ModelStore**: Llama.cpp contexts, downloads, NPU/Metal
- **UIStore**: Global UI, toasts, persistence, events

---

**Remember**: `basemind` first, then act. The code map is your source of truth.
