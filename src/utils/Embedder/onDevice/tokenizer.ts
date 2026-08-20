import { NativeModules, Platform } from "react-native";

type SentencePieceProcessor = import("@sctg/sentencepiece-js").SentencePieceProcessor;

let spmProcessor: SentencePieceProcessor | null = null;
let isInitialized = false;

export const TOKENIZER_CONSTANTS = {
  UNK_TOKEN: 0,
  PAD_TOKEN: 1,
  CLS_TOKEN: 2,
  SEP_TOKEN: 3,
  MASK_TOKEN: 4,
  MAX_LENGTH: 256,
};

export async function initializeTokenizer(): Promise<void> {
  if (isInitialized && spmProcessor) return;

  try {
    const { SentencePieceProcessor } = require("@sctg/sentencepiece-js");
    const RNFS = require("react-native-fs");
    let modelData: string;

    if (Platform.OS === "android") {
      modelData = await RNFS.readFileAssets("sentencepiece.model", "base64");
    } else {
      const modelPath = `${RNFS.MainBundlePath}/sentencepiece.model`;
      const modelExists = await RNFS.exists(modelPath);
      if (!modelExists) {
        throw new Error(
          `SentencePiece model not found at ${modelPath}. Run download script.`,
        );
      }
      modelData = await RNFS.readFile(modelPath, "base64");
    }

    const processor = new SentencePieceProcessor();
    await processor.loadFromB64StringModel(modelData);
    spmProcessor = processor;

    isInitialized = true;
    console.log("[EmbeddingGemmaTokenizer] Initialized successfully");
  } catch (error) {
    console.error("[EmbeddingGemmaTokenizer] Failed to initialize:", error);
    throw error;
  }
}

export function isTokenizerReady(): boolean {
  return isInitialized && spmProcessor !== null;
}

export function tokenize(
  text: string,
  maxLength = TOKENIZER_CONSTANTS.MAX_LENGTH,
): number[] {
  if (!spmProcessor) {
    throw new Error(
      "Tokenizer not initialized. Call initializeTokenizer() first.",
    );
  }

  if (maxLength < 2) {
    throw new Error(
      `maxLength must be at least 2 (CLS + SEP tokens), got ${maxLength}`,
    );
  }

  const trimmed = text.trim();
  const ids = trimmed.length > 0 ? spmProcessor.encodeIds(trimmed) : [];
  const tokens: number[] = [
    TOKENIZER_CONSTANTS.CLS_TOKEN,
    ...ids,
    TOKENIZER_CONSTANTS.SEP_TOKEN,
  ];

  if (tokens.length > maxLength) {
    return tokens.slice(0, maxLength - 1).concat(TOKENIZER_CONSTANTS.SEP_TOKEN);
  }

  while (tokens.length < maxLength) {
    tokens.push(TOKENIZER_CONSTANTS.PAD_TOKEN);
  }

  return tokens;
}

export function tokenizeBatch(
  texts: string[],
  maxLength = TOKENIZER_CONSTANTS.MAX_LENGTH,
): number[][] {
  return texts.map(text => tokenize(text, maxLength));
}

export function decode(tokens: number[]): string {
  if (!spmProcessor) {
    throw new Error("Tokenizer not initialized");
  }
  const filteredTokens = tokens.filter(
    t => t >= TOKENIZER_CONSTANTS.MASK_TOKEN,
  );
  const int32Array = new Int32Array(filteredTokens);
  return spmProcessor.decodeIds(int32Array);
}
