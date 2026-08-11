import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Plus } from "phosphor-react-native";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import MemoRow from "./MemoRow";
import { PATHS } from "@/utils/paths";

type TabType = "workspace" | "global";

export default function AudioMemosScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { memos, loading, playingId, fetchMemos, deleteMemo, playMemo, pauseMemo } = useAudioMemos();
  const [activeTab, setActiveTab] = useState<TabType>("workspace");

  useEffect(() => {
    fetchMemos(activeTab === "workspace" ? "current" : null);
  }, [activeTab, fetchMemos]);

  const handleDelete = useCallback(async (uuid: string) => {
    await deleteMemo(uuid);
  }, [deleteMemo]);

  const handlePlay = useCallback((uuid: string, audioUri: string) => {
    playMemo(uuid, audioUri);
  }, [playMemo]);

  const tabs: { key: TabType; label: string }[] = [
    { key: "workspace", label: "Workspace" },
    { key: "global", label: "Global" },
  ];

  return (
    <SafeView
      safeAreaClassNames="bg-[#1B1B1E]"
      containerStyle={{ flex: 1, backgroundColor: "#1B1B1E" }}>
      {/* Header */}
      <View
        style={{ paddingTop: insets.top, paddingHorizontal: 20, paddingBottom: 16 }}
        className="flex-row items-center justify-between">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">Audio Memos</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate(PATHS.audio_memo_player, { mode: "record" })}>
          <Plus size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View className="flex-row mx-4 mb-4 bg-[#27282A] rounded-lg p-1">
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 rounded-md ${
              activeTab === tab.key ? "bg-[#3B82F6]" : ""
            }`}>
            <Text
              className={`text-center font-medium ${
                activeTab === tab.key ? "text-white" : "text-white/60"
              }`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Memo List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : memos.length === 0 ? (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-white/60 text-center">
            No memos yet.{"\n"}Tap + to record your first memo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={memos}
          keyExtractor={(item) => item.uuid}
          renderItem={({ item }) => (
            <MemoRow
              memo={item}
              isPlaying={playingId === item.uuid}
              onPlay={() => handlePlay(item.uuid, item.audioUri)}
              onPause={pauseMemo}
              onDelete={() => handleDelete(item.uuid)}
              onPress={() =>
                navigation.navigate(PATHS.audio_memo_player, {
                  memoId: item.uuid,
                  mode: "play",
                })
              }
            />
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </SafeView>
  );
}
