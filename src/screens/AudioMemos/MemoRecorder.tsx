import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Stop, Trash } from "phosphor-react-native";
import {
  WaveformRecorderView,
  ensureMicrophonePermission,
  type WaveformRecorderViewRef,
  type WaveformRecorderState,
  type WaveformRecorderCompleteEvent,
  type WaveformRecorderErrorEvent,
} from "react-native-waveform-recorder";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { useTranslation } from "@/hooks/useTranslation";
import { transcribeMemoInBackground } from "@/utils/AudioMemos/transcribeMemo";

interface MemoRecorderProps {
  wsSlug: string | null;
  onDone: () => void;
  onCancel: () => void;
}

export default function MemoRecorder({
  wsSlug,
  onDone,
  onCancel,
}: MemoRecorderProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("audio");
  const { createMemo, updateMemo } = useAudioMemos();
  const recorderRef = useRef<WaveformRecorderViewRef>(null);
  const [state, setState] = useState<WaveformRecorderState>("idle");
  const [saving, setSaving] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      const granted = await ensureMicrophonePermission();
      if (!granted) {
        Alert.alert(
          t("record.permissionDenied.title"),
          t("record.permissionDenied.message"),
        );
        onCancel();
        return;
      }
      recorderRef.current?.start();
    })();
  }, [t, onCancel]);

  useEffect(() => {
    return () => {
      if (state === "recording" || state === "paused") {
        recorderRef.current?.cancel();
      }
    };
    // Only run on unmount - `state` is read via closure intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStop = useCallback(() => {
    setSaving(true);
    recorderRef.current?.stop();
  }, []);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      t("record.discardConfirm.title"),
      t("record.discardConfirm.message"),
      [
        { text: t("player.transcript.cancel"), style: "cancel" },
        {
          text: t("record.discard"),
          style: "destructive",
          onPress: () => {
            recorderRef.current?.cancel();
            onCancel();
          },
        },
      ],
    );
  }, [t, onCancel]);

  const handleComplete = useCallback(
    async (event: WaveformRecorderCompleteEvent) => {
      try {
        const memo = await createMemo({
          audioUri: event.uri,
          durationMs: event.durationMs,
          waveformPeaks: event.samples,
          workspaceSlug: wsSlug,
        });
        transcribeMemoInBackground(memo.uuid, event.uri, updateMemo);
        onDone();
      } catch (err) {
        console.error("Failed to save memo:", err);
        Alert.alert(t("common:status.error"), t("record.error"));
        setSaving(false);
      }
    },
    [createMemo, updateMemo, wsSlug, onDone, t],
  );

  const handleError = useCallback(
    (event: WaveformRecorderErrorEvent) => {
      console.error("Recording error:", event.message);
      Alert.alert(t("common:status.error"), t("record.error"));
      setSaving(false);
      onCancel();
    },
    [t, onCancel],
  );

  return (
    <SafeView
      safeAreaClassNames="bg-[#1B1B1E]"
      containerStyle={{ flex: 1, backgroundColor: "#1B1B1E" }}>
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
        className="flex-row items-center justify-between">
        <TouchableOpacity onPress={handleDiscard}>
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">
          {saving ? t("record.saving") : t("record.title")}
        </Text>
        <TouchableOpacity onPress={handleDiscard} disabled={saving}>
          <Trash size={22} color={saving ? "#3A3B3D" : "#9F9FA0"} />
        </TouchableOpacity>
      </View>

      <View className="flex-1 justify-center px-6">
        <WaveformRecorderView
          ref={recorderRef}
          output={{ format: "m4a" }}
          style={{ height: 120, marginBottom: 24 }}
          containerBackgroundColor="#27282A"
          containerBorderRadius={12}
          playedBarColor="#EF4444"
          unplayedBarColor="#3A3B3D"
          barWidth={4}
          barGap={3}
          showBackground
          showTime
          timeColor="#FFFFFF"
          onStateChange={({ state: newState }) => setState(newState)}
          onComplete={handleComplete}
          onError={handleError}
          onPermissionDenied={() => {
            Alert.alert(
              t("record.permissionDenied.title"),
              t("record.permissionDenied.message"),
            );
            onCancel();
          }}
        />

        <Text className="text-white/60 text-center mb-8">
          {state === "recording" ? t("record.recording") : ""}
        </Text>

        <TouchableOpacity
          onPress={handleStop}
          disabled={state !== "recording" || saving}
          className="w-16 h-16 rounded-full bg-[#EF4444] items-center justify-center self-center"
          style={{ opacity: state === "recording" && !saving ? 1 : 0.5 }}>
          <Stop size={28} color="#FFF" weight="fill" />
        </TouchableOpacity>
        <Text className="text-white/60 text-center mt-3">
          {t("record.stop")}
        </Text>
      </View>
    </SafeView>
  );
}
