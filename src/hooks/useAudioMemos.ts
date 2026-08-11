import { useState, useCallback } from "react";
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
      const where = workspaceSlug !== undefined
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

  const createMemo = useCallback(async (data: {
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
    setMemos((prev) => [memo, ...prev]);
    return memo;
  }, []);

  const deleteMemo = useCallback(async (uuid: string) => {
    const success = await AudioMemo.delete([{ field: "uuid", value: uuid }]);
    if (success) {
      setMemos((prev) => prev.filter((m) => m.uuid !== uuid));
    }
    return success;
  }, []);

  const updateMemo = useCallback(async (uuid: string, updates: Partial<AudioMemoType>) => {
    const updated = await AudioMemo.update(uuid, updates);
    if (updated) {
      setMemos((prev) =>
        prev.map((m) => (m.uuid === uuid ? updated : m))
      );
    }
  }, []);

  // Playback functions would use expo-av or react-native-audio-player
  const playMemo = useCallback(async (uuid: string, audioUri: string) => {
    setPlayingId(uuid);
    // Actual playback implementation with audio player library
  }, []);

  const pauseMemo = useCallback(async () => {
    // Pause playback
    setPlayingId(null);
  }, []);

  const resumeMemo = useCallback(async () => {
    // Resume playback
  }, []);

  const stopMemo = useCallback(async () => {
    setPlayingId(null);
    setPlaybackPosition(0);
  }, []);

  const seekTo = useCallback(async (position: number) => {
    setPlaybackPosition(position);
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
  };
}
