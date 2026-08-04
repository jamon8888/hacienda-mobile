import { EmbeddingProvider, EmbeddingEngine } from './types';
import OnDeviceEmbedderProvider from './onDevice';
import MultilingualEmbedderProvider from './onDevice/multilingual';

let currentProvider: EmbeddingProvider | null = null;
let currentEngine: EmbeddingEngine = 'nomic-v1.5';

export function createEmbeddingProvider(engine: EmbeddingEngine): EmbeddingProvider {
    switch (engine) {
        case 'multilingual-e5-small':
        case 'multilingual-e5-base':
        case 'sentence-camembert-base':
        case 'nomic-embed-text-v2-moe':
            return new MultilingualEmbedderProvider(engine);
        case 'nomic-v1.5':
        default:
            return OnDeviceEmbedderProvider.instance || new OnDeviceEmbedderProvider();
    }
}

export function getEmbeddingProvider(engine?: EmbeddingEngine): EmbeddingProvider {
    const targetEngine = engine || currentEngine;
    if (!currentProvider || currentEngine !== targetEngine) {
        currentProvider = createEmbeddingProvider(targetEngine);
        currentEngine = targetEngine;
    }
    return currentProvider;
}

export function setEmbeddingEngine(engine: EmbeddingEngine): EmbeddingProvider {
    if (currentProvider) {
        currentProvider.cleanup();
    }
    currentProvider = createEmbeddingProvider(engine);
    currentEngine = engine;
    return currentProvider;
}

export function getCurrentEngine(): EmbeddingEngine {
    return currentEngine;
}

// The keep-alive window this extends is 3 minutes (see OnDeviceEmbedderProvider /
// MultilingualEmbedderProvider's keepAliveInterval) — throttling actual touches to once per 10s
// is invisible against that window but avoids a clearTimeout/setTimeout pair on every keystroke
// for fast typists or long input sessions.
const TOUCH_THROTTLE_MS = 10_000;
let lastTouchAt = 0;

/**
 * Extends the keep-alive window of whichever embedding provider is currently active, if any.
 * No-op if no provider has been resolved yet, or if that provider has no model loaded — never
 * triggers a (re)load. Meant to be called from UI signals of active engagement (e.g. typing)
 * without needing to know which engine the current workspace uses. Throttled — see
 * TOUCH_THROTTLE_MS.
 */
export function touchCurrentEmbeddingProvider(): void {
    const now = Date.now();
    if (now - lastTouchAt < TOUCH_THROTTLE_MS) return;
    lastTouchAt = now;
    currentProvider?.touch();
}