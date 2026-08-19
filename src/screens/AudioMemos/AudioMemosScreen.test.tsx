import React from "react";
import renderer, { act } from "react-test-renderer";
import { FlatList } from "react-native";
import AudioMemosScreen from "./AudioMemosScreen";
import { useAudioMemos } from "@/hooks/useAudioMemos";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { createMockT } from "@/testUtils/mockUseTranslation";

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
    Plus: createIcon("Plus"),
    CaretDown: createIcon("CaretDown"),
    Check: createIcon("Check"),
    Play: createIcon("Play"),
    Pause: createIcon("Pause"),
    Trash: createIcon("Trash"),
  };
});

jest.mock("@/hooks/useTranslation", () => {
  const { createMockT } = require("@/testUtils/mockUseTranslation");
  return { useTranslation: () => createMockT() };
});

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => callback(),
}));

jest.mock("@react-navigation/drawer", () => ({
  DrawerNavigationProp: jest.fn(),
}));

jest.mock("@/hooks/useAudioMemos", () => ({
  useAudioMemos: jest.fn(),
}));

// `mockResolvedValue(mockWorkspaces)` would evaluate mockWorkspaces eagerly,
// at factory-registration time - which runs before this file's own `const`
// declarations due to jest.mock() hoisting above imports. Defer the
// reference into the implementation function so it only resolves at call
// time, once the whole file (including mockWorkspaces below) has loaded.
jest.mock("@/database/models/Workspace", () => ({
  __esModule: true,
  default: { find: jest.fn(() => Promise.resolve(mockWorkspaces)) },
}));

const mockWorkspaces = [
  { slug: "workspace-a", name: "Workspace A" },
  { slug: "workspace-b", name: "Workspace B" },
];

// TouchableOpacity is real (unmocked) here, and wraps children in its own
// internal layers - `.parent` isn't reliably "the pressable" one hop up.
function findPressableAncestor(instance: any): any {
  let node = instance.parent;
  while (node && typeof node.props?.onPress !== "function") {
    node = node.parent;
  }
  return node;
}

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
    vectorBoxIds: [],
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
    vectorBoxIds: [],
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

  it("renders loading state correctly", async () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      loading: true,
      memos: [],
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const activityIndicator = tree!.root.findByProps({ size: "large" });
    expect(activityIndicator).toBeTruthy();
  });

  it("renders empty state when no memos", async () => {
    (useAudioMemos as jest.Mock).mockReturnValue({
      ...mockUseAudioMemos,
      memos: [],
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const emptyText = tree!.root.findByProps({
      children: "No memos yet.\nTap + to record your first memo.",
    });
    expect(emptyText).toBeTruthy();
  });

  it("renders memo list when memos exist", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const flatList = tree!.root.findByType(FlatList);
    expect(flatList.props.data).toEqual(mockMemos);
  });

  it("fetches memos for the auto-selected workspace once workspaces load", async () => {
    await act(async () => {
      renderer.create(<AudioMemosScreen />);
    });
    // Initial synchronous call has no workspace selected yet; a second call
    // fires once Workspace.find() resolves and the picker auto-selects the
    // first workspace.
    expect(mockUseAudioMemos.fetchMemos).toHaveBeenLastCalledWith(
      "workspace-a",
    );
  });

  it("fetches memos for global (null) when the Global tab is active", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const globalTab = tree!.root.findByProps({ children: "Global" });
    await act(async () => {
      findPressableAncestor(globalTab).props.onPress();
    });
    expect(mockUseAudioMemos.fetchMemos).toHaveBeenLastCalledWith(null);
  });

  it("calls goBack when back button is pressed", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const backIcon = tree!.root.findAllByProps({ "data-icon": "ArrowLeft" })[0];
    findPressableAncestor(backIcon).props.onPress();
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it("navigates to record mode with the selected workspace when plus button is pressed", async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<AudioMemosScreen />);
    });
    const plusIcon = tree!.root.findAllByProps({ "data-icon": "Plus" })[0];
    findPressableAncestor(plusIcon).props.onPress();
    expect(mockNavigation.navigate).toHaveBeenCalledWith("audio_memo_player", {
      mode: "record",
      wsSlug: "workspace-a",
    });
  });
});
