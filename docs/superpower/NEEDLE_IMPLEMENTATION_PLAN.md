# Needle — Implementation Plan v2.1

> **v2.1** · Companion implementer for [`NEEDLE_INTEGRATION.md`](NEEDLE_INTEGRATION.md).
> Goal: ship the real **Cactus-Compute/needle** model as an on-device RAG router and tool-ranker, running through the **existing `cactus-react-native` engine**. No new native module. **Available to all users** by default; product gating is a separate business decision.
> Rule: @ reviewers — flag anything that contradicts the spec or the existing Cactus integration.

---

## 0. Phase map

| #   | Phase                                         | Deliverable                                           | Done-when                                |
| --- | --------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| P0  | Feasibility spike (CQ4 bundle loads + routes) | proof run on device                                   | K0..K5                                   |
| P1  | Bundle downloader                             | download + extract `needle-cq4.zip`                   | typecheck + unit test                    |
| P2  | TS layer `src/utils/Needle`                   | `types.ts` / `NeedleClient.ts` / `index.ts`           | typecheck                                |
| P3  | State + hook                                  | `NeedleStore.ts`, `useNeedle.ts`                      | typecheck                                |
| P4  | Router integration into `getContextTexts`     | gate before embed                                     | typecheck + unit test                    |
| P5  | Tool-ranking integration                      | `selectTools()` used by `CactusLmWrapper`             | typecheck                                |
| P6  | Tests & quality                               | unit + integration tests                              | `yarn test`                              |

---

## P0 — Feasibility spike (BLOCKING; do first)

Verifies the official CQ4 bundle actually loads in our pinned runtime.

1. Download `https://huggingface.co/Cactus-Compute/needle/resolve/main/needle-cq4.zip` to a dev machine and inspect the extracted folder (already done; see spec).
2. In an RN debug build, attempt to load it via `CactusLM` using a local path:
   ```ts
   const path = await CactusFileSystem.getModelPath('needle');
   const lm = new CactusLM({ model: path });
   await lm.init();
   ```
   Two load strategies to test:
   - **Strategy A**: use `CactusFileSystem.downloadModel('needle', NEEDLE_CQ4_URL)` and then `getModelPath('needle')`.
   - **Strategy B**: download the zip with RNFS, extract with `react-native-zip-archive`, then `new CactusLM({ model: extractedDir })`.
3. If `init()` succeeds, run the document-router tools and confirm valid JSON tool calls.
4. Measure load time, first-route latency, and peak RAM on a mid-range Android device.
5. If `needle-cq4.zip` fails on runtime 1.13.1, repeat with `needle-pebble-ft-cq4.zip`. If that also fails, escalate to the `needle-rs` v1 plan.

**Exit criteria:** a valid tool call is produced on-device. → K0 — nothing else starts.

---

## P1 — Bundle downloader

Create a dedicated downloader because the SDK registry does not list Needle.

**File**: `src/services/downloads/NeedleBundleDownloader.ts` (or extend `DownloadManager`).

```ts
const NEEDLE_CQ4_URL =
  "https://huggingface.co/Cactus-Compute/needle/resolve/main/needle-cq4.zip";

export class NeedleBundleDownloader {
  async ensureDownloaded(onProgress?: (p: number) => void): Promise<string> {
    const modelPath = await CactusFileSystem.getModelPath("needle");
    if (await CactusFileSystem.modelExists("needle")) {
      return modelPath;
    }
    await CactusFileSystem.downloadModel("needle", NEEDLE_CQ4_URL, onProgress);
    return CactusFileSystem.getModelPath("needle");
  }
}
```

If `downloadModel` does not extract the zip, fall back to:

```ts
const zipPath = `${RNFS.DocumentDirectoryPath}/models/needle/needle-cq4.zip`;
const extractDir = `${RNFS.DocumentDirectoryPath}/models/needle/needle-cq4`;
await RNFS.downloadFile({ fromUrl: NEEDLE_CQ4_URL, toFile: zipPath }).promise;
await zip(zipPath, extractDir); // react-native-zip-archive
return extractDir;
```

**Verify**: `yarn typecheck`; on-device download completes and folder contains `config.txt` + weight files.

---

## P2 — TS layer `src/utils/Needle`

Mirror `src/utils/Xberg/*`:

- **`types.ts`** — `NeedleRouteDecision = { type: 'retrieve', topK } | { type: 'expand', topK, revisedQuery } | { type: 'skip' } | { type: 'fallback' }`; `NeedleToolSelectionResult`; `DOCUMENT_TOOLS`.
- **`NeedleClient.ts`** — owns the `CactusLM` instance loaded from the local path:
  ```ts
  static async init(bundlePath: string): Promise<void>
  static async routeRag(query: string, opts?: RouteOptions): Promise<NeedleRouteDecision>
  static async selectTools(query: string, tools: CactusLMTool[], topK?: number): Promise<CactusLMTool[]>
  ```
  Add the **500 ms timeout** guard + `fallback` on any rejection.
- **`index.ts`** — exports the above plus helper `buildDocumentTools()`.

Keep the router a pure function for unit-testing; the store owns the instance.

**Verify**: `yarn typecheck` passes.

---

## P3 — State + hook

- **`src/store/NeedleStore.ts`** — singleton, `makeAutoObservable`, fields `{ ready, busy, lastRoute, error }`, methods `init()`, `routeRag()`, `selectTools()`. Non-blocking: `init` swallows failures into `ready=false`.
- **`src/hooks/useNeedle.ts`** — returns `{ ready, busy, routeRag, selectTools }` bound to the store.

The store:
1. Calls `NeedleBundleDownloader.ensureDownloaded()`.
2. Creates `new CactusLM({ model: bundlePath })`.
3. Calls `lm.init()` (no `lm.download()` because the registry path is not used).
4. Serializes all routing calls via a `busy` flag / queue.

**Verify**: `yarn typecheck` passes.

---

## P4 — Integrate into `getContextTexts()`

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

## P5 — Tool-ranking integration

**File**: `src/utils/AiProviders/onDevice/cactus/index.ts`, inside `streamGetChatCompletion()`.

Before the main LLM call, rank the available tools with Needle:

```ts
let cactusTools = this.toCactusTools(availableTools ?? []);
if (cactusTools.length > 5 && needleStore.ready) {
  cactusTools = await needleStore.selectTools(
    messages[messages.length - 1].content ?? "",
    cactusTools,
    5,
  );
}
```

Then pass the ranked subset to the main LLM:

```ts
const result = await this.cactusLmContext.complete({
  messages: messages as any,
  options: {
    stopSequences: [...stops],
    maxTokens: this.nPredict,
    ...apiParams,
    temperature: this.temperature,
  },
  tools: cactusTools.length > 0 ? cactusTools : undefined,
  onToken: callback,
});
```

This replaces the generic `toolRagTopK` engine heuristic with the dedicated Needle ranker.

**Verify**: `yarn typecheck` passes.

---

## P6 — Tests & quality

- Unit: `routeRag` mapping / clamp / fallback cases (`src/utils/Needle/__tests__/routeRag.test.ts`).
- Unit: `selectTools` fallback when router unavailable.
- Integration on device: RAG-answer vs general-knowledge questions only when correctly routed.
- `yarn typecheck`, `yarn lint`, `yarn test`.

---

## Files (all new unless noted)

| Path                                                                  | Action                               |
| --------------------------------------------------------------------- | ------------------------------------ |
| `src/services/downloads/NeedleBundleDownloader.ts`                    | create                               |
| `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}`              | create                               |
| `src/store/NeedleStore.ts`, `src/hooks/useNeedle.ts`                  | create                               |
| `src/utils/AiProviders/baseOpenAILikeProvider/index.ts`               | edit `getContextTexts`               |
| `src/utils/AiProviders/onDevice/cactus/index.ts`                      | edit `streamGetChatCompletion`       |
| `package.json`                                                        | add `react-native-zip-archive` only if spike proves `CactusFileSystem.downloadModel` does not extract |

## Rollback / safety

- The needle gate lives in one function with a guaranteed `fallback` return — reverting = revert that single edit. A broken/missing bundle can never `throw` into `getContextTexts`.
- Tool-ranking changes are additive; removing them restores prior behavior.
- **No public API/UI change in v2.1.**

---

## R — Review findings

Findings from auditing this plan against the spec and the existing Cactus integration:

1. **`CactusLM.complete()` is async and runs on a native thread.** The JS-side timeout cannot cancel it; it only lets `routeRag` return `fallback` while the native call completes. Acceptable **only if we enforce max one in-flight call** — see (3).
2. **The SDK is not re-entrant.** `CactusLM` throws if a completion/embedding is already in progress. `NeedleStore` must serialize calls.
3. **Concurrency / serialization:** `routeRag()` and `selectTools()` calls must be serialized behind a JS-side queue (or a `busy` flag). Two overlapping calls corrupt state or throw.
4. **Model lifecycle:** the Needle `CactusLM` instance must be `destroy()`-ed when the store is torn down to free native memory.
5. **Clamp scope:** `routeRag` must NOT read `this.topN`; it takes `opts.maxTopK` as an arg. Hard-clamp `topK` to `[1, min(maxTopK, 5)]`.
6. **Tool description token budget:** keep `DOCUMENT_TOOLS` terse; future additions must not bloat the prompt.
7. **Silent fail contract:** any `reject`/`throw` path maps to `{ type: 'fallback' }` or the unfiltered tool list — never propagate.
8. **Bundle format risk:** the spike must confirm `needle-cq4.zip` is compatible with `cactus-react-native@1.13.1`. This is the single biggest open question.
