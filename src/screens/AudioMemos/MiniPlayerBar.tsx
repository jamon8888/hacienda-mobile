import React from "react";
import { View, TouchableOpacity } from "react-native";
import { X } from "phosphor-react-native";
import { AudioWaveformView } from "react-native-waveform-player";
import { useAudioMemoPlayer } from "@/hooks/useAudioMemoPlayer";

/**
 * Persistent mini-player shown at the bottom of AudioMemosScreen whenever a
 * memo is loaded (playing or paused). This is the real playback engine for
 * the list screen - tapping play on a MemoRow updates the shared player
 * store, and this is what actually produces sound for it.
 *
 * Renders nothing while a focused MemoPlayerScreen owns the same memo, so
 * only one real AudioWaveformView (one native playback engine) ever targets
 * a given file at a time.
 */
export default function MiniPlayerBar() {
  const {
    playingId,
    isPlaying,
    currentAudioUri,
    playbackPosition,
    pauseMemo,
    resumeMemo,
    stopMemo,
    updatePlaybackTime,
    isOwnedByFocusedPlayer,
  } = useAudioMemoPlayer();

  if (!playingId || !currentAudioUri) return null;
  if (isOwnedByFocusedPlayer(playingId)) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: "#27282A",
        borderTopWidth: 1,
        borderTopColor: "#3A3B3D",
      }}>
      <AudioWaveformView
        key={currentAudioUri}
        source={{ uri: currentAudioUri }}
        playing={isPlaying}
        initialPositionMs={playbackPosition}
        style={{ flex: 1, height: 48 }}
        containerBackgroundColor="transparent"
        showBackground={false}
        playedBarColor="#3B82F6"
        unplayedBarColor="#3A3B3D"
        onPlayerStateChange={({ isPlaying: nowPlaying }) => {
          if (nowPlaying && !isPlaying) resumeMemo();
          else if (!nowPlaying && isPlaying) pauseMemo();
        }}
        onTimeUpdate={({ currentTimeMs, durationMs }) =>
          updatePlaybackTime(currentTimeMs, durationMs)
        }
        onEnd={() => stopMemo()}
      />
      <TouchableOpacity onPress={() => stopMemo()} className="p-2">
        <X size={18} color="#9F9FA0" />
      </TouchableOpacity>
    </View>
  );
}
