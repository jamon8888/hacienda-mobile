# AnythingLLM Mobile - OpenCode Agent Harness

## Quick Start

```bash
# Start opencode with agent harness
opencode --config .opencode/config.json

# Or use specific agents
opencode --agent typescript    # TypeScript fixes
opencode --agent embedding     # Embedding models
opencode --agent database      # WatermelonDB
opencode --agent ui            # React Native UI
```

## Agent Overview

| Agent | Purpose | Context Files |
|-------|---------|---------------|
| `default` | General React Native development | All |
| `typescript` | Type safety, strict mode | tsconfig.json, Embedder types, Workspace |
| `embedding` | Multilingual embeddings, GGUF, vector search | defaults.ts, Embedder/*, VectorDB |
| `database` | WatermelonDB schema, migrations | models/*, schema.ts, VectorDB |
| `ui` | NativeWind, Paper, navigation | screens/*, components/*, theme.ts |

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

## Common Tasks

### Fix TypeScript Errors
```bash
opencode --agent typescript "Fix all TS errors in src/utils/Embedder/"
```

### Add New Embedding Model
```bash
opencode --agent embedding "Add bge-m3 model to defaults.ts and MultilingualEmbedderProvider"
```

### Database Migration
```bash
opencode --agent database "Add embeddingConfig column migration for workspaces table"
```

### UI Feature
```bash
opencode --agent ui "Add language badge to citation items in ChatHistory"
```

## Basemind Code Intelligence

```bash
# Index the codebase
opencode basemind index

# Query symbols
opencode basemind query "EmbeddingProvider"

# Find references
opencode basemind refs "MultilingualEmbedderProvider"

# Get call graph
opencode basemind calls "getContextTexts"
```

## Project Commands

```bash
# Type check
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

## Architecture Notes

- **State**: MobX stores (ModelStore, UIStore) + React Context (LLMPreference, BottomSheet)
- **Navigation**: React Navigation drawer + stack
- **Local LLM**: cactus-react-native (llama.cpp bindings) via CactusLmWrapper
- **Remote LLM**: OpenAICompatible, Ollama, LMStudio, OpenRouter, DelegatedProvider
- **Embeddings**: On-device via CactusLM.embedding() with GGUF models
- **Vectors**: ObjectBox (native) via VectorDB wrapper
- **Persistence**: WatermelonDB (SQLite) + AsyncStorage (MobX persist)