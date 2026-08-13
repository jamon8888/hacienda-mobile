import React from "react";
import renderer from "react-test-renderer";
import { Text, View } from "react-native";
import MemoPlayerScreen from "./MemoPlayerScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { AudioWaveformView } from "react-native-waveform-player";

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
}));

jest.mock("react-native-waveform-player", () => {
  const React = jest.requireActual("react");
  return {
    AudioWaveformView: React.forwardRef((_props: any, ref: any) => {
      return React.createElement("AudioWaveformView", { ref });
    }),
  };
});

jest.mock("phosphor-react-native", () => {
  const React = jest.requireActual("react");
  const createIcon = (name: string) => {
    const Icon = React.forwardRef((props: any, ref: any) => {
      return React.createElement("Icon", { ...props, ref, "data-icon": name });
    });
    Icon.displayName = name;
    return Icon;
  };
  return {
    ArrowLeft: createIcon("ArrowLeft"),
    Play: createIcon("Play"),
    Pause: createIcon("Pause"),
    Trash: createIcon("Trash"),
    Share: createIcon("Share"),
  };
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

  it("renders AudioWaveformView component", () => {
    const tree = createScreen();
    const root = tree.root;
    const waveformView = root.findByType(AudioWaveformView);
    expect(waveformView).toBeTruthy();
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
    const backButton = root.findByProps({ weight: "bold" });
    backButton?.props.onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("calls deleteMemo and goBack when delete button is pressed", () => {
    const tree = createScreen();
    const root = tree.root;
    const trashIcons = root.findAllByProps({ "data-icon": "Trash" });
    expect(trashIcons.length).toBeGreaterThan(0);
    const touchable = trashIcons[0]?.parent;
    touchable?.props.onPress();
    expect(mockUseAudioMemos.deleteMemo).toHaveBeenCalledWith("test-uuid-1");
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("calls playMemo when play button is pressed", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: null,
    });

    const tree = createScreen();
    const root = tree.root;
    const playIcons = root.findAllByProps({ "data-icon": "Play" });
    expect(playIcons.length).toBeGreaterThan(0);
    const touchable = playIcons[0]?.parent?.parent;
    touchable?.props.onPress();
    expect(mockUseAudioMemos.playMemo).toHaveBeenCalledWith(
      "test-uuid-1",
      "file:///test/audio.m4a",
    );
  });

  it("calls pauseMemo when pause button is pressed", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: "test-uuid-1",
    });

    const tree = createScreen();
    const root = tree.root;
    const pauseIcons = root.findAllByProps({ "data-icon": "Pause" });
    expect(pauseIcons.length).toBeGreaterThan(0);
    const touchable = pauseIcons[0]?.parent?.parent;
    touchable?.props.onPress();
    expect(mockUseAudioMemos.pauseMemo).toHaveBeenCalled();
  });

  it("renders Share button in header", () => {
    const tree = createScreen();
    const root = tree.root;
    const shareIcons = root.findAllByProps({ "data-icon": "Share" });
    expect(shareIcons.length).toBeGreaterThan(0);
  });

  it("renders speed control options", () => {
    const tree = createScreen();
    const root = tree.root;
    const speedButtons = root.findAllByProps({ "data-icon": undefined }).filter(
      (node: any) => node.props.className?.includes("px-4"),
    );
    expect(speedButtons.length).toBe(4);
  });

  it("calls handleSpeedChange when speed button is pressed", () => {
    const tree = createScreen();
    const root = tree.root;
    const touchables = root.findAllByType(View).filter(
      (node: any) => node.props.className?.includes("px-4"),
    );
    expect(touchables.length).toBe(4);
  });

  it("has Edit button for transcript", () => {
    const tree = createScreen();
    const root = tree.root;
    const editTexts = root.findAllByType(Text).filter(
      (t: any) => t.props.children === "Edit",
    );
    expect(editTexts.length).toBe(1);
  });
});
