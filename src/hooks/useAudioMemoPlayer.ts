import { useSyncExternalStore } from "react";

/**
 * Shared audio-memo playback state, external to React (mirrors UIStore's
 * plain-singleton pattern). AudioMemosScreen's list and MemoPlayerScreen each
 * hold their own `useAudioMemos()` instance, but there is only ever one real
 * playing/paused memo at a time app-wide - this is the single source of
 * truth both screens read and drive, so a memo started from the list stays
 * playing (and resumable) if the user navigates into its detail screen, and
 * vice versa.
 */
type PlayerState = {
  playingId: string | null;
  isPlaying: boolean;
  currentAudioUri: string | null;
  playbackPosition: number;
  playbackDuration: number;
  // uuid of the memo a currently-focused MemoPlayerScreen is displaying, if
  // any. While that screen owns a memo's playback, other real
  // AudioWaveformView instances (e.g. the list's mini-player bar) must not
  // also mount a player for the same file, or both would produce sound.
  focusedPlayerMemoId: string | null;
};

const initialState: PlayerState = {
  playingId: null,
  isPlaying: false,
  currentAudioUri: null,
  playbackPosition: 0,
  playbackDuration: 0,
  focusedPlayerMemoId: null,
};

let state: PlayerState = { ...initialState };
const listeners = new Set<() => void>();

function setState(patch: Partial<PlayerState>): void {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PlayerState {
  return state;
}

function play(uuid: string, audioUri: string): void {
  setState({
    playingId: uuid,
    currentAudioUri: audioUri,
    isPlaying: true,
    playbackPosition: 0,
    playbackDuration: 0,
  });
}

function pause(): void {
  setState({ isPlaying: false });
}

function resume(): void {
  if (!state.playingId) return;
  setState({ isPlaying: true });
}

function stop(): void {
  setState({ ...initialState, focusedPlayerMemoId: state.focusedPlayerMemoId });
}

function seekTo(position: number): void {
  setState({ playbackPosition: position });
}

function updatePlaybackTime(position: number, duration: number): void {
  setState({ playbackPosition: position, playbackDuration: duration });
}

function setFocusedPlayer(memoId: string | null): void {
  setState({ focusedPlayerMemoId: memoId });
}

function isOwnedByFocusedPlayer(uuid: string): boolean {
  return state.focusedPlayerMemoId === uuid;
}

// Test-only: module state otherwise persists across test cases in the same
// file, the same way embedQueue/queryCache do elsewhere in this codebase.
export function __resetAudioMemoPlayerForTests(): void {
  state = { ...initialState };
}

export function useAudioMemoPlayer() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return {
    playingId: snapshot.playingId,
    isPlaying: snapshot.isPlaying,
    currentAudioUri: snapshot.currentAudioUri,
    playbackPosition: snapshot.playbackPosition,
    playbackDuration: snapshot.playbackDuration,
    focusedPlayerMemoId: snapshot.focusedPlayerMemoId,
    playMemo: play,
    pauseMemo: pause,
    resumeMemo: resume,
    stopMemo: stop,
    seekTo,
    updatePlaybackTime,
    setFocusedPlayer,
    isOwnedByFocusedPlayer,
  };
}
