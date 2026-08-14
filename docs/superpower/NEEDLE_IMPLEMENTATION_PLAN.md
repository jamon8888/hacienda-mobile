# Needle — Implementation Plan v2.0.0

> **v2.0.0** · Companion implementer for [`NEEDLE_INTEGRATION.md`](NEEDLE_INTEGRATION.md).
> Goal: ship an on-device RAG **router** (skip / retrieve / expand) and smarter tool selection using the **existing `cactus-react-native` engine**. **No new native module** — a transparent layer inside `getContextTexts()` and the on-device chat provider that degrades silently to current behavior.
> Rule: @ reviewers — flag anything that contradicts the spec or the existing Cactus integration.

---

## 0. Phase map

| #   | Phase                                         | Deliverable                                           | Done-when                                |
| --- | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| P0  | Feasibility spike (model loads + routes)      | proof run of `lfm2.5-350m` tool calls                 | K0..K5                                   |
| P1  | TS layer `src/utils/Needle`                   | `types.ts` / `NeedleClient.ts` / `index.ts`           | typecheck                                |
| P2  | State + hook                                  | `NeedleStore.ts`, `useNeedle.ts`                      | typecheck                                |
| P3  | Router integration into `getContextTexts`     | gate before embed                                     | typecheck + unit test                    |
| P4  | Tool-rag integration into `CactusLmWrapper`   | pass `toolRagTopK` / `confidenceThreshold`            | typecheck                                |
| P5  | Add router model to defaults + wiring         | `defaults.ts` entry, `SubscriptionStore` gate         | typecheck                                |
| P6  | Tests & quality                               | unit + integration tests                              | `yarn test`                              |
| P7  | (Future) Needle model migration               | swap slug when Cactus publishes bundle                | tracked, not scheduled                   |

---

## P0 — Feasibility spike (BLOCKING; do first)

Verifies a small Cactus model can act as a RAG router before any integration.

1. Add `lfm2.5-350m` (or `qwen3-0.6b`) as a test entry in a throwaway script.
2. Download and init via `CactusLM` in a Node / RN debug build.
3. Call `complete({ messages, tools: DOCUMENT_TOOLS, options: { forceTools: true, maxTokens: 64 } })` with representative queries:
   - "What is the capital of France?" → `skip_rag`
   - "What does the budget say about travel?" → `retrieve_documents`
   - "Find me everything about Q3 revenue" → `expand_search` (or high `top_k`)
4. Measure latency (warm) and RAM. Budget: warm < 500 ms, working set reasonable on a mid-range device.
5. Repeat on a real Android device to confirm ARM path performance.

**Exit criteria:** tool calls are syntactically valid and map to the expected actions ≥ 80 % of the time. → K0 — nothing else starts.

---

## P1 — TS layer `src/utils/Needle`

Mirror `src/utils/Xberg/*`:

- **`types.ts`** — `NeedleRouteDecision = { type: 'retrieve', topK } | { type: 'expand', topK, revisedQuery } | { type: 'skip' } | { type: 'fallback' }`; `NeedleToolSelectionResult`; `DOCUMENT_TOOLS`; `TOOL_ROUTER_TOOLS`.
- **`NeedleClient.ts`** — wraps a `CactusLM` instance:
  ```ts
  static async init(modelRef: CactusModelRef): Promise<void>
  static async routeRag(query: string, opts?: RouteOptions): Promise<NeedleRouteDecision>
  static async selectTools(query: string, tools: CactusLMTool[], topK?: number): Promise<CactusLMTool[]>
  ```
  Add the **500 ms timeout** guard + `fallback` on any rejection.
- **`index.ts`** — exports the above plus helper `buildDocumentTools()`.

Re-use `CactusLMTool` from `cactus-react-native` directly. Keep the router a pure function (no store coupling) for unit-testing.

**Verify**: `yarn typecheck` passes.

---

## P2 — State + hook

- **`src/store/NeedleStore.ts`** — singleton, `makeAutoObservable`, fields `{ ready, busy, lastRoute, error, modelRef }`, methods `init()`, `routeRag()`, `selectTools()`. Non-blocking: `init` swallows failures into `ready=false`.
- **`src/hooks/useNeedle.ts`** — returns `{ ready, busy, routeRag, selectTools }` bound to the store (pattern of `useXberg`).

The store owns the lifecycle of the `CactusLM` router instance and enforces serialization (single in-flight call) because the SDK is not re-entrant across completions.

**Verify**: `yarn typecheck` passes.

---

## P3 — Integrate into `getContextTexts()`

**File**: `src/utils/AiProviders/baseOpenAILikeProvider/index.ts`, **at top of** `getContextTexts` (before the embed).

```ts
const route = await NeedleRouter.routeRag(userPrompt, {
  maxTopK: this.topN * 2,
});
if (route.type === "skip") return [];
const topN =
  route.type === "expand" || route.type === "retrieve"
    ? route.topK
    : this.topN;
// existing path continues with topN
```

- Guard upstream so `routeRag` never throws (it returns `fallback`).
- `skip` path returns early; `expand`/`retrieve` override `topN`; `fallback` reuses `this.topN`.

**Verify**: `yarn typecheck` + new unit tests in `src/utils/Needle/__tests__/routeRag.test.ts`.

---

## P4 — Integrate tool-rag into `CactusLmWrapper`

**File**: `src/utils/AiProviders/onDevice/cactus/index.ts`, inside `streamGetChatCompletion()`.

Update the `complete()` call to:

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

This lets the engine rank large tool catalogues and only consider the top-K, matching one of Needle's headline benefits.

**Verify**: `yarn typecheck` passes.

---

## P5 — Router model in defaults + Pro gating

**File**: `src/utils/models/defaults.ts`

Add a router model entry (not a chat model):

```ts
export const CACTUS_ROUTER_MODELS = {
  needle_router_lfm2_5_350m: {
    slug: "lfm2.5-350m",
    quantization: "int4",
  },
} as const satisfies Record<string, CactusModelRef>;
```

**File**: `src/store/NeedleStore.ts`

Gate `init()` on `SubscriptionStore`:

```ts
if (!subscriptionStore.canUseNeedleRouter) {
  this.ready = false;
  return;
}
```

The freemium architecture spec positions this as a paid-only feature; free users fall back to unconditional retrieval.

**Verify**: `yarn typecheck` passes.

---

## P6 — Tests & quality

- Unit: `routeRag` mapping / clamp / fallback cases (`src/utils/Needle/__tests__/routeRag.test.ts`).
- Unit: `selectTools` fallback when router unavailable.
- Integration on device: RAG-answer vs general-knowledge questions only when correctly routed.
- `yarn typecheck`, `yarn lint`, `yarn test`.

---

## P7 — Future: true Needle migration (tracked, not scheduled)

When `Cactus-Compute/needle` or `Cactus-Compute/needle-pebble-ft` is published in the registry format (`weights/*-int4.zip` + `weights/*-int8.zip` + version tags ≤ 1.13.1):

1. Add the slug to `CACTUS_ROUTER_MODELS`.
2. Change `NeedleStore` default modelRef.
3. No other code changes.

If the 22 MB `needle-rs` footprint becomes critical before a Cactus bundle ships, execute the v1 native-module spike and reopen the v1 implementation plan.

---

## Files (all new unless noted)

| Path                                                                  | Action                               |
| --------------------------------------------------------------------- | ------------------------------------ |
| `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}`              | create                               |
| `src/store/NeedleStore.ts`, `src/hooks/useNeedle.ts`                  | create                               |
| `src/utils/models/defaults.ts`                                        | add `CACTUS_ROUTER_MODELS`           |
| `src/utils/AiProviders/baseOpenAILikeProvider/index.ts`               | edit `getContextTexts`               |
| `src/utils/AiProviders/onDevice/cactus/index.ts`                      | edit `streamGetChatCompletion`       |
| `src/store/SubscriptionStore.ts`                                      | add `canUseNeedleRouter` (if absent) |

## Rollback / safety

- The needle gate lives in one function with a guaranteed `fallback` return — reverting = revert that single edit. A broken/missing router can never `throw` into `getContextTexts`.
- Tool-rag changes in `CactusLmWrapper` are additive option fields; removing them restores prior behavior.
- **No public API/UI change in v2.**

---

## R — Review findings

Findings from auditing this plan against the spec and the existing Cactus integration:

1. **`CactusLM.complete()` is already async and runs on a Nitro/Hybrid thread.** The JS-side timeout cannot cancel it; it only lets `routeRag` return `fallback` while the native call completes. Acceptable **only if we enforce max one in-flight call** — see (3).
2. **The SDK is not re-entrant.** `CactusLM` throws if a completion/embedding is already in progress. `NeedleStore` must serialize calls.
3. **Concurrency / serialization:** `routeRag()` and `selectTools()` calls must be serialized behind a JS-side queue (or a `busy` flag). Two overlapping calls corrupt state or throw.
4. **Model lifecycle:** the router `CactusLM` instance must be `destroy()`-ed when the store is torn down (app background / logout) to free native memory.
5. **Clamp scope:** `routeRag` must NOT read `this.topN`; it takes `opts.maxTopK` as an arg. Hard-clamp `topK` to `[1, min(maxTopK, 5)]`.
6. **Tool description token budget:** keep `DOCUMENT_TOOLS` terse; future additions must not bloat the prompt.
7. **Silent fail contract:** any `reject`/`throw` path maps to `{ type: 'fallback' }` or the unfiltered tool list — never propagate.
8. **Pro gating:** confirm `SubscriptionStore.canUseNeedleRouter` exists or add it before P5.
