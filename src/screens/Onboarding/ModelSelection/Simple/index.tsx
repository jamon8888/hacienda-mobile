import { Text, View } from "react-native";
import React, { useEffect, useState } from "react";
import { NavigationProp, useNavigation } from "@react-navigation/native";
import { useTranslation } from "@/hooks/useTranslation";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import useModelManager from "@/hooks/useModelManager";
import useLlmPreference from "@/hooks/useLLMPreference";
import { AvailableModel } from "@/components/TopBar/ModelChip";
import SimpleModelCard from "./SimpleModelCard";
import getLLM from "@/utils/AiProviders";
import PushNotifications from "@/utils/PushNotifications";
import { useDeviceCapabilities } from "@/hooks/useDeviceCapabilities";
import {
  getModelRecommendations,
  ModelWithRecommendation,
} from "@/utils/models/recommendations";

// During onboarding, this config will not yet be set in the UIStore, so we need set the default here
const DEFAULT_LLM_PREFERENCE = {
  provider: "native",
  config: { runtime: "cpu", model: null },
} as const;

export default function SimpleModelSelection() {
  const { t } = useTranslation("onboarding");
  const navigation = useNavigation<NavigationProp<any>>();
  const LLMProvider = getLLM(
    DEFAULT_LLM_PREFERENCE.provider,
    DEFAULT_LLM_PREFERENCE.config,
  );
  const llmPreferences = DEFAULT_LLM_PREFERENCE;
  const { fetchLLMPreference } = useLlmPreference();
  const deviceCaps = useDeviceCapabilities();
  const [availableModels, setAvailableModels] = useState<
    ModelWithRecommendation[]
  >([]);
  const {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    runPreDownloadConfirmations,
  } = useModelManager({ llmPreferences, fetchLLMPreference, LLMProvider });

  const saveAndNavigate = async (modelOverride?: ModelWithRecommendation) => {
    const model =
      modelOverride ||
      availableModels.find(card => card.model.modelId === selectedModel);
    if (!model) return;

    await uiStore.setToStorage("onboarding_model_selection_completed", true);
    await uiStore.setToStorage("llmPreference", {
      provider: "native",
      config: { runtime: "cpu", model: model.model.modelId },
    });
    navigation.navigate(PATHS.onboarding.survey as never);
  };

  useEffect(() => {
    const fetchModels = async () => {
      if (LLMProvider) {
        const models = ((await LLMProvider.availableModels()) ?? []) as any[];
        const presetModels = models.filter(model => model.isPreset);
        const recommendedModels = getModelRecommendations(
          presetModels,
          deviceCaps,
        );
        setAvailableModels(recommendedModels);
      } else setAvailableModels([]);
    };
    fetchModels();
  }, [LLMProvider, deviceCaps]);

  // Show device info banner
  const deviceInfo = deviceCaps ? (
    <View className="mb-4 p-4 bg-white/10 rounded-lg border border-white/20">
      <Text className="text-white text-sm font-medium mb-1">
        {t("modelSelection.deviceDetected")}
      </Text>
      <View className="flex flex-row flex-wrap gap-2">
        <Text className="text-white/70 text-xs px-2 py-1 bg-white/10 rounded">
          {t(`modelSelection.ramTier.${deviceCaps.ramTier}`)}{" "}
          {t("modelSelection.ramAvailable", {
            gb: (deviceCaps.availableRAM / 1024 ** 3).toFixed(1),
          })}
        </Text>
        <Text className="text-white/70 text-xs px-2 py-1 bg-white/10 rounded">
          {deviceCaps.npuBackend !== "CPU" && deviceCaps.npuBackend !== "NNAPI"
            ? t("modelSelection.npu", { backend: deviceCaps.npuBackend })
            : t("modelSelection.cpuOnly")}
        </Text>
        <Text className="text-white/70 text-xs px-2 py-1 bg-white/10 rounded">
          {t("modelSelection.llmAsr", {
            llm: deviceCaps.recommendedLLMQuant,
            asr: deviceCaps.recommendedASRQuant,
          })}
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <React.Fragment>
      <View className="flex flex-col gap-y-4 justify-center items-center pb-[24px]">
        <Text className="text-white text-4xl font-bold text-center">
          {t("modelSelection.title")}
        </Text>
        <Text className="text-white/60 text-xl text-center">
          {t("modelSelection.subtitle")}
        </Text>
      </View>
      {deviceInfo}
      <View className="flex flex-col items-center" style={{ gap: 16 }}>
        {availableModels.map((card, index) => (
          <SimpleModelCard
            key={index}
            model={card.model}
            recommendation={card.recommendation}
            isSelected={selectedModel === card.model.modelId}
            isDownloaded={downloadedModels[card.model.modelId]}
            modelDownloadUrl={modelDownloadUrl}
            downloadProgress={downloadProgress}
            onSelect={async () => {
              // If the user has not granted permissions to receive notifications we cannot download models in the background
              // so we need to await the entire download process
              if (PushNotifications.notificationsEnabled) {
                const approved = await runPreDownloadConfirmations(card.model);
                if (!approved) return false;
                downloadModel(card.model, false);
                await saveAndNavigate(card);
                return;
              }

              // Manually run the pre-download confirmation checks since we need to confirm
              // the user approved the download before we navigate to the next screen
              // Notifications will provide progress updates so we can move to the next screen while the download is in progress
              const approved = await runPreDownloadConfirmations(card.model);
              if (!approved) return false;
              const result = await downloadModel(card.model, false);
              if (result !== false) await saveAndNavigate(card);
            }}
          />
        ))}
      </View>
    </React.Fragment>
  );
}
