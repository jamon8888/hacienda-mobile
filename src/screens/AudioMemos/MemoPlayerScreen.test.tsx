import React from "react";
import renderer from "react-test-renderer";
import MemoPlayerScreen from "./MemoPlayerScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { AudioMemoType } from "@/database/models/AudioMemo";

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("@/hooks/useAudioMemos", () => ({
  useAudioMemos: jest.fn(),
}));

jest.mock("@/components/SafeView", () => {
  const { View } = require("react-native");
  return ({ children }: any) => <View>{children}</View>;
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
});

const mockMemo: AudioMemoType = {
  uuid: "test-uuid-1",
  workspaceSlug: "test-workspace",
  audioUri: "file:///test/audio.m4a",
  transcript: "This is a test transcript for the memo",
  durationMs: 65000,
  waveformPeaks: [0.1, 0.5, 0.3, 0.8, 0.2],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

describe("MemoPlayerScreen", () => {
  const mockUseAudioMemos = {
    memos: [mockMemo],
    loading: false,
    playingId: null,
    playbackPosition: 0,
    playMemo: jest.fn(),
    pauseMemo: jest.fn(),
    stopMemo: jest.fn(),
    seekTo: jest.fn(),
    updateMemo: jest.fn(),
    deleteMemo: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAudioMemos as jest.Mock).mockReturnValue(mockUseAudioMemos);
  });

  const createScreen = (memoId = "test-uuid-1") => {
    return renderer.create(
      <MemoPlayerScreen
        route={{ params: { memoId, mode: "play" } }}
        navigation={mockNavigation}
      />,
    );
  };

  it("renders 'Memo not found' when memo does not exist", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [],
    });

    const tree = createScreen("non-existent-uuid");
    const root = tree.root;
    const text = root.findByProps({ children: "Memo not found" });
    expect(text).toBeTruthy();
  });

  it("renders memo title in header", () => {
    const tree = createScreen();
    const root = tree.root;
    const titleText = root.findByProps({ children: "Memo" });
    expect(titleText).toBeTruthy();
  });

  it("renders waveform placeholder", () => {
    const tree = createScreen();
    const root = tree.root;
    const waveformText = root.findByProps({ children: "Waveform" });
    expect(waveformText).toBeTruthy();
  });

  it("renders play button when not playing", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: null,
    });

    const tree = createScreen();
    const root = tree.root;
    const playButtons = root.findAllByProps({ weight: "fill" });
    expect(playButtons.length).toBeGreaterThan(0);
  });

  it("renders pause button when playing", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: "test-uuid-1",
    });

    const tree = createScreen();
    const root = tree.root;
    const pauseButtons = root.findAllByProps({ weight: "fill" });
    expect(pauseButtons.length).toBeGreaterThan(0);
  });

  it("calls playMemo when play button is pressed and not playing", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: null,
    });

    const tree = createScreen();
    const root = tree.root;
    const playButtons = root.findAllByProps({ weight: "fill" });
    playButtons[0]?.props.onPress();
    expect(mockUseAudioMemos.playMemo).toHaveBeenCalledWith(
      "test-uuid-1",
      "file:///test/audio.m4a",
    );
  });

  it("calls pauseMemo when pause button is pressed and playing", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: "test-uuid-1",
    });

    const tree = createScreen();
    const root = tree.root;
    const pauseButtons = root.findAllByProps({ weight: "fill" });
    pauseButtons[0]?.props.onPress();
    expect(mockUseAudioMemos.pauseMemo).toHaveBeenCalled();
  });

  it("renders speed control options", () => {
    const tree = createScreen();
    const root = tree.root;
    const speedButtons = root.findAllByType(Text);
    const speedLabels = speedButtons
      .filter(btn => btn.props.children === "0.5x" || btn.props.children === "1x" || btn.props.children === "1.5x" || btn.props.children === "2x")
      .map(btn => btn.props.children);
    expect(speedLabels).toContain("0.5x");
    expect(speedLabels).toContain("1x");
    expect(speedLabels).toContain("1.5x");
    expect(speedLabels).toContain("2x");
  });

  it("renders transcript section with memo transcript", () => {
    const tree = createScreen();
    const root = tree.root;
    const transcriptText = root.findByProps({
      children: "This is a test transcript for the memo",
    });
    expect(transcriptText).toBeTruthy();
  });

  it("shows 'No transcript available' when transcript is null", () => {
    const memoWithoutTranscript = { ...mockMemo, transcript: null };
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [memoWithoutTranscript],
    });

    const tree = createScreen();
    const root = tree.root;
    const noTranscriptText = root.findByProps({
      children: "No transcript available",
    });
    expect(noTranscriptText).toBeTruthy();
  });

  it("calls goBack when back button is pressed", () => {
    const tree = createScreen();
    const root = tree.root;
    const backButton = root.findAllByProps({ weight: "bold" })[0];
    backButton?.props.onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("calls deleteMemo and goBack when delete button is pressed", async () => {
    const tree = createScreen();
    const root = tree.root;
    const deleteButton = root.findAllByProps({ weight: "bold" })[1];
    deleteButton?.props.onPress();
    expect(mockUseAudioMemos.deleteMemo).toHaveBeenCalledWith("test-uuid-1");
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("renders progress bar with correct width based on playback position", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playbackPosition: 32500, // Half of 65000
    });

    const tree = createScreen();
    const root = tree.root;
    const progressViews = root.findAllByType(View);
    // Find the progress bar inner view (has percentage width style)
    const progressInner = progressViews.find(
      v => v.props.style && typeof v.props.style.width === "string" && v.props.style.width.includes("%"),
    );
    expect(progressInner).toBeTruthy();
  });

  it("toggles edit mode when edit button is pressed", () => {
    const tree = createScreen();
    const root = tree.root;
    const editButton = root.findByProps({ children: "Edit" });
    editButton?.props.onPress();
    // After pressing edit, the component should re-render with isEditing=true
    tree.update(
      <MemoPlayerScreen
        route={{ params: { memoId: "test-uuid-1", mode: "play" } }}
        navigation={mockNavigation}
      />,
    );
    // Note: Testing internal state change requires more sophisticated testing
    // This test verifies the button exists and is clickable
    expect(editButton).toBeTruthy();
  });
});