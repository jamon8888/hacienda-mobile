import { useState, useEffect } from "react";
import { Alert } from "react-native";
import * as RNFS from "@dr.pogodin/react-native-fs";
import {
  resolveDestinationPathFromGGUFUrl,
  CACTUS_CHAT_MODELS,
} from "@/utils/models/defaults";
import { useNetInfo } from "@react-native-community/netinfo";
import { formatBytes } from "@/utils/formatters";
import AwaitableAlert from "@/components/AwaitableAlert";
import uiStore from "@/store/UIStore";
import PushNotifications from "@/utils/PushNotifications";
import { activateKeepAwake, deactivateKeepAwake } from "@/utils/keepAwake";

interface UseModelManagerProps {
  llmPreferences: any;
  fetchLLMPreference: () => Promise<void>;
  LLMProvider?: any;
}

export default function useModelManager({
  llmPreferences,
  fetchLLMPreference,
  LLMProvider,
}: UseModelManagerProps) {
  const netInfo = useNetInfo();
  const [modelDownloadUrl, setModelDownloadUrl] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedModels, setDownloadedModels] = useState<{
    [key: string]: boolean;
  }>({});
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Check which models are downloaded and set initial selection
  useEffect(() => {
    async function fetchModels() {
      if (LLMProvider) {
        const models = await LLMProvider.availableModels();
        updateDownloadedModels(models);
        setSelectedModel(LLMProvider.model || null);
      }
    }
    fetchModels();
  }, [LLMProvider]);

  // cactus-react-native names an on-disk bundle "<slug>-<quantization>" (see
  // CactusLM.getModelName()), and internally exposes a CactusFileSystem.modelExists()/
  // deleteModel() pair that could answer "is this bundle on disk" precisely -- but that class
  // lives under the package's private native/ module, outside its public "exports" map (only
  // "." is exported), so importing it here doesn't resolve. Short of patching the SDK or vendoring
  // its internals, there is no supported way to query or delete a downloaded Cactus registry
  // bundle from application code; CactusLM only exposes download()/init(), which is safe to
  // call again (it no-ops once cached) but isn't a presence check on its own since calling it
  // would kick off a real download for an uncached model just to answer "is it downloaded".
  // "No legacy GGUF path" is therefore still treated as "downloaded" below -- it's imprecise
  // (a lazy model could in fact not be on disk yet) but it's the best available without an SDK
  // change, and it fails safe: worst case the user taps "download" on an already-selected model
  // and CactusLmWrapper's own download() no-ops instantly.
  const isModelDownloaded = async (model: any): Promise<boolean> => {
    const ref =
      CACTUS_CHAT_MODELS[model.modelId as keyof typeof CACTUS_CHAT_MODELS];
    if (ref) return true;

    const path = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
    return path ? await RNFS.exists(path) : true;
  };

  const updateDownloadedModels = async (models: any[]) => {
    const downloaded: { [key: string]: boolean } = {};
    for (const model of models) {
      downloaded[model.modelId] = await isModelDownloaded(model);
    }
    setDownloadedModels(downloaded);
  };

  /**
   * Run the pre-download confirmation checks
   * - Will deny download if there is no internet connection
   * - Will ask to continue download if the model is not a Wi-Fi connection
   * - Will final confirmation before download of model
   * @param model - The model to download
   * @returns True if the model can be downloaded, false otherwise
   */
  async function runPreDownloadConfirmations(model: any): Promise<boolean> {
    const modelSize =
      typeof model.size === "number" ? formatBytes(model.size) : model.size;
    if (!netInfo.isConnected) {
      await AwaitableAlert(
        "No internet connection.",
        "You will need to be connected to the internet to download any model.",
        { text: "Dismiss", style: "default" },
        { text: "OK", style: "default" },
      );
      return false;
    }

    if (netInfo.type !== "wifi") {
      const ignoreWarning = await AwaitableAlert(
        "Data usage warning",
        `We recommend using a Wi-Fi connection to download the model since it's ${modelSize} in size.`,
        { text: "Cancel", style: "cancel" },
        { text: "Continue Anyway", style: "default" },
      );
      if (!ignoreWarning) return false;
    }

    const shouldDownload = await AwaitableAlert(
      "Download model?",
      `This will download the model to your device. It is ${modelSize} in size.`,
      { text: "Cancel", style: "cancel" },
      { text: "Continue with download", style: "default" },
    );
    if (!shouldDownload) return false;
    return true;
  }

  /**
   * Download a model
   * @param model - The model to download
   * @param runPrefetchChecks - If true, the model will be downloaded and the pre-download confirmation checks will be run. Otherwise, it is assumed these checks have already been run prior to calling this function.
   * @returns True if the model was downloaded, false otherwise
   */
  const downloadModel = async (model: any, runPrefetchChecks = true) => {
    if (!!modelDownloadUrl) return false;

    const isDownloaded = await isModelDownloaded(model);
    if (isDownloaded) return await selectModel(model);

    // If prefetch checks are enabled, run them before downloading to abort early
    if (runPrefetchChecks) {
      const approved = await runPreDownloadConfirmations(model);
      if (!approved) return false;
    }

    setModelDownloadUrl(model.downloadUrl);
    // A Cactus registry model already short-circuited to selectModel() above, so any model
    // reaching here has a legacy GGUF path and storageLocation is guaranteed non-null.
    const storageLocation = resolveDestinationPathFromGGUFUrl(
      model.downloadUrl,
    ) as string;

    // Create the directory if it doesn't exist
    const dirPath = storageLocation.substring(
      0,
      storageLocation.lastIndexOf("/"),
    );
    await RNFS.mkdir(dirPath, { NSURLIsExcludedFromBackupKey: true });

    const downloadNotificationId = await PushNotifications.send("progress", {
      title: "Downloading model",
      body: `Downloading ${model.modelId}`,
      android: {
        progress: {
          indeterminate: true,
        },
      },
    });

    try {
      activateKeepAwake();
      uiStore.setSessionKey(
        "@downloadInProgress",
        true,
        uiStore.globalEvents.MODEL_DOWNLOAD_STARTED,
      );
      await RNFS.downloadFile({
        fromUrl: model.downloadUrl,
        toFile: storageLocation,
        progress: res => {
          const progress = Math.round(
            (res.bytesWritten / res.contentLength) * 100,
          );
          setDownloadProgress(progress);
          PushNotifications.send("progress", {
            id: downloadNotificationId,
            title: "Downloading model",
            body: `Downloading ${model.modelId}`,
            android: {
              progress: {
                current: progress,
                max: 100,
              },
            },
          });
        },
        background: true,
        discretionary: true,
        progressInterval: 5000,
      }).promise;

      setDownloadedModels(prev => ({ ...prev, [model.modelId]: true }));
      PushNotifications.send("primary", {
        title: "Download complete",
        body: `Downloaded ${model.modelId}`,
      });
      return await selectModel(model);
    } catch (error) {
      console.error("Download failed:", error);
      PushNotifications.send("primary", {
        title: "Download failed",
        body: `There was an error downloading the model.`,
      });
      await AwaitableAlert(
        "Download failed",
        "There was an error downloading the model.",
        { text: "Dismiss", style: "default" },
        { text: "OK", style: "default" },
      );
      setModelDownloadUrl(null);
      setDownloadProgress(0);
      return false;
    } finally {
      deactivateKeepAwake();
      PushNotifications.cancel("progress", downloadNotificationId);
      uiStore.deleteSessionKey(
        "@downloadInProgress",
        uiStore.globalEvents.MODEL_DOWNLOAD_COMPLETE,
      );
    }
  };

  const uninstallModel = async (model: any) => {
    const shouldUninstall = await AwaitableAlert(
      "Uninstall model?",
      "This will remove the model from your device.",
      { text: "Cancel", style: "cancel" },
      { text: "Uninstall", style: "destructive" },
    );

    if (!shouldUninstall) return false;

    // Cactus registry bundles (see isModelDownloaded) have no supported delete path from
    // application code -- CactusFileSystem.deleteModel() exists in the SDK but isn't part of
    // its public exports (see isModelDownloaded's comment). Removing legacy files here would
    // do nothing for these models while still flipping isDownloaded to false, misleading the
    // UI into thinking the ~GBs of on-disk weights were actually freed. Bail out honestly
    // instead until the SDK exposes a public way to do this.
    if (CACTUS_CHAT_MODELS[model.modelId as keyof typeof CACTUS_CHAT_MODELS]) {
      Alert.alert(
        "Cannot uninstall",
        "This model cannot be uninstalled from within the app yet.",
      );
      return false;
    }

    try {
      const path = resolveDestinationPathFromGGUFUrl(model.downloadUrl);
      if (!path || !(await RNFS.exists(path))) return false;
      await RNFS.unlink(path);

      // Update downloaded models state
      setDownloadedModels(prev => ({
        ...prev,
        [model.modelId]: false,
      }));

      // If this was the selected model, clear the selection
      if (selectedModel === model.modelId) {
        setSelectedModel(null);
        await uiStore.setToStorage("llmPreference", {
          ...llmPreferences,
          config: { ...llmPreferences.config, model: null },
        });
        await fetchLLMPreference();
      }
      return true;
    } catch (error) {
      console.error("Failed to uninstall model:", error);
      return false;
    }
  };

  const selectModel = async (model: { modelId?: string }) => {
    try {
      // Set selected model state first
      setSelectedModel(model?.modelId || null);

      // Then update preferences
      await uiStore.setToStorage("llmPreference", {
        provider: llmPreferences?.provider ?? "native", // if the provider is not set, default to native
        config: { ...llmPreferences.config, model: model?.modelId || null },
      });

      // Only fetch preferences if we need to
      if (model?.modelId !== llmPreferences.config.model) {
        await fetchLLMPreference();
      }
      return true;
    } catch (error) {
      console.error("Failed to select model:", error);
      return false;
    }
  };

  return {
    modelDownloadUrl,
    downloadProgress,
    downloadedModels,
    selectedModel,
    downloadModel,
    uninstallModel,
    selectModel,
    runPreDownloadConfirmations,
    isModelDownloaded,
  };
}
