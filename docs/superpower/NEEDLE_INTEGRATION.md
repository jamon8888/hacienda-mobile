# Needle Integration — True Needle via the Cactus Engine

> **Status**: Draft / v2.1
> **Decision**: Run the real **Cactus-Compute/needle** model (26M params, 16 MB CQ4 bundle) through the **existing `cactus-react-native` engine**. No `needle-rs` bridge, no new native module — just download the official CQ4 bundle, extract it, and load it as a local model path.
> **Verified against real artifacts**: `cactus-react-native@1.13.1` source/typings, live HuggingFace tree for `Cactus-Compute/needle`, and a downloaded/extracted copy of `needle-cq4.zip`.

---

## 1. Why (problem)

Today RAG is unconditional:

- `getContextTexts()` (`src/utils/AiProviders/baseOpenAILikeProvider/index.ts`) embeds the user prompt and always runs `VectorDB.runSemanticSearch(..., topN)`.
- The model is flooded with context **regardless of whether the question is actually document-grounded**, and there is no cheap, on-device signal to choose _how much_ context to pull or _which tools_ to expose.

Needle gives us that signal: a 26M-param tool-calling model that maps `(query, tool-definitions) → single JSON call` in one forward pass. We use it to **decide the RAG strategy before embedding** — skip retrieval, narrow it, or widen it — and only then pay for semantic search / generation.

## 2. Verified facts

### The model — `Cactus-Compute/needle`

| Property              | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Architecture          | Encoder-decoder "Simple Attention Network" (pure attention, **no FFN**) |
| Encoder               | 12 layers, GQA (8H/4KV), RoPE, gated residuals                          |
| Decoder               | 8 layers, self-attn + cross-attn, gated residuals                       |
| d_model               | 512                                                                     |
| Vocab                 | 8192 (SentencePiece BPE)                                                |
| Precision             | BF16; INT4-QAT during training                                          |
| Production runtime    | Cactus engine (6000 tok/s prefill, 1200 tok/s decode)                   |
| Mobile bundle         | `needle-cq4.zip` (≈ 16 MB) on HuggingFace                               |
| License               | **MIT**                                                                 |

### The CQ4 bundle exists and is a real Cactus bundle

Live check of `https://huggingface.co/api/models/Cactus-Compute/needle/tree/main` shows:

- `needle-cq4.zip` — 16,185,061 bytes
- `model.safetensors` — 60,881,792 bytes (the JAX/Flax source)
- `needle.pkl` — 52,633,098 bytes (Python checkpoint)

Extracting `needle-cq4.zip` yields a standard Cactus weight folder:

```
needle-cq4/
  config.txt          # model_type=needle, is_encoder_decoder=true, d_model=512, ...
  config.json
  hf_config.json
  tokenizer.model
  vocab.txt
  special_tokens.json
  merges.txt
  weights_manifest.json
  conversion_manifest.json
  token_embeddings.weights
  output_weight.weights
  encoder_layer_*.weights
  layer_*.weights
  ...
```

This is the exact folder layout `cactus_init("path/to/weight/folder", ...)` expects.

### Why the registry code missed it

`cactus-react-native@1.13.1`'s `modelRegistry.js` only accepts models that have **both** `weights/{slug}-int4.zip` **and** `weights/{slug}-int8.zip` plus a SemVer tag ≤ the runtime version. Needle ships as a single root-level `needle-cq4.zip` with no version tags, so the registry silently skips it.

**We do not need the registry.** `CactusFileSystem.downloadModel(name, url)` downloads and extracts arbitrary bundle zips, and `CactusLM` accepts an absolute path via `model: '/path/to/extracted/needle-cq4'`.

### needle-rs is not required

The original v1 plan proposed adding a separate `needle-rs` native module because it was assumed `cactus-react-native` could not run Needle. That assumption is wrong:

- The Cactus engine's own CLI advertises `cactus run Cactus-Compute/needle --tools my_tools.json`.
- The extracted `needle-cq4.zip` is a native Cactus bundle.
- `cactus-react-native` is a thin wrapper around the same Cactus engine.

→ `needle-rs` is a fallback option only if the CQ4 bundle proves incompatible with runtime 1.13.1. The spike must confirm compatibility.

## 3. End-to-end data flow

```
user prompt
   │
   ▼
Needle (CactusLM loaded from local needle-cq4 bundle)
   │  tools: [retrieve_documents, skip_rag, expand_search]
   │  options: { forceTools: true }
   ▼
function call
   │
   ├── skip_rag ───────────────────────────► return [] (no embed/search)
   ├── retrieve_documents(query, top_k) ───► embed → runSemanticSearch(slug, topK)
   └── expand_search(revised_query, top_k) ─► rewrite query, widen topK, then search
```

The same Needle instance can also rank the app tool catalogue before the main LLM call (tool RAG), and provide a confidence score for each routing decision.

## 4. Design

### 4.1 Needle model lifecycle

```
app/documents directory
   │
   ├── models/needle/
   │     └── needle-cq4/            # extracted bundle
   │           ├── config.txt
   │           ├── ...weights...
   │
   └── NeedleStore holds CactusLM({ model: '/data/.../models/needle/needle-cq4' })
```

Download source:

```ts
const NEEDLE_CQ4_URL =
  "https://huggingface.co/Cactus-Compute/needle/resolve/main/needle-cq4.zip";
```

Extraction is done in pure JS with `jszip` (added as a direct dependency) after downloading the zip with RNFS. This avoids relying on the SDK's internal `CactusFileSystem` API and avoids adding a native zip module.

### 4.2 Native bridge — none needed

No new Kotlin/Swift modules. Needle runs through the same `Cactus` Nitro object already used by chat models.

### 4.3 TS layer — `NeedleStore` + `NeedleRouter`

```
src/utils/Needle/
  types.ts          // RouteDecision union + ToolDef types
  NeedleClient.ts   // wraps CactusLM loaded from local path
  index.ts          // exports routeRag + helpers
src/store/NeedleStore.ts    // MobX singleton: loaded, ready, lastRoute
src/hooks/useNeedle.ts
```

`routeRag(userPrompt)`:

1. if `!NeedleStore.ready` → `{ type: 'fallback' }`.
2. Build `CactusLMTool[]` for the document-router.
3. `const result = await needleLm.complete({ messages, tools, options: { forceTools: true, maxTokens: 64 } })`.
4. Parse `result.functionCalls[0]`; map to `NeedleRouteDecision`.
5. Clamp `topK` to `[1, min(maxTopK, 5)]`.

### 4.4 Tool definitions (document-intelligence)

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

### 4.5 Hook into `getContextTexts()`

Insert a needle gate at the top of `getContextTexts()`, **before the embed call**:

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

### 4.6 Tool-rag in `CactusLmWrapper`

The main chat LLM can also benefit from Needle-like tool ranking. Today `streamGetChatCompletion()` passes the full tool list. For large catalogues we can use the same Needle instance (or the chat model's own `toolRagTopK`) to pre-rank tools:

```ts
const rankedTools = await NeedleRouter.selectTools(
  lastUserMessage,
  cactusTools,
  5,
);
```

Then pass `rankedTools` to the main LLM. This keeps the main LLM prompt small and avoids exposing irrelevant tools.

### 4.7 Confidence gating

`CactusLM.complete()` returns `confidence`. We can:

- In RAG routing: if `confidence < 0.7`, treat as `fallback` (do the default retrieval).
- In tool selection: if `confidence < 0.7`, return the full tool list.

This gives us a safety margin while the model is being validated in production.

### 4.8 Failure/latency contract

- **Timeout** `routeRag()` at ~500 ms. Exceeded → `fallback`.
- Serialize all Needle calls; the underlying engine is not re-entrant.
- If the bundle is missing or `init()` fails → `NeedleStore.ready = false`, all calls return `fallback`.
- Keep a last-known-good path so the app never blocks on Needle.

## 5. Why this is the right path

| Concern | Cactus CQ4 Needle | needle-rs bridge |
| --- | --- | --- |
| Footprint | 16 MB bundle | 22 MB weights + native lib |
| Speed | Cactus NEON/Metal kernels | needle-rs NEON (slower, no Metal) |
| Native work | None (uses existing Cactus engine) | New Android/iOS modules |
| Maintenance | Same as other Cactus models | Separate Rust repo + bindings |
| Correctness | Official Cactus bundle, constrained decoding in engine | Independent reimplementation |
| Mobile recommendation | Cactus's own CLI/docs say "use Cactus" | README says "(use Cactus)" for mobile |

## 6. Open risks

| Risk | Mitigation |
| --- | --- |
| `needle-cq4.zip` format incompatible with runtime 1.13.1 | P0 spike: load the bundle in an RN build. If it fails, try `needle-pebble-ft-cq4.zip` or fall back to `needle-rs`. |
| `CactusFileSystem.downloadModel` does not extract zips | Use `react-native-zip-archive` after download. |
| English-only / greedy limitations | Acceptable for routing; never send freeform chat through Needle. |
| Concurrent calls to single `CactusLM` instance | Serialize behind `NeedleStore`. |
| 16 MB download on cellular | Respect user's download preferences; default to Wi-Fi. |

## 7. Files touched

- `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}` (new)
- `src/store/NeedleStore.ts` (new)
- `src/hooks/useNeedle.ts` (new)
- `src/utils/AiProviders/baseOpenAILikeProvider/index.ts` (edit `getContextTexts`)
- `src/utils/AiProviders/onDevice/cactus/index.ts` (edit `streamGetChatCompletion` for tool ranking)
- `src/services/downloads/NeedleBundleDownloader.ts` (RNFS + jszip download/extract)
- `package.json` (add `jszip`)

---

_Next step: execute the P0 spike — download `needle-cq4.zip`, extract it, and prove `CactusLM` loads it and returns a valid tool call on-device._
