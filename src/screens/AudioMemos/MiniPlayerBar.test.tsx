import React from "react";
import renderer, { act } from "react-test-renderer";
import MiniPlayerBar from "./MiniPlayerBar";
import {
  __resetAudioMemoPlayerForTests,
  useAudioMemoPlayer,
} from "@/hooks/useAudioMemoPlayer";
import { AudioWaveformView } from "react-native-waveform-player";

beforeEach(() => {
  __resetAudioMemoPlayerForTests();
});

// Renders the bar plus a hidden helper exposing the shared player controls,
// so tests can drive state through the real hook instead of reaching into
// module internals.
function Harness() {
  const player = useAudioMemoPlayer();
  (globalThis as any).__player = player;
  return <MiniPlayerBar />;
}

describe("MiniPlayerBar", () => {
  it("renders nothing when no memo is loaded", () => {
    const tree = renderer.create(<Harness />);
    expect(tree.root.findAllByType(AudioWaveformView)).toHaveLength(0);
  });

  it("renders a real AudioWaveformView once a memo is playing", () => {
    const tree = renderer.create(<Harness />);
    act(() => {
      (globalThis as any).__player.playMemo("memo-1", "file:///a.m4a");
    });
    const view = tree.root.findByType(AudioWaveformView);
    expect(view.props.source).toEqual({ uri: "file:///a.m4a" });
    expect(view.props.playing).toBe(true);
  });

  it("renders nothing once a focused MemoPlayerScreen owns the same memo", () => {
    const tree = renderer.create(<Harness />);
    act(() => {
      (globalThis as any).__player.playMemo("memo-1", "file:///a.m4a");
      (globalThis as any).__player.setFocusedPlayer("memo-1");
    });
    expect(tree.root.findAllByType(AudioWaveformView)).toHaveLength(0);
  });
});
