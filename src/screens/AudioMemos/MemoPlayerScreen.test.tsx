import React from "react";
import renderer from "react-test-renderer";
import MemoPlayerScreen from "./MemoPlayerScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

const mockRoute = { params: { memoId: "missing-memo", mode: "play" } };

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

describe("MemoPlayerScreen", () => {
  it("renders the not-found state when the memo is unavailable", () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      memos: [],
      playingId: null,
      playbackPosition: 0,
      playMemo: jest.fn(),
      pauseMemo: jest.fn(),
      updateMemo: jest.fn(),
      deleteMemo: jest.fn(),
    });

    const tree = renderer.create(<MemoPlayerScreen />);

    expect(tree.root.findByProps({ children: "Memo not found" })).toBeTruthy();
  });
});
