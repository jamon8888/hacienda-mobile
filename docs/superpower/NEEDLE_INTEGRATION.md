# Needle Integration — On-Device Document-Intelligence Router

> **Status**: Draft / Feasibility-pending
> **v1.0.0** — spec for routing RAG retrieval via Cactus Compute's **Needle** tool-calling model, executed through the **needle-rs** Rust runtime compiled to a C ABI and bridged the same way as Xberg (`XbergModule.kt` / `XbergModule.swift`).
> **Verified against real docs**: upstream [Cactus-Compute/needle](https://github.com/cactus-compute/needle), the [Needle model card](https://huggingface.co/Cactus-Compute/needle), the [onnx-community/needle-onnx](https://huggingface.co/onnx-community/needle-onnx) export, [Abdalrahman/needle-rs-safetensors](https://huggingface.co/Abdalrahman/needle-rs-safetensors), and the [Geekgineer/needle-rs](https://github.com/Geekgineer/needle-rs) README/BENCHMARKS/ARCHITECTURE.

---

## 1. Why (problem)

Today RAG is unconditional:

- `getContextTexts()` (`src/utils/AiProviders/baseOpenAILikeProvider/index.ts:272`) embeds the user prompt and always runs `runSemanticSearch(..., topN)` (topN=2).
- The model is flooded with context **regardless of whether the question is actually document-grounded**, and there is no cheap, on-device signal to choose _how much_ context to pull.

Needle gives us that signal: a proven, 26M-param tool-calling model that maps `(query, tool-definitions) → single JSON call` in one forward pass. We use it to **decide the RAG strategy before embedding** — skip retrieval, narrow it, or widen it — and only then pay for semantic search / generation.

## 2. Verified facts (correcting prior assumptions)

### The model — `Cactus-Compute/needle`

| Property              | Value                                                                   |
| --------------------- | ----------------------------------------------------------------------- |
| Architecture          | Encoder-decoder "Simple Attention Network" (pure attention, **no FFN**) |
| Encoder               | 12 layers, GQA (8H/4KV), RoPE, gated residuals                          |
| Decoder               | 8 layers, self-attn + cross-attn, gated residuals                       |
| d_model               | 512                                                                     |
| Vocab                 | 8192 (SentencePiece BPE)                                                |
| Precision             | BF16; INT4-QAT during training                                          |
| Trained on            | 200B tokens + 2B function-call tokens                                   |
| Speed (Cactus native) | ~6000 tok/s prefill, ~1200 tok/s decode                                 |
| License               | **MIT**                                                                 |

### The fatal correction: **NO GGUF exists**

Prior plan assumed loading needle in the existing `CactusLM` (llama.cpp) context. **This is impossible.** The vendored `cactus-react-native@0.2.10` is a **llama.cpp/ggml fork** (`LM_GGML_USE_CPU`/`LM_GGML_USE_METAL`, `LlamaContext.java`, GGUF-only). Needle is encoder-decoder and ships JAX/Safetensors — the only ready-made runtimes are:

| Quantization                           | Runtime                                  | Size                     | Mobile-relevant?       |
| -------------------------------------- | ---------------------------------------- | ------------------------ | ---------------------- |
| `Abdalrahman/needle-rs-safetensors`    | **needle-rs** (pure Rust + WASM + C ABI) | 22 MB INT4 (custom `I4`) | ✅ target of this spec |
| `onnx-community/needle-onnx`           | onnxruntime (web/mobile)                 | 55 MB + 85 MB            | fallback path only     |
| `RockMan256/needle-onnx-lfm`           | ONNX                                     | ~                        | fallback               |
| `justinebert1/needle_finetune_example` | finetune example                         | ~                        | n/a                    |

### needle-rs runtime (chosen) — verified

- Pure Rust; deploys to browser WASM (258 KB), CLI (533 KB), **C/C++/Go/Swift via FFI (557 KB)**, Python, `no_std` embedded.
- INT4 group-wise (`group_size=32`), AVX2 on x86_64, **NEON on aarch64**, scalar for WASM.
- **Constrained decoding**: char-level trie + three-state JSON machine masks logits → output is always valid JSON pointing at a real tool (no hallucinated names).
- Accepts both flat `{"location":{"type":"string"}}` and OpenAI `{"type":"object","properties":...}` schema forms (Python reference handles only flat — Rust handles both).
- **Greedy/argmax only** (by design — routing, not generation). No temperature.
- Guaranteed **560/560 token-exact** parity vs the Python/JAX reference, enforced in CI.
- API surface: `run` / `run_stream` / `run_batch` / `encode_contrastive` / `retrieve_tools`.
- Reserved: encoder long `≤ 1024 tokens` (tool catalogue must be pre-filtered for large lists).

### Important caveat from the official repo

The needle-rs README notes _"iOS / Android … (use Cactus)"_ — Cactus's official engine targets mobile/NPUs with hand-tuned ARM SIMD. We **ignore** that recommendation for two concrete reasons:

1. The vendored mobile package (`cactus-react-native`) is only the llama.cpp fork — it cannot load needle. The official Rust engine is not yet packaged for RN.
2. needle-rs already ships a **aarch64 NEON path + a tiny 557 KB C ABI**, which is trivially cross-compiled and bridged through our existing native-module template. At 22 MB weights / ~80 ms warm inference this is well under the Xberg footprint bar.

→ Decision recorded for the feasibility spike (see §8): confirm REAL aarch64-NEON ARM SIMD speed on a device; if the NN path is not enabled, prefer a WASM build over the brittle x86 matvec.

## 3. End-to-end data flow

```
user prompt
   │
   ▼
needle (needle-rs, native) ──"route_document_search"──► returns:
   │                                                         ┌ retrieve_documents(query, top_k)
   │  (or skip_rag/citation tools)                        ──┤ widen_search(query, top_k)
   ▼                                                       └ skip_rag()
choose RAG strategy
   │  ┌─────────────── yes ────────────────► embed query → runSemanticSearch(slug, topK) → buildPrompt
   ▼  │
workspace has vectors?
   └──────────── no ────► existing RAG path unchanged
```

Requirements:

- Guarantees when Needle is missing/failing (model not downloaded, native lib absent, architecture mismatch) → **graceful fallback to the current unconditional semantic search** (never block the user flow; §4.5).

## 4. Design

### 4.1 Native artifact (per platform)

Same pattern as Xberg module pattern. Rust `needle-rs` → C ABI `libneedle.so`/`.dylib` via `cargo build --release --target aarch64-linux-android` (and `armeabi-v7a`, `x86_64`) + iOS staticlib (`aarch64-apple-ios` / `aarch64-apple-ios-sim`).

Library APIs (from the repo header `crates/needle-c` today):

```c
NeedleHandle  needle_load(const char *safetensors_path, const char *vocab_path);
const char *  needle_run(NeedleHandle h, const char *query, const char *tools_json);
void          needle_free_str(char *out);
void          needle_free(NeedleHandle h);
const char *  needle_last_error(void);
```

Also confirmed: `engine.encode_contrastive` / `engine.retrieve_tools(query, descs, k) -> Vec<(usize, f32)>` — we can use `retrieve_tools` later to rank a growing tool catalogue, but for the current 2-3 document tools we statically pass all of them (avoids the ≤1024 encoder limit).

### 4.2 Native bridge (JS ⇄ Rust)

Great fit for the Xberg module pattern already in the repo:

- **Android**: `NeedleModule.kt` + `NeedlePackage.kt`, JNI → the static `libneedle.so`.
- **iOS**: `NeedleModule.swift` + `.m` (Turbo module mimic), link the staticlib + **C** header.
- Exposed RN methods (mirror needles):
  - `init({ weightsPath, vocabPath }) -> null`
  - `route(query: string, toolsJson: string): string` (returns the JSON call, parsed in TS)
  - `release()`
- **always return an empty string / throw a `flag "DISABLED"` when `needle_load` fails or no weights — never the app crash.**

### 4.3 TS layer — `NeedleRouter`

```
src/utils/Needle/
  types.ts          // RouteDecision union + ToolDef types
  NeedleClient.ts   // wraps NativeModules.NeedleModule, async init, route()
  index.ts          // exports routeRag + helpers
src/store/NeedleStore.ts    // MobX makeAutoObservable singleton: loaded, ready, lastRoute
src/hooks/useNeedle.ts
```

`routeRag(userPrompt)`:

1. if `!NeedleStore.ready` → `{ action: 'rag', }` (fallback).
2. Build `toolsJson` for the document-router (below).
3. `const json = await NeedleClient.route(userPrompt, toolsJson)` → parse.
4. Map to `NeedleRouterAction`: `{ type: 'retrieve', topK } | { type: 'expand', topK, revisedQuery } | { type: 'skip' }`. Fallback `{ type: 'retrieve', topK: default }`.

### 4.4 Tool definitions (document-intelligence)

Always pass the full set statically (no need for `retrieve_tools` while there are ≤3 tools). Needle accepts OpenAI's `{"type":"object","properties":...}` form, so we can reuse the same shape throughout. Keep `name`s `snake_case` (the trained convention) and descriptions terse to fit the encoder budget.

```ts
const DOCUMENT_TOOLS = [
  {
    name: "retrieve_documents",
    description: "Pull your workspace documents relevant to the question.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search text to embed and match against.",
        },
        top_k: {
          type: "integer",
          description: "How many document chunks to pull (1-5).",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "skip_rag",
    description:
      "No document context is needed; answer from general knowledge.",
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

The routed call must always name exactly one of these tools; any other result is treated as `fallback` in `NeedleRouter` (§4.3).

### 4.5 Hook into `getContextTexts()`

Insert a needle gate at the top of `getContextTexts()` (line 272), **before the embed call**:

```ts
const route = await NeedleRouter.routeRag(userPrompt);
switch (route.type) {
  case "skip":
    return []; // no retrieval, no embedding
  case "expand":
    topN = route.topK; // widen; then fall through
  case "retrieve":
    topN = Math.min(route.topK, this.topN * 2); // fall through
  default: /* 'fallback' */ // existing path unchanged
}
```

- The non-blocking fallback lives in `NeedleRouter`, so `getContextTexts` stays clean.
- `topK` is clamped to `[1, min(this.topN*2, 5)]` in the router so we never explode context.

### 4.6 Failure/latency contract

- **Timeout** the `route()` call at ~250 ms. If it exceeds (device still JIT / memory pressure), treat as `fallback`.
- Over-invokation: cache router for a session (init once, reuse).

## 5. Hoisting decisions

- **Engine**: needle-rs C ABI, cross-compiled (NEON aarch64), bridged via our native-module template.
- **Alternative**: WASM build hosted in RN via a wasm runtime lib — heavier bridge, same weights, useful if native cross-compile becomes painful. **Decision held as open** until spike.

## 6. Feasibility spike (before any UI)

1. Build/run `needle-rs` on **aarch64** target (Android API). Confirm the NEON path actually computes (not just scalar fallback).
2. Verify `needle_load` resolves in an RN Android build (gradle CMake staticlib linking).
3. End-to-end: a query with the DOCUMENT_TOOLS while embedded → calls return `JSON.parse`-able, correct routing.
4. Measure **append** cost on a mid-range device: load (~once) and per-route latency. Budget: < 300 ms warm / full cold, working set < 30 MB.
5. If NEON proves broken, pivot to the WASM variant and re-run.

## 7. Risks & mitigations

| Risk                                                            | Sat status                                 | Fallback                                                   |
| --------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------- |
| NN/aarch64 path slow on device                                  | verity in spike §6                         | WASM variant                                               |
| Mobile not primary target of needle-rs (README says use Cactus) | tiny lib + NEON already shipped            | keep tool budget; probe size                               |
| English-only / greedy limitations                               | acceptable — keep phrases short & explicit | enforce `skip` pattern; never send chat freeform to needle |
| `getContextTexts` blocking generation                           | gate with 250 ms timeout                   | treat as unavailable → default retrieval                   |
| weights 22 MB download                                          | support via same download infra as Cactus  | defer until user opts in                                   |

## 8. Files touched (all NEW — no churn on existing)

- `android/app/src/main/java/com/anythingllm/needle/{NeedleModule.kt, NeedlePackage.kt}`
- `ios/AnythingLLM/{NeedleModule.swift, NeedleModule.m}`
- `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}`
- `src/store/NeedleStore.ts`, `src/hooks/useNeedle.ts`
- `android/app/build.gradle` (CMake link + ABI), `ios/Podfile` (staticlib)
- **modify** `src/AiProviders/baseOpenAILikeProvider/index.ts::getContextTexts`

All MIT, credit Cactus Compute + needle-rs.

---

_Next step: execute §6 spike; do not start RN-side code until an Android build passes._
