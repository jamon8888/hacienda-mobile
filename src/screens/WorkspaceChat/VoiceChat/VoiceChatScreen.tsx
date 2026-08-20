// VoiceChatScreen.tsx - Main voice chat interface

import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  TouchableOpacity,
} from "react-native";
import { useRoute, RouteProp } from "@react-navigation/native";
import SafeView from "@/components/SafeView";
import { Microphone, X, SpeakerHigh, Sparkle } from "phosphor-react-native";
import {
  useVoicePipeline,
  VoicePipelineConfig,
} from "@/utils/AiProviders/onDevice/voice";
import {
  CACTUS_VOICE_MODELS,
  CactusVoiceModelId,
  DEFAULT_CACTUS_ASR_MODEL,
  DEFAULT_CACTUS_LLM_MODEL,
} from "@/utils/models/defaults";
import uiStore from "@/store/UIStore";

interface VoiceSettingsStorage {
  asrModel: CactusVoiceModelId;
  llmModel: CactusVoiceModelId;
  confidenceThreshold: number;
  autoHandoff: boolean;
  processingDelay: number;
  enableTTS: boolean;
  vadThreshold: number;
}

function isKnownModelId(
  id: unknown,
  recommendedFor: "transcription" | "voice-pipeline",
): id is CactusVoiceModelId {
  const model = typeof id === "string" ? CACTUS_VOICE_MODELS[id] : undefined;
  return model?.recommendedFor === recommendedFor;
}

/**
 * Loads the settings VoiceSettingsView persists to "voiceSettings" and turns them into a
 * VoicePipelineConfig. Model IDs are validated against the current catalog -- storage doesn't
 * enforce CactusVoiceModelId, and a stale/removed ID would otherwise reach
 * VoicePipelineProvider's constructor, which throws on an unknown registry lookup.
 */
async function loadVoicePipelineConfig(): Promise<VoicePipelineConfig> {
  const saved = await uiStore.getFromStorage<Partial<VoiceSettingsStorage>>(
    "voiceSettings",
    {},
  );
  const config: VoicePipelineConfig = {};
  if (isKnownModelId(saved.asrModel, "transcription"))
    config.asrModelId = saved.asrModel;
  if (isKnownModelId(saved.llmModel, "voice-pipeline"))
    config.llmModelId = saved.llmModel;
  if (saved.confidenceThreshold !== undefined)
    config.confidenceThreshold = saved.confidenceThreshold;
  if (saved.autoHandoff !== undefined) config.autoHandoff = saved.autoHandoff;
  if (saved.processingDelay !== undefined)
    config.processingDelayMs = saved.processingDelay;
  if (saved.enableTTS !== undefined) config.enableTTS = saved.enableTTS;
  if (saved.vadThreshold !== undefined)
    config.vadThreshold = saved.vadThreshold;
  return config;
}

const COLORS = {
  background: "#1B1B1E",
  surface: "#27282A",
  surfaceHover: "#2E2F31",
  border: "#3A3B3D",
  text: "#FFFFFF",
  textSecondary: "#9F9FA0",
  accent: "#3B82F6",
  accentHover: "#2563EB",
  success: "#6CE9A6",
  warning: "#FBBF24",
  error: "#F97066",
  recording: "#EF4444",
  thinking: "#8B5CF6",
};

const DEFAULT_VOICE_PIPELINE_CONFIG: VoicePipelineConfig = {
  asrModelId: DEFAULT_CACTUS_ASR_MODEL,
  llmModelId: DEFAULT_CACTUS_LLM_MODEL,
  confidenceThreshold: 0.7,
  autoHandoff: true,
  processingDelayMs: 50,
  enableTTS: true,
  vadThreshold: 0.5,
};

/**
 * useVoicePipeline constructs its VoicePipelineProvider once, via a lazy useState initializer
 * (see VoicePipelineProvider.ts) -- the config it's first called with is the config it keeps for
 * the lifetime of the component. So the settings VoiceSettingsView saves can only take effect if
 * they're loaded and merged in *before* this component (and therefore useVoicePipeline) ever
 * mounts, which is what this wrapper exists for.
 */
export default function VoiceChatScreen() {
  const route =
    useRoute<RouteProp<{ VoiceChat: { wsSlug?: string } }, "VoiceChat">>();
  const wsSlug = route.params?.wsSlug ?? null;
  const [config, setConfig] = useState<VoicePipelineConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadVoicePipelineConfig()
      .then(saved => {
        if (!cancelled)
          setConfig({
            ...DEFAULT_VOICE_PIPELINE_CONFIG,
            ...saved,
            workspaceSlug: wsSlug,
          });
      })
      .catch(err => {
        console.error("Failed to load voice settings:", err);
        if (!cancelled)
          setConfig({ ...DEFAULT_VOICE_PIPELINE_CONFIG, workspaceSlug: wsSlug });
      });
    return () => {
      cancelled = true;
    };
  }, [wsSlug]);

  if (!config) return null;
  return <VoiceChatScreenInner config={config} />;
}

function VoiceChatScreenInner({ config }: { config: VoicePipelineConfig }) {
  const {
    state,
    lastResponse,
    currentTranscript,
    error,
    volume,
    isRecording,
    initialize,
    startListening,
    stopListening,
  } = useVoicePipeline(config);

  const [isInitialized, setIsInitialized] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>(Array(50).fill(0));
  const waveformAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Initialize pipeline on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize()
        .then(() => setIsInitialized(true))
        .catch(console.error);
    }
  }, [initialize, isInitialized]);

  // Update waveform based on volume while recording, decay it to zero while idle. Previously
  // this depended on waveformData and called setWaveformData unconditionally on every trigger,
  // which reran the effect itself every render regardless of whether volume/isRecording had
  // actually changed ("Maximum update depth exceeded" -- observed in practice on-device).
  // The idle decay now runs on an interval instead of chaining off its own state.
  useEffect(() => {
    if (isRecording) {
      setWaveformData(prev => [
        ...prev.slice(1),
        volume * 50 + Math.random() * 10,
      ]);
      return;
    }
    // Stop once decay is effectively finished instead of running for the screen's entire idle
    // lifetime -- prev.map() below always returns a new array even once every value has
    // decayed near zero, so without this check React kept re-rendering on a 50ms timer for as
    // long as the screen stayed open.
    const DECAY_STOP_THRESHOLD = 0.1;
    const interval = setInterval(() => {
      // Updater stays pure (no clearInterval inside -- React may invoke it more than once,
      // e.g. in Strict Mode); `decayFinished` is only read after setState returns, so the
      // interval is stopped exactly once per tick regardless of how many times React called
      // the updater internally.
      let decayFinished = false;
      setWaveformData(prev => {
        if (prev.every(v => v < DECAY_STOP_THRESHOLD)) {
          decayFinished = true;
          return prev.every(v => v === 0) ? prev : prev.map(() => 0);
        }
        return prev.map(v => v * 0.9);
      });
      if (decayFinished) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [volume, isRecording]);

  // Pulse animation when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ).start();
    } else {
      pulseAnim.stopAnimation();
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isRecording]);

  // Show thinking animation when processing
  useEffect(() => {
    if (state === "thinking" || state === "transcribing") {
      Animated.loop(
        Animated.timing(waveformAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ).start();
    } else {
      waveformAnim.stopAnimation();
      Animated.timing(waveformAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [state]);

  const handleToggleRecording = async () => {
    try {
      if (isRecording) {
        await stopListening();
      } else {
        await startListening();
      }
    } catch (err) {
      console.error("Recording error:", err);
    }
  };

  const getStateColor = () => {
    switch (state) {
      case "listening":
        return COLORS.recording;
      case "transcribing":
        return COLORS.warning;
      case "thinking":
        return COLORS.thinking;
      case "responding":
        return COLORS.success;
      case "error":
        return COLORS.error;
      default:
        return COLORS.textSecondary;
    }
  };

  const getStateLabel = () => {
    switch (state) {
      case "idle":
        return "Tap to start";
      case "initializing":
        return "Loading models...";
      case "listening":
        return "Listening...";
      case "transcribing":
        return "Transcribing...";
      case "thinking":
        return "Thinking...";
      case "responding":
        return "Responding...";
      case "error":
        return "Error occurred";
      default:
        return "Unknown";
    }
  };

  const renderWaveform = () => {
    return (
      <View style={styles.waveformContainer}>
        {waveformData.map((value, index) => (
          <Animated.View
            key={index}
            style={[
              styles.waveformBar,
              {
                height: Math.max(value, 4),
                backgroundColor: isRecording ? COLORS.recording : COLORS.accent,
              },
            ]}
          />
        ))}
      </View>
    );
  };

  const renderTranscript = () => {
    if (!currentTranscript.text) return null;

    return (
      <View style={styles.transcriptContainer}>
        <Text
          style={[
            styles.transcriptText,
            { color: currentTranscript.isFinal ? COLORS.text : COLORS.warning },
          ]}>
          {currentTranscript.text}
          {!currentTranscript.isFinal && (
            <Text style={styles.pendingIndicator}>&nbsp;▌</Text>
          )}
        </Text>
      </View>
    );
  };

  const renderLastResponse = () => {
    if (!lastResponse) return null;

    return (
      <View style={styles.responseContainer}>
        <View style={styles.responseHeader}>
          <Text style={styles.responseLabel}>Response</Text>
          <View style={styles.responseMeta}>
            <Text style={styles.metaItem}>
              {lastResponse.metrics.asrLatencyMs}ms ASR
            </Text>
            <Text style={styles.metaItem}>
              {lastResponse.metrics.llmLatencyMs}ms LLM
            </Text>
            {lastResponse.cloudHandoff && (
              <Text style={[styles.metaItem, { color: COLORS.accent }]}>
                ☁ Cloud
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.responseText}>{lastResponse.text}</Text>
        {lastResponse.thinking && (
          <View style={styles.thinkingBlock}>
            <Text style={styles.thinkingLabel}>Thinking</Text>
            <Text style={styles.thinkingText}>{lastResponse.thinking}</Text>
          </View>
        )}
        <View style={styles.confidenceBar}>
          <View
            style={[
              styles.confidenceFill,
              { width: `${lastResponse.confidence * 100}%` },
            ]}
          />
          <Text style={styles.confidenceLabel}>
            Confidence: {(lastResponse.confidence * 100).toFixed(0)}%
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeView
      safeAreaClassNames="bg-[#1B1B1E]"
      containerStyle={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Voice Assistant</Text>
        <View style={styles.headerActions}>
          <Animated.View
            style={[
              styles.statusDot,
              { backgroundColor: getStateColor() },
              { transform: [{ scale: pulseAnim }] },
            ]}
          />
          <Text style={[styles.stateLabel, { color: getStateColor() }]}>
            {getStateLabel()}
          </Text>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {/* Waveform Visualization */}
        <View style={styles.waveformWrapper}>
          <Animated.View
            style={[
              styles.centralCircle,
              {
                transform: [{ scale: pulseAnim }],
                borderColor: isRecording ? COLORS.recording : COLORS.accent,
              },
            ]}>
            {state === "thinking" && (
              <Sparkle size={32} color={COLORS.thinking} weight="bold" />
            )}
            {state === "transcribing" && (
              <SpeakerHigh size={32} color={COLORS.warning} weight="bold" />
            )}
            {state === "listening" && (
              <Microphone size={32} color={COLORS.recording} weight="bold" />
            )}
            {(state === "idle" || state === "responding") && (
              <Microphone
                size={32}
                color={COLORS.textSecondary}
                weight="regular"
              />
            )}
          </Animated.View>

          {renderWaveform()}
        </View>

        {/* Transcript Display */}
        {renderTranscript()}

        {/* Last Response */}
        {renderLastResponse()}

        {/* Error Display */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error.message}</Text>
          </View>
        )}
      </View>

      {/* Control Buttons */}
      <View style={styles.controls}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.mainButton,
            isRecording ? styles.mainButtonRecording : styles.mainButtonIdle,
            { transform: [{ scale: pulseAnim }] },
          ]}
          onPress={handleToggleRecording}>
          <Animated.View style={[{ transform: [{ scale: pulseAnim }] }]}>
            {isRecording ? (
              <X size={28} color="#FFF" weight="bold" />
            ) : (
              <Microphone size={28} color="#FFF" weight="bold" />
            )}
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Help Text */}
      <View style={styles.helpText}>
        <Text style={styles.helpTextItem}>
          Hold to speak · Releases on silence
        </Text>
        {state === "thinking" && (
          <Text style={[styles.helpTextItem, { color: COLORS.thinking }]}>
            Processing with Gemma 4 E2B Hybrid...
          </Text>
        )}
      </View>
    </SafeView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stateLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  waveformWrapper: {
    alignItems: "center",
    marginBottom: 24,
  },
  centralCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: COLORS.accent,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  waveformContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 3,
    marginTop: 16,
    height: 60,
  },
  waveformBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 4,
  },
  transcriptContainer: {
    width: "100%",
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  transcriptText: {
    fontSize: 16,
    lineHeight: 24,
  },
  pendingIndicator: {
    color: COLORS.warning,
    fontWeight: "bold",
  },
  responseContainer: {
    width: "100%",
    padding: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  responseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  responseLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  responseMeta: {
    flexDirection: "row",
    gap: 12,
  },
  metaItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text,
    marginBottom: 12,
  },
  thinkingBlock: {
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.thinking,
    marginBottom: 12,
  },
  thinkingLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.thinking,
    marginBottom: 4,
  },
  thinkingText: {
    fontSize: 14,
    color: COLORS.text,
    fontStyle: "italic",
  },
  confidenceBar: {
    height: 6,
    backgroundColor: COLORS.background,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  confidenceFill: {
    height: "100%",
    backgroundColor: COLORS.success,
    borderRadius: 3,
  },
  confidenceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  errorContainer: {
    width: "100%",
    padding: 12,
    backgroundColor: "rgba(249, 112, 102, 0.1)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.error,
    marginBottom: 16,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 14,
    textAlign: "center",
  },
  controls: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    alignItems: "center",
  },
  mainButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  mainButtonIdle: {
    backgroundColor: COLORS.accent,
  },
  mainButtonRecording: {
    backgroundColor: COLORS.recording,
  },
  helpText: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 4,
  },
  helpTextItem: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
});

export { VoiceChatScreen };
