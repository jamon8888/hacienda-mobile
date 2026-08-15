import {
  Text,
  TouchableOpacity,
  View,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useState, useCallback, useMemo, useEffect } from "react";
import {
  generateUUID,
  getCurrentDeviceInfo,
  screenDimensions,
} from "@/utils/constants";
import * as RNFS from "@dr.pogodin/react-native-fs";
import Storage from "@/utils/storage";
import { pick } from "react-native-document-picker";
import {
  getEmbeddingProvider,
  setEmbeddingEngine,
  MultilingualEmbeddingModelId,
} from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";
import Document from "@/database/models/Document";
import { showToast } from "@/utils/Notification";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { snapPointsDefault } from "@/screens/WorkspaceChat/PromptInput";
import { CHAT_HANDLER_EVENTS } from "@/hooks/useChatHandler";
import uiStore from "@/store/UIStore";
import { storeProcessedFileAsText } from "@/utils/fs";
import Telemetry from "@/utils/Telemetry";
import { XbergClient } from "@/utils/Xberg";
import { ExtractionConfig, SUPPORTED_FILE_TYPES } from "@/utils/Xberg/types";
import { FileText, MusicNotes, File, Image } from "phosphor-react-native";

const MAX_ATTACHMENTS = 4;

/** Formats whose bytes are already readable text, so a raw UTF-8 read is a valid fallback. */
const PLAIN_TEXT_EXTENSIONS = [
  ...SUPPORTED_FILE_TYPES.text,
  ...SUPPORTED_FILE_TYPES.data,
  ...SUPPORTED_FILE_TYPES.web,
  ...SUPPORTED_FILE_TYPES.code,
];

function isPlainTextAttachment(filePath: string, mimeType: string): boolean {
  if (mimeType?.startsWith("text/")) return true;
  const lower = filePath.toLowerCase();
  return PLAIN_TEXT_EXTENSIONS.some(ext => lower.endsWith(ext));
}

function getAttachmentIcon(type: string) {
  if (type?.includes("pdf")) return <FileText size={14} color="#F97066" />;
  if (type?.includes("audio")) return <MusicNotes size={14} color="#6CE9A6" />;
  if (type?.includes("image")) return <Image size={14} color="#F59E0B" />;
  if (type?.includes("word") || type?.includes("document"))
    return <FileText size={14} color="#3B82F6" />;
  return <File size={14} color="#9F9FA0" />;
}

export interface Attachment {
  uuid: string;
  type: string;
  uri: string;
  name: string;
  size: number;
  content: string | null;
  processing: boolean;
}

export interface AttachmentInterface {
  attachments: Attachment[];
  addAttachment: (attachment: Attachment) => void;
  removeAttachment: (attachment: Attachment) => Promise<void>;
  clearAttachments: () => void;
  renderAttachments: () => React.ReactNode;
  askForAttachment: () => void;
  clearWorkspaceVectors: () => Promise<void>;
  isMaxAttachments: boolean;
}

interface UseAttachmentsOptions {
  wsSlug: string;
  embeddingConfig?: {
    engine: MultilingualEmbeddingModelId;
    dimensions: number;
    autoDetectLanguage: boolean;
  };
}

export default function useAttachments({
  wsSlug,
  embeddingConfig,
}: UseAttachmentsOptions): AttachmentInterface {
  const embedder = embeddingConfig
    ? setEmbeddingEngine(embeddingConfig.engine)
    : getEmbeddingProvider();
  const deviceInfo = getCurrentDeviceInfo();
  const [workspaceSlug, setWorkspaceSlug] = useState(wsSlug);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const addAttachment = useCallback((attachment: Attachment) => {
    setAttachments(prev => [...prev, attachment]);
  }, []);

  const removeAttachment = useCallback(async (attachment: Attachment) => {
    setAttachments(prev => prev.filter(a => a.uuid !== attachment.uuid));
    await Document.delete([{ field: "uuid", value: attachment.uuid }], true); // delete the document and the vectors associated with it
  }, []);

  const clearAttachments = useCallback(async () => {
    const currentAttachments = attachments;
    setAttachments([]);
    await Promise.all(currentAttachments.map(a => removeAttachment(a)));
  }, [attachments, removeAttachment]);

  /**
   * Blindly clears the workspace vectors and deletes the documents
   * associated with the workspace. This is used when the user wants to
   * clear the workspace vectors and start fresh.
   */
  const onClearWorkspaceVectors = useCallback(async () => {
    setAttachments([]);
    await VectorDB.resetVectorsForWorkspace(workspaceSlug);
    await Document.delete([{ field: "workspace_slug", value: workspaceSlug }]);
    showToast("Workspace vectors cleared");
  }, [workspaceSlug]);

  const clearWorkspaceVectors = useCallback(async () => {
    Alert.alert(
      "Clear Workspace Vectors",
      "Are you sure you want to clear the vectors for this workspace? This will remove all vectors for this workspace and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: onClearWorkspaceVectors,
        },
      ],
    );
  }, [onClearWorkspaceVectors]);

  const extractTextContentFromFile = useCallback(
    async (
      fileStoragePath: string,
      mimeType: string,
    ): Promise<string | null> => {
      try {
        const config: ExtractionConfig = XbergClient.defaultExtractionConfig();
        const result = await XbergClient.extract(fileStoragePath, config);
        return result.results[0]?.content || null;
      } catch (e) {
        console.log("Xberg extraction failed, falling back:", e);
        // The fallback reads the file as UTF-8 text, which is only meaningful for formats
        // that *are* text. Reading a PDF, DOCX or image this way yields binary noise that
        // still looks like a successful extraction to every caller downstream — it gets
        // embedded, stored, and later retrieved as context. Refusing is the honest answer:
        // callers surface "could not be read" rather than silently poisoning the workspace.
        if (!isPlainTextAttachment(fileStoragePath, mimeType)) {
          console.log(
            "No text fallback for this format; reporting extraction failure",
          );
          return null;
        }
        try {
          const stats = await RNFS.stat(fileStoragePath).catch(e => {
            console.log("error", e);
            throw new Error("Attachment could not be read");
          });
          return await RNFS.read(fileStoragePath, stats.size, 0, "utf8");
        } catch (fallbackError) {
          console.log("Fallback extraction failed:", fallbackError);
          return null;
        }
      }
    },
    [],
  );

  /**
   * Process an attachment and add it to the attachments array
   * @notice On Android The user MUST select the file from the real folder,
   * if they use the "recent files" the URI will be auto-formatted to the correct
   * format, BUT it will still fail to read the file since the permissions are
   * not granted to the app for the current session.
   *
   * If they use the file directly from the file manager, then subsequent
   * attempts from recent files will work. Weird, idk.
   * @param attachment - The attachment to process
   */
  const processAttachment = useCallback(
    async (attachment: Attachment) => {
      let temporaryFilePath: string | null = null;
      if (!attachment.uri) return;
      try {
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.DISABLE_PROMPT_INPUT);

        /**
         * On Android, if the API level is less than 29, we need to copy the file to the temporary directory
         * because the file URI is not valid for the app to read - this mainly happens on newer devices that have no real file manager
         * eg: QRD device for android 16 (API 36) at this time cannot be used to read the file. We can always copy the file and then
         * read it directly since the file will then be app-owned so we can process it.
         *
         * The temporary file is removed after the attachment is processed. This workaround is not needed for Android 15 (API 35) and below.
         */
        if (deviceInfo.isAndroid) {
          console.log(`Android device detected, using copy file workaround...`);
          await RNFS.mkdir(RNFS.TemporaryDirectoryPath + "/uploads");
          temporaryFilePath = `${RNFS.TemporaryDirectoryPath}/uploads/${attachment.uuid}-${attachment.name}`;
          await RNFS.copyFile(attachment.uri, temporaryFilePath);
          attachment.uri = temporaryFilePath;
          console.log(`Temporary file created: ${temporaryFilePath}`);
        }

        const realPath = await Storage.getRealPathFromUri(attachment.uri).catch(
          e => {
            console.log("error", e);
            throw new Error("Attachment could not be found");
          },
        );

        const result = await extractTextContentFromFile(
          realPath,
          attachment.type,
        );
        if (!result)
          throw new Error("Attachment content was empty or could not be read");

        // Store the attachment as a plain text file in the local folder with the same name
        // but as text/plain so that it can be read as plain text later on but refer to it as
        // the original filename.
        await storeProcessedFileAsText(attachment.name, result);

        // Embed the processed file
        const chunkSize = embeddingConfig ? Math.min(400, 512 - 50) : 2048; // 512 token context for multilingual models
        const document = await embedder
          .splitAndEmbed(
            result,
            { chunkSize, chunkOverlap: 50 },
            "embed_document",
          )
          .then(embedResults =>
            embedResults.map(embedResult => {
              const metadata = {
                ...embedResult.metadata,
                name: attachment.name,
              };
              return { embedding: embedResult.embedding, metadata };
            }),
          )
          .then(
            async embeddings =>
              await VectorDB.bulkInsert(workspaceSlug, embeddings),
          )
          .then(async ({ ids }) => {
            return await Document.create({
              name: attachment.name,
              workspaceSlug: workspaceSlug,
              vectorBoxIds: ids,
            });
          });

        if (!document)
          throw new Error("Failed to create document for attachment");
        const newAttachment: Attachment = {
          ...attachment,
          content: result,
          processing: false,
          uuid: document.uuid, // update the attachment with the new uuid so we can manage the DB record associated with it
        };
        setAttachments(prev =>
          prev.map(a => (a.uuid === attachment.uuid ? newAttachment : a)),
        );
        Telemetry.logEvent(Telemetry.CUSTOM_EVENTS.ACTIONS.DOCUMENT_IMPORTED, {
          documentType: attachment.type,
        });
      } catch (e) {
        showToast((e as Error).message);
        removeAttachment(attachment);
      } finally {
        uiStore.emitter.emit(CHAT_HANDLER_EVENTS.ENABLE_PROMPT_INPUT);
        if (temporaryFilePath && (await RNFS.exists(temporaryFilePath))) {
          console.log("Removing temporary file:", temporaryFilePath);
          await RNFS.unlink(temporaryFilePath);
        }
      }
    },
    [
      workspaceSlug,
      deviceInfo.isAndroid,
      embedder,
      embeddingConfig,
      extractTextContentFromFile,
      removeAttachment,
    ],
  );

  const askForAttachment = useCallback(async () => {
    const result = await pick({
      allowMultiSelection: true,
      type: [
        "text/plain",
        "application/pdf",
        "text/markdown",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
        "audio/mpeg",
        "audio/mp4",
        "audio/wav",
        "audio/webm",
      ],
    });
    if (result.length === 0) return;
    for (const file of result) {
      const attachmentObject: Attachment = {
        uuid: generateUUID(),
        type: file.type || "text/plain",
        uri: decodeURI(file.uri),
        name: file.name || "attachment",
        size: file.size || 0,
        content: null,
        processing: true,
      };
      addAttachment(attachmentObject);
      await processAttachment(attachmentObject);
    }
  }, [addAttachment, processAttachment]);

  const renderAttachments = useCallback(() => {
    if (attachments.length === 0) return null;
    return (
      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        className="px-2">
        <View className="flex flex-row gap-x-2">
          {attachments.map(attachment => {
            const isProcessing = attachment.processing;
            return (
              <TouchableOpacity
                key={attachment.uuid}
                disabled={isProcessing}
                style={{
                  height: 40,
                  paddingHorizontal: 14,
                  maxWidth: 250,
                  ...(isProcessing
                    ? {
                        backgroundColor: "transparent",
                        borderWidth: 1,
                        borderColor: "#6F6F71",
                      }
                    : {
                        backgroundColor: "#333333",
                      }),
                }}
                className="flex flex-row gap-x-2 items-center rounded-full justify-center"
                onPress={() => {
                  Alert.alert(
                    "Remove Attachment",
                    "Are you sure you want to remove this attachment from chat?",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => removeAttachment(attachment),
                      },
                    ],
                  );
                }}>
                {isProcessing && (
                  <ActivityIndicator size="small" color="#fff" />
                )}
                {getAttachmentIcon(attachment.type)}
                <Text
                  numberOfLines={1}
                  ellipsizeMode="middle"
                  className="text-white">
                  {attachment.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }, [attachments]);

  useEffect(() => {
    setWorkspaceSlug(wsSlug);
  }, [wsSlug]);

  useEffect(() => {
    uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED, () =>
      setAttachments([]),
    );
    uiStore.emitter.addListener(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS, () =>
      setAttachments([]),
    );
    return () => {
      uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.PROMPT_SUBMITTED);
      uiStore.emitter.removeAllListeners(CHAT_HANDLER_EVENTS.CLEAR_ATTACHMENTS);
    };
  }, [setAttachments]);

  const attachmentInterface = useMemo(() => {
    return {
      attachments,
      addAttachment,
      removeAttachment,
      clearAttachments,
      renderAttachments,
      askForAttachment,
      clearWorkspaceVectors,
      isMaxAttachments: attachments.length >= MAX_ATTACHMENTS,
    };
  }, [
    attachments,
    addAttachment,
    removeAttachment,
    clearAttachments,
    renderAttachments,
    askForAttachment,
    clearWorkspaceVectors,
  ]);

  return attachmentInterface;
}

const ATTACHMENTS_SECTION_HEIGHT = 40; // height for the attachment items and the bottom padding
export function ChatWindowAttachmentsContainer({
  attachmentHandler,
}: {
  attachmentHandler: AttachmentInterface;
}) {
  const insets = useSafeAreaInsets();
  const getTopPosition = useCallback(() => {
    const snapPoint = parseInt(snapPointsDefault[0]) / 100;
    return (
      screenDimensions.height -
      screenDimensions.height * snapPoint -
      insets.top -
      ATTACHMENTS_SECTION_HEIGHT
    );
  }, [insets.bottom]);

  return (
    <View
      style={{
        position: "absolute",
        zIndex: 2,
        left: 0,
        top: getTopPosition(),
        height: ATTACHMENTS_SECTION_HEIGHT + 10,
      }}>
      {attachmentHandler.renderAttachments()}
    </View>
  );
}
