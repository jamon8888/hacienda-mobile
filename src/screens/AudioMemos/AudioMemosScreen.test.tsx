import React from "react";
import renderer from "react-test-renderer";
import AudioMemosScreen from "./AudioMemosScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { AudioMemoType } from "@/database/models/AudioMemo";

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock("@react-navigation/drawer", () => ({
  DrawerNavigationProp: jest.fn(),
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

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  RN.Alert.alert = jest.fn();
  return RN;
});

const mockMemos: AudioMemoType[] = [
  {
    uuid: "test-uuid-1",
    workspaceSlug: "test-workspace",
    audioUri: "file:///test/audio1.m4a",
    transcript: "First memo transcript",
    durationMs: 30000,
    waveformPeaks: [0.1, 0.5, 0.3],
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
  },
  {
    uuid: "test-uuid-2",
    workspaceSlug: "test-workspace",
    audioUri: "file:///test/audio2.m4a",
    transcript: "Second memo transcript",
    durationMs: 45000,
    waveformPeaks: [0.2, 0.6, 0.4],
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 172800000,
  },
];

describe("AudioMemosScreen", () => {
  const mockUseAudioMemos = {
    memos: mockMemos,
    loading: false,
    playingId: null,
    fetchMemos: jest.fn(),
    deleteMemo: jest.fn(),
    playMemo: jest.fn(),
    pauseMemo: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAudioMemos as jest.Mock).mockReturnValue(mockUseAudioMemos);
  });

  it("renders loading state correctly", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      loading: true,
      memos: [],
    });

    const tree = renderer.create(<AudioMemosScreen />);
    const root = tree.root;
    const activityIndicator = root.findByProps({ size: "large" });
    expect(activityIndicator).toBeTruthy();
  });

  it("renders empty state when no memos", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [],
    });

    const tree = renderer.create(<AudioMemosScreen />);
    const root = tree.root;
    const emptyText = root.findByProps({
      children: "No memos yet.\nTap + to record your first memo.",
    });
    expect(emptyText).toBeTruthy();
  });

  it("renders memo list when memos exist", () => {
    const tree = renderer.create(<AudioMemosScreen />);
    const root = tree.root;
    const flatList = root.findByProps({ keyExtractor: expect.any(Function) });
    expect(flatList).toBeTruthy();
  });

  it("calls fetchMemos on mount with workspace filter", () => {
    renderer.create(<AudioMemosScreen />);
    expect(mockUseAudioMemos.fetchMemos).toHaveBeenCalledWith("current");
  });

  it("calls goBack when back button is pressed", () => {
    const tree = renderer.create(<AudioMemosScreen />);
    const root = tree.root;
    const backButton = root.findAllByProps({ weight: "bold" })[0];
    backButton?.props.onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("navigates to record mode when plus button is pressed", () => {
    const tree = renderer.create(<AudioMemosScreen />);
    const root = tree.root;
    const plusButton = root.findAllByProps({ weight: "bold" })[1];
    plusButton?.props.onPress();
    expect(mockNavigation.navigate).toHaveBeenCalledWith("audio_memo_player", {
      mode: "record",
    });
  });
});
