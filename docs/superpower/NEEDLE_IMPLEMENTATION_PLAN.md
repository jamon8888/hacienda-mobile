# Needle — Implementation Plan

> **v1.0.0** · Companion implementer for [`NEEDLE_INTEGRATION.md`](NEEDLE_INTEGRATION.md).
> Goal: ship an on-device RAG **router** (skip / retrieve / expand) powered by Cactus's 26M-param **Needle** tool-caller, run via **needle-rs** C ABI and bridged the same way as Xberg. **No UI** — a transparent layer inside `getContextTexts()` that degrades silently to the current unconditional semantic search.
> Rule: @ reviewers — flag anything that contradicts the spec or the vendored-native-module contract.

---

## 0. Phase map

| #   | Phase                                         | Deliverable                                           | Done-when                   |
| --- | --------------------------------------------- | ----------------------------------------------------- | --------------------------- |
| P0  | Feasibility spike (native lib loads + routes) | proof run on aarch64                                  | K0..K5                      |
| P1  | Android native bridge                         | `libneedle.so` + `NeedleModule.kt`                    | typecheck + `assembleDebug` |
| P2  | iOS native bridge                             | staticlib + `NeedleModule.swift/.m`                   | `pod install` + build       |
| P3  | TS layer `src/utils/Needle`                   | `types.ts`/`XbergClient`-style client/`index.ts`      | typecheck                   |
| P4  | State + hook                                  | `NeedleStore.ts`, `useNeedle.ts`                      | typecheck                   |
| P5  | Router integration into `getContextTexts`     | gate before embed                                     | typecheck + unit test       |
| P6  | Bundling weights download                     | RNFS fetch of 22MB `needle.safetensors` + `vocab.txt` | integration test            |

---

## P0 — Feasibility spike (BLOCKING; do first)

Verifies needle-rs is actually usable on ARM before any RN plumbing.

1. Clone `https://github.com/Geekgineer/needle-rs`, `cargo build --release --target aarch64-linux-android`.
2. Confirm the **NEON** matvec path compiles/runs (not scalar fallback). Run the crates' own e2e parity test on aarch64.
3. `needle_load` against the 22 MB `Abdalrahman/needle-rs-safetensors` (INT4) resolves and `needle_run` returns parseable JSON for the `DOCUMENT_TOOLS` in the spec (§4.4).
4. Rough latency: load once (cold) + per-route warm. Budget: warm < 300 ms, working set < 30 MB.
5. If NEON is non-functional → pivot: build the **WASM** variant and bundle through a Hermes-compatible wasm runtime, re-run. Else proceed.

**Exit criteria:** `needle_run` produces a syntactically valid tool call on-device. → K0 (checklist) — nothing else starts.

---

## P1 — Android native module

Mirror `com.hacienda.xberg` exactly. New dir `android/app/src/main/java/com/hacienda/needle/`.

1. **build files** — add NDK `externalNativeBuild`/CMake block to `android/app/build.gradle` (or a `module.cmake`) that:
   - statically links the Rust-produced `libneedle.a` (ABI per each `abiFilters` — `arm64-v8a`, plus `x86_64`/`armeabi-v7a` if kept);
   - declares `targetSdk/minSdk` parity with the app (minSdk 24 already set for cactus).
2. **`NeedleModule.kt`** — `@ReactMethod`s (TurboModule-style, single-threaded guarded):
   - `init(safetensorsPath: String, vocabPath: String, promise: Promise)` → `needle_load`; maps NULL/crash → `reject` with `err.code = 'NEEDLE_UNAVAILABLE'` (never throw into JS).
   - `route(query: String, toolsJson: String, promise: Promise)` → returns the JSON call string; on load-fail/latency → `reject('NEEDLE_TIMEOUT', fallback)`.
   - `release(promise)`.
   - Handle JNI → pointer as `Long` (~handle) in a thread-safe holder (id = JNI GlobalRef lifecycle) — reuse the `DeviceInfo`/`pdfparser` JNI convention in repo, not Xberg (Xberg is a managed SDK, this is raw JNI).
3. **`NeedlePackage.kt`** — clone of `XbergPackage.kt` shape.
4. Register in `MainApplication.kt` (addLine to the existing `packages` list) — do **not** hand-edit the `XbergPackage` entry.

**Verify**: `yarn typecheck` unaffected; `./gradlew assembleDebug` builds and links (embed the `.so` check).

> Note: keep the pure-JS fork per original pattern. If CMake linking is painful, the C ABI can ship as a prebuilt `.a`/`.so` copied into `libs`; decide in P0.

---

## P2 — iOS native module

Mirror `ios/Hacienda/XbergModule.swift` + `.m`.

- `NeedleModule.swift` — `@objc` exposed methods `init(weights:vocab:resolver:rejecter:)`, `route(_:toolsJson:resolver:rejecter:)`, plus `NeedleModule.m` macro registration (mirror `XbergModule.{swift,m}`, `RCT_EXTERN_MODULE`).
- Link the Rust staticlib (universal arm64-sim + device) and the `needle.h` C header into the Xcode target via the Podfile/Podspec dependency.
- `Podfile`: add a local pod that pulls the staticlib (or vendor under `ios/hacienda/` and reference in `.xcconfig`).
- Keep `cactus.xcframework` path untouched.

**Verify**: `cd ios && pod install`; open Xcode build. (iOS can be validated later — Android is the primary target this session.)

---

## P3 — TS layer `src/utils/Needle`

Mirror `src/utils/Xberg/*`:

- **`types.ts`** — `NeedleRouteDecision = { type: 'retrieve', topK } | { type: 'expand', topK, revisedQuery } | { type: 'skip' } | { type: 'fallback' }`; `DOCUMENT_TOOLS` (spec §4.4); `RouteOptions`.
- **`NeedleClient.ts`** — thin `NativeModules.NeedleModule` wrapper:
  ```ts
  static async init(weightsPath, vocabPath): Promise<void>      // reject → mark unavailable
  static async route(query, toolsJson): Promise<string>          // '' → fallback
  ```
  Add the **250 ms timeout** guard + `''`→`fallback` here.
- **`index.ts`** — exports `routeRag(userPrompt, opts?: RouteOptions): Promise<NeedleRouterDecision>`:

  1. if `!NeedleStore.ready` → `{ type: 'fallback' }`;
  2. `const json = await NeedleClient.route(prompt, stringify(DOCUMENT_TOOLS))`;
  3. parse; if not a one-named call → `{ type: 'fallback' }`; else map to action with `topK` clamped to `[1, min(opts.maxTopK, 5)]` (`maxTopK` is passed by the caller = the provider's `this.topN * 2`).

- Reuse `XbergClient`'s `NativeModules` import style; keep the router a pure function (no store/service coupling) for unit-testing.

---

## P4 — State + hook

- **`src/store/NeedleStore.ts`** — singleton, `makeAutoObservable`, fields `{ ready, busy, lastRoute, error }`, methods `init()`, `route()`. Non-blocking: `init` swallows failures into `ready=false`.
- **`src/hooks/useNeedle.ts`** — returns `{ ready, init, route }` bound to the store (pattern of `useXberg`).

---

## P5 — Integrate into `getContextTexts()`

**File**: `src/utils/AiProviders/baseOpenAILikeProvider/index.ts`, **at top of** `getContextTexts` (line ~272, before the embed).

```ts
const route = await NeedleRouter.routeRag(userPrompt, {
  maxTopK: this.topN * 2,
});
if (route.type === "skip") return []; // no embed, no search
const topN =
  route.type === "expand" || route.type === "retrieve" ? route.topK : this.topN; // 'fallback' → unchanged
await ensureVectorCount(); // existing pre-embed guard
const queryVector = await embedder.embed(userPrompt, "query", dims);
const results = await VectorDB.runSemanticSearch(
  this.workspace.slug,
  queryVector,
  topN,
);
```

- guard upstream so `routeRag` never throws (it returns `fallback`).
- `skip` path and `expand` path are both covered below; `fallback` reuses `this.topN`.

---

## P6 — Weight bundling & asset fetch

- On first `init` call (guarded by `NeedleStore`), fetch `needle.safetensors` + `vocab.txt` from `Abdalrahman/needle-rs-safetensors` via RNFS download into `DocumentDirectoryPath/needle/` (mirror the existing Cactus `ModelStore`/downloadManager pattern).
- If `needle.safetensors` already exists → re-init directly (no re-download).
- `init` must be non-blocking on the JS thread; resolution = just the native `ready` flag (no test inference).

---

## P7 — Tests & quality (post code)

- Unit: `routeRag` mapping/clamp/fallback cases (`src/utils/Needle/__tests__/routeRag.test.ts`).
- Integration on device: RAG-answer vs general-knowledge questions only when correctly routed.
- `yarn typecheck`, `yarn lint`, `yarn test`.

---

## Files (all new unless noted)

| Path                                                                     | Action                               |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `android/.../com/hacienda/needle/{NeedleModule.kt, NeedlePackage.kt}` | create                               |
| `android/app/build.gradle` (+ prefab or CMake)                           | add `.so` link (edit)                |
| `ios/Hacienda/{NeedleModule.swift, NeedleModule.m, needle.h}`         | create                               |
| `ios/Podfile` / Podspec                                                  | add staticlib pod (edit)             |
| `src/utils/Needle/{types.ts, NeedleClient.ts, index.ts}`                 | create                               |
| `src/store/NeedleStore.ts`, `src/hooks/useNeedle.ts`                     | create                               |
| `src/AiProviders/baseOpenAILikeProvider/index.ts`                        | edit `getContextTexts`               |
| `src/screens/WorkspaceSettings/index.tsx` (maybe)                        | settings toggle for router (skip v1) |

## Rollback / safety

- The needle gate lives in one function with a guaranteed `fallback` return — reverting = revert that single edit. A broken/missing native module can never `throw` into `getContextTexts` (all paths catch to `fallback`).
- **No public API/UI change in v1.**

---

_Reviewer: open point — iOS static lib bundling method (vendored pod vs. `.xcconfig`) is undecided and ships after the Android gate._

---

## R — Review findings (must be addressed before/at each phase)

Findings from auditing this plan against the spec, the vendored-native-module contract, and the `getContextTexts` source:

1. **`needle_run` is synchronous/blocking.** It runs on a NativeModule background thread (ReactPackage `createNativeModules` executor), so it won't stall the JS thread — good. But the JS-side **250 ms timeout cannot cancel** it; it only lets `routeRag` return `fallback` while the native call keeps running to completion. That is acceptable (fire-and-forget) **only if we enforce max one in-flight call** — see (3).

2. **Native engine is not re-entrant / not thread-safe.** Assumed unless proven otherwise in P0; enforce single-caller serialization.
3. **Concurrency / serialization:** `route()` calls must be serialized behind a native `synchronized`/lock (or a ready-flag gate) + a JS-side in-flight checker. Otherwise two overlapping `getContextTexts` calls corrupt the single `NeedleHandle`. Add this to `NeedleStore` and the Kotlin/Swift modules.
4. **JNI `Long` handle lifetime:** `needle_load` returns a raw pointer. Storing it as `Long` in a Kotlin field is fine (mirrors `pdfparser` JNI convention) but must be a **global reference** with an explicit `free` on `release()` / React `invalidate()` — a leaked handle is a native-memory leak. Never let JS/GC own the pointer value.
5. **Clamp scope:** `routeRag` must NOT read `this.topN` (it has no provider reference); it takes `opts.maxTopK` as an arg (fixed above in P3/P5). Never trust the model's `top_k` — hard-clamp `[1, min(maxTopK, 5)]`.
6. **Encoder token budget (≤1024):** the flat `DOCUMENT_TOOLS` descriptions must stay terse; byte-length-cheat check the JSON in tests so a future tool addition doesn't overflow the encoder silently.
7. **Silent fail contract:** any `reject`/`throw` path must map to `{ type: 'fallback' }` — never propagate. This is the single most important invariant; `getContextTexts` itself must not be made `async`-risky for this.
8. **iOS bundling method open** (see reviewer note); Android is the only target this session — iOS work is gated behind the Android exit criteria.

> These findings correspond to real risks, not stylistic edits; P5/P0 confirmed the worst one (blocking + re-entrancy).
