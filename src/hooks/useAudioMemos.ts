import { useState, useCallback } from "react";
import AudioMemo, { AudioMemoType } from "@/database/models/AudioMemo";
import { embedMemoTranscript } from "@/utils/AudioMemos/embedMemoTranscript";

// Module-level (not per-hook-instance) so overlapping transcript edits for
// the same memo serialize correctly even across different mounted screens
// (e.g. AudioMemosScreen and MemoPlayerScreen both hold their own
// useAudioMemos() instance). Without this, two edits in quick succession can
// run embedMemoTranscript concurrently - since that function itself inserts
// and deletes real vectors, an older job finishing last can overwrite a
// newer job's vectors, not just race on the final AudioMemo.update call.
const embedQueue = new Map<string, Promise<unknown>>();

function enqueueEmbed(uuid: string, task: () => Promise<void>): void {
  const previous = embedQueue.get(uuid) ?? Promise.resolve();
  const next = previous.then(task, task);
  embedQueue.set(uuid, next);
  next.finally(() => {
    if (embedQueue.get(uuid) === next) embedQueue.delete(uuid);
  });
}

interface UseAudioMemosReturn {
  memos: AudioMemoType[];
  loading: boolean;
  playingId: string | null;
  playbackPosition: number;
  playbackDuration: number;
  fetchMemos: (workspaceSlug?: string | null) => Promise<void>;
  createMemo: (data: {
    audioUri: string;
    transcript?: string;
    durationMs: number;
    waveformPeaks: number[];
    workspaceSlug?: string | null;
  }) => Promise<AudioMemoType>;
  deleteMemo: (uuid: string) => Promise<boolean>;
  updateMemo: (uuid: string, updates: Partial<AudioMemoType>) => Promise<void>;
  playMemo: (uuid: string, audioUri: string) => Promise<void>;
  pauseMemo: () => Promise<void>;
  resumeMemo: () => Promise<void>;
  stopMemo: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  updatePlaybackTime: (position: number, duration: number) => void;
}

export function useAudioMemos(): UseAudioMemosReturn {
  const [memos, setMemos] = useState<AudioMemoType[]>([]);
  const [loading, setLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  const fetchMemos = useCallback(async (workspaceSlug?: string | null) => {
    setLoading(true);
    try {
      const where =
        workspaceSlug !== undefined
          ? [{ field: "workspace_slug", value: workspaceSlug }]
          : [];
      const fetched = await AudioMemo.find(where, [
        { field: "created_at", direction: "desc" },
      ]);
      setMemos(fetched);
    } catch (err) {
      console.error("Failed to fetch memos:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createMemo = useCallback(
    async (data: {
      audioUri: string;
      transcript?: string;
      durationMs: number;
      waveformPeaks: number[];
      workspaceSlug?: string | null;
    }) => {
      const memo = await AudioMemo.create({
        audioUri: data.audioUri,
        transcript: data.transcript ?? null,
        durationMs: data.durationMs,
        waveformPeaks: data.waveformPeaks,
        workspaceSlug: data.workspaceSlug ?? null,
      });
      setMemos(prev => [memo, ...prev]);
      return memo;
    },
    [],
  );

  const deleteMemo = useCallback(async (uuid: string) => {
    // File and vector cleanup now happen inside AudioMemo.delete itself, so
    // this stays correct even when called from contexts that don't have this
    // hook's in-memory `memos` list (e.g. Workspace.delete, a full app reset).
    const success = await AudioMemo.delete(
      [{ field: "uuid", value: uuid }],
      true,
    );
    if (success) {
      setMemos(prev => prev.filter(m => m.uuid !== uuid));
    }
    return success;
  }, []);

  const updateMemo = useCallback(
    async (uuid: string, updates: Partial<AudioMemoType>) => {
      const updated = await AudioMemo.update(uuid, updates);
      if (!updated) return;
      setMemos(prev => prev.map(m => (m.uuid === uuid ? updated : m)));

      // Re-embed (or embed for the first time) whenever the transcript
      // changes - covers both auto-transcription and manual edits, since
      // both funnel through this same call. Fire-and-forget: embedding can
      // take a few seconds (model load) and shouldn't block the caller.
      // Queued per-uuid (see enqueueEmbed) so a second edit before the first
      // finishes embedding waits its turn instead of racing it.
      if (updates.transcript !== undefined) {
        enqueueEmbed(uuid, async () => {
          // Re-fetch rather than embedding the `updated` snapshot captured
          // above: by the time this job's turn comes up, a later edit may
          // already have changed the transcript (and this memo's
          // vectorBoxIds) again, and embedMemoTranscript needs the current
          // vectorBoxIds to know what to replace.
          const [current] = await AudioMemo.find([
            { field: "uuid", value: uuid },
          ]);
          if (!current) return;

          const vectorBoxIds = await embedMemoTranscript(current);
          // undefined means the embed failed/was skipped - leave the memo's
          // existing vectorBoxIds untouched rather than persisting an empty
          // array over what could still be a valid, working embedding.
          if (vectorBoxIds === undefined) return;
          const withVectors = await AudioMemo.update(uuid, { vectorBoxIds });
          if (withVectors) {
            setMemos(prev => prev.map(m => (m.uuid === uuid ? withVectors : m)));
          }
        });
      }
    },
    [],
  );

  // These are pure state bookkeeping - the actual audio playback is driven
  // by the AudioWaveformView ref in MemoPlayerScreen. Callers invoke these
  // both optimistically (on tap, for instant UI feedback) and correctively
  // (from the waveform's onPlayerStateChange/onTimeUpdate/onEnd/onSeek
  // callbacks, which are the real source of truth for player state).
  const playMemo = useCallback(async (uuid: string, _audioUri: string) => {
    setPlayingId(uuid);
  }, []);

  const pauseMemo = useCallback(async () => {
    setPlayingId(null);
  }, []);

  // Unused by any current call site: pauseMemo clears playingId, so there's
  // no remembered uuid to resume without a scrubber/mini-player that keeps
  // a memo "loaded" across pause. Left as a no-op until that exists.
  const resumeMemo = useCallback(async () => {}, []);

  const stopMemo = useCallback(async () => {
    setPlayingId(null);
    setPlaybackPosition(0);
  }, []);

  const seekTo = useCallback(async (position: number) => {
    setPlaybackPosition(position);
  }, []);

  const updatePlaybackTime = useCallback((position: number, duration: number) => {
    setPlaybackPosition(position);
    setPlaybackDuration(duration);
  }, []);

  return {
    memos,
    loading,
    playingId,
    playbackPosition,
    playbackDuration,
    fetchMemos,
    createMemo,
    deleteMemo,
    updateMemo,
    playMemo,
    pauseMemo,
    resumeMemo,
    stopMemo,
    seekTo,
    updatePlaybackTime,
  };
}
