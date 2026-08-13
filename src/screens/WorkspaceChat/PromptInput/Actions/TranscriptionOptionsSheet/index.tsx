import { useCallback, useEffect, useRef, useState } from "react";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
} from "@gorhom/bottom-sheet";
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from "@/contexts/BottomSheetContext";
import { View, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Radio, MusicNotes } from "phosphor-react-native";
import { xbergStore } from "@/store/XbergStore";
import { XbergClient } from "@/utils/Xberg";

const MODEL_OPTIONS = [
  { value: "tiny", label: "Tiny", size: "10 MB", description: "Fastest" },
  { value: "base", label: "Base", size: "50 MB", description: "Recommended" },
  {
    value: "small",
    label: "Small",
    size: "200 MB",
    description: "Best accuracy",
  },
];

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
];

export default function TranscriptionOptionsSheet() {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, dismissSheet } = useBottomSheet();
  const [selectedModel, setSelectedModel] = useState(
    xbergStore.transcriptionModel,
  );
  const [selectedLanguage, setSelectedLanguage] = useState(
    xbergStore.transcriptionLanguage,
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.7}
      />
    ),
    [],
  );

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.TRANSCRIPTION_OPTIONS, bottomSheetRef);
  }, [registerSheet]);

  function handleConfirm() {
    xbergStore.setTranscriptionOptions(selectedModel, selectedLanguage);
    bottomSheetRef.current?.dismiss();
  }

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={["70%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: "#1B1B1E" }}
      handleIndicatorStyle={{
        backgroundColor: "#9F9FA0",
        width: 45,
        margin: 10,
      }}
      onDismiss={() => dismissSheet(BOTTOM_SHEET_NAMES.TRANSCRIPTION_OPTIONS)}>
      <View
        style={{
          paddingHorizontal: 30,
          paddingBottom: insets.bottom,
          paddingTop: 20,
        }}>
        <View className="flex flex-row items-center gap-2 mb-4">
          <MusicNotes size={20} color="#6CE9A6" />
          <Text className="text-white text-xl font-medium">
            Audio Transcription
          </Text>
        </View>

        {XbergClient.getTranscriptionEngine() === "whisper" ? (
          <View
            style={{ backgroundColor: "rgba(108,233,166,0.15)", padding: 12 }}
            className="rounded-lg flex flex-row items-start gap-3 mb-4">
            <MusicNotes size={18} color="#6CE9A6" style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text style={{ color: "#6CE9A6" }} className="text-sm font-medium">
                Engine: Xberg Whisper
              </Text>
              <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
                Using ONNX Whisper for high-accuracy transcription.
              </Text>
            </View>
          </View>
        ) : (
          <View
            style={{ backgroundColor: "rgba(59,130,246,0.15)", padding: 12 }}
            className="rounded-lg flex flex-row items-start gap-3 mb-4">
            <MusicNotes size={18} color="#3B82F6" style={{ marginTop: 2 }} />
            <View className="flex-1">
              <Text style={{ color: "#3B82F6" }} className="text-sm font-medium">
                Engine: Cactus Parakeet
              </Text>
              <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
                Using Parakeet TDT 0.6B for on-device transcription. Model is
                already bundled — no download needed.
              </Text>
            </View>
          </View>
        )}

        <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase mb-2">
          Model Size
        </Text>
        <View className="mb-4">
          {MODEL_OPTIONS.map(model => (
            <TouchableOpacity
              key={model.value}
              onPress={() => setSelectedModel(model.value)}
              style={{
                backgroundColor: "#27282A",
                padding: 12,
                marginBottom: 8,
                borderRadius: 8,
                borderWidth: selectedModel === model.value ? 2 : 0,
                borderColor:
                  selectedModel === model.value ? "#3B82F6" : "transparent",
              }}
              className="flex flex-row items-center justify-between">
              <View className="flex-1">
                <Text className="text-white text-base">{model.label}</Text>
                <Text style={{ color: "#9F9FA0" }} className="text-xs">
                  {model.description} | {model.size}
                </Text>
              </View>
              <Radio
                size={20}
                color={selectedModel === model.value ? "#3B82F6" : "#9F9FA0"}
                weight="fill"
              />
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase mb-2">
          Language
        </Text>
        <View className="flex flex-row flex-wrap gap-2 mb-6">
          {LANGUAGE_OPTIONS.map(lang => (
            <TouchableOpacity
              key={lang.value}
              onPress={() => setSelectedLanguage(lang.value)}
              style={{
                backgroundColor:
                  selectedLanguage === lang.value ? "#3B82F6" : "#27282A",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 16,
              }}>
              <Text
                style={{
                  color:
                    selectedLanguage === lang.value ? "#FFF" : "#9F9FA0",
                }}
                className="text-sm">
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleConfirm}
          style={{ backgroundColor: "#3B82F6", padding: 14 }}
          className="rounded-lg items-center">
          <Text className="text-white text-base font-medium">
            Save Settings
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheetModal>
  );
}
