import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, TextInput, Alert } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Play, Pause, Trash, Share } from "phosphor-react-native";
import {
  AudioWaveformView,
  type AudioWaveformViewRef,
} from "react-native-waveform-player";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { useTranslation } from "@/hooks/useTranslation";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { useRoute, useNavigation } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";

type SpeedOption = 0.5 | 1 | 1.5 | 2;

export default function MemoPlayerScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute();
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const { t } = useTranslation("audio");
  const { memoId } = route.params as { memoId: string; mode?: string };
  const {
    memos,
    playingId,
    playbackPosition,
    playMemo,
    pauseMemo,
    updateMemo,
    deleteMemo,
  } = useAudioMemos();

  const [memo, setMemo] = useState<AudioMemoType | null>(null);
  const [speed, setSpeed] = useState<SpeedOption>(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState("");
  const waveformRef = useRef<AudioWaveformViewRef>(null);

  useEffect(() => {
    const found = memos.find(m => m.uuid === memoId);
    if (found) {
      setMemo(found);
      setEditedTranscript(found.transcript ?? "");
    }
  }, [memoId, memos]);

  // Cleanup waveformRef on unmount or memo change
  useEffect(() => {
    const currentRef = waveformRef.current;
    return () => {
      currentRef?.pause();
    };
  }, [memoId]);

  const handlePlayPause = useCallback(() => {
    if (!memo) return;
    if (playingId === memo.uuid) {
      pauseMemo();
      waveformRef.current?.pause();
    } else {
      playMemo(memo.uuid, memo.audioUri);
      waveformRef.current?.play();
    }
  }, [memo, playingId, pauseMemo, playMemo]);

  const handleSpeedChange = useCallback((newSpeed: SpeedOption) => {
    setSpeed(newSpeed);
    waveformRef.current?.setSpeed(newSpeed);
  }, []);

  const handleSaveTranscript = useCallback(async () => {
    if (!memo) return;
    await updateMemo(memo.uuid, { transcript: editedTranscript });
    setIsEditing(false);
  }, [memo, editedTranscript, updateMemo]);

  const handleDelete = useCallback(async () => {
    if (!memo) return;
    const success = await deleteMemo(memo.uuid);
    if (success) {
      navigation.goBack();
    } else {
      Alert.alert(t("common:status.error"), t("player.deleteFailed"));
    }
  }, [memo, deleteMemo, navigation, t]);

  if (!memo) {
    return (
      <SafeView safeAreaClassNames="bg-[#1B1B1E]">
        <View className="flex-1 justify-center items-center">
          <Text className="text-white/60">{t("player.notFound")}</Text>
        </View>
      </SafeView>
    );
  }

  return (
    <SafeView
      safeAreaClassNames="bg-[#1B1B1E]"
      containerStyle={{ flex: 1, backgroundColor: "#1B1B1E" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
        className="flex-row items-center justify-between">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">
          {t("player.title")}
        </Text>
        <View className="flex-row gap-4">
          <TouchableOpacity onPress={handleDelete}>
            <Trash size={22} color="#9F9FA0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {}}>
            <Share size={22} color="#9F9FA0" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Waveform Player */}
      <View className="flex-1 px-6">
        <AudioWaveformView
          ref={waveformRef}
          source={{ uri: memo.audioUri }}
          samples={
            memo.waveformPeaks
              ? typeof memo.waveformPeaks === "string"
                ? JSON.parse(memo.waveformPeaks)
                : memo.waveformPeaks
              : undefined
          }
          style={{ height: 120, marginBottom: 16 }}
          containerBackgroundColor="#27282A"
          containerBorderRadius={12}
          playedBarColor="#3B82F6"
          unplayedBarColor="#3A3B3D"
          barWidth={4}
          barGap={3}
          showPlayButton={false}
          showTime={false}
          showSpeedControl={false}
          showBackground={true}
          onLoadError={() => {
            // Error handling for waveform load failure
            console.warn("Failed to load waveform");
          }}
        />

        {/* Time Display */}
        <View className="flex-row justify-between w-full mb-6">
          <Text className="text-white/60 text-xs">
            {Math.floor(playbackPosition / 1000)}s
          </Text>
          <Text className="text-white/60 text-xs">
            {Math.floor(memo.durationMs / 1000)}s
          </Text>
        </View>

        {/* Play/Pause Button */}
        <TouchableOpacity
          onPress={handlePlayPause}
          className="w-16 h-16 rounded-full bg-[#3B82F6] items-center justify-center mb-6 align-self-center">
          {playingId === memo.uuid ? (
            <Pause size={28} color="#FFF" weight="fill" />
          ) : (
            <Play size={28} color="#FFF" weight="fill" />
          )}
        </TouchableOpacity>

        {/* Speed Control */}
        <View className="flex-row gap-2 mb-6 justify-center">
          {[0.5, 1, 1.5, 2].map(s => (
            <TouchableOpacity
              key={s}
              onPress={() => handleSpeedChange(s as SpeedOption)}
              className={`px-4 py-2 rounded-lg ${
                speed === s ? "bg-[#3B82F6]" : "bg-[#27282A]"
              }`}>
              <Text
                className={`text-sm ${
                  speed === s ? "text-white" : "text-white/60"
                }`}>
                {s}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Transcript */}
        <View className="w-full">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white/60 text-sm uppercase">
              {t("player.transcript.title")}
            </Text>
            <TouchableOpacity onPress={() => setIsEditing(!isEditing)}>
              <Text className="text-[#3B82F6] text-sm">
                {isEditing
                  ? t("player.transcript.cancel")
                  : t("player.transcript.edit")}
              </Text>
            </TouchableOpacity>
          </View>
          {isEditing ? (
            <View>
              <TextInput
                value={editedTranscript}
                onChangeText={setEditedTranscript}
                multiline
                className="bg-[#27282A] text-white p-3 rounded-lg min-h-[100px]"
                textAlignVertical="top"
              />
              <TouchableOpacity
                onPress={handleSaveTranscript}
                className="bg-[#3B82F6] py-2 rounded-lg mt-2">
                <Text className="text-white text-center">
                  {t("player.transcript.save")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text className="text-white bg-[#27282A] p-3 rounded-lg min-h-[100px]">
              {memo.transcript || t("player.transcript.noTranscript")}
            </Text>
          )}
        </View>
      </View>
    </SafeView>
  );
}
