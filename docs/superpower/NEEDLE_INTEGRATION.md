# Needle Integration v2 — Cactus-Native Router with Needle Migration Path

> **Status**: Draft / v2.0.0
> **Decision**: Ship the first RAG/tool router using the **existing `cactus-react-native` engine** (`forceTools` + `toolRagTopK` + `confidenceThreshold`), not a new `needle-rs` native module. Keep the `needle-rs` path as a future optimization when Cactus publishes Needle as a registry bundle or when the 22 MB footprint advantage justifies the native work.
> **Verified against real artifacts**: `cactus-react-native@1.13.1` source/typings, its model-registry fetcher, and the live HuggingFace `Cactus-Compute` org listing.

---

## 1. Why (problem)

Today RAG is unconditional:

- `getContextTexts()` (`src/utils/AiProviders/baseOpenAILikeProvider/index.ts`) embeds the user prompt and always runs `VectorDB.runSemanticSearch(..., topN)`.
- The model is flooded with context **regardless of whether the question is actually document-grounded**, and there is no cheap, on-device signal to choose _how much_ context to pull or _which tools_ to expose.

A tiny tool-calling router gives us that signal: map `(query, tool-definitions) → single JSON call` in one forward pass, decide the RAG strategy before embedding, and only then pay for semantic search / generation.

## 2. What changed since v1

| v1 assumption | v2 finding |
| --- | --- |
| `cactus-react-native` is a llama.cpp/ggml fork that can only load GGUF. | It is now a native Cactus engine (`CactusLM`) that supports tool calling, tool RAG, confidence scoring, embeddings, and vision/audio. |
| Needle must be loaded through a separate `needle-rs` Rust runtime bridged as a new native module. | The same conceptual routing can be done today with any existing Cactus chat model via `complete({ tools, options: { forceTools, toolRagTopK, confidenceThreshold } })`. |
| `Cactus-Compute/needle` is downloadable like other Cactus models. | It is **not** published in the registry format that `cactus-react-native@1.13.1` expects (no version tags, no `weights/*-int4.zip` + `weights/*-int8.zip`). `needle-pebble-ft` exists but is also not registry-compatible. |
| needle-rs is the only mobile-viable runtime. | Cactus's own React Native SDK already ships the required APIs on Android/iOS and is already integrated in the app. |

**Net**: we can deliver Needle-_like_ RAG accuracy, speed, and tool-use improvements immediately with the engine we already ship, and swap to the true Needle bundle later with no architecture change.

## 3. New architecture

```
user prompt
   │
   ▼
CactusLM router call (existing SDK)
   │  tools: [retrieve_documents, skip_rag, expand_search]
   │  options: { forceTools: true, toolRagTopK: 3, confidenceThreshold: 0.7 }
   ▼
function call + confidence
   │
   ├── skip_rag ───────────────────────────► return [] (no embed/search)
   ├── retrieve_documents(query, top_k) ───► embed → runSemanticSearch(slug, topK)
   └── expand_search(revised_query, top_k) ─► rewrite query, widen topK, then search
```

The same mechanism also improves **tool use** in `CactusLmWrapper.streamGetChatCompletion()`:

```ts
const result = await this.cactusLmContext.complete({
  messages,
  tools: cactusTools,
  options: {
    forceTools: false,
    toolRagTopK: 5,       // rank large catalog, only pass top-K to decoder
    confidenceThreshold: 0.7,
  },
  onToken: callback,
});
```

`toolRagTopK` selects the most relevant tools via an internal RAG step before generation, and `confidenceThreshold` lets us gate low-confidence calls to cloud handoff or fall back to text.

## 4. Why not official Cactus Needle today

The SDK's model registry (`node_modules/cactus-react-native/lib/module/modelRegistry.js`) only accepts models that:

1. live under `https://huggingface.co/Cactus-Compute`,
2. have a Git tag `v{major}.{minor}.{patch}` ≤ runtime `1.13.1`,
3. contain **both** `weights/{slug}-int4.zip` and `weights/{slug}-int8.zip`.

Live check results:

| Model | Tags | `weights/` zips | Registry-loadable? |
| --- | --- | --- | --- |
| `Cactus-Compute/needle` | none | none (JAX/Safetensors only) | ❌ |
| `Cactus-Compute/needle-pebble-ft` | none | `needle-pebble-ft-int4.zip` only, plus a root-level `*-cq4.zip` | ❌ |

→ `new CactusLM({ model: 'needle' })` will 404 today. We therefore **cannot** use the official Needle model through the existing SDK without Cactus publishing a compatible bundle.

## 5. Why not `needle-rs` today

`needle-rs` (Geekgineer/needle-rs, 26M params, 22 MB INT4, ~80 ms warm ARM NEON) is still technically viable, but it requires:

- a new Rust → C ABI cross-compile for Android/iOS,
- new TurboModules (`NeedleModule.kt` / `NeedleModule.swift`),
- a separate weight-download path,
- maintenance of a native bridge that duplicates capabilities already present in `cactus-react-native`.

The **same user-facing improvement** (RAG routing, tool ranking, confidence gating) is achievable through the Cactus engine immediately. We keep `needle-rs` as a tracked alternative, not the v2 default.

## 6. Migration path to true Needle

When Cactus publishes Needle in registry format:

1. Add the Needle slug to `src/utils/models/defaults.ts` (or a dedicated router model list).
2. Instantiate a dedicated `CactusLM({ model: 'needle', options: { quantization: 'int4' } })` router in `NeedleStore`.
3. Keep the same `NeedleRouter.routeRag()` / `routeTools()` TS contract — only the model slug changes.
4. Reuse the existing download/init/cleanup path from `CactusLmWrapper`.

If Cactus never publishes a registry bundle but the 22 MB footprint becomes critical, execute the v1 `needle-rs` native-module spike.

## 7. Design

### 7.1 Router model

Use a small, tool-capable Cactus model. Good candidates from the current registry:

| Slug | Params | Tags | Why |
| --- | --- | --- | --- |
| `lfm2.5-350m` | 350 M | `completion`, `tools`, `embed` | Smallest tool-capable model in the registry. |
| `qwen3-0.6b` | 0.6 B | `completion`, `tools`, `embed` | Already a chat default; can share context if already loaded. |

The choice is made in `src/utils/models/defaults.ts` and passed to `NeedleStore`.

### 7.2 TS layer — `NeedleRouter`

```
src/utils/Needle/
  types.ts          // RouteDecision union + ToolDef types
  NeedleClient.ts   // wraps CactusLM, async init, routeRag(), routeTools()
  index.ts          // exports + DOCUMENT_TOOLS / TOOL_ROUTER_TOOLS
src/store/NeedleStore.ts    // MobX singleton: model, loaded, ready, lastRoute
src/hooks/useNeedle.ts
```

`routeRag(userPrompt)`:

1. if `!NeedleStore.ready` → `{ type: 'fallback' }`.
2. Build `CactusLMTool[]` for the document-router.
3. `const result = await cactusLm.complete({ messages, tools, options: { forceTools: true, maxTokens: 64 } })`.
4. Parse `result.functionCalls[0]`; map to `NeedleRouteDecision`.
5. Clamp `topK` to `[1, min(maxTopK, 5)]`.

`routeTools(userPrompt, allTools, topK)`:

1. if `!NeedleStore.ready` → return `allTools`.
2. Call `complete({ messages, tools: allTools, options: { toolRagTopK: topK } })`.
3. Return the subset selected by the engine (or all tools on fallback).

### 7.3 Tool definitions (document-intelligence)

```ts
const DOCUMENT_TOOLS = [
  {
    name: "retrieve_documents",
    description: "Pull your workspace documents relevant to the question.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search text to embed and match against." },
        top_k: { type: "integer", description: "How many document chunks to pull (1-5)." },
      },
      required: ["query"],
    },
  },
  {
    name: "skip_rag",
    description: "No document context is needed; answer from general knowledge.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "expand_search",
    description: "Re-run retrieval with a rewritten query and more chunks.",
    parameters: {
      type: "object",
      properties: {
        revised_query: { type: "string" },
        top_k: { type: "integer" },
      },
      required: ["revised_query"],
    },
  },
];
```

### 7.4 Hook into `getContextTexts()`

Insert a router gate at the top of `getContextTexts()`, **before the embed call**:

```ts
const route = await NeedleRouter.routeRag(userPrompt, { maxTopK: this.topN * 2 });
switch (route.type) {
  case "skip":
    return [];
  case "expand":
  case "retrieve":
    topN = Math.min(route.topK, this.topN * 2);
    break;
  default:
    // fallback: keep existing behavior
}
```

### 7.5 Hook into `streamGetChatCompletion()`

In `src/utils/AiProviders/onDevice/cactus/index.ts`:

```ts
const result = await this.cactusLmContext.complete({
  messages: messages as any,
  options: {
    stopSequences: [...stops],
    maxTokens: this.nPredict,
    ...apiParams,
    temperature: this.temperature,
    toolRagTopK: cactusTools.length > 5 ? 5 : undefined,
    confidenceThreshold: 0.7,
  },
  tools: cactusTools.length > 0 ? cactusTools : undefined,
  onToken: callback,
});
```

### 7.6 Failure/latency contract

- **Timeout** the `routeRag()` / `routeTools()` calls at ~500 ms. If exceeded → `fallback`.
- Cache the router `CactusLM` instance for the session; reuse across calls.
- Serialize concurrent routing calls (the SDK's underlying engine is single-generation; `CactusLM` throws if a generation is already in progress).
- Never propagate native errors to `getContextTexts()` or chat completion — all router errors map to `fallback`.

## 8. Hoisting decisions

- **Engine**: existing `cactus-react-native` `CactusLM` (no new native module).
- **Router model**: `lfm2.5-350m` int4 by default; overridable per build.
- **Paid-tier gating**: Needle-like routing is positioned as a Pro feature per the freemium architecture spec. The gate lives in `NeedleStore.init()` using `SubscriptionStore`.
- **Alternative retained**: `needle-rs` native module remains documented as the footprint-optimized future path.

## 9. Risks & mitigations

| Risk | Status | Mitigation |
| --- | --- | --- |
| Router model larger/slower than true Needle (350M vs 26M) | accepted for v2 | Measure latency in spike; if unacceptable, escalate to `needle-rs` or wait for Cactus Needle bundle. |
| Tool-call format differs from Needle's constrained JSON | verified | Cactus returns `functionCalls` array; parser normalizes to the same `NeedleRouteDecision`. |
| SDK's `forceTools` not deterministic enough | spike | Test routing accuracy on representative queries; tune prompts/tools. |
| Router call contends with chat generation | verified risk | Use a separate `CactusLM` instance for routing, or serialize behind `NeedleStore`. |
| Cactus Needle bundle arrives later | tracked | Migration is a one-line slug swap. |

## 10. Files touched

- `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}` (new)
- `src/store/NeedleStore.ts` (new)
- `src/hooks/useNeedle.ts` (new)
- `src/utils/models/defaults.ts` (add router model entry)
- `src/utils/AiProviders/baseOpenAILikeProvider/index.ts` (edit `getContextTexts`)
- `src/utils/AiProviders/onDevice/cactus/index.ts` (edit `streamGetChatCompletion` to pass `toolRagTopK` / `confidenceThreshold`)

No new native modules, no Rust cross-compile, no Android/iOS build changes.

---

_Next step: run the Phase 0 spike (verify `lfm2.5-350m` tool-calling accuracy and latency) before writing the TS layer._
