import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { DrawerNavigationProp } from "@react-navigation/drawer";
import { ArrowLeft, Plus, CaretDown, Check } from "phosphor-react-native";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { useTranslation } from "@/hooks/useTranslation";
import Workspace, { WorkspaceType } from "@/database/models/Workspace";
import MemoRow from "./MemoRow";
import { PATHS } from "@/utils/paths";

type TabType = "workspace" | "global";

export default function AudioMemosScreen() {
  const navigation = useNavigation<DrawerNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("audio");
  const {
    memos,
    loading,
    playingId,
    fetchMemos,
    deleteMemo,
    playMemo,
    pauseMemo,
  } = useAudioMemos();
  const [activeTab, setActiveTab] = useState<TabType>("workspace");
  const [workspaces, setWorkspaces] = useState<WorkspaceType[]>([]);
  const [selectedWsSlug, setSelectedWsSlug] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    Workspace.find().then(setWorkspaces);
  }, []);

  useEffect(() => {
    if (activeTab === "workspace" && !selectedWsSlug && workspaces.length > 0) {
      setSelectedWsSlug(workspaces[0].slug);
    }
  }, [activeTab, selectedWsSlug, workspaces]);

  const refetch = useCallback(() => {
    fetchMemos(activeTab === "workspace" ? selectedWsSlug : null);
  }, [activeTab, selectedWsSlug, fetchMemos]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Screens stay mounted in the drawer navigator, so a plain mount-time
  // effect won't refresh the list after returning from recording a memo.
  useFocusEffect(refetch);

  const handleDelete = useCallback(
    (uuid: string) => {
      Alert.alert(t("memos.delete.title"), t("memos.delete.confirm"), [
        { text: t("common:buttons.cancel"), style: "cancel" },
        {
          text: t("common:buttons.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteMemo(uuid);
          },
        },
      ]);
    },
    [deleteMemo, t],
  );

  const handlePlay = useCallback(
    (uuid: string, audioUri: string) => {
      playMemo(uuid, audioUri);
    },
    [playMemo],
  );

  const tabs: { key: TabType; label: string }[] = [
    { key: "workspace", label: t("memos.tabs.workspace") },
    { key: "global", label: t("memos.tabs.global") },
  ];

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
          {t("memos.title")}
        </Text>
        <TouchableOpacity
          onPress={() =>
            navigation.navigate(PATHS.audio_memo_player, {
              mode: "record",
              wsSlug: activeTab === "workspace" ? selectedWsSlug : null,
            })
          }>
          <Plus size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
      </View>

      {/* Segmented Control */}
      <View className="flex-row mx-4 mb-4 bg-[#27282A] rounded-lg p-1">
        {tabs.map(tab => (
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

      {/* Workspace Picker */}
      {activeTab === "workspace" && (
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          className="flex-row items-center justify-between mx-4 mb-4 bg-[#27282A] rounded-lg px-4 py-3">
          <Text className="text-white" numberOfLines={1}>
            {workspaces.find(w => w.slug === selectedWsSlug)?.name ??
              t("workspacePicker.title")}
          </Text>
          <CaretDown size={16} color="#9F9FA0" />
        </TouchableOpacity>
      )}

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}>
        <TouchableOpacity
          className="flex-1 bg-black/60 justify-end"
          activeOpacity={1}
          onPress={() => setPickerVisible(false)}>
          <View
            className="bg-[#27282A] rounded-t-2xl pb-6"
            style={{ paddingBottom: insets.bottom + 16 }}>
            <Text className="text-white text-lg font-medium px-5 pt-5 pb-2">
              {t("workspacePicker.title")}
            </Text>
            <FlatList
              data={workspaces}
              keyExtractor={item => item.slug}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedWsSlug(item.slug);
                    setPickerVisible(false);
                  }}
                  className="flex-row items-center justify-between px-5 py-3">
                  <Text className="text-white">{item.name}</Text>
                  {item.slug === selectedWsSlug && (
                    <Check size={18} color="#3B82F6" weight="bold" />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Memo List */}
      {loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color="#3B82F6" />
        </View>
      ) : memos.length === 0 ? (
        <View className="flex-1 justify-center items-center px-4">
          <Text className="text-white/60 text-center">{t("memos.empty")}</Text>
        </View>
      ) : (
        <FlatList
          data={memos}
          keyExtractor={item => item.uuid}
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
