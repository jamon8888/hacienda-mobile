import React from "react";
import { TouchableOpacity, Pressable } from "react-native";
import renderer from "react-test-renderer";
import MemoRow from "./MemoRow";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { createMockT } from "@/testUtils/mockUseTranslation";

jest.mock("@/hooks/useTranslation", () => {
  const { createMockT } = require("@/testUtils/mockUseTranslation");
  return { useTranslation: () => createMockT() };
});

const mockMemo: AudioMemoType = {
  uuid: "test-uuid-1",
  workspaceSlug: "test-workspace",
  audioUri: "file:///test/audio.m4a",
  transcript: "This is a test transcript for the memo",
  durationMs: 65000,
  waveformPeaks: [0.1, 0.5, 0.3, 0.8, 0.2],
  vectorBoxIds: [],
  createdAt: Date.now() - 86400000,
  updatedAt: Date.now() - 86400000,
};

describe("MemoRow", () => {
  const defaultProps = {
    memo: mockMemo,
    isActive: false,
    isPlaying: false,
    onPlay: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onDelete: jest.fn(),
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders memo title from transcript", () => {
    const shortMemo = { ...mockMemo, transcript: "Short transcript" };
    const tree = renderer.create(
      <MemoRow {...defaultProps} memo={shortMemo} />,
    );
    const root = tree.root;
    const titleText = root.findByProps({ numberOfLines: 1 });
    expect(titleText.props.children).toBe("Short transcript");
  });

  it("renders 'Untitled Memo' when transcript is null", () => {
    const memoWithoutTranscript = { ...mockMemo, transcript: null };
    const tree = renderer.create(
      <MemoRow {...defaultProps} memo={memoWithoutTranscript} />,
    );
    const root = tree.root;
    const titleText = root.findByProps({ numberOfLines: 1 });
    expect(titleText.props.children).toBe("Untitled Memo");
  });

  it("truncates long transcripts to 30 characters", () => {
    const longTranscript = "A".repeat(50);
    const memoWithLongTranscript = { ...mockMemo, transcript: longTranscript };
    const tree = renderer.create(
      <MemoRow {...defaultProps} memo={memoWithLongTranscript} />,
    );
    const root = tree.root;
    const titleText = root.findByProps({ numberOfLines: 1 });
    expect(titleText.props.children).toBe("A".repeat(30) + "...");
  });

  it("trims trailing spaces before ellipsis", () => {
    const spacedTranscript = "Hello world this is a test transcript  ";
    const memoWithSpaces = { ...mockMemo, transcript: spacedTranscript };
    const tree = renderer.create(
      <MemoRow {...defaultProps} memo={memoWithSpaces} />,
    );
    const root = tree.root;
    const titleText = root.findByProps({ numberOfLines: 1 });
    expect(titleText.props.children).toBe("Hello world this is a test tra...");
  });

  it("calls onPress when row is pressed", () => {
    const tree = renderer.create(<MemoRow {...defaultProps} />);
    const root = tree.root;
    const row = root.findAllByType(TouchableOpacity)[0];
    row?.props.onPress();
    expect(defaultProps.onPress).toHaveBeenCalled();
  });

  it("calls onPlay when play button is pressed and this row is not active", () => {
    const tree = renderer.create(
      <MemoRow {...defaultProps} isActive={false} isPlaying={false} />,
    );
    const root = tree.root;
    const playButton = root.findAllByType(Pressable)[0];
    playButton?.props.onPress();
    expect(defaultProps.onPlay).toHaveBeenCalled();
  });

  it("calls onPause when pause button is pressed and this row is playing", () => {
    const tree = renderer.create(
      <MemoRow {...defaultProps} isActive={true} isPlaying={true} />,
    );
    const root = tree.root;
    const pauseButton = root.findAllByType(Pressable)[0];
    pauseButton?.props.onPress();
    expect(defaultProps.onPause).toHaveBeenCalled();
  });

  it("calls onResume when play button is pressed and this row is active but paused", () => {
    const tree = renderer.create(
      <MemoRow {...defaultProps} isActive={true} isPlaying={false} />,
    );
    const root = tree.root;
    const playButton = root.findAllByType(Pressable)[0];
    playButton?.props.onPress();
    expect(defaultProps.onResume).toHaveBeenCalled();
    expect(defaultProps.onPlay).not.toHaveBeenCalled();
  });

  it("calls onDelete when delete button is pressed", () => {
    const tree = renderer.create(<MemoRow {...defaultProps} />);
    const root = tree.root;
    const deleteButton = root.findAllByType(Pressable)[1];
    deleteButton?.props.onPress();
    expect(defaultProps.onDelete).toHaveBeenCalled();
  });
});
