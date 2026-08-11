import { useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  getDeviceCapabilities,
  AndroidDeviceCapabilities,
} from "@/utils/device";

export interface DeviceCapabilities {
  // CPU
  cpuCores: number;
  cpuFeatures: string[];
  hasFp16: boolean;
  hasDotProd: boolean;
  hasSve: boolean;
  hasI8mm: boolean;

  // Memory
  totalRAM: number;
  availableRAM: number;
  freeDiskSpace: number;

  // GPU/NPU
  hasMetal: boolean;
  hasANE: boolean;
  npuBackend: NPUBackend;
  gpuVendor: GPUVendor;

  // Derived
  ramTier: "low" | "medium" | "high";
  computeTier: "cpu" | "npu";
  recommendedASRQuant: "CQ2" | "CQ3" | "CQ4";
  recommendedLLMQuant: "CQ2" | "CQ2.54" | "CQ4";
}

type NPUBackend =
  | "QNN"
  | "MEDIATEK_APU"
  | "EXYNOS_NPU"
  | "TENSOR_TPU"
  | "KIRIN_NPU"
  | "NNAPI"
  | "CPU";
type GPUVendor =
  | "apple"
  | "qualcomm"
  | "mediatek"
  | "samsung"
  | "google"
  | "huawei"
  | "mali"
  | "adreno"
  | "unknown";

export function useDeviceCapabilities(): DeviceCapabilities | null {
  const [caps, setCaps] = useState<DeviceCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function detect() {
      try {
        setLoading(true);
        setError(null);

        let result: DeviceCapabilities;

        if (Platform.OS === "android") {
          const androidCaps = await getDeviceCapabilities();
          result = mapAndroidToUnified(androidCaps);
        } else {
          result = getIOSCapabilities();
        }

        if (mounted) {
          setCaps(result);
        }
      } catch (e) {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Unknown error");
          setCaps(getFallbackCapabilities());
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    detect();

    return () => {
      mounted = false;
    };
  }, []);

  return caps;
}

function mapAndroidToUnified(a: AndroidDeviceCapabilities): DeviceCapabilities {
  return {
    cpuCores: a.cpuInfo.cores,
    cpuFeatures: a.cpuInfo.features,
    hasFp16: a.cpuInfo.hasFp16,
    hasDotProd: a.cpuInfo.hasDotProd,
    hasSve: a.cpuInfo.hasSve,
    hasI8mm: a.cpuInfo.hasI8mm,
    totalRAM: a.ramInfo.totalRAM,
    availableRAM: a.ramInfo.availableRAM,
    freeDiskSpace: 0, // Filled by separate check
    hasMetal: false,
    hasANE: false,
    npuBackend: a.npuBackend,
    gpuVendor: a.gpuVendor,
    ramTier: a.ramTier,
    computeTier: a.computeTier,
    recommendedASRQuant: a.recommendedASRQuant,
    recommendedLLMQuant: a.recommendedLLMQuant,
  };
}

function getIOSCapabilities(): DeviceCapabilities {
  // Placeholder for iOS Phase 2
  return getFallbackCapabilities();
}

function getFallbackCapabilities(): DeviceCapabilities {
  return {
    cpuCores: 4,
    cpuFeatures: [],
    hasFp16: false,
    hasDotProd: false,
    hasSve: false,
    hasI8mm: false,
    totalRAM: 4 * 1024 ** 3,
    availableRAM: 2 * 1024 ** 3,
    freeDiskSpace: 0,
    hasMetal: false,
    hasANE: false,
    npuBackend: "CPU",
    gpuVendor: "unknown",
    ramTier: "medium",
    computeTier: "cpu",
    recommendedASRQuant: "CQ2",
    recommendedLLMQuant: "CQ2.54",
  };
}
