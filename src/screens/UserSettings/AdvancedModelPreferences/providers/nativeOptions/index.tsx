import useModelManager from "@/hooks/useModelManager";
import { Text, TouchableOpacity } from "react-native";
import ModelCard from "@/components/ModelCard";
import { useState, useEffect, Fragment } from "react";
import OnDeviceProvider from "@/utils/AiProviders/onDevice";

interface NativeOptionsProps {
  llmPreferences: any;
  fetchLLMPreference: () => Promise<void>;
  LLMProvider: any;
}

export default function NativeOptions({
  llmPreferences,
  fetchLLMPreference,
  LLMProvider,
}: NativeOptionsProps) {
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [showAllModels, setShowAllModels] = useState(false);
  const {
    modelDownloadUrl,
    downloadProgress,
    selectedModel,
    downloadModel,
    uninstallModel,
    isModelDownloaded,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  useEffect(() => {
    async function fetchModels() {
      if (LLMProvider) {
        const models = await (
          LLMProvider as OnDeviceProvider
        ).availableModels();
        for (const model of models) {
          // Checks the real Cactus registry bundle for models CactusLmWrapper downloads
          // lazily (see isModelDownloaded), falling back to the legacy GGUF path check for
          // the rest -- a missing legacy path alone doesn't mean the bundle is on disk.
          // @ts-ignore
          model.isDownloaded = await isModelDownloaded(model);
        }
        setAvailableModels(models);
      } else setAvailableModels([]);
    }
    fetchModels();
  }, [LLMProvider]);

  const displayedModels = showAllModels
    ? availableModels
    : availableModels.filter(model => model.isPreset);

  return (
    <Fragment>
      {displayedModels.map((model, index) => (
        <ModelCard
          key={`settings-${model.modelId}-${index}`}
          model={model}
          isSelected={selectedModel === model.modelId}
          isDownloaded={model.isDownloaded}
          modelDownloadUrl={modelDownloadUrl}
          downloadProgress={downloadProgress}
          onSelect={() => downloadModel(model)}
          onUninstall={() => uninstallModel(model)}
        />
      ))}
      {availableModels.length > 0 && (
        <TouchableOpacity
          onPress={() => setShowAllModels(!showAllModels)}
          className="flex flex-row items-center justify-center py-2">
          <Text className="text-[#9F9FA0] text-sm">
            {showAllModels ? "Show Less" : "View More"}
          </Text>
        </TouchableOpacity>
      )}
    </Fragment>
  );
}
