import React, { useCallback } from "react";
import { TouchableOpacity, View, ActivityIndicator } from "react-native";
import { Microphone, MicrophoneSlash } from "phosphor-react-native";
import { useVoiceTranscription } from "@/hooks/useVoiceTranscription";

interface MicButtonProps {
  onTranscriptReady: (text: string) => void;
}

export function MicButton({ onTranscriptReady }: MicButtonProps) {
  const {
    isRecording,
    startRecording,
    stopRecording,
    currentTranscript,
    isFinal,
    error,
  } = useVoiceTranscription();

  const handlePressIn = useCallback(() => {
    startRecording();
  }, [startRecording]);

  const handlePressOut = useCallback(() => {
    if (isFinal && currentTranscript.trim()) {
      onTranscriptReady(currentTranscript);
    }
    stopRecording();
  }, [isFinal, currentTranscript, onTranscriptReady, stopRecording]);

  return (
    <TouchableOpacity
      testID="mic-button"
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.7}
      className={`p-2 rounded-full ${
        isRecording ? "bg-red-500/20" : "bg-white/10"
      }`}>
      {isRecording ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" color="#EF4444" />
          <Microphone size={20} color="#EF4444" weight="fill" />
        </View>
      ) : error ? (
        <MicrophoneSlash
          testID="mic-button-error"
          size={20}
          color="#9F9FA0"
        />
      ) : (
        <Microphone size={20} color="#9F9FA0" />
      )}
    </TouchableOpacity>
  );
}
