import { SentencePieceProcessor } from "@sctg/sentencepiece-js";
import { NativeModules, Platform } from "react-native";
import RNFS from "react-native-fs";

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
    let modelPath: string;

    if (Platform.OS === "android") {
      modelPath = `${RNFS.MainBundlePath}/sentencepiece.model`;
    } else {
      modelPath = RNFS.MainBundlePath + "/sentencepiece.model";
    }

    const modelExists = await RNFS.exists(modelPath);
    if (!modelExists) {
      throw new Error(
        `SentencePiece model not found at ${modelPath}. Run download script.`,
      );
    }

    const modelData = await RNFS.readFile(modelPath, "base64");

    spmProcessor = new SentencePieceProcessor();
    await spmProcessor.loadFromB64StringModel(modelData);

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

  const ids = spmProcessor.encodeIds(text);
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
  // Filter out special tokens (below MASK_TOKEN = 4)
  const filteredTokens = tokens.filter(
    t => t >= TOKENIZER_CONSTANTS.MASK_TOKEN,
  );
  const int32Array = new Int32Array(filteredTokens);
  return spmProcessor.decodeIds(int32Array);
}
