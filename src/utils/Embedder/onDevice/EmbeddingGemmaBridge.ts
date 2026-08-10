import { NativeModules, Platform } from 'react-native';

const { EmbeddingGemmaModule } = NativeModules;

export async function isEmbeddingGemmaAvailable(): Promise<boolean> {
  if (!EmbeddingGemmaModule) return false;
  try {
    return await EmbeddingGemmaModule.isAvailable();
  } catch {
    return false;
  }
}

export async function initEmbeddingGemma(): Promise<void> {
  if (!EmbeddingGemmaModule) {
    throw new Error('EmbeddingGemma native module not available');
  }
  await EmbeddingGemmaModule.initModel();
}

export async function embedText(text: string, dims = 128): Promise<Float32Array> {
  if (!EmbeddingGemmaModule) {
    throw new Error('EmbeddingGemma native module not available');
  }
  const result = await EmbeddingGemmaModule.embed(text, dims);
  return new Float32Array(result);
}

export async function embedBatch(
  texts: string[],
  dims = 128,
): Promise<Float32Array[]> {
  if (!EmbeddingGemmaModule) {
    throw new Error('EmbeddingGemma native module not available');
  }
  const results = await EmbeddingGemmaModule.embedBatch(texts, dims);
  return results.map((r: number[]) => new Float32Array(r));
}
