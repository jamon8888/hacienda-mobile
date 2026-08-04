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

/**
 * Extends the keep-alive window of whichever embedding provider is currently active, if any.
 * No-op if no provider has been resolved yet, or if that provider has no model loaded — never
 * triggers a (re)load. Meant to be called from UI signals of active engagement (e.g. typing)
 * without needing to know which engine the current workspace uses.
 */
export function touchCurrentEmbeddingProvider(): void {
    currentProvider?.touch();
}