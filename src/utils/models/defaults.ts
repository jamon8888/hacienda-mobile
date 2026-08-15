import { Feather, Scales, Barbell } from "phosphor-react-native";
import * as RNFS from "@dr.pogodin/react-native-fs";

export type DefaultModel = {
  id: string;
  name: string;
  description: string;
  Icon: React.ElementType;
  size: string;
  modelId: string;
  tag: string;
  isPreset: boolean;
};

/**
 * Cactus registry slug + quantization for an on-device model.
 *
 * cactus-react-native >= 1.x dropped raw-GGUF support: CactusLM.init() passes whatever it is
 * given straight to the native runtime, which expects one of Cactus's own model bundles (a
 * directory holding config.txt alongside the weights), not a .gguf file. A path starting with
 * "/" is treated as an already-local bundle (see isModelPath() in the SDK's CactusLM.ts), so
 * handing it a downloaded HuggingFace GGUF made every single load fail with
 * "Failed to create model - check config.txt exists at: <path>".
 *
 * Models are therefore identified by registry slug now, and the SDK downloads the matching
 * bundle itself via CactusLM.download() from https://huggingface.co/Cactus-Compute.
 */
export interface CactusModelRef {
  slug: string;
  quantization: "int4" | "int8";
}

/**
 * Which bundle each chat model maps to in the Cactus registry, keyed by the app's own model id.
 *
 * Only slugs verified to resolve against our pinned SDK are listed. The SDK picks the newest
 * release tag on the model's HF repo that is <= its own runtime version (1.13.1) -- a slug can
 * exist upstream yet still 404 at that tag if the bundle was published later, which is exactly
 * how gemma-4-e2b-it's int8 bundle broke (present from v2.0, absent at the v1.13 we resolve to).
 * Verify any new entry with a HEAD request against the resolved tag before adding it.
 */
export const CACTUS_CHAT_MODELS = {
  "unsloth/Qwen3-0.6B-GGUF": { slug: "qwen3-0.6b", quantization: "int8" },
  "unsloth/Qwen3-1.7B-GGUF": { slug: "qwen3-1.7b", quantization: "int8" },
  "Cactus-Compute/Qwen3.5-2B": { slug: "qwen3.5-2b", quantization: "int8" },
  "unsloth/gemma-3-1b-it-GGUF": {
    slug: "gemma-3-1b-it",
    quantization: "int8",
  },
} as const satisfies Record<string, CactusModelRef>;

/**
 * Which embedding engines have a Cactus registry bundle, keyed by the app's engine id.
 *
 * Same constraint as CACTUS_CHAT_MODELS: the runtime can only load registry bundles, so an
 * engine absent from this map cannot run at all. Of the four multilingual engines the app
 * offers, only Nomic v2 MoE is published to the Cactus registry -- the E5 and CamemBERT
 * entries exist upstream on HuggingFace as plain GGUF only, which this runtime cannot load.
 * They are left in MULTILINGUAL_EMBEDDING_MODELS (so stored workspace configs referencing
 * them still resolve for display) but selecting one now fails loudly at init instead of
 * silently producing no vectors.
 */
export const CACTUS_EMBEDDING_MODELS = {
  "nomic-embed-text-v2-moe": {
    slug: "nomic-embed-text-v2-moe",
    quantization: "int8",
  },
} as const satisfies Record<string, CactusModelRef>;

export const MODEL_CARDS = [
  {
    id: "lightweight",
    name: "Lightweight",
    description: "For quick responses and simple tasks.",
    Icon: Feather,
    size: "639MB",
    modelId: "unsloth/Qwen3-0.6B-GGUF",
    tag: "https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf",
  },
  {
    id: "balanced",
    name: "Balanced",
    description: "For a balance of speed and accuracy.",
    Icon: Scales,
    size: "1.83GB",
    modelId: "unsloth/Qwen3-1.7B-GGUF",
    tag: "https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q8_0.gguf",
  },
  {
    id: "powerful",
    name: "Powerful",
    description: "Heavier models for the best accuracy.",
    Icon: Barbell,
    // Was unsloth/Llama-3.2-3B-Instruct-GGUF, which has no Cactus registry equivalent -- and
    // since the runtime can only load registry bundles now (see CACTUS_CHAT_MODELS above),
    // keeping it would have left this tier permanently unloadable. Qwen3.5 2B is the closest
    // available bundle and keeps all three tiers on the same model family.
    size: "2.0GB",
    modelId: "Cactus-Compute/Qwen3.5-2B",
    tag: "",
  },
];

export const EMBEDDING_MODEL = {
  id: "default",
  name: "Default",
  description: "The default embedding model for AnythingLLM.",
  size: "328MB",

  // Was nomic-ai/nomic-embed-text-v1.5-GGUF, a plain GGUF this runtime cannot load (see
  // CACTUS_EMBEDDING_MODELS). Nomic v2 MoE is the closest match actually published to the
  // Cactus registry -- same 768 dimensions, and OnDeviceEmbedderProvider now downloads it via
  // CACTUS_EMBEDDING_MODELS["nomic-embed-text-v2-moe"] rather than modelId/tag below, which are
  // kept only for display (size/dimensions/contextLength/languages) and no longer drive a
  // download.
  // NOTE: switching the embedding model changes the vector space -- old and new vectors are
  // not comparable. Not a migration concern here specifically because v1.5 never produced a
  // vector on this runtime (CactusLM couldn't load it at all, see above), so there is no
  // pre-existing v1.5-embedded corpus to invalidate. This DOES apply the next time
  // EMBEDDING_MODEL changes to a different model with existing embedded documents: add a
  // persisted embedding-model-version marker and a reindex gate before doing that.
  modelId: "Cactus-Compute/nomic-embed-text-v2-moe",
  tag: "",
  dimensions: 768,
  contextLength: 512,
  languages: ["en", "fr", "de", "es", "zh", "ja", "ko", "ar", "hi", "pt"],
};

export const MULTILINGUAL_EMBEDDING_MODELS = {
  "multilingual-e5-small": {
    id: "multilingual-e5-small",
    name: "Multilingual E5 Small",
    description:
      "100+ languages, fast & tiny (124MB). Best for low-RAM devices.",
    size: "124MB",
    modelId: "cstr/multilingual-e5-small-GGUF",
    tag: "https://huggingface.co/cstr/multilingual-e5-small-GGUF/resolve/main/multilingual-e5-small-q4_k.gguf",
    dimensions: 384,
    contextLength: 512,
    languages: [
      "en",
      "fr",
      "de",
      "es",
      "zh",
      "ja",
      "ko",
      "ar",
      "hi",
      "pt",
      "ru",
      "it",
      "nl",
      "pl",
      "tr",
      "vi",
      "th",
      "id",
      "sv",
      "da",
      "no",
      "fi",
      "cs",
      "ro",
      "hu",
      "bg",
      "uk",
      "ca",
      "el",
      "hr",
      "sk",
      "sl",
      "et",
      "lt",
      "lv",
      "ms",
      "tl",
      "sw",
      "af",
      "cy",
      "ga",
      "sq",
      "mk",
      "bs",
      "mt",
      "gl",
      "eu",
      "is",
      "ka",
      "hy",
      "kk",
      "uz",
      "az",
      "be",
      "mn",
      "ne",
      "si",
      "km",
      "my",
      "lo",
      "am",
      "ps",
      "sd",
      "ku",
      "ug",
      "bo",
      "dz",
      "fy",
    ],
    mtebFrench: 0.63,
    license: "MIT",
  },
  "multilingual-e5-base": {
    id: "multilingual-e5-base",
    name: "Multilingual E5 Base",
    description: "100+ languages, better quality (280MB). Good balance.",
    size: "280MB",
    modelId: "intfloat/multilingual-e5-base-GGUF",
    tag: "https://huggingface.co/intfloat/multilingual-e5-base-GGUF/resolve/main/multilingual-e5-base-q4_k_m.gguf",
    dimensions: 768,
    contextLength: 512,
    languages: [
      "en",
      "fr",
      "de",
      "es",
      "zh",
      "ja",
      "ko",
      "ar",
      "hi",
      "pt",
      "ru",
      "it",
      "nl",
      "pl",
      "tr",
      "vi",
      "th",
      "id",
      "sv",
      "da",
      "no",
      "fi",
      "cs",
      "ro",
      "hu",
      "bg",
      "uk",
      "ca",
      "el",
      "hr",
      "sk",
      "sl",
      "et",
      "lt",
      "lv",
      "ms",
      "tl",
      "sw",
      "af",
      "cy",
      "ga",
      "sq",
      "mk",
      "bs",
      "mt",
      "gl",
      "eu",
      "is",
      "ka",
      "hy",
      "kk",
      "uz",
      "az",
      "be",
      "mn",
      "ne",
      "si",
      "km",
      "my",
      "lo",
      "am",
      "ps",
      "sd",
      "ku",
      "ug",
      "bo",
      "dz",
      "fy",
    ],
    mtebFrench: 0.65,
    license: "MIT",
  },
  "sentence-camembert-base": {
    id: "sentence-camembert-base",
    name: "CamemBERT Base (French)",
    description:
      "French-specific, optimized for French tasks (115MB). Apache 2.0.",
    size: "115MB",
    modelId: "lyon-nlp/sentence-camembert-base-GGUF",
    tag: "https://huggingface.co/lyon-nlp/sentence-camembert-base-GGUF/resolve/main/sentence-camembert-base-q4_k_m.gguf",
    dimensions: 768,
    contextLength: 512,
    languages: ["fr", "en"],
    mtebFrench: 0.59,
    license: "Apache-2.0",
  },
  "nomic-embed-text-v2-moe": {
    id: "nomic-embed-text-v2-moe",
    name: "Nomic Embed v2 MoE (Multilingual)",
    description:
      "~100 languages, MoE architecture, Matryoshka dims (328MB). Best quality.",
    size: "328MB",
    modelId: "nomic-ai/nomic-embed-text-v2-moe-GGUF",
    tag: "https://huggingface.co/nomic-ai/nomic-embed-text-v2-moe-GGUF/resolve/main/nomic-embed-text-v2-moe.Q4_K_M.gguf",
    dimensions: 768,
    contextLength: 512,
    languages: [
      "en",
      "fr",
      "de",
      "es",
      "zh",
      "ja",
      "ko",
      "ar",
      "hi",
      "pt",
      "ru",
      "it",
      "nl",
      "pl",
      "tr",
      "vi",
      "th",
      "id",
      "sv",
      "da",
      "no",
      "fi",
      "cs",
      "ro",
      "hu",
      "bg",
      "uk",
      "ca",
      "el",
      "hr",
      "sk",
      "sl",
      "et",
      "lt",
      "lv",
      "ms",
      "tl",
      "sw",
      "af",
      "cy",
      "ga",
      "sq",
      "mk",
      "bs",
      "mt",
      "gl",
      "eu",
      "is",
      "ka",
      "hy",
      "kk",
      "uz",
      "az",
      "be",
      "mn",
      "ne",
      "si",
      "km",
      "my",
      "lo",
      "am",
      "ps",
      "sd",
      "ku",
      "ug",
      "bo",
      "dz",
      "fy",
    ],
    mtebFrench: 0.66,
    license: "Apache-2.0",
    matryoshka: true,
    activeParams: "305M",
    totalParams: "475M",
  },
} as const;

export type MultilingualEmbeddingModelId =
  keyof typeof MULTILINGUAL_EMBEDDING_MODELS;

export const DEFAULT_MULTILINGUAL_EMBEDDING_MODEL: MultilingualEmbeddingModelId =
  "multilingual-e5-small";

/**
 * Resolves the destination path for a gguf model from a url
 * Typically this is a huggingface url
 * @param url - The url of the model
 * @returns The destination path for the model
 */
/**
 * Returns null (rather than throwing) for models that no longer ship a legacy GGUF `tag`/
 * `downloadUrl` -- e.g. MODEL_CARDS' "powerful" tier, which has no Cactus registry equivalent
 * for Llama-3.2-3B and so has tag: "". useModelManager.ts's pre-download flow treats null as
 * "nothing to pre-download here", which is correct: the actual model load now goes through
 * CACTUS_CHAT_MODELS + CactusLM.download() (see CactusLmWrapper.initialize()), which is
 * independent of this legacy path and downloads lazily on first use regardless.
 */
export function resolveDestinationPathFromGGUFUrl(url: string): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const splits = parsed.pathname.split("/");
  const creator = {
    creator: splits[1],
    model: splits[2],
    file: splits.slice(-1)[0],
  };
  return `${RNFS.DocumentDirectoryPath}/models/gguf/${creator.creator}/${creator.model}/${creator.file}`;
}

/**
 * Voice pipeline model bundle. `slug` must be a key returned by cactus-react-native's
 * getRegistry() (HuggingFace-backed, https://huggingface.co/Cactus-Compute) -- the SDK
 * downloads and manages storage for it internally via CactusLM/CactusSTT's own
 * `.download()`, there is no manual path resolution any more.
 */
export interface CactusVoiceModelBundle {
  id: string;
  name: string;
  description: string;
  slug: string;
  quantization: "int4" | "int8";
  pro?: boolean;
  size: string;
  hasConfidenceProbe: boolean;
  supportsCloudHandoff: boolean;
  multimodal: {
    text: boolean;
    vision: boolean;
    audio: boolean;
  };
  recommendedFor:
    | "chat"
    | "voice-pipeline"
    | "transcription"
    | "vision"
    | "tool-calling";
  minRAM: string;
}

export const CACTUS_VOICE_MODELS = {
  // No "gemma-4-e2b-it-int8" entry: cactus-react-native's registry resolver (modelRegistry.ts)
  // picks the newest release tag on Cactus-Compute/gemma-4-E2B-it that is <= our pinned SDK's
  // runtime version (1.13.1), which resolves to tag v1.13. That tag ships gemma-4-e2b-it-int4.zip
  // but NOT gemma-4-e2b-it-int8.zip (added later, only present from v2.0 onward) -- so selecting
  // the int8 bundle 404s partway through download every time. Verified directly against HF's API
  // (curl -I .../resolve/v1.13/weights/gemma-4-e2b-it-int8.zip -> 404;
  // .../resolve/v2.0/weights/gemma-4-e2b-it-int8.zip -> 302). Re-add int8 once
  // cactus-react-native is upgraded past whatever runtime version resolves to v2.0+.
  "gemma-4-e2b-it-int4": {
    id: "gemma-4-e2b-it-int4",
    name: "Gemma 4 E2B (4-bit)",
    description:
      "Vision, audio, completion and tool-calling capable multimodal model.",
    slug: "gemma-4-e2b-it",
    quantization: "int4",
    pro: false,
    // The actual weights/gemma-4-e2b-it-int4.zip on HF is ~3.85GB (verified via HEAD request),
    // not the ~650MB previously listed here -- it bundles vision + audio encoders alongside the
    // text model, not just a quantized text-only LLM.
    size: "~3.85GB",
    hasConfidenceProbe: false,
    supportsCloudHandoff: false,
    multimodal: { text: true, vision: true, audio: true },
    recommendedFor: "voice-pipeline",
    // Was 3GB, inconsistent with the corrected ~3.85GB bundle size above -- resident memory
    // for weights this size plus KV cache/runtime overhead won't fit in 3GB. Rounded up as an
    // estimate; not yet measured against real device resident memory.
    minRAM: "5GB",
  },
  "parakeet-tdt-0.6b-v3-int4": {
    id: "parakeet-tdt-0.6b-v3-int4",
    name: "Parakeet TDT 0.6B (4-bit)",
    description:
      "Best-in-class streaming ASR, smallest bundle. Non-autoregressive, real-time factor ~0.1x.",
    slug: "parakeet-tdt-0.6b-v3",
    quantization: "int4",
    pro: false,
    size: "~180MB",
    hasConfidenceProbe: false,
    supportsCloudHandoff: false,
    multimodal: { text: false, vision: false, audio: true },
    recommendedFor: "transcription",
    minRAM: "2GB",
  },
  "parakeet-tdt-0.6b-v3-int8": {
    id: "parakeet-tdt-0.6b-v3-int8",
    name: "Parakeet TDT 0.6B (8-bit)",
    description: "Highest accuracy at this size. Use when RAM allows.",
    slug: "parakeet-tdt-0.6b-v3",
    quantization: "int8",
    pro: false,
    size: "~320MB",
    hasConfidenceProbe: false,
    supportsCloudHandoff: false,
    multimodal: { text: false, vision: false, audio: true },
    recommendedFor: "transcription",
    minRAM: "3GB",
  },
  "parakeet-ctc-1.1b-int8": {
    id: "parakeet-ctc-1.1b-int8",
    name: "Parakeet CTC 1.1B (8-bit)",
    description: "Larger model for challenging audio (accents, noise).",
    slug: "parakeet-ctc-1.1b",
    quantization: "int8",
    pro: false,
    size: "~600MB",
    hasConfidenceProbe: false,
    supportsCloudHandoff: false,
    multimodal: { text: false, vision: false, audio: true },
    recommendedFor: "transcription",
    minRAM: "3GB",
  },
} as const satisfies Record<string, CactusVoiceModelBundle>;

export type CactusVoiceModelId = keyof typeof CACTUS_VOICE_MODELS;

export const DEFAULT_CACTUS_ASR_MODEL: CactusVoiceModelId =
  "parakeet-tdt-0.6b-v3-int4";
export const DEFAULT_CACTUS_LLM_MODEL: CactusVoiceModelId =
  "gemma-4-e2b-it-int4";

export default MODEL_CARDS;
