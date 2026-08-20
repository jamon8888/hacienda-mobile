import { XbergClient } from "@/utils/Xberg/XbergClient";
import { AudioMemoType } from "@/database/models/AudioMemo";
// Import the bare i18next singleton rather than "@/i18n" - the latter also
// pulls in react-native-localize (for device-language detection) and dayjs
// locale files as a side effect, which unmocked test files that transitively
// import this module (e.g. via MemoRecorder) would otherwise crash on. Both
// imports resolve to the same already-initialized instance at runtime.
import i18n from "i18next";
import uiStore from "@/store/UIStore";

/**
 * Best-effort auto-transcription for a freshly recorded memo. Fire-and-forget:
 * on failure the memo simply keeps transcript: null, which the player screen's
 * existing manual transcript-edit UI already handles as a normal state. This
 * typically runs after the recorder screen has already navigated away, so
 * failures are surfaced via the global toast/alert rather than local state.
 */
export function transcribeMemoInBackground(
  uuid: string,
  audioUri: string,
  updateMemo: (uuid: string, updates: Partial<AudioMemoType>) => Promise<void>,
): void {
  XbergClient.transcribeAudio(audioUri)
    .then(result => {
      const transcript = result.results[0]?.content?.trim();
      if (transcript) {
        return updateMemo(uuid, { transcript });
      }
    })
    .catch(err => {
      console.warn("Auto-transcription failed for memo", uuid, err);
      uiStore.showError(i18n.t("transcription.failed", { ns: "audio" }));
    });
}
