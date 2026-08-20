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
import type { IWorkspacePageKey } from "./index";

interface EmbeddingSettingsViewProps {
  workspace: any;
  goToPage: (page: IWorkspacePageKey) => void;
  initialThreadSlug?: string | null;
}

const ENGINE_OPTIONS: {
  value: MultilingualEmbeddingModelId;
  label: string;
  description: string;
  size: string;
  quality: number;
  dimensions: number;
}[] = [
  {
    value: "multilingual-e5-small",
    label: "Multilingual E5 Small",
    description: "100+ languages, fast & tiny. Best for low-RAM devices.",
    size: "124MB",
    quality: 0.63,
    dimensions: 384,
  },
  {
    value: "multilingual-e5-base",
    label: "Multilingual E5 Base",
    description: "100+ languages, better quality. Good balance.",
    size: "280MB",
    quality: 0.65,
    dimensions: 768,
  },
  {
    value: "sentence-camembert-base",
    label: "CamemBERT Base (French)",
    description: "French-specific, optimized for French tasks.",
    size: "115MB",
    quality: 0.59,
    dimensions: 768,
  },
  {
    value: "nomic-embed-text-v2-moe",
    label: "Nomic Embed v2 MoE (Multilingual)",
    description: "~100 languages, MoE, Matryoshka dims. Best quality.",
    size: "328MB",
    quality: 0.66,
    dimensions: 768,
  },
];

const DIMENSION_OPTIONS = [
  { value: 768, label: "768 - Best quality" },
  { value: 512, label: "512 - Balanced (66% storage)" },
  { value: 256, label: "256 - Fast search (33% storage) ⭐" },
  { value: 128, label: "128 - Mobile optimized (16% storage)" },
  { value: 64, label: "64 - Tiny (8% storage)" },
];

export function EmbeddingSettingsView({
  workspace,
  goToPage,
}: EmbeddingSettingsViewProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
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
      uiStore.showError("Embedding settings could not be saved");
      return;
    }
    setConfig(newConfig);
    uiStore.showSuccess("Embedding settings saved");
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
      uiStore.showSuccess(`Re-embedded ${total} item${total === 1 ? "" : "s"}`);
    } else {
      uiStore.showError(
        `Re-embedded ${total} item${total === 1 ? "" : "s"}, ${failed} failed`,
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
          Embedding Settings
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
              Embedding Engine
            </Text>
            <Info size={18} color="#6F6F71" />
          </View>
          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={() => setShowEnginePicker(true)}>
            <View className="flex flex-row gap-2 items-center">
              <Globe size={18} color="#FFF" />
              <Text className="text-white text-lg">Engine</Text>
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
            {selectedEngine.description} | {selectedEngine.size} | French MTEB:{" "}
            {selectedEngine.quality}
          </Text>

          {/* Engine Picker Modal */}
          {showEnginePicker && (
            <View
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
              style={{ top: insets.top }}>
              <View className="bg-gray-900 rounded-xl p-6 w-full mx-4 max-h-[80%]">
                <Text className="text-white text-xl font-bold mb-4">
                  Select Embedding Engine
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
                          <Text>French: {engine.quality}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() => setShowEnginePicker(false)}
                  className="mt-4 w-full bg-gray-700 py-3 rounded-lg items-center justify-center">
                  <Text className="text-white">Cancel</Text>
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
                Embedding Dimensions
              </Text>
              <Info size={18} color="#6F6F71" />
            </View>
            <TouchableOpacity
              style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
              className="w-full flex flex-row items-center rounded-lg"
              onPress={() => setShowDimensionPicker(true)}>
              <View className="flex flex-row gap-2 items-center">
                <Globe size={18} color="#FFF" />
                <Text className="text-white text-lg">Dimensions</Text>
              </View>
              <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: "#9F9FA0" }}
                  className="text-lg flex-1 text-right">
                  {config.dimensions} dims
                </Text>
                <CaretDown size={18} color="#FFF" />
              </View>
            </TouchableOpacity>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              Matryoshka truncation: smaller dimensions = faster search, less
              storage. 256 dims retains ~99% quality.
            </Text>

            {/* Dimension Picker Modal */}
            {showDimensionPicker && (
              <View
                className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
                style={{ top: insets.top }}>
                <View className="bg-gray-900 rounded-xl p-6 w-full mx-4 max-h-[80%]">
                  <Text className="text-white text-xl font-bold mb-4">
                    Select Dimensions
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
                    <Text className="text-white">Cancel</Text>
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
                Embedding Dimensions
              </Text>
            </View>
            <View
              style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
              className="w-full flex flex-row items-center rounded-lg">
              <View className="flex flex-row gap-2 items-center">
                <Globe size={18} color="#FFF" />
                <Text className="text-white text-lg">Dimensions</Text>
              </View>
              <View className="flex flex-1 flex-row gap-2 items-center justify-between">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={{ color: "#9F9FA0" }}
                  className="text-lg flex-1 text-right">
                  {config.dimensions} dims (fixed for this model)
                </Text>
              </View>
            </View>
            <Text style={{ color: "#9F9FA0" }} className="text-xs">
              This model has fixed dimensions. Switch to Nomic v2 MoE for
              Matryoshka truncation.
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
              <Text className="text-white text-lg">Auto-detect</Text>
            </View>
            <View className="flex flex-1 flex-row gap-2 items-center justify-between">
              <Text className="text-white text-lg">
                {config.autoDetectLanguage ? "Enabled" : "Disabled"}
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
            Automatically detect document language and route to optimal
            embedder. When disabled, uses selected engine for all documents.
          </Text>
        </View>

        {/* Re-embed Workspace */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Re-embed Workspace
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
              <Text className="text-white text-lg">Re-embed All Documents</Text>
            </View>
          </TouchableOpacity>
          <Text style={{ color: "#9F9FA0" }} className="text-xs">
            Re-process all documents with current embedding settings. This will
            delete existing vectors and create new ones.
          </Text>

          {/* Re-embed Confirm Modal */}
          {showReembedConfirm && (
            <View
              className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"
              style={{ top: insets.top }}>
              <View className="bg-gray-900 rounded-xl p-6 w-full mx-4">
                <Text className="text-white text-xl font-bold mb-4">
                  Re-embed Workspace?
                </Text>
                <Text className="text-gray-300 mb-6">
                  This will re-process all documents in this workspace using the
                  current embedding engine and dimensions. Existing vectors will
                  be replaced. This operation cannot be undone and may take
                  several minutes.
                </Text>
                <View className="flex flex-row gap-4">
                  <TouchableOpacity
                    onPress={() => setShowReembedConfirm(false)}
                    className="flex-1 bg-gray-700 py-3 rounded-lg items-center justify-center">
                    <Text className="text-white">Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReembedWorkspace}
                    className="flex-1 bg-blue-600 py-3 rounded-lg items-center justify-center">
                    <Text className="text-white">Re-embed</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Current Model Info */}
        <View className="w-full flex flex-col" style={{ gap: 12 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Current Configuration
          </Text>
          <View
            style={{ backgroundColor: "#27282A", padding: 14, gap: 12 }}
            className="w-full rounded-lg">
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Engine</Text>
              <Text className="text-white">{selectedEngine.label}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Dimensions</Text>
              <Text className="text-white">{config.dimensions}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Model Size</Text>
              <Text className="text-white">{selectedEngine.size}</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Context Length</Text>
              <Text className="text-white">512 tokens</Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Auto-detect Language</Text>
              <Text className="text-white">
                {config.autoDetectLanguage ? "Enabled" : "Disabled"}
              </Text>
            </View>
            <View className="flex flex-row justify-between">
              <Text className="text-gray-400">Matryoshka</Text>
              <Text className="text-white">
                {supportsMatryoshka ? "Supported" : "Not supported"}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeView>
  );
}
