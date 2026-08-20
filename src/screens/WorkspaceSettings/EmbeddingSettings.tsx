import { Text, TouchableOpacity, View, ScrollView, Switch } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Globe,
  CaretDown,
  Check,
  Warning,
  Info,
} from "phosphor-react-native";
import { useNavigation } from "@react-navigation/native";
import { PATHS } from "@/utils/paths";
import uiStore from "@/store/UIStore";
import { useEffect, useState } from "react";
import {
  MULTILINGUAL_EMBEDDING_MODELS,
  MultilingualEmbeddingModelId,
  DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
} from "@/utils/models/defaults";
import Workspace from "@/database/models/Workspace";
import { reembedWorkspace } from "@/utils/Embedder/reembedWorkspace";
import { useTranslation } from "@/hooks/useTranslation";
import type { IWorkspacePageKey } from "./index";

interface EmbeddingSettingsViewProps {
  workspace: any;
  goToPage: (page: IWorkspacePageKey) => void;
  initialThreadSlug?: string | null;
}

const ENGINE_VALUES: MultilingualEmbeddingModelId[] = [
  "multilingual-e5-small",
  "multilingual-e5-base",
  "sentence-camembert-base",
  "nomic-embed-text-v2-moe",
];

const ENGINE_META: Record<
  MultilingualEmbeddingModelId,
  { size: string; quality: number; dimensions: number }
> = {
  "multilingual-e5-small": { size: "124MB", quality: 0.63, dimensions: 384 },
  "multilingual-e5-base": { size: "280MB", quality: 0.65, dimensions: 768 },
  "sentence-camembert-base": { size: "115MB", quality: 0.59, dimensions: 768 },
  "nomic-embed-text-v2-moe": { size: "328MB", quality: 0.66, dimensions: 768 },
};

const DIMENSION_VALUES = [768, 512, 256, 128, 64];

export function EmbeddingSettingsView({
  workspace,
  goToPage,
}: EmbeddingSettingsViewProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("workspace");
  const [config, setConfig] = useState(
    workspace.embeddingConfig || {
      engine: DEFAULT_MULTILINGUAL_EMBEDDING_MODEL,
      dimensions:
        MULTILINGUAL_EMBEDDING_MODELS[DEFAULT_MULTILINGUAL_EMBEDDING_MODEL]
          .dimensions,
      autoDetectLanguage: true,
      modelVersion: "1.0",
    },
  );
  const [showEnginePicker, setShowEnginePicker] = useState(false);
  const [showDimensionPicker, setShowDimensionPicker] = useState(false);
  const [showReembedConfirm, setShowReembedConfirm] = useState(false);

  const ENGINE_OPTIONS = ENGINE_VALUES.map(value => ({
    value,
    label: t(`embedding.engine.options.${value}.label`),
    description: t(`embedding.engine.options.${value}.description`),
    ...ENGINE_META[value],
  }));
  const DIMENSION_OPTIONS = DIMENSION_VALUES.map(value => ({
    value,
    label: t(`embedding.dimensions.options.${value}`),
  }));

  const selectedEngine =
    ENGINE_OPTIONS.find(e => e.value === config.engine) || ENGINE_OPTIONS[0];
  const supportsMatryoshka = selectedEngine.value === "nomic-embed-text-v2-moe";
  const availableDimensions = supportsMatryoshka
    ? DIMENSION_OPTIONS
    : DIMENSION_OPTIONS.filter(d => d.value <= selectedEngine.dimensions);

  async function saveConfig() {
    const newConfig = {
      ...config,
      modelVersion: "1.0",
    };
    const updated = await Workspace.update(
      [{ field: "slug", value: workspace.slug }],
      { embeddingConfig: newConfig },
    );
    if (!updated) {
      uiStore.showError(t("embedding.saveError"));
      return;
    }
    setConfig(newConfig);
    uiStore.showSuccess(t("embedding.saveSuccess"));
  }

  async function handleEngineChange(engine: MultilingualEmbeddingModelId) {
    const engineConfig = MULTILINGUAL_EMBEDDING_MODELS[engine];
    const newDimensions = Math.min(config.dimensions, engineConfig.dimensions);
    setConfig(prev => ({
      ...prev,
      engine,
      dimensions: newDimensions,
    }));
    setShowEnginePicker(false);
    await saveConfig();
  }

  async function handleDimensionChange(dimensions: number) {
    setConfig(prev => ({ ...prev, dimensions }));
    setShowDimensionPicker(false);
    await saveConfig();
  }

  async function handleAutoDetectChange(autoDetectLanguage: boolean) {
    setConfig(prev => ({ ...prev, autoDetectLanguage }));
    await saveConfig();
  }

  async function handleReembedWorkspace() {
    setShowReembedConfirm(false);
    // Use the current (possibly just-changed) config rather than the
    // workspace prop's, which may not have caught up to the latest save yet.
    const { documentsReembedded, documentsFailed, memosReembedded, memosFailed } =
      await reembedWorkspace({ ...workspace, embeddingConfig: config });

    const total = documentsReembedded + memosReembedded;
    const failed = documentsFailed + memosFailed;
    if (failed === 0) {
      uiStore.showSuccess(t("embedding.reembed.success", { count: total }));
    } else {
      uiStore.showError(
        t("embedding.reembed.successWithFailures", { count: total, failed }),
      );
    }
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: "#1B1B1E" }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 30,
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={() => goToPage("main")}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text
          style={{ maxWidth: "80%" }}
          numberOfLines={1}
          ellipsizeMode="middle"
          className="text-white text-lg font-medium">
          {t("embedding.title")}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex flex-col"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 100,
          gap: 24,
          backgroundColor: "#1B1B1E",
        }}>
        {/* Engine Selection */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <View className="flex flex-row items-center justify-between">
            <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
              {t("embedding.engine.label")}
            </Text>
            <Info size={18} color="#6F6F71" />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={() => setShowEnginePicker(true)}>
            <View className="flex flex-row gap-2 items-center">
              <Globe size={18} color="#FFF" />
              <Text className="text-white text-lg">
                {t("embedding.engine.fieldLabel")}
              </Text>
            </View>
            <View className="flex flex-1 flex-row gap-2 items-center justify-between">
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{ color: "#9F9FA0" }}
                className="text-lg flex-1 text-right">
                {selectedEngine.label}
              </Text>
              <CaretDown size={18} color="#FFF" />
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9F9FA0" }} className="text-xs">
            {t("embedding.engine.description", {
              description: selectedEngine.description,
              size: selectedEngine.size,
              quality: selectedEngine.quality,
            })}
          </Text>

          {/* Engine Picker Modal */}
          {showEnginePicker && (
            <View
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
              style={{ top: insets.top }}>
              <View className="bg-gray-900 rounded-xl p-6 w-full mx-4 max-h-[80%]">
                <Text className="text-white text-xl font-bold mb-4">
                  {t("embedding.engine.pickerTitle")}
                </Text>
                <ScrollView>
                  {ENGINE_OPTIONS.map(engine => (
                    <TouchableOpacity
                      key={engine.value}
                      style={{
                        backgroundColor: "#27282A",
                        padding: 16,
                        marginBottom: 12,
                        borderRadius: 12,
                        borderWidth: config.engine === engine.value ? 2 : 0,
                        borderColor:
                          config.engine === engine.value
                            ? "#3B82F6"
                            : "transparent",
                      }}
                      onPress={() => handleEngineChange(engine.value)}
                      className="flex flex-row items-center justify-between">
                      <View className="flex-1">
                        <View className="flex flex-row items-center gap-2 mb-2">
                          <Text className="text-white text-lg">
                            {engine.label}
                          </Text>
                          {config.engine === engine.value && (
                            <Check size={20} color="#3B82F6" />
                          )}
                        </View>
                        <Text className="text-gray-400 text-sm">
                          {engine.description}
                        </Text>
                        <View className="flex flex-row gap-4 mt-2 text-xs text-gray-500">
                          <Text>{engine.size}</Text>
                          <Text>
                            {t("embedding.engine.frenchQuality", {
                              quality: engine.quality,
                            })}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setShowEnginePicker(false)}
                  className="mt-4 w-full bg-gray-700 py-3 rounded-lg items-center justify-center">
                  <Text className="text-white">{t("embedding.engine.cancel")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Dimensions (Matryoshka) */}
        {supportsMatryoshka && (
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
                {t("embedding.dimensions.label")}
              </Text>
              <Info size={18} color="#6F6F71" />
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
              className="w-full flex flex-row items-center rounded-lg"
              onPress={() => setShowDimensionPicker(true)}>
              <View className="flex flex-row gap-2 items-center">
                <Globe size={18} color="#FFF" />
                <Text className="text-white text-lg">
                  {t("embedding.dimensions.fieldLabel")}
                </Text>
              </View>
              <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: "#9F9FA0" }}
                  className="text-lg flex-1 text-right">
                  {config.dimensions} {t("embedding.dimensions.valueSuffix")}
                </Text>
                <CaretDown size={18} color="#FFF" />
              </View>
            </TouchableOpacity>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              {t("embedding.dimensions.matryoshkaDescription")}
            </Text>

            {/* Dimension Picker Modal */}
            {showDimensionPicker && (
              <View
                className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
                style={{ top: insets.top }}>
                <View className="bg-gray-900 rounded-xl p-6 w-full mx-4 max-h-[80%]">
                  <Text className="text-white text-xl font-bold mb-4">
                    {t("embedding.dimensions.pickerTitle")}
                  </Text>
                  <ScrollView>
                    {availableDimensions.map(dim => (
                      <TouchableOpacity
                        key={dim.value}
                        style={{
                          backgroundColor: "#27282A",
                          padding: 16,
                          marginBottom: 12,
                          borderRadius: 12,
                          borderWidth: config.dimensions === dim.value ? 2 : 0,
                          borderColor:
                            config.dimensions === dim.value
                              ? "#3B82F6"
                              : "transparent",
                        }}
                        onPress={() => handleDimensionChange(dim.value)}
                        className="flex flex-row items-center justify-between">
                        <Text className="text-white text-lg">{dim.label}</Text>
                        {config.dimensions === dim.value && (
                          <Check size={20} color="#3B82F6" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity
                    onPress={() => setShowDimensionPicker(false)}
                    className="mt-4 w-full bg-gray-700 py-3 rounded-lg items-center justify-center">
                    <Text className="text-white">
                      {t("embedding.dimensions.cancel")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}

        {!supportsMatryoshka && (
          <View className="w-full flex flex-col" style={{ gap: 12 }}>
            <View className="flex flex-row items-center justify-between">
              <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
                {t("embedding.dimensions.label")}
              </Text>
            </View>
            <View
              style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
              className="w-full flex flex-row items-center rounded-lg">
              <View className="flex flex-row gap-2 items-center">
                <Globe size={18} color="#FFF" />
                <Text className="text-white text-lg">
                  {t("embedding.dimensions.fieldLabel")}
                </Text>
              </View>
              <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: "#9F9FA0" }}
                  className="text-lg flex-1 text-right">
                  {config.dimensions} {t("embedding.dimensions.fixedSuffix")}
                </Text>
              </View>
            </View>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              {t("embedding.dimensions.fixedDescription")}
            </Text>
          </View>
        )}

        {/* Auto-detect Language */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Auto-detect Language
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={() => handleAutoDetectChange(!config.autoDetectLanguage)}>
            <View className="flex flex-row gap-2 items-center">
              <Globe size={18} color="#FFF" />
              <Text className="text-white text-lg">
                {t("embedding.autoDetect.fieldLabel")}
              </Text>
            </View>
            <View className="flex flex-1 flex-row gap-2 items-center justify-between">
              <Text className="text-white text-lg">
                {config.autoDetectLanguage
                  ? t("embedding.autoDetect.enabled")
                  : t("embedding.autoDetect.disabled")}
              </Text>
              <Switch
                value={config.autoDetectLanguage}
                onValueChange={handleAutoDetectChange}
                trackColor={{ false: "#444", true: "#3B82F6" }}
                thumbColor={config.autoDetectLanguage ? "#3B82F6" : "#FFF"}
              />
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9F9FA0" }} className="text-xs">
            {t("embedding.autoDetect.description")}
          </Text>
        </View>

        {/* Re-embed Workspace */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            {t("embedding.reembed.label")}
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: "rgba(59,130,246,0.2)",
              padding: 14,
              gap: 20,
            }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={() => setShowReembedConfirm(true)}>
            <View className="flex flex-row gap-2 items-center">
              <Warning size={18} color="#3B82F6" />
              <Text className="text-white text-lg">
                {t("embedding.reembed.button")}
              </Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9F9FA0" }} className="text-xs">
            {t("embedding.reembed.description")}
          </Text>

          {/* Re-embed Confirm Modal */}
          {showReembedConfirm && (
            <View
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
              style={{ top: insets.top }}>
              <View className="bg-gray-900 rounded-xl p-6 w-full mx-4">
                <Text className="text-white text-xl font-bold mb-4">
                  {t("embedding.reembed.confirmTitle")}
                </Text>
                <Text className="text-gray-300 mb-6">
                  {t("embedding.reembed.confirmMessage")}
                </Text>
                <View className="flex flex-row gap-4">
                  <TouchableOpacity
                    onPress={() => setShowReembedConfirm(false)}
                    className="flex-1 bg-gray-700 py-3 rounded-lg items-center justify-center">
                    <Text className="text-white">
                      {t("embedding.reembed.cancel")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReembedWorkspace}
                    className="flex-1 bg-blue-600 py-3 rounded-lg items-center justify-center">
                    <Text className="text-white">
                      {t("embedding.reembed.confirm")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Current Model Info */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            {t("embedding.currentConfig.label")}
          </Text>
          <View
            style={{ backgroundColor: "#27282A", padding: 14, gap: 12 }}
            className="w-full rounded-lg">
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.engine")}
              </Text>
              <Text className="text-white">{selectedEngine.label}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.dimensions")}
              </Text>
              <Text className="text-white">{config.dimensions}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.modelSize")}
              </Text>
              <Text className="text-white">{selectedEngine.size}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.contextLength")}
              </Text>
              <Text className="text-white">
                {t("embedding.currentConfig.contextLengthValue")}
              </Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.autoDetect")}
              </Text>
              <Text className="text-white">
                {config.autoDetectLanguage
                  ? t("embedding.autoDetect.enabled")
                  : t("embedding.autoDetect.disabled")}
              </Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">
                {t("embedding.currentConfig.matryoshka")}
              </Text>
              <Text className="text-white">
                {supportsMatryoshka
                  ? t("embedding.currentConfig.supported")
                  : t("embedding.currentConfig.notSupported")}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeView>
  );
}
