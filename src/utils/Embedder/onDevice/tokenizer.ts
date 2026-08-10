/**
 * Simple tokenizer for EmbeddingGemma
 * This is a placeholder until a proper SentencePiece tokenizer is implemented
 */

// Basic vocabulary for English text
const BASIC_VOCABULARY: Record<string, number> = {};
const UNK_TOKEN = 0;
const PAD_TOKEN = 1;
const CLS_TOKEN = 2;
const SEP_TOKEN = 3;
const MASK_TOKEN = 4;

// Simple word-level tokenization
export function tokenize(text: string, max length: number = 256): number[] {
  const tokens: number[] = [CLS_TOKEN];
  
  // Split text into words and convert to token IDs
  const words = text.toLowerCase().split(/\s+/);
  
  for (const word of words) {
    if (tokens.length >= max length - 1) break;
    
    // Simple hash-based tokenization (placeholder)
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    
    // Map to vocabulary range (5-30000)
    const tokenId = Math.abs(hash) % 29995 + 5;
    tokens.push(tokenId);
  }
  
  tokens.push(SEP_TOKEN);
  
  // Pad to max length
  while (tokens.length < max length) {
    tokens.push(PAD_TOKEN);
  }
  
  return tokens;
}

export function tokenizeBatch(texts: string[], max length: number = 256): number[][] {
  return texts.map(text => tokenize(text, maxLength));
}

// Export constants for use in native modules
export const TOKENIZER_CONSTANTS = {
  UNK_TOKEN,
  PAD_TOKEN,
  CLS_TOKEN,
  SEP_TOKEN,
  MASK_TOKEN,
  MAX_LENGTH: 256,
};
