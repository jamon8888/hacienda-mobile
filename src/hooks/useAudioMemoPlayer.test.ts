import {
  useAudioMemoPlayer,
  __resetAudioMemoPlayerForTests,
} from "./useAudioMemoPlayer";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderHook, act } = require("@testing-library/react-hooks");

beforeEach(() => {
  __resetAudioMemoPlayerForTests();
});

describe("useAudioMemoPlayer", () => {
  it("starts with no memo loaded", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());
    expect(result.current.playingId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentAudioUri).toBeNull();
  });

  it("sets playingId, currentAudioUri and isPlaying on playMemo", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());

    act(() => {
      result.current.playMemo("memo-1", "file:///a.m4a");
    });

    expect(result.current.playingId).toBe("memo-1");
    expect(result.current.currentAudioUri).toBe("file:///a.m4a");
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playbackPosition).toBe(0);
  });

  it("keeps playingId but clears isPlaying on pauseMemo, and resumeMemo restores it", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());

    act(() => {
      result.current.playMemo("memo-1", "file:///a.m4a");
      result.current.updatePlaybackTime(9000, 30000);
      result.current.pauseMemo();
    });

    expect(result.current.playingId).toBe("memo-1");
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playbackPosition).toBe(9000);

    act(() => {
      result.current.resumeMemo();
    });

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.playbackPosition).toBe(9000);
  });

  it("does nothing on resumeMemo when no memo is loaded", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());

    act(() => {
      result.current.resumeMemo();
    });

    expect(result.current.playingId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it("fully clears state on stopMemo but preserves focusedPlayerMemoId", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());

    act(() => {
      result.current.playMemo("memo-1", "file:///a.m4a");
      result.current.setFocusedPlayer("memo-1");
      result.current.stopMemo();
    });

    expect(result.current.playingId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.currentAudioUri).toBeNull();
    expect(result.current.playbackPosition).toBe(0);
    expect(result.current.focusedPlayerMemoId).toBe("memo-1");
  });

  it("shares state across separate hook instances (e.g. two mounted screens)", () => {
    const listScreen = renderHook(() => useAudioMemoPlayer());
    const playerScreen = renderHook(() => useAudioMemoPlayer());

    act(() => {
      listScreen.result.current.playMemo("memo-1", "file:///a.m4a");
    });

    expect(playerScreen.result.current.playingId).toBe("memo-1");
    expect(playerScreen.result.current.isPlaying).toBe(true);
  });

  it("isOwnedByFocusedPlayer reflects the registered focused player's memo", () => {
    const { result } = renderHook(() => useAudioMemoPlayer());

    act(() => {
      result.current.playMemo("memo-1", "file:///a.m4a");
    });
    expect(result.current.isOwnedByFocusedPlayer("memo-1")).toBe(false);

    act(() => {
      result.current.setFocusedPlayer("memo-1");
    });
    expect(result.current.isOwnedByFocusedPlayer("memo-1")).toBe(true);
    expect(result.current.isOwnedByFocusedPlayer("memo-2")).toBe(false);

    act(() => {
      result.current.setFocusedPlayer(null);
    });
    expect(result.current.isOwnedByFocusedPlayer("memo-1")).toBe(false);
  });
});
