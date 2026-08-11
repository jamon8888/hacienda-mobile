import { useRef } from "react";
import { Alert, Platform, View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { File, FolderSimple, X } from "phosphor-react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from "@/contexts/BottomSheetContext";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AttachmentInterface } from "@/hooks/useAttachments";
import DocumentPicker from "react-native-document-picker";
import { XbergClient, ExtractionConfig } from "@/utils/Xberg";
import Storage from "@/utils/storage";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { getEmbeddingProvider } from "@/utils/Embedder";
import { EmbeddingEngine } from "@/utils/Embedder/types";
import { storeProcessedFileAsText } from "@/utils/fs";
import { getSHA256Hash } from "@/utils/device";
import { indexingStore } from "@/store/IndexingStore";
import { dedupeChunks } from "@/utils/chunking";
import { showToast } from "@/utils/Notification";
import RNFS from "@dr.pogodin/react-native-fs";
import { SUPPORTED_FILE_TYPES } from "@/utils/Xberg/types";

interface AttachmentActionMenuProps {
  attachmentHandler: AttachmentInterface;
  workspaceSlug: string;
}

export default function AttachmentActionMenu({
  attachmentHandler,
  workspaceSlug,
}: AttachmentActionMenuProps) {
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet } = useBottomSheet();

  const handleImportFiles = () => {
    attachmentHandler.askForAttachment();
    presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);
  };

  const handleImportFolder = async () => {
    presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true);

    if (Platform.OS === "ios") {
      Alert.alert(
        "Folder Import",
        "Folder import on iOS requires selecting files individually. Please use 'Import Files' instead.",
      );
      return;
    }

    try {
      const result = await DocumentPicker.pickDirectory();
      if (!result) return;

      const realPath = await Storage.getRealPathFromUri(result.uri);
      if (realPath.startsWith("content://")) {
        Alert.alert(
          "Cannot Scan",
          "This folder picker can't be scanned here. Choose individual files instead."
        );
        return;
      }

      const collectSupportedFiles = async (dirPath: string): Promise<string[]> => {
        const SUPPORTED_EXTENSIONS = new Set(
          Object.values(SUPPORTED_FILE_TYPES)
            .flat()
            .map(ext => ext.toLowerCase()),
        );
        const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;

        const items = await RNFS.readDir(dirPath);
        const paths: string[] = [];
        for (const item of items) {
          if (item.isDirectory()) {
            const subPaths = await collectSupportedFiles(item.path);
            paths.push(...subPaths);
          } else if (item.isFile()) {
            const dot = item.name.lastIndexOf(".");
            const ext = dot > 0 ? item.name.slice(dot).toLowerCase() : "";
            if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
            const stat = await RNFS.stat(item.path);
            if (stat.size > MAX_IMPORT_FILE_SIZE) continue;
            paths.push(item.path);
          }
        }
        return paths;
      };

      const paths = await collectSupportedFiles(realPath);
      if (paths.length === 0) {
        showToast("No supported files found in this folder");
        return;
      }

      const config: ExtractionConfig = XbergClient.defaultFolderBatchConfig();
      const engine = "multilingual-e5-small" as EmbeddingEngine;

      const { imported, unchanged, failed } = await indexingStore.enqueueFolder(
        {
          paths,
          workspaceSlug,
          engine,
          config,
        },
      );

      const skipped = paths.length - imported;
      const unchangedNote = unchanged > 0 ? ` (${unchanged} unchanged)` : "";
      const failedNote = failed > 0 ? `, ${failed} failed` : "";
      showToast(
        skipped > 0
          ? `Imported ${imported} of ${paths.length} files${unchangedNote}${failedNote}`
          : `Imported ${imported} files successfully!`,
      );
    } catch (e) {
      const error = e as any;
      if (error.name !== "Cancel") {
        console.error("Folder picker error:", error);
        Alert.alert("Error", "Failed to import folder");
      }
    }
  };

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={["40%"]}
        enableDynamicSizing={false}
        enablePanDownToClose={true}
        backgroundStyle={{ backgroundColor: "#1B1B1E" }}
        handleIndicatorStyle={{ display: "none" }}
        onDismiss={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to Conversation</Text>
            <TouchableOpacity
              onPress={() => presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)}
              style={styles.closeButton}>
              <X size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.optionContainer}>
            <TouchableOpacity
              onPress={handleImportFiles}
              style={styles.optionButton}
              className="flex flex-row items-center justify-center gap-3"
              disabled={attachmentHandler.isMaxAttachments}>
              <View style={styles.optionIcon}>
                <File size={24} color="#3B82F6" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Import Files</Text>
                <Text style={styles.optionSubtitle}>
                  Select one or multiple files
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleImportFolder}
              style={styles.optionButton}
              className="flex flex-row items-center justify-center gap-3">
              <View style={styles.optionIcon}>
                <FolderSimple size={24} color="#6CE9A6" />
              </View>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Import Folder</Text>
                <Text style={styles.optionSubtitle}>
                  Scan and import all supported files in a folder
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetModal>

      <TouchableOpacity
        onPress={() => presentSheet(BOTTOM_SHEET_NAMES.ATTACHMENT_ACTIONS)}
        disabled={attachmentHandler.isMaxAttachments}
        className="flex flex-row items-center gap-x-2 disabled:opacity-50">
        <File size={25} color="#FFF" />
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    color: "#FFF",
    fontSize: 20,
    fontWeight: "600",
  },
  closeButton: {
    padding: 8,
  },
  optionContainer: {
    gap: 12,
  },
  optionButton: {
    backgroundColor: "#27282A",
    borderRadius: 12,
    padding: 16,
    minHeight: 72,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(59,130,246,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  optionSubtitle: {
    color: "#9F9FA0",
    fontSize: 13,
    marginTop: 2,
  },
});