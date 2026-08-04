import { Feather, Scales, Barbell } from "phosphor-react-native";
import * as RNFS from '@dr.pogodin/react-native-fs';

export type DefaultModel = {
    id: string;
    name: string;
    description: string;
    Icon: React.ElementType;
    size: string;
    modelId: string;
    tag: string;
    isPreset: boolean;
}

export const MODEL_CARDS = [
    {
        id: 'lightweight',
        name: 'Lightweight',
        description: 'For quick responses and simple tasks.',
        Icon: Feather,
        size: '639MB',
        modelId: 'unsloth/Qwen3-0.6B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    },
    {
        id: 'balanced',
        name: 'Balanced',
        description: 'For a balance of speed and accuracy.',
        Icon: Scales,
        size: '1.83GB',
        modelId: 'unsloth/Qwen3-1.7B-GGUF',
        tag: 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf',
    },
    {
        id: 'powerful',
        name: 'Powerful',
        description: 'Heavier models for the best accuracy.',
        Icon: Barbell,
        size: '2.09GB',
        modelId: 'unsloth/Llama-3.2-3B-Instruct-GGUF',
        tag: 'https://huggingface.co/unsloth/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_1.gguf',
    },
];

export const EMBEDDING_MODEL = {
    id: 'default',
    name: 'Default',
    description: 'The default embedding model for AnythingLLM (English-only).',
    size: '84.1MB',

    // Nomic Embed Text works best, all the All-MiniLM-L6-v2 models are too compressed and suck.
    // https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF
    modelId: 'nomic-ai/nomic-embed-text-v1.5-GGUF',
    tag: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-GGUF/resolve/main/nomic-embed-text-v1.5.Q4_K_M.gguf',
    dimensions: 768,
    contextLength: 8192,
    languages: ['en'],
}

export const MULTILINGUAL_EMBEDDING_MODELS = {
    'multilingual-e5-small': {
        id: 'multilingual-e5-small',
        name: 'Multilingual E5 Small',
        description: '100+ languages, fast & tiny (124MB). Best for low-RAM devices.',
        size: '124MB',
        modelId: 'cstr/multilingual-e5-small-GGUF',
        tag: 'https://huggingface.co/cstr/multilingual-e5-small-GGUF/resolve/main/multilingual-e5-small-q4_k.gguf',
        dimensions: 384,
        contextLength: 512,
        languages: ['en', 'fr', 'de', 'es', 'zh', 'ja', 'ko', 'ar', 'hi', 'pt', 'ru', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'sv', 'da', 'no', 'fi', 'cs', 'ro', 'hu', 'bg', 'uk', 'ca', 'el', 'hr', 'sk', 'sl', 'et', 'lt', 'lv', 'ms', 'tl', 'sw', 'af', 'cy', 'ga', 'sq', 'mk', 'bs', 'mt', 'gl', 'eu', 'is', 'ka', 'hy', 'kk', 'uz', 'az', 'be', 'mn', 'ne', 'si', 'km', 'my', 'lo', 'am', 'ps', 'sd', 'ku', 'ug', 'bo', 'dz', 'fy'],
        mtebFrench: 0.63,
        license: 'MIT',
    },
    'multilingual-e5-base': {
        id: 'multilingual-e5-base',
        name: 'Multilingual E5 Base',
        description: '100+ languages, better quality (280MB). Good balance.',
        size: '280MB',
        modelId: 'intfloat/multilingual-e5-base-GGUF',
        tag: 'https://huggingface.co/intfloat/multilingual-e5-base-GGUF/resolve/main/multilingual-e5-base-q4_k_m.gguf',
        dimensions: 768,
        contextLength: 512,
        languages: ['en', 'fr', 'de', 'es', 'zh', 'ja', 'ko', 'ar', 'hi', 'pt', 'ru', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'sv', 'da', 'no', 'fi', 'cs', 'ro', 'hu', 'bg', 'uk', 'ca', 'el', 'hr', 'sk', 'sl', 'et', 'lt', 'lv', 'ms', 'tl', 'sw', 'af', 'cy', 'ga', 'sq', 'mk', 'bs', 'mt', 'gl', 'eu', 'is', 'ka', 'hy', 'kk', 'uz', 'az', 'be', 'mn', 'ne', 'si', 'km', 'my', 'lo', 'am', 'ps', 'sd', 'ku', 'ug', 'bo', 'dz', 'fy'],
        mtebFrench: 0.65,
        license: 'MIT',
    },
    'sentence-camembert-base': {
        id: 'sentence-camembert-base',
        name: 'CamemBERT Base (French)',
        description: 'French-specific, optimized for French tasks (115MB). Apache 2.0.',
        size: '115MB',
        modelId: 'lyon-nlp/sentence-camembert-base-GGUF',
        tag: 'https://huggingface.co/lyon-nlp/sentence-camembert-base-GGUF/resolve/main/sentence-camembert-base-q4_k_m.gguf',
        dimensions: 768,
        contextLength: 512,
        languages: ['fr', 'en'],
        mtebFrench: 0.59,
        license: 'Apache-2.0',
    },
    'nomic-embed-text-v2-moe': {
        id: 'nomic-embed-text-v2-moe',
        name: 'Nomic Embed v2 MoE (Multilingual)',
        description: '~100 languages, MoE architecture, Matryoshka dims (328MB). Best quality.',
        size: '328MB',
        modelId: 'nomic-ai/nomic-embed-text-v2-moe-GGUF',
        tag: 'https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q4_K_M.gguf',
        dimensions: 768,
        contextLength: 512,
        languages: ['en', 'fr', 'de', 'es', 'zh', 'ja', 'ko', 'ar', 'hi', 'pt', 'ru', 'it', 'nl', 'pl', 'tr', 'vi', 'th', 'id', 'sv', 'da', 'no', 'fi', 'cs', 'ro', 'hu', 'bg', 'uk', 'ca', 'el', 'hr', 'sk', 'sl', 'et', 'lt', 'lv', 'ms', 'tl', 'sw', 'af', 'cy', 'ga', 'sq', 'mk', 'bs', 'mt', 'gl', 'eu', 'is', 'ka', 'hy', 'kk', 'uz', 'az', 'be', 'mn', 'ne', 'si', 'km', 'my', 'lo', 'am', 'ps', 'sd', 'ku', 'ug', 'bo', 'dz', 'fy'],
        mtebFrench: 0.66,
        license: 'Apache-2.0',
        matryoshka: true,
        activeParams: '305M',
        totalParams: '475M',
    },
} as const;

export type MultilingualEmbeddingModelId = keyof typeof MULTILINGUAL_EMBEDDING_MODELS;

export const DEFAULT_MULTILINGUAL_EMBEDDING_MODEL: MultilingualEmbeddingModelId = 'multilingual-e5-small';

/**
 * Resolves the destination path for a gguf model from a url
 * Typically this is a huggingface url
 * @param url - The url of the model
 * @returns The destination path for the model
 */
export function resolveDestinationPathFromGGUFUrl(url: string) {
    const splits = new URL(url).pathname.split('/');
    const creator = {
        creator: splits[1],
        model: splits[2],
        file: splits.slice(-1)[0],
    }
    return `${RNFS.DocumentDirectoryPath}/models/gguf/${creator.creator}/${creator.model}/${creator.file}`;
}

export interface CactusModelBundle {
    id: string;
    name: string;
    description: string;
    modelId: string;
    cactusBundlePath: string;
    quantization: 'CQ4' | 'CQ3.26' | 'CQ2.54' | 'CQ2' | 'CQ1';
    size: string;
    backend: 'cpu' | 'metal' | 'npu';
    hasConfidenceProbe: boolean;
    supportsCloudHandoff: boolean;
    multimodal: {
        text: boolean;
        vision: boolean;
        audio: boolean;
    };
    recommendedFor: 'chat' | 'voice-pipeline' | 'transcription' | 'vision' | 'tool-calling';
    minRAM: string;
}

export const CACTUS_VOICE_MODELS: Record<string, CactusModelBundle> = {
    'gemma-4-e2b-hybrid-cq4': {
        id: 'gemma-4-e2b-hybrid-cq4',
        name: 'Gemma 4 E2B Hybrid (4-bit)',
        description: 'Best accuracy with confidence probe for cloud handoff. Matches Gemini Flash-Lite at 15-35% handoff.',
        modelId: 'Cactus-Compute/gemma-4-e2b-it-hybrid',
        cactusBundlePath: 'weights/gemma-4-e2b-it-hybrid-cq4',
        quantization: 'CQ4',
        size: '~1.2GB',
        backend: 'metal',
        hasConfidenceProbe: true,
        supportsCloudHandoff: true,
        multimodal: { text: true, vision: true, audio: true },
        recommendedFor: 'voice-pipeline',
        minRAM: '4GB',
    },
    'gemma-4-e2b-hybrid-cq2.54': {
        id: 'gemma-4-e2b-hybrid-cq2.54',
        name: 'Gemma 4 E2B Hybrid (2.54-bit mixed)',
        description: '50% smaller, near-4-bit quality. 2.7 bpw production bundle with 4-bit LLM linears + 2-bit embeddings.',
        modelId: 'Cactus-Compute/gemma-4-e2b-it-hybrid',
        cactusBundlePath: 'weights/gemma-4-e2b-it-hybrid-cq2.54',
        quantization: 'CQ2.54',
        size: '~650MB',
        backend: 'metal',
        hasConfidenceProbe: true,
        supportsCloudHandoff: true,
        multimodal: { text: true, vision: true, audio: true },
        recommendedFor: 'voice-pipeline',
        minRAM: '3GB',
    },
    'parakeet-tdt-0.6b-cq2': {
        id: 'parakeet-tdt-0.6b-cq2',
        name: 'Parakeet TDT 0.6B (2-bit)',
        description: 'Best-in-class streaming ASR at 2-bit (WER 0.147). Non-autoregressive, real-time factor ~0.1x.',
        modelId: 'nvidia/parakeet-tdt-0.6b-v3',
        cactusBundlePath: 'weights/parakeet-tdt-0.6b-v3-cq2',
        quantization: 'CQ2',
        size: '~180MB',
        backend: 'metal',
        hasConfidenceProbe: false,
        supportsCloudHandoff: false,
        multimodal: { text: false, vision: false, audio: true },
        recommendedFor: 'transcription',
        minRAM: '2GB',
    },
    'parakeet-tdt-0.6b-cq4': {
        id: 'parakeet-tdt-0.6b-cq4',
        name: 'Parakeet TDT 0.6B (4-bit)',
        description: 'Highest accuracy streaming ASR (WER 0.115). Use when RAM allows.',
        modelId: 'nvidia/parakeet-tdt-0.6b-v3',
        cactusBundlePath: 'weights/parakeet-tdt-0.6b-v3-cq4',
        quantization: 'CQ4',
        size: '~320MB',
        backend: 'metal',
        hasConfidenceProbe: false,
        supportsCloudHandoff: false,
        multimodal: { text: false, vision: false, audio: true },
        recommendedFor: 'transcription',
        minRAM: '3GB',
    },
    'parakeet-tdt-1.1b-cq2': {
        id: 'parakeet-tdt-1.1b-cq2',
        name: 'Parakeet TDT 1.1B (2-bit)',
        description: 'Larger model for challenging audio (accents, noise). Still usable at 2-bit.',
        modelId: 'nvidia/parakeet-tdt-1.1b-v3',
        cactusBundlePath: 'weights/parakeet-tdt-1.1b-v3-cq2',
        quantization: 'CQ2',
        size: '~300MB',
        backend: 'metal',
        hasConfidenceProbe: false,
        supportsCloudHandoff: false,
        multimodal: { text: false, vision: false, audio: true },
        recommendedFor: 'transcription',
        minRAM: '3GB',
    },
} as const;

export type CactusVoiceModelId = keyof typeof CACTUS_VOICE_MODELS;

export const DEFAULT_CACTUS_ASR_MODEL: CactusVoiceModelId = 'parakeet-tdt-0.6b-cq2';
export const DEFAULT_CACTUS_LLM_MODEL: CactusVoiceModelId = 'gemma-4-e2b-hybrid-cq4';

export function resolveCactusBundlePath(modelId: CactusVoiceModelId): string {
    const model = CACTUS_VOICE_MODELS[modelId];
    return `${RNFS.DocumentDirectoryPath}/models/cactus/${model.cactusBundlePath}`;
}

export default MODEL_CARDS;