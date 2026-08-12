import { pcmBase64ToInt16Samples } from "@/utils/AiProviders/onDevice/voice/audioEncoding";

const mockSttInstance = {
  download: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
  transcribe: jest.fn().mockResolvedValue({
    success: true,
    response: "hello world",
    confidence: 0.95,
  }),
  destroy: jest.fn().mockResolvedValue(undefined),
};

const mockCactusSTT = jest.fn().mockImplementation(() => mockSttInstance);
jest.mock("cactus-react-native", () => ({
  CactusSTT: mockCactusSTT,
}));

jest.mock("@/utils/models/defaults", () => ({
  CACTUS_VOICE_MODELS: {
    "parakeet-tdt-0.6b-v3-int4": {
      name: "Parakeet TDT 0.6B (4-bit)",
      slug: "parakeet-tdt-0.6b-v3",
      quantization: "int4",
    },
  },
  DEFAULT_CACTUS_ASR_MODEL: "parakeet-tdt-0.6b-v3-int4",
}));

type SpeechSegmentHandler = (segment: {
  audioBase64: string;
  isFinal: boolean;
}) => void;

let audioStreamHandlers: Record<string, (...args: unknown[]) => void>;
const mockAudioStreamInstance = {
  on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    audioStreamHandlers[event] = cb;
    return () => {
      delete audioStreamHandlers[event];
    };
  }),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};
jest.mock("@/utils/AiProviders/onDevice/voice/VoiceAudioStream", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockAudioStreamInstance),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderHook, act } = require("@testing-library/react-hooks");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useVoiceTranscription } = require("./useVoiceTranscription");

beforeEach(() => {
  jest.clearAllMocks();
  audioStreamHandlers = {};
});

function emitSpeechSegment(audioBase64: string, isFinal = true) {
  const handler = audioStreamHandlers.onSpeechSegment as SpeechSegmentHandler;
  return handler({ audioBase64, isFinal });
}

function emitVolumeChange(volume: number) {
  const handler = audioStreamHandlers.onVolumeChange;
  return handler(volume);
}

describe("useVoiceTranscription", () => {
  it("initializes with correct default state", () => {
    const { result } = renderHook(() => useVoiceTranscription());

    expect(result.current.isRecording).toBe(false);
    expect(result.current.currentTranscript).toBe("");
    expect(result.current.isFinal).toBe(false);
    expect(result.current.volume).toBe(0);
    expect(result.current.error).toBeNull();
  });

  describe("startRecording", () => {
    it("initializes ASR model and starts audio stream", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(mockCactusSTT).toHaveBeenCalledWith({
        model: "parakeet-tdt-0.6b-v3",
        options: { quantization: "int4", pro: undefined },
      });
      expect(mockSttInstance.download).toHaveBeenCalled();
      expect(mockSttInstance.init).toHaveBeenCalled();
      expect(mockAudioStreamInstance.start).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(true);
    });

    it("sets error when ASR initialization fails", async () => {
      mockSttInstance.download.mockRejectedValueOnce(
        new Error("Download failed"),
      );

      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Download failed");
    });

    it("sets error when audio stream fails to start", async () => {
      mockAudioStreamInstance.start.mockRejectedValueOnce(
        new Error("Microphone permission denied"),
      );

      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe(
        "Microphone permission denied",
      );
    });
  });

  describe("speech segment handling", () => {
    it("transcribes audio and updates transcript on final segment", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        emitSpeechSegment("AAABAA==", true);
      });

      expect(mockSttInstance.transcribe).toHaveBeenCalledWith({
        audio: pcmBase64ToInt16Samples("AAABAA=="),
      });
      expect(result.current.currentTranscript).toBe("hello world");
      expect(result.current.isFinal).toBe(true);
    });

    it("ignores non-final speech segments", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        emitSpeechSegment("AAABAA==", false);
      });

      expect(mockSttInstance.transcribe).not.toHaveBeenCalled();
      expect(result.current.currentTranscript).toBe("");
    });

    it("sets error when transcription fails", async () => {
      mockSttInstance.transcribe.mockRejectedValueOnce(
        new Error("Transcription failed"),
      );

      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        emitSpeechSegment("AAABAA==", true);
      });

      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe("Transcription failed");
    });
  });

  describe("volume tracking", () => {
    it("updates volume from audio stream events", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      act(() => {
        emitVolumeChange(0.75);
      });

      expect(result.current.volume).toBe(0.75);
    });
  });

  describe("stopRecording", () => {
    it("stops audio stream and resets state", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      expect(mockAudioStreamInstance.stop).toHaveBeenCalled();
      expect(result.current.isRecording).toBe(false);
      expect(result.current.volume).toBe(0);
    });
  });

  describe("cancelRecording", () => {
    it("stops recording and clears transcript", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        emitSpeechSegment("AAABAA==", true);
      });

      expect(result.current.currentTranscript).toBe("hello world");

      await act(async () => {
        await result.current.cancelRecording();
      });

      expect(result.current.isRecording).toBe(false);
      expect(result.current.currentTranscript).toBe("");
      expect(result.current.isFinal).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("destroys ASR model and stops stream on unmount", async () => {
      const { result, unmount } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      unmount();

      expect(mockAudioStreamInstance.stop).toHaveBeenCalled();
      expect(mockSttInstance.destroy).toHaveBeenCalled();
    });
  });

  describe("deduplication", () => {
    it("does not re-initialize ASR if already initialized", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      await act(async () => {
        await result.current.stopRecording();
      });

      await act(async () => {
        await result.current.startRecording();
      });

      expect(mockCactusSTT).toHaveBeenCalledTimes(1);
      expect(mockSttInstance.download).toHaveBeenCalledTimes(1);
      expect(mockSttInstance.init).toHaveBeenCalledTimes(1);
    });

    it("does not create second stream if already recording", async () => {
      const { result } = renderHook(() => useVoiceTranscription());

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.isRecording).toBe(true);
      const firstStartCallCount =
        mockAudioStreamInstance.start.mock.calls.length;

      await act(async () => {
        await result.current.startRecording();
      });

      // Second call should be a no-op
      expect(mockAudioStreamInstance.start).toHaveBeenCalledTimes(
        firstStartCallCount,
      );
      expect(result.current.isRecording).toBe(true);
    });
  });
});
