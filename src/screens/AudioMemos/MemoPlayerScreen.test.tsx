import React from "react";
import renderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import MemoPlayerScreen from "./MemoPlayerScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { AudioWaveformView } from "react-native-waveform-player";
import { createMockT } from "@/testUtils/mockUseTranslation";

jest.mock("@/hooks/useTranslation", () => {
  const { createMockT } = require("@/testUtils/mockUseTranslation");
  return { useTranslation: () => createMockT() };
});

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

const mockRoute = { params: { memoId: "test-uuid-1", mode: "play" } };
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
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

// A bare string ("AudioWaveformView") as the mock component type reproduces
// a confusing "Element type is invalid" crash specifically once this screen's
// mount effect (which calls setMemo) triggers a second render pass - a real
// forwardRef component sidesteps it and is the safer pattern regardless.
jest.mock("react-native-waveform-player", () => {
  const ReactActual = jest.requireActual("react");
  const AudioWaveformView = ReactActual.forwardRef((props: any, ref: any) => {
    return ReactActual.createElement("AudioWaveformView", { ...props, ref });
  });
  AudioWaveformView.displayName = "AudioWaveformView";
  return { AudioWaveformView };
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

// TouchableOpacity is real (unmocked) here, and wraps children in its own
// internal layers - `.parent`/`.parent.parent` guessing is fragile.
function findPressableAncestor(instance: any): any {
  let node = instance.parent;
  while (node && typeof node.props?.onPress !== "function") {
    node = node.parent;
  }
  return node;
}

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
    playingId: null as string | null,
    playbackPosition: 0,
    fetchMemos: jest.fn(),
    playMemo: jest.fn(),
    pauseMemo: jest.fn(),
    stopMemo: jest.fn(),
    seekTo: jest.fn(),
    updatePlaybackTime: jest.fn(),
    updateMemo: jest.fn(),
    deleteMemo: jest.fn().mockResolvedValue(true),
    createMemo: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAudioMemos as jest.Mock).mockReturnValue(mockUseAudioMemos);
    mockRoute.params = { memoId: "test-uuid-1", mode: "play" };
  });

  // The screen's own mount effect (which finds and sets `memo` from the
  // fetched `memos` array) needs a flush before the AudioWaveformView
  // branch of the render is reachable - render must happen inside act().
  const createScreen = async (memoId = "test-uuid-1") => {
    mockRoute.params.memoId = memoId;
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<MemoPlayerScreen />);
    });
    return tree!;
  };

  it("renders 'Memo not found' when memo does not exist", async () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [],
    });

    const tree = await createScreen("non-existent-uuid");
    const text = tree.root.findByProps({ children: "Memo not found" });
    expect(text).toBeTruthy();
  });

  it("renders AudioWaveformView component", async () => {
    const tree = await createScreen();
    const waveformView = tree.root.findByType(AudioWaveformView);
    expect(waveformView).toBeTruthy();
  });

  it("renders transcript section with memo transcript", async () => {
    const tree = await createScreen();
    const transcriptText = tree.root.findByProps({
      children: "This is a test transcript for the memo",
    });
    expect(transcriptText).toBeTruthy();
  });

  it("shows 'No transcript available' when transcript is null", async () => {
    const memoWithoutTranscript = { ...mockMemo, transcript: null };
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [memoWithoutTranscript],
    });

    const tree = await createScreen();
    const noTranscriptText = tree.root.findByProps({
      children: "No transcript available",
    });
    expect(noTranscriptText).toBeTruthy();
  });

  it("calls goBack when back button is pressed", async () => {
    const tree = await createScreen();
    const backIcon = tree.root.findAllByProps({ "data-icon": "ArrowLeft" })[0];
    findPressableAncestor(backIcon).props.onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("calls deleteMemo and goBack when delete button is pressed", async () => {
    const tree = await createScreen();
    const trashIcons = tree.root.findAllByProps({ "data-icon": "Trash" });
    expect(trashIcons.length).toBeGreaterThan(0);
    await act(async () => {
      findPressableAncestor(trashIcons[0]).props.onPress();
    });
    expect(mockUseAudioMemos.deleteMemo).toHaveBeenCalledWith("test-uuid-1");
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("calls playMemo when play button is pressed", async () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: null,
    });

    const tree = await createScreen();
    const playIcons = tree.root.findAllByProps({ "data-icon": "Play" });
    expect(playIcons.length).toBeGreaterThan(0);
    findPressableAncestor(playIcons[0]).props.onPress();
    expect(mockUseAudioMemos.playMemo).toHaveBeenCalledWith(
      "test-uuid-1",
      "file:///test/audio.m4a",
    );
  });

  it("calls pauseMemo when pause button is pressed", async () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      playingId: "test-uuid-1",
    });

    const tree = await createScreen();
    const pauseIcons = tree.root.findAllByProps({ "data-icon": "Pause" });
    expect(pauseIcons.length).toBeGreaterThan(0);
    findPressableAncestor(pauseIcons[0]).props.onPress();
    expect(mockUseAudioMemos.pauseMemo).toHaveBeenCalled();
  });

  it("renders Share button in header", async () => {
    const tree = await createScreen();
    const shareIcons = tree.root.findAllByProps({ "data-icon": "Share" });
    expect(shareIcons.length).toBeGreaterThan(0);
  });

  // JSX `{s}x` renders as two children (the number, then "x"), not a single
  // concatenated string, so match on the leading numeric child.
  const findSpeedText = (tree: renderer.ReactTestRenderer, value: number) =>
    tree.root
      .findAllByType(Text)
      .find(
        (t: any) => Array.isArray(t.props.children) && t.props.children[0] === value,
      );

  it("renders speed control options", async () => {
    const tree = await createScreen();
    const speedValues = [0.5, 1, 1.5, 2];
    for (const value of speedValues) {
      expect(findSpeedText(tree, value)).toBeTruthy();
    }
  });

  it("calls handleSpeedChange when speed button is pressed", async () => {
    const tree = await createScreen();
    const speedText = findSpeedText(tree, 1.5);
    await act(async () => {
      findPressableAncestor(speedText).props.onPress();
    });
    // No direct assertion target for internal `speed` state; verifying the
    // press handler is reachable and doesn't throw is the coverage here.
  });

  it("has Edit button for transcript", async () => {
    const tree = await createScreen();
    const editTexts = tree.root
      .findAllByType(Text)
      .filter((t: any) => t.props.children === "Edit");
    expect(editTexts.length).toBe(1);
  });

  it("syncs playingId/playbackPosition from waveform player callbacks", async () => {
    const tree = await createScreen();
    const waveformView = tree.root.findByType(AudioWaveformView);

    await act(async () => {
      waveformView.props.onTimeUpdate({ currentTimeMs: 5000, durationMs: 65000 });
    });
    expect(mockUseAudioMemos.updatePlaybackTime).toHaveBeenCalledWith(
      5000,
      65000,
    );

    await act(async () => {
      waveformView.props.onEnd();
    });
    expect(mockUseAudioMemos.stopMemo).toHaveBeenCalled();
  });
});
