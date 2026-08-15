import React from "react";
import renderer, { act } from "react-test-renderer";
import { MicButton } from "./MicButton";
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

describe("MicButton", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls onTranscriptReady when isFinal and transcript is non-empty", async () => {
    const onTranscriptReady = jest.fn();
    const mockStopRecording = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: true,
      startRecording: jest.fn(),
      stopRecording: mockStopRecording,
      cancelRecording: jest.fn(),
      currentTranscript: "hello world",
      isFinal: true,
      volume: 0.5,
      error: null,
    });

    await act(async () => {
      renderer.create(<MicButton onTranscriptReady={onTranscriptReady} />);
    });

    expect(onTranscriptReady).toHaveBeenCalledWith("hello world");
    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("does not call onTranscriptReady when transcript is empty", async () => {
    const onTranscriptReady = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: false,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "",
      isFinal: true,
      volume: 0,
      error: null,
    });

    await act(async () => {
      renderer.create(<MicButton onTranscriptReady={onTranscriptReady} />);
    });

    expect(onTranscriptReady).not.toHaveBeenCalled();
  });

  it("does not call onTranscriptReady when not final", async () => {
    const onTranscriptReady = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: true,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "partial",
      isFinal: false,
      volume: 0.5,
      error: null,
    });

    await act(async () => {
      renderer.create(<MicButton onTranscriptReady={onTranscriptReady} />);
    });

    expect(onTranscriptReady).not.toHaveBeenCalled();
  });

  it("calls startRecording on press in", () => {
    const mockStartRecording = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: false,
      startRecording: mockStartRecording,
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "",
      isFinal: false,
      volume: 0,
      error: null,
    });

    const tree = renderer.create(<MicButton onTranscriptReady={jest.fn()} />);
    const root = tree.root;
    const touchable = root.findByProps({ testID: "mic-button" });
    touchable.props.onPressIn();

    expect(mockStartRecording).toHaveBeenCalled();
  });

  it("calls stopRecording on press out", () => {
    const mockStopRecording = jest.fn();
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: true,
      startRecording: jest.fn(),
      stopRecording: mockStopRecording,
      cancelRecording: jest.fn(),
      currentTranscript: "",
      isFinal: false,
      volume: 0.5,
      error: null,
    });

    const tree = renderer.create(<MicButton onTranscriptReady={jest.fn()} />);
    const root = tree.root;
    const touchable = root.findByProps({ testID: "mic-button" });
    touchable.props.onPressOut();

    expect(mockStopRecording).toHaveBeenCalled();
  });

  it("renders error icon when error is present", () => {
    (useVoiceTranscription as jest.Mock).mockReturnValue({
      isRecording: false,
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      cancelRecording: jest.fn(),
      currentTranscript: "",
      isFinal: false,
      volume: 0,
      error: new Error("Test error"),
    });

    const tree = renderer.create(<MicButton onTranscriptReady={jest.fn()} />);
    const root = tree.root;
    const errorIcon = root.findByProps({ testID: "mic-button-error" });
    expect(errorIcon).toBeTruthy();
  });
});
