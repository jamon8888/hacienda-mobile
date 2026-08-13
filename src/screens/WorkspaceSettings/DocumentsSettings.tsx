import { Text, TouchableOpacity, View, ScrollView, Alert } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  FolderOpen,
  FileText,
  MusicNote,
  Image,
  File,
  Trash,
  Gear,
} from "phosphor-react-native";
import uiStore from "@/store/UIStore";
import { useState, useEffect } from "react";
import type { IWorkspacePageKey } from "./index";
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from "@/contexts/BottomSheetContext";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";
import { xbergStore } from "@/store/XbergStore";
import { XbergClient } from "@/utils/Xberg";

interface DocumentsSettingsProps {
  workspace: any;
  goToPage: (page: IWorkspacePageKey) => void;
  initialThreadSlug?: string | null;
}

export function DocumentsSettingsView({
  workspace,
  goToPage,
}: DocumentsSettingsProps) {
  const insets = useSafeAreaInsets();
  const { presentSheet } = useBottomSheet();
  const [documentCount, setDocumentCount] = useState(0);
  const [vectorCount, setVectorCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [workspace.slug]);

  async function loadStats() {
    try {
      setIsLoading(true);
      const docs = await Document.find([
        { field: "workspace_slug", value: workspace.slug },
      ]);
      setDocumentCount(docs.length);

      const count = await VectorDB.getWorkspaceVectorCount(workspace.slug);
      setVectorCount(count);
    } catch (e) {
      console.error("Failed to load document stats:", e);
    } finally {
      setIsLoading(false);
    }
  }

  function handleImportPress() {
    presentSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES);
  }

  function handleTranscriptionSettings() {
    presentSheet(BOTTOM_SHEET_NAMES.TRANSCRIPTION_OPTIONS);
  }

  function handleClearAll() {
    Alert.alert(
      "Clear All Documents",
      "Are you sure you want to clear all documents? This will remove all vectors and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: onClearAll },
      ],
    );
  }

  async function onClearAll() {
    try {
      await VectorDB.resetVectorsForWorkspace(workspace.slug);
      await Document.delete([
        { field: "workspace_slug", value: workspace.slug },
      ]);
      showToast("All documents cleared");
      loadStats();
    } catch (e) {
      console.error("Failed to clear documents:", e);
      uiStore.showError("Failed to clear documents");
    }
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex-1 flex flex-col"
      safeAreaStyle={{ backgroundColor: "#1B1B1E" }}>
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
          Documents
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="flex flex-col"
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingBottom: 100,
          gap: 20,
          backgroundColor: "#1B1B1E",
        }}>
        {/* Stats Row */}
        <View className="flex flex-row gap-3">
          <View
            style={{ backgroundColor: "#27282A", flex: 1, padding: 14 }}
            className="rounded-lg items-center">
            <Text className="text-white text-2xl font-bold">
              {isLoading ? "-" : documentCount}
            </Text>
            <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
              Documents
            </Text>
          </View>
          <View
            style={{ backgroundColor: "#27282A", flex: 1, padding: 14 }}
            className="rounded-lg items-center">
            <Text className="text-white text-2xl font-bold">
              {isLoading ? "-" : vectorCount}
            </Text>
            <Text style={{ color: "#9F9FA0" }} className="text-xs mt-1">
              Vectors
            </Text>
          </View>
        </View>

        {/* Import Section */}
        <View className="w-full flex flex-col" style={{ gap: 10 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Import
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={handleImportPress}>
            <FolderOpen size={20} color="#6CE9A6" />
            <View className="flex-1 ml-3">
              <Text className="text-white text-base">Import Files</Text>
              <Text style={{ color: "#9F9FA0" }} className="text-xs">
                PDF, DOCX, audio, images, and 100+ formats
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Transcription Settings */}
        <View className="w-full flex flex-col" style={{ gap: 10 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Audio Transcription
          </Text>
          <View
            style={{ backgroundColor: "rgba(108,233,166,0.15)", padding: 10 }}
            className="rounded-lg flex flex-row items-center gap-2">
            <MusicNote size={14} color="#6CE9A6" />
            <Text style={{ color: "#6CE9A6" }} className="text-xs flex-1">
              {XbergClient.getTranscriptionEngine() === "whisper"
                ? "Engine: Xberg Whisper (ONNX Runtime)"
                : "Engine: Cactus Parakeet (on-device ASR)"}
            </Text>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: "#27282A", padding: 14 }}
            className="w-full flex flex-row items-center rounded-lg"
            onPress={handleTranscriptionSettings}>
            <MusicNote size={20} color="#6CE9A6" />
            <View className="flex-1 ml-3">
              <Text className="text-white text-base">
                Transcription Settings
              </Text>
              <Text style={{ color: "#9F9FA0" }} className="text-xs">
                Model: {xbergStore.transcriptionModel} / Language:{" "}
                {xbergStore.transcriptionLanguage === "auto"
                  ? "Auto-detect"
                  : xbergStore.transcriptionLanguage}
              </Text>
            </View>
            <Gear size={18} color="#9F9FA0" />
          </TouchableOpacity>
        </View>

        {/* Supported Formats */}
        <View className="w-full flex flex-col" style={{ gap: 10 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Supported Formats
          </Text>
          <View
            style={{ backgroundColor: "#27282A", padding: 14 }}
            className="rounded-lg">
            <View className="flex flex-row flex-wrap gap-2">
              {[
                { label: "PDF", icon: FileText, color: "#F97066" },
                { label: "DOCX", icon: FileText, color: "#3B82F6" },
                { label: "PPTX", icon: FileText, color: "#F59E0B" },
                { label: "XLSX", icon: FileText, color: "#6CE9A6" },
                { label: "TXT", icon: File, color: "#9F9FA0" },
                { label: "MD", icon: File, color: "#9F9FA0" },
                { label: "CSV", icon: File, color: "#9F9FA0" },
                { label: "MP3", icon: MusicNote, color: "#6CE9A6" },
                { label: "WAV", icon: MusicNote, color: "#6CE9A6" },
                { label: "M4A", icon: MusicNote, color: "#6CE9A6" },
                { label: "PNG", icon: Image, color: "#F59E0B" },
                { label: "JPG", icon: Image, color: "#F59E0B" },
              ].map(({ label, icon: Icon, color }) => (
                <View
                  key={label}
                  style={{ backgroundColor: "#333" }}
                  className="flex flex-row items-center gap-1 px-2 py-1 rounded">
                  <Icon size={12} color={color} />
                  <Text style={{ color: "#9F9FA0" }} className="text-xs">
                    {label}
                  </Text>
                </View>
              ))}
              <View
                style={{ backgroundColor: "#333" }}
                className="px-2 py-1 rounded">
                <Text style={{ color: "#9F9FA0" }} className="text-xs">
                  +90 more
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Processing Engine */}
        <View className="w-full flex flex-col" style={{ gap: 10 }}>
          <Text style={{ color: "#9F9FA0" }} className="text-sm uppercase">
            Processing Engine
          </Text>
          <View
            style={{ backgroundColor: "#27282A", padding: 14, gap: 10 }}
            className="rounded-lg">
            {[
              { label: "Engine", value: "Xberg v1.0.8" },
              { label: "OCR", value: "Tesseract" },
              { label: "Chunking", value: "Semantic" },
              { label: "Max File Size", value: "50 MB" },
            ].map(({ label, value }) => (
              <View key={label} className="flex flex-row justify-between">
                <Text style={{ color: "#9F9FA0" }}>{label}</Text>
                <Text className="text-white">{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Danger Zone */}
        <View className="w-full flex flex-col" style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={handleClearAll}
            style={{ backgroundColor: "rgba(122,39,26,0.2)" }}
            className="flex flex-row items-center justify-center rounded-lg p-4">
            <Trash size={18} color="#F97066" />
            <Text
              style={{ color: "#F97066" }}
              className="text-base font-medium ml-2">
              Clear All Documents
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeView>
  );
}
