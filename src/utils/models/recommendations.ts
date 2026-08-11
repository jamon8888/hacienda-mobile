import { DeviceCapabilities } from "@/hooks/useDeviceCapabilities";
import {
  CACTUS_VOICE_MODELS,
  CactusVoiceModelId,
} from "@/utils/models/defaults";

export interface ModelRecommendation {
  modelId: string;
  isRecommended: boolean;
  reason: string;
  ramEstimate: string;
  qualityScore: number; // 0-100
  quantization: string;
  deviceTier: "optimal" | "good" | "acceptable" | "not_recommended";
}

export interface ModelWithRecommendation {
  model: any;
  recommendation: ModelRecommendation;
}

/**
 * Get model recommendations based on device capabilities
 */
export function getModelRecommendations(
  models: any[],
  device: DeviceCapabilities | null,
): ModelWithRecommendation[] {
  if (!device) {
    return models.map(model => ({
      model,
      recommendation: {
        modelId: model.modelId,
        isRecommended: false,
        reason: "Could not detect device capabilities",
        ramEstimate: model.size || "Unknown",
        qualityScore: 50,
        quantization: "Unknown",
        deviceTier: "acceptable",
      },
    }));
  }

  const ramGB = device.availableRAM / 1024 ** 3;
  const hasNPU = device.npuBackend !== "CPU" && device.npuBackend !== "NNAPI";

  return models
    .map(model => {
      const rec = evaluateModel(model, device, ramGB, hasNPU);
      return { model, recommendation: rec };
    })
    .sort((a, b) => {
      // Sort: recommended first, then by quality score
      if (a.recommendation.isRecommended && !b.recommendation.isRecommended)
        return -1;
      if (!a.recommendation.isRecommended && b.recommendation.isRecommended)
        return 1;
      return b.recommendation.qualityScore - a.recommendation.qualityScore;
    });
}

function evaluateModel(
  model: any,
  device: DeviceCapabilities,
  ramGB: number,
  hasNPU: boolean,
): ModelRecommendation {
  const modelId = model.modelId?.toLowerCase() || "";

  // Determine model type and requirements
  let modelType = "unknown";
  let modelRAM = 0;
  let modelQuant = "Unknown";

  if (modelId.includes("qwen3-0.6b") || modelId.includes("qwen-0.6b")) {
    modelType = "llm";
    modelRAM = 0.6; // GB
    modelQuant = "Q8_0";
  } else if (modelId.includes("qwen3-1.7b") || modelId.includes("qwen-1.7b")) {
    modelType = "llm";
    modelRAM = 1.8;
    modelQuant = "Q8_0";
  } else if (modelId.includes("llama-3.2-3b")) {
    modelType = "llm";
    modelRAM = 2.0;
    modelQuant = "Q4_1";
  } else if (modelId.includes("gemma-4-e2b") || modelId.includes("gemma4")) {
    modelType = "llm";
    modelRAM = 2.0;
    modelQuant = "CQ2.54";
  } else if (modelId.includes("parakeet")) {
    modelType = "asr";
    modelRAM = 0.2;
    modelQuant = "CQ2";
  } else if (modelId.includes("whisper")) {
    modelType = "asr";
    modelRAM = 0.5;
    modelQuant = "Q4";
  } else if (modelId.includes("multilingual-e5-small")) {
    modelType = "embedding";
    modelRAM = 0.12;
    modelQuant = "Q4";
  } else if (modelId.includes("multilingual-e5-base")) {
    modelType = "embedding";
    modelRAM = 0.28;
    modelQuant = "Q4";
  } else if (modelId.includes("nomic-embed-text-v2-moe")) {
    modelType = "embedding";
    modelRAM = 0.33;
    modelQuant = "Q4";
  } else if (modelId.includes("sentence-camembert-base")) {
    modelType = "embedding";
    modelRAM = 0.11;
    modelQuant = "Q4";
  }

  // Check if Cactus model is available
  const isCactusModel =
    modelId.includes("gemma-4-e2b") || modelId.includes("parakeet");

  // Determine recommendation
  let isRecommended = false;
  let reason = "";
  let qualityScore = 50;
  let deviceTier: "optimal" | "good" | "acceptable" | "not_recommended" =
    "acceptable";

  if (modelType === "llm") {
    // LLM recommendations
    if (isCactusModel) {
      // Cactus Gemma 4 E2B Hybrid
      if (ramGB >= 5) {
        isRecommended = true;
        reason = `Optimal: ${ramGB.toFixed(1)}GB RAM + ${
          hasNPU ? device.npuBackend : "CPU"
        } → CQ4 best quality`;
        qualityScore = hasNPU ? 95 : 90;
        deviceTier = "optimal";
      } else if (ramGB >= 3) {
        isRecommended = true;
        reason = `Good: ${ramGB.toFixed(1)}GB RAM → CQ2.54 production bundle`;
        qualityScore = hasNPU ? 85 : 80;
        deviceTier = "good";
      } else {
        reason = `Limited: ${ramGB.toFixed(1)}GB RAM → CQ2.54 minimum`;
        qualityScore = 60;
        deviceTier = "acceptable";
      }
    } else {
      // GGUF models (Qwen, Llama)
      if (ramGB >= 4) {
        isRecommended = true;
        reason = `${ramGB.toFixed(1)}GB RAM → ${modelQuant} quantization`;
        qualityScore = 75;
        deviceTier = "good";
      } else if (ramGB >= 2) {
        reason = `${ramGB.toFixed(1)}GB RAM → may be slow with ${modelQuant}`;
        qualityScore = 60;
        deviceTier = "acceptable";
      } else {
        reason = `Insufficient RAM (${ramGB.toFixed(1)}GB) for this model`;
        qualityScore = 30;
        deviceTier = "not_recommended";
      }
    }
  } else if (modelType === "asr") {
    // ASR recommendations (Parakeet, Whisper)
    if (isCactusModel && modelId.includes("parakeet")) {
      if (ramGB >= 3) {
        isRecommended = true;
        reason = `Optimal: ${ramGB.toFixed(
          1,
        )}GB RAM → CQ4 best accuracy (WER 0.115)`;
        qualityScore = 95;
        deviceTier = "optimal";
      } else if (ramGB >= 2) {
        isRecommended = true;
        reason = `Good: ${ramGB.toFixed(
          1,
        )}GB RAM → CQ2 minimal footprint (WER 0.147)`;
        qualityScore = 85;
        deviceTier = "good";
      } else {
        reason = `Limited: ${ramGB.toFixed(1)}GB RAM → CQ2 minimum`;
        qualityScore = 70;
        deviceTier = "acceptable";
      }
    } else {
      // Whisper GGUF
      if (ramGB >= 2) {
        isRecommended = true;
        reason = `${ramGB.toFixed(1)}GB RAM → ${modelQuant}`;
        qualityScore = 80;
        deviceTier = "good";
      } else {
        reason = `Insufficient RAM for ASR model`;
        qualityScore = 40;
        deviceTier = "not_recommended";
      }
    }
  } else if (modelType === "embedding") {
    // Embedding recommendations
    if (ramGB >= 2) {
      isRecommended = true;
      reason = `${ramGB.toFixed(1)}GB RAM → ${modelQuant} good for embeddings`;
      qualityScore = 85;
      deviceTier = "good";
    } else {
      reason = `Limited RAM for embedding model`;
      qualityScore = 60;
      deviceTier = "acceptable";
    }
  } else {
    // Unknown model type
    if (ramGB >= 3) {
      isRecommended = true;
      reason = `${ramGB.toFixed(1)}GB RAM available`;
      qualityScore = 70;
      deviceTier = "acceptable";
    } else {
      reason = `Limited RAM (${ramGB.toFixed(1)}GB)`;
      qualityScore = 50;
      deviceTier = "acceptable";
    }
  }

  // Boost score if NPU available and model can use it
  if (hasNPU && (modelType === "llm" || modelType === "asr")) {
    qualityScore = Math.min(qualityScore + 5, 100);
  }

  return {
    modelId: model.modelId || model.id || "",
    isRecommended,
    reason,
    ramEstimate: `${modelRAM}GB`,
    qualityScore,
    quantization: modelQuant,
    deviceTier,
  };
}

/**
 * Get recommended quantization for a specific model type
 */
export function getRecommendedQuantization(
  modelType: "llm" | "asr" | "embedding",
  device: DeviceCapabilities,
): { quantization: string; reason: string } {
  const ramGB = device.availableRAM / 1024 ** 3;
  const hasNPU = device.npuBackend !== "CPU" && device.npuBackend !== "NNAPI";

  if (modelType === "llm") {
    if (ramGB >= 5)
      return {
        quantization: "CQ4",
        reason: `High RAM (${ramGB.toFixed(1)}GB) + ${
          hasNPU ? device.npuBackend : "CPU"
        } → best quality`,
      };
    if (ramGB >= 3)
      return {
        quantization: "CQ2.54",
        reason: `Medium RAM (${ramGB.toFixed(1)}GB) → production bundle`,
      };
    return {
      quantization: "CQ2.54",
      reason: `Low RAM (${ramGB.toFixed(1)}GB) → minimum viable`,
    };
  }

  if (modelType === "asr") {
    if (ramGB >= 3)
      return {
        quantization: "CQ4",
        reason: `High RAM (${ramGB.toFixed(1)}GB) → best accuracy (WER 0.115)`,
      };
    if (ramGB >= 2)
      return {
        quantization: "CQ2",
        reason: `Medium RAM (${ramGB.toFixed(
          1,
        )}GB) → minimal footprint (WER 0.147)`,
      };
    return {
      quantization: "CQ2",
      reason: `Low RAM (${ramGB.toFixed(1)}GB) → minimal footprint`,
    };
  }

  if (modelType === "embedding") {
    if (ramGB >= 3)
      return {
        quantization: "Q4",
        reason: "High RAM → best embedding quality",
      };
    return {
      quantization: "Q4",
      reason: "Standard quantization for embeddings",
    };
  }

  return { quantization: "Auto", reason: "Auto-detect based on device" };
}
