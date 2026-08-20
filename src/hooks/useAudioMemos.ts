import { useState, useCallback } from "react";
import * as RNFS from "@dr.pogodin/react-native-fs";
import AudioMemo, { AudioMemoType } from "@/database/models/AudioMemo";

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

  const deleteMemo = useCallback(
    async (uuid: string) => {
      const audioUri = memos.find(m => m.uuid === uuid)?.audioUri;
      const success = await AudioMemo.delete([{ field: "uuid", value: uuid }]);
      if (success) {
        setMemos(prev => prev.filter(m => m.uuid !== uuid));
        if (audioUri) {
          try {
            await RNFS.unlink(audioUri);
          } catch (err) {
            console.warn("Failed to delete memo file:", audioUri, err);
          }
        }
      }
      return success;
    },
    [memos],
  );

  const updateMemo = useCallback(
    async (uuid: string, updates: Partial<AudioMemoType>) => {
      const updated = await AudioMemo.update(uuid, updates);
      if (updated) {
        setMemos(prev => prev.map(m => (m.uuid === uuid ? updated : m)));
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
