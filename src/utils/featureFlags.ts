import { subscriptionStore } from "@/store/SubscriptionStore";

// Inference
export function isInferenceCloudEnabled(): boolean {
  return subscriptionStore.isPaid;
}

// Verticals (placeholder - requires Xberg NER bridge)
export function isVerticalEnabled(): boolean {
  return false; // Not built yet
}

// NER (placeholder - requires Xberg NER bridge)
export function isNEREnabled(): boolean {
  return false; // Not built yet
}

// LoRAs (placeholder - requires Cactus LoRA support)
export function isLoRAEnabled(): boolean {
  return false; // Not built yet
}

// Needle RAG (placeholder - unbuilt)
export function isNeedleEnabled(): boolean {
  return false; // Not built yet
}

// Free for all
export function isDocumentGenerationEnabled(): boolean {
  return true;
}

export function isPushToTalkEnabled(): boolean {
  return true;
}

export function isAudioMemosEnabled(): boolean {
  return true;
}

// Office format reading (Xberg already supports this)
export function isOfficeReadingEnabled(): boolean {
  return true;
}
