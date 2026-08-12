import { useState, useEffect, useCallback, useRef } from "react";
import { CactusSTT } from "cactus-react-native";
import VoiceAudioStream from "@/utils/AiProviders/onDevice/voice/VoiceAudioStream";
import { pcmBase64ToInt16Samples } from "@/utils/AiProviders/onDevice/voice/audioEncoding";
import {
  CACTUS_VOICE_MODELS,
  CactusVoiceModelId,
  DEFAULT_CACTUS_ASR_MODEL,
} from "@/utils/models/defaults";

interface UseVoiceTranscriptionReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  currentTranscript: string;
  isFinal: boolean;
  volume: number;
  error: Error | null;
}

export function useVoiceTranscription(): UseVoiceTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [isFinal, setIsFinal] = useState(false);
  const [volume, setVolume] = useState(0);
  const [error, setError] = useState<Error | null>(null);

  const asrModelRef = useRef<CactusSTT | null>(null);
  const audioStreamRef = useRef<VoiceAudioStream | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Initialize ASR model
  const initializeASR = useCallback(async () => {
    if (asrModelRef.current) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      try {
        const asrId: CactusVoiceModelId = DEFAULT_CACTUS_ASR_MODEL;
        const asrBundle = CACTUS_VOICE_MODELS[asrId];
        if (!asrBundle) throw new Error(`Unknown ASR model: ${asrId}`);

        asrModelRef.current = new CactusSTT({
          model: asrBundle.slug,
          options: { quantization: asrBundle.quantization, pro: asrBundle.pro },
        });

        await asrModelRef.current.download({
          onProgress: p => console.log("ASR download:", p),
        });
        await asrModelRef.current.init();
      } catch (err) {
        setError(err as Error);
        throw err;
      } finally {
        initPromiseRef.current = null;
      }
    })();

    return initPromiseRef.current;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioStreamRef.current?.stop().catch(console.error);
      asrModelRef.current?.destroy().catch(console.error);
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording) return; // no-op if already recording

    try {
      setError(null);
      setCurrentTranscript("");
      setIsFinal(false);

      await initializeASR();

      const audioStream = new VoiceAudioStream({ vadThreshold: 0.5 });

      audioStream.on("onSpeechSegment", async segment => {
        if (!segment.isFinal || !asrModelRef.current) return;

        try {
          const samples = pcmBase64ToInt16Samples(segment.audioBase64);
          const result = await asrModelRef.current.transcribe({
            audio: samples,
          });
          if (result.response) {
            setCurrentTranscript(result.response);
            setIsFinal(true);
          }
        } catch (err) {
          setError(err as Error);
        }
      });

      audioStream.on("onVolumeChange", v => setVolume(v));
      audioStream.on("onError", err => setError(err));

      await audioStream.start();
      audioStreamRef.current = audioStream;
      setIsRecording(true);
    } catch (err) {
      setError(err as Error);
    }
  }, [isRecording, initializeASR]);

  const stopRecording = useCallback(async () => {
    if (audioStreamRef.current) {
      await audioStreamRef.current.stop();
      audioStreamRef.current = null;
    }
    setIsRecording(false);
    setVolume(0);
  }, []);

  const cancelRecording = useCallback(async () => {
    await stopRecording();
    setCurrentTranscript("");
    setIsFinal(false);
  }, [stopRecording]);

  return {
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
    currentTranscript,
    isFinal,
    volume,
    error,
  };
}
