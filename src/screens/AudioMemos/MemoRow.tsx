import React from "react";
import { View, Text, TouchableOpacity, Pressable } from "react-native";
import { Play, Pause, Trash } from "phosphor-react-native";
import dayjs from "dayjs";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { useTranslation } from "@/hooks/useTranslation";

interface MemoRowProps {
  memo: AudioMemoType;
  // This row is the shared player's currently loaded memo (playing or
  // paused) - distinct from isPlaying, which additionally requires it to be
  // actively sounding right now (used to decide play vs. resume on tap).
  isActive: boolean;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onPress: () => void;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function MemoRow({
  memo,
  isActive,
  isPlaying,
  onPlay,
  onPause,
  onResume,
  onDelete,
  onPress,
}: MemoRowProps) {
  const { t } = useTranslation("audio");

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return t("memos.today");
    if (days === 1) return t("memos.yesterday");
    if (days < 7) return t("memos.daysAgo", { count: days });
    return dayjs(date).format("MMM D, YYYY");
  };

  const title = memo.transcript
    ? (memo.transcript.length > 30
        ? memo.transcript.substring(0, 30).trimEnd() + "..."
        : memo.transcript)
    : t("memos.untitled");

  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center p-4 bg-[#27282A] rounded-lg mb-2 border border-[#3A3B3D]">
      {/* Play/Pause Button */}
      <Pressable
        onPress={() => {
          if (!isActive) return onPlay();
          return isPlaying ? onPause() : onResume();
        }}
        className="w-10 h-10 rounded-full bg-[#3B82F6] items-center justify-center mr-3">
        {isPlaying ? (
          <Pause size={18} color="#FFF" weight="fill" />
        ) : (
          <Play size={18} color="#FFF" weight="fill" />
        )}
      </Pressable>

      {/* Content */}
      <View className="flex-1">
        <Text className="text-white text-base font-medium" numberOfLines={1}>
          {title}
        </Text>
        <View className="flex-row items-center gap-2 mt-1">
          <Text className="text-white/60 text-xs">
            {formatDuration(memo.durationMs)}
          </Text>
          <Text className="text-white/60 text-xs">•</Text>
          <Text className="text-white/60 text-xs">
            {formatDate(memo.createdAt)}
          </Text>
        </View>
      </View>

      {/* Delete Button */}
      <Pressable onPress={onDelete} className="p-2">
        <Trash size={18} color="#9F9FA0" />
      </Pressable>
    </TouchableOpacity>
  );
}
