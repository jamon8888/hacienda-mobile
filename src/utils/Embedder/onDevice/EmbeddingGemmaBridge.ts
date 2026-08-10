import { NativeModules } from "react-native";
import { tokenize, tokenizeBatch } from "./tokenizer";

const { EmbeddingGemmaModule } = NativeModules;

export async function isEmbeddingGemmaAvailable(): Promise<boolean> {
  if (!EmbeddingGemmaModule) {
    return false;
  }
  try {
    return await EmbeddingGemmaModule.isAvailable();
  } catch {
    return false;
  }
}

export async function initEmbeddingGemma(): Promise<void> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }
  await EmbeddingGemmaModule.initModel();
}

export async function embedText(
  text: string,
  dims = 128,
): Promise<Float32Array> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }

  // Tokenize the input text
  const tokens = tokenize(text);

  // Pass tokens to native module for inference
  const result = await EmbeddingGemmaModule.embed(tokens, dims);
  return new Float32Array(result);
}

export async function embedBatch(
  texts: string[],
  dims = 128,
): Promise<Float32Array[]> {
  if (!EmbeddingGemmaModule) {
    throw new Error("EmbeddingGemma native module not available");
  }

  // Tokenize all texts
  const tokenBatch = tokenizeBatch(texts);

  // Pass token batch to native module for inference
  const results = await EmbeddingGemmaModule.embedBatch(tokenBatch, dims);
  return results.map((r: number[]) => new Float32Array(r));
}
