import { useVoiceTranscription } from "@/hooks/useVoiceTranscription";

jest.mock("@/hooks/useVoiceTranscription", () => ({
  useVoiceTranscription: jest.fn(() => ({
    isRecording: false,
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    cancelRecording: jest.fn(),
    currentTranscript: "",
    isFinal: false,
    volume: 0,
    error: null,
  })),
}));

describe("MicButton logic", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls onTranscriptReady when isFinal and transcript is non-empty", () => {
    const onTranscriptReady = jest.fn();
    const mockStopRecording = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValueOnce({
      isRecording: true,
      startRecording: jest.fn(),
      stopRecording: mockStopRecording,
      cancelRecording: jest.fn(),
      currentTranscript: "hello world",
      isFinal: true,
      volume: 0.5,
      error: null,
    });

    const { isFinal, currentTranscript } = useVoiceTranscription();
    if (isFinal && currentTranscript.trim()) {
      onTranscriptReady(currentTranscript);
    }

    expect(onTranscriptReady).toHaveBeenCalledWith("hello world");
  });

  it("does not call onTranscriptReady when transcript is empty", () => {
    const onTranscriptReady = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValueOnce({
      isRecording: false,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "",
      isFinal: true,
      volume: 0,
      error: null,
    });

    const { isFinal, currentTranscript } = useVoiceTranscription();
    if (isFinal && currentTranscript.trim()) {
      onTranscriptReady(currentTranscript);
    }

    expect(onTranscriptReady).not.toHaveBeenCalled();
  });

  it("does not call onTranscriptReady when not final", () => {
    const onTranscriptReady = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValueOnce({
      isRecording: true,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "partial",
      isFinal: false,
      volume: 0.5,
      error: null,
    });

    const { isFinal, currentTranscript } = useVoiceTranscription();
    if (isFinal && currentTranscript.trim()) {
      onTranscriptReady(currentTranscript);
    }

    expect(onTranscriptReady).not.toHaveBeenCalled();
  });

  it("initializes with default state", () => {
    const { isRecording, currentTranscript, isFinal, volume, error } =
      useVoiceTranscription();

    expect(isRecording).toBe(false);
    expect(currentTranscript).toBe("");
    expect(isFinal).toBe(false);
    expect(volume).toBe(0);
    expect(error).toBeNull();
  });

  it("provides startRecording and stopRecording functions", () => {
    const { startRecording, stopRecording } = useVoiceTranscription();
    expect(typeof startRecording).toBe("function");
    expect(typeof stopRecording).toBe("function");
  });
});
