import { EmbeddingProvider, EmbeddingEngine } from "./types";
import OnDeviceEmbedderProvider from "./onDevice";
import MultilingualEmbedderProvider from "./onDevice/multilingual";
import { EmbeddingGemmaProvider } from "./onDevice/embeddinggemma";

// Bounded rather than a single slot: switching between workspaces on
// different embedding engines in quick succession (e.g. background memo
// embedding for one workspace while chatting in another) used to force a
// full provider reinstantiation - and the native model load/unload that
// comes with it - on every single call. Caching a small number keeps both
// warm instead of thrashing.
const MAX_CACHED_PROVIDERS = 2;
const providerCache = new Map<EmbeddingEngine, EmbeddingProvider>();
let lastUsedEngine: EmbeddingEngine = "nomic-v1.5";

export function createEmbeddingProvider(
  engine: EmbeddingEngine,
): EmbeddingProvider {
  switch (engine) {
    case "multilingual-e5-small":
    case "multilingual-e5-base":
    case "sentence-camembert-base":
    case "nomic-embed-text-v2-moe":
      return new MultilingualEmbedderProvider(engine);
    case "embeddinggemma-300m":
      return EmbeddingGemmaProvider.getInstance();
    case "nomic-v1.5":
    default:
      return (
        OnDeviceEmbedderProvider.instance || new OnDeviceEmbedderProvider()
      );
  }
}

// Marks `engine` as the most-recently-used cache entry (Maps preserve
// insertion order, so delete+re-set moves it to the end) and evicts the
// oldest entry/entries once the cache grows past MAX_CACHED_PROVIDERS.
function cacheProvider(engine: EmbeddingEngine, provider: EmbeddingProvider) {
  providerCache.delete(engine);
  providerCache.set(engine, provider);
  while (providerCache.size > MAX_CACHED_PROVIDERS) {
    const oldestEngine = providerCache.keys().next().value;
    if (oldestEngine === undefined) break;
    providerCache.get(oldestEngine)?.cleanup();
    providerCache.delete(oldestEngine);
  }
}

export function getEmbeddingProvider(
  engine?: EmbeddingEngine,
): EmbeddingProvider {
  const targetEngine = engine || lastUsedEngine;
  lastUsedEngine = targetEngine;

  const provider =
    providerCache.get(targetEngine) ?? createEmbeddingProvider(targetEngine);
  cacheProvider(targetEngine, provider);
  return provider;
}

export function setEmbeddingEngine(engine: EmbeddingEngine): EmbeddingProvider {
  // Explicit user-driven switch (e.g. changing a workspace's embedding
  // settings) - always tear down and rebuild fresh, rather than reusing
  // whatever happens to be cached for this engine.
  providerCache.get(engine)?.cleanup();
  const provider = createEmbeddingProvider(engine);
  cacheProvider(engine, provider);
  lastUsedEngine = engine;
  return provider;
}

export function getCurrentEngine(): EmbeddingEngine {
  return lastUsedEngine;
}

// The keep-alive window this extends is 3 minutes (see OnDeviceEmbedderProvider /
// MultilingualEmbedderProvider's keepAliveInterval) — throttling actual touches to once per 10s
// is invisible against that window but avoids a clearTimeout/setTimeout pair on every keystroke
// for fast typists or long input sessions.
const TOUCH_THROTTLE_MS = 10_000;
let lastTouchAt = 0;

/**
 * Extends the keep-alive window of whichever embedding provider was most recently used, if any.
 * No-op if no provider has been resolved yet, or if that provider has no model loaded — never
 * triggers a (re)load. Meant to be called from UI signals of active engagement (e.g. typing)
 * without needing to know which engine the current workspace uses. Throttled — see
 * TOUCH_THROTTLE_MS.
 */
export function touchCurrentEmbeddingProvider(): void {
  const now = Date.now();
  if (now - lastTouchAt < TOUCH_THROTTLE_MS) return;
  lastTouchAt = now;
  providerCache.get(lastUsedEngine)?.touch();
}
