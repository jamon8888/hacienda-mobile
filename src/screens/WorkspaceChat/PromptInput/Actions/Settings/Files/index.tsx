import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  DotsThreeCircleVertical,
  X,
  FolderSimple,
  File,
} from "phosphor-react-native";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import {
  useBottomSheet,
  BOTTOM_SHEET_NAMES,
} from "@/contexts/BottomSheetContext";
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  NativeModules,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WorkspaceType } from "@/database/models/Workspace";
import useWorkspaceFiles from "./useWorkspaceFiles";
import FilesListContainer from "./Container";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";
import DocumentPicker from "react-native-document-picker";
import { XbergClient } from "@/utils/Xberg";
import { ExtractionConfig, SUPPORTED_FILE_TYPES } from "@/utils/Xberg/types";
import Storage from "@/utils/storage";
import * as RNFS from "@dr.pogodin/react-native-fs";
import VectorDB from "@/utils/VectorDB";
import { storeProcessedFileAsText } from "@/utils/fs";
import { getEmbeddingProvider } from "@/utils/Embedder";
import { EmbeddingEngine } from "@/utils/Embedder/types";
import { getSHA256Hash } from "@/utils/device";
import { indexingStore, IndexProgress } from "@/store/IndexingStore";
import { dedupeChunks } from "@/utils/chunking";
import uiStore from "@/store/UIStore";

const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(
  Object.values(SUPPORTED_FILE_TYPES)
    .flat()
    .map(ext => ext.toLowerCase()),
);

async function collectSupportedFiles(
  dirPath: string,
  acc: string[] = [],
): Promise<string[]> {
  const items = await RNFS.readDir(dirPath);
  for (const item of items) {
    if (item.isDirectory()) {
      await collectSupportedFiles(item.path, acc);
    } else if (item.isFile()) {
      const dot = item.name.lastIndexOf(".");
      const ext = dot > 0 ? item.name.slice(dot).toLowerCase() : "";
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      const stat = await RNFS.stat(item.path);
      if (stat.size > MAX_IMPORT_FILE_SIZE) continue;
      acc.push(item.path);
    }
  }
  return acc;
}

export default function WorkspaceFilesActionSheet({
  workspace,
}: {
  workspace: WorkspaceType;
}) {
  const insets = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const { registerSheet, presentSheet, activeSheet } = useBottomSheet();
  const [optionsActive, setOptionsActive] = useState(false);
  const [selectedFileUuids, setSelectedFileUuids] = useState<string[]>([]);
  const { files, isLoading, error, fetchFiles } = useWorkspaceFiles(
    workspace.slug,
    { runOnMount: false },
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [folderProgress, setFolderProgress] = useState<IndexProgress | null>(
    null,
  );

  function handleSelectAllFiles() {
    setSelectedFileUuids(
      selectedFileUuids.length === files.length
        ? []
        : files.map(file => file.uuid),
    );
  }

  async function deleteSelectedFiles() {
    try {
      setIsDeleting(true);
      await Document.deleteByUuids(selectedFileUuids, true);
      showToast(
        `${selectedFileUuids.length} files deleted successfully!`,
        "short",
      );
      setSelectedFileUuids([]);
      await fetchFiles();
    } catch (error) {
      console.error(error);
    } finally {
      setOptionsActive(false);
      setIsDeleting(false);
    }
  }

  async function handleImportFiles() {
    try {
      const result = await DocumentPicker.pick({
        allowMultiSelection: true,
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/plain",
          "text/markdown",
          "text/csv",
          "audio/mpeg",
          "audio/mp4",
          "audio/wav",
          "audio/webm",
        ],
      });
      if (result.length === 0) return;
      setIsImporting(true);
      let imported = 0;
      for (const file of result) {
        if (await processImportedFile(file)) imported += 1;
      }
      await fetchFiles();
      const skipped = result.length - imported;
      showToast(
        skipped > 0
          ? `Imported ${imported} of ${result.length} files`
          : `Imported ${imported} files successfully!`,
      );
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) {
        console.error("File picker error:", e);
        uiStore.showError("Failed to import files");
      }
    } finally {
      setIsImporting(false);
    }
  }

  async function handleImportFolder() {
    // react-native-document-picker's pickDirectory() unconditionally rejects on iOS
    // ("pickDirectory is not supported on iOS" — the library never wired up
    // UIDocumentPickerViewController's folder-picking mode there). FolderPickerModule is a
    // small native module (ios/AnythingLLM/FolderPickerModule.{h,m}) that fills that gap
    // directly: it presents the same system picker restricted to folders and copies the
    // selection into a tmp dir so it can be walked like any other real path below.
    let iosTmpPath: string | null = null;
    try {
      let realPath: string;
      if (Platform.OS === "ios") {
        const { FolderPickerModule } = NativeModules;
        if (!FolderPickerModule) {
          uiStore.showError("Folder import isn’t available on this build.");
          return;
        }
        let result: { path: string };
        try {
          result = await FolderPickerModule.pickDirectory();
        } catch (e: any) {
          if (e?.code === "CANCELLED") return;
          throw e;
        }
        realPath = result.path;
        iosTmpPath = realPath;
      } else {
        const result = await DocumentPicker.pickDirectory();
        if (!result) return;
        realPath = await Storage.getRealPathFromUri(result.uri);
        if (realPath.startsWith("content://")) {
          uiStore.showError(
            "This folder picker can’t be scanned here yet. Choose individual files instead.",
          );
          return;
        }
      }
      setIsImporting(true);

      const paths = await collectSupportedFiles(realPath);
      if (paths.length === 0) {
        showToast("No supported files found in this folder");
        return;
      }

      const config: ExtractionConfig = XbergClient.defaultFolderBatchConfig();
      const engine = (workspace.embeddingConfig?.engine ||
        "multilingual-e5-small") as EmbeddingEngine;

      // P5: queue the import — background, per-file tolerance, live progress
      const { imported, unchanged, failed } = await indexingStore.enqueueFolder(
        {
          paths,
          workspaceSlug: workspace.slug,
          engine,
          config,
          onProgress: progress => setFolderProgress(progress),
        },
      );

      await fetchFiles();
      const skipped = paths.length - imported;
      const unchangedNote = unchanged > 0 ? ` (${unchanged} unchanged)` : "";
      const failedNote = failed > 0 ? `, ${failed} failed` : "";
      showToast(
        skipped > 0
          ? `Imported ${imported} of ${paths.length} files${unchangedNote}${failedNote}`
          : `Imported ${imported} files successfully!`,
      );
    } catch (e) {
      if (!DocumentPicker.isCancel(e)) {
        console.error("Folder picker error:", e);
        uiStore.showError("Failed to import folder");
      }
    } finally {
      if (iosTmpPath) {
        RNFS.unlink(iosTmpPath).catch(() => {});
      }
      setIsImporting(false);
      setFolderProgress(null);
    }
  }

  async function processImportedFile(file: any): Promise<boolean> {
    try {
      const realPath = await Storage.getRealPathFromUri(file.uri);

      // P2: hash-skip BEFORE extract/embed — unchanged files are not reprocessed
      let contentHash: string | null = null;
      try {
        contentHash = await getSHA256Hash(realPath);
      } catch {
        contentHash = null;
      }
      if (contentHash) {
        const existing = await Document.findByContentHash(
          workspace.slug,
          contentHash,
        );
        if (existing) return false;
      }

      const config: ExtractionConfig = XbergClient.defaultExtractionConfig();
      const extracted = await XbergClient.extract(realPath, config);
      const result = extracted.results[0];
      if (!result?.content) throw new Error("Extraction returned no content");
      const content = result.content;
      // Chunking is a request, not a guarantee: Xberg returns no chunks for inputs its
      // semantic splitter can't segment (very short files, some OCR output). Falling back
      // to the whole document keeps the file searchable instead of registering a Document
      // with zero vectors — which would look imported but never match a query.
      const chunks = result.chunks?.length ? result.chunks : [{ content }];
      const chunkContents = dedupeChunks(
        chunks.map(c => c.content).filter(Boolean),
      );
      if (chunkContents.length === 0)
        throw new Error("Extraction produced no chunks");

      await storeProcessedFileAsText(file.name, content);
      const embedder = getEmbeddingProvider(
        (workspace.embeddingConfig?.engine ||
          "multilingual-e5-small") as EmbeddingEngine,
      );
      const embeddings = await embedder.embedBatch(
        chunkContents,
        "embed_document",
      );
      const { ids } = await VectorDB.bulkInsert(
        workspace.slug,
        embeddings.map((emb, i) => ({
          embedding: emb,
          metadata: { content: chunkContents[i], name: file.name },
        })),
      );
      await Document.create({
        name: file.name,
        workspaceSlug: workspace.slug,
        vectorBoxIds: ids,
        contentHash,
      });
      return true;
    } catch (e) {
      console.error("Failed to process file:", file.name, e);
      return false;
    }
  }

  useEffect(() => {
    registerSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES, bottomSheetRef);
  }, [registerSheet]);

  useEffect(() => {
    if (activeSheet === BOTTOM_SHEET_NAMES.WORKSPACE_FILES) {
      setSelectedFileUuids([]);
      setOptionsActive(false);
      fetchFiles();
    }
  }, [activeSheet]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={["100%"]}
      enableDynamicSizing={false}
      enablePanDownToClose={true}
      backgroundStyle={{ backgroundColor: "#1B1B1E" }}
      handleIndicatorStyle={{ display: "none" }}
      onDismiss={() =>
        presentSheet(BOTTOM_SHEET_NAMES.PRIMARY_PROMPT_INPUT, true)
      }>
      <View
        style={{
          paddingHorizontal: 30,
          paddingBottom: insets.bottom,
          paddingTop: insets.top,
          flex: 1,
        }}>
        <View
          style={{ marginBottom: 24 }}
          className="flex w-full flex-row items-center justify-between">
          <View className="flex-1">
            {optionsActive ? (
              <TouchableOpacity onPress={handleSelectAllFiles}>
                <Text style={{ color: "#7cd4fd" }} className="text-lg">
                  {selectedFileUuids.length === files.length
                    ? "Deselect All"
                    : "Select All"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text className="text-white text-xl font-medium">Files</Text>
          <View className="flex-1 items-end">
            <TouchableOpacity
              disabled={isDeleting}
              onPress={() => setOptionsActive(!optionsActive)}
              className="disabled:opacity-50">
              {optionsActive ? (
                <X size={24} color="#FFF" />
              ) : (
                <DotsThreeCircleVertical size={24} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Import Buttons */}
        {!optionsActive && (
          <View className="flex flex-row gap-2 mb-4">
            <TouchableOpacity
              onPress={handleImportFiles}
              disabled={isImporting}
              style={{ backgroundColor: "#27282A", flex: 1, padding: 12 }}
              className="rounded-lg flex flex-row items-center justify-center gap-2">
              <File size={18} color="#3B82F6" />
              <Text className="text-white text-sm">
                {isImporting ? "Importing..." : "Import Files"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleImportFolder}
              disabled={isImporting}
              style={{ backgroundColor: "#27282A", flex: 1, padding: 12 }}
              className="rounded-lg flex flex-row items-center justify-center gap-2">
              <FolderSimple size={18} color="#6CE9A6" />
              <Text className="text-white text-sm">
                {isImporting ? "Importing..." : "Import Folder"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Folder import progress */}
        {folderProgress &&
          (() => {
            // `done` already counts skipped and failed files (IndexingStore advances it
            // once per file whatever the outcome), so it is the completion count on its
            // own — adding the other two back would overshoot the total.
            // Only 'extracting' has a meaningful `extracted` counter -- IndexingStore
            // advances `done` (not `extracted`) for every file skipped during 'hashing',
            // so including 'hashing' here left the bar stuck at 0% whenever most files
            // were already indexed.
            const isExtracting = folderProgress.phase === "extracting";
            const count = isExtracting
              ? folderProgress.extracted
              : folderProgress.done;
            const percent =
              folderProgress.total > 0
                ? Math.round((count / folderProgress.total) * 100)
                : 0;
            const label =
              folderProgress.currentFile ||
              (folderProgress.phase === "hashing"
                ? "Checking for changes…"
                : folderProgress.phase === "extracting"
                ? "Extracting…"
                : folderProgress.phase === "embedding"
                ? "Embedding…"
                : "Starting…");
            return (
              <View className="mb-4 p-3 bg-gray-800 rounded-lg">
                <View className="flex flex-row justify-between text-xs text-gray-400 mb-1">
                  <Text>{label}</Text>
                  <Text>
                    {count} / {folderProgress.total}
                  </Text>
                </View>
                <View
                  style={{
                    height: 4,
                    backgroundColor: "#333",
                    borderRadius: 2,
                  }}>
                  <View
                    style={{
                      height: "100%",
                      width: `${percent}%`,
                      backgroundColor: isExtracting ? "#7CB8FF" : "#6CE9A6",
                      borderRadius: 2,
                    }}
                  />
                </View>
                <View className="flex flex-row justify-between text-xs text-gray-500 mt-1">
                  <Text>
                    Done:{" "}
                    {folderProgress.done -
                      folderProgress.skipped -
                      folderProgress.failed}
                  </Text>
                  <Text>Skipped: {folderProgress.skipped}</Text>
                  <Text>Failed: {folderProgress.failed}</Text>
                </View>
              </View>
            );
          })()}

        {selectedFileUuids.length > 0 && (
          <TouchableOpacity
            disabled={isDeleting}
            onPress={deleteSelectedFiles}
            style={{ backgroundColor: "rgba(122,39,26,0.2)" }}
            className="flex flex-row items-center justify-center rounded-lg p-4 mb-4">
            <Text style={{ color: "#F97066" }} className="text-lg font-medium">
              Delete Selected Files
            </Text>
          </TouchableOpacity>
        )}
        <FilesListContainer
          disabled={isDeleting}
          selectedFileUuids={selectedFileUuids}
          setSelectedFileUuids={setSelectedFileUuids}
          files={files}
          error={error}
          isLoading={isLoading}
          optionsActive={optionsActive}
        />
      </View>
    </BottomSheetModal>
  );
}

export function WorkspaceFilesActionButton({
  disabled = false,
}: {
  disabled: boolean;
}) {
  const { presentSheet } = useBottomSheet();
  return (
    <TouchableOpacity
      disabled={disabled}
      onPress={() => presentSheet(BOTTOM_SHEET_NAMES.WORKSPACE_FILES)}
      style={{ gap: 11, opacity: disabled ? 0.4 : 1 }}
      className="flex flex-col items-center justify-center">
      <View
        style={{ backgroundColor: "#3f3f42", width: 52, height: 52 }}
        className="flex flex-col items-center justify-center rounded-full">
        <Paperclip size={32} color="#FFF" />
      </View>
      <Text className="text-white text-lg font-medium">Files</Text>
    </TouchableOpacity>
  );
}
