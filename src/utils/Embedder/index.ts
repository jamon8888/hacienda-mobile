import OnDeviceEmbedderProvider from "./onDevice";
import MultilingualEmbedderProvider from "./onDevice/multilingual";
import {
  createEmbeddingProvider,
  getEmbeddingProvider,
  setEmbeddingEngine,
  getCurrentEngine,
  touchCurrentEmbeddingProvider,
} from "./factory";
import {
  EmbeddingProvider,
  EmbeddingEngine,
  EmbeddingResult,
  EmbedderPrefixType,
  MultilingualEmbeddingModelId,
} from "./types";
import {
  MULTILINGUAL_EMBEDDING_MODELS,
  DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
} from "@/utils/models/defaults";

export type {
  EmbeddingProvider,
  EmbeddingEngine,
  EmbeddingResult,
  EmbedderPrefixType,
  MultilingualEmbeddingModelId,
};
export { OnDeviceEmbedderProvider, MultilingualEmbedderProvider };
export {
  createEmbeddingProvider,
  getEmbeddingProvider,
  setEmbeddingEngine,
  getCurrentEngine,
  touchCurrentEmbeddingProvider,
};
export { MULTILINGUAL_EMBEDDING_MODELS, DEFAULT_MULTILINGUAL_EMBEDDING_MODEL };

export type EmbedderProvider =
  | OnDeviceEmbedderProvider
  | MultilingualEmbedderProvider;

function getEmbedder(
  provider: string,
  config: { [key: string]: any } = {},
): EmbedderProvider {
  switch (provider) {
    case "native":
      return (
        OnDeviceEmbedderProvider.instance || new OnDeviceEmbedderProvider()
      );
    case "multilingual-e5-small":
    case "multilingual-e5-base":
    case "sentence-camembert-base":
    case "nomic-embed-text-v2-moe":
      return MultilingualEmbedderProvider.getInstance(
        config.modelId as MultilingualEmbeddingModelId,
      );
    default:
      throw new Error(`Provider ${provider} not supported`);
  }
}

export default getEmbedder;
