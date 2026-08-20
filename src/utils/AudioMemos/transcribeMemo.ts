import { XbergClient } from "@/utils/Xberg/XbergClient";
import { AudioMemoType } from "@/database/models/AudioMemo";

/**
 * Best-effort auto-transcription for a freshly recorded memo. Fire-and-forget:
 * on failure the memo simply keeps transcript: null, which the player screen's
 * existing manual transcript-edit UI already handles as a normal state.
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
    });
}
