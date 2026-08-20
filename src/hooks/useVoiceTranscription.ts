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
  const recordingRef = useRef(false);
  const mountedRef = useRef(true);

  // Initialize ASR model
  const initializeASR = useCallback(async () => {
    if (asrModelRef.current) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    initPromiseRef.current = (async () => {
      try {
        const asrId: CactusVoiceModelId = DEFAULT_CACTUS_ASR_MODEL;
        const asrBundle = CACTUS_VOICE_MODELS[asrId];
        if (!asrBundle) throw new Error(`Unknown ASR model: ${asrId}`);

        const model = new CactusSTT({
          model: asrBundle.slug,
          options: { quantization: asrBundle.quantization, pro: asrBundle.pro },
        });

        await model.download({
          onProgress: p => console.log("ASR download:", p),
        });
        await model.init();
        asrModelRef.current = model;
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      audioStreamRef.current?.stop().catch(console.error);
      asrModelRef.current?.destroy().catch(console.error);
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (recordingRef.current) return; // no-op if already recording
    recordingRef.current = true;

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
          if (result.response && mountedRef.current) {
            setCurrentTranscript(result.response);
            setIsFinal(true);
          }
        } catch (err) {
          if (mountedRef.current) setError(err as Error);
        }
      });

      audioStream.on("onVolumeChange", v => setVolume(v));
      audioStream.on("onError", err => setError(err));

      await audioStream.start();
      if (!recordingRef.current) {
        // stopRecording() ran while we were awaiting start() (a fast
        // tap-release) - audioStreamRef was never set so stopRecording had
        // nothing to stop. Stop this now-orphaned stream instead of handing
        // it back and marking recording as active after the user released.
        await audioStream.stop();
        return;
      }
      audioStreamRef.current = audioStream;
      setIsRecording(true);
    } catch (err) {
      recordingRef.current = false;
      setError(err as Error);
    }
  }, [initializeASR]);

  const stopRecording = useCallback(async () => {
    recordingRef.current = false;
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
