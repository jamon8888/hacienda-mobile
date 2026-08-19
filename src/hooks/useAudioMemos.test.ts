import AudioMemo from "@/database/models/AudioMemo";
import * as RNFS from "@dr.pogodin/react-native-fs";
import VectorDB from "@/utils/VectorDB";
import { embedMemoTranscript } from "@/utils/AudioMemos/embedMemoTranscript";

jest.mock("@/database/models/AudioMemo", () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/utils/VectorDB", () => ({
  __esModule: true,
  default: {
    deleteVectorsByIds: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("@/utils/AudioMemos/embedMemoTranscript", () => ({
  embedMemoTranscript: jest.fn().mockResolvedValue([]),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderHook, act } = require("@testing-library/react-hooks");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useAudioMemos } = require("./useAudioMemos");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useAudioMemos", () => {
  it("should initialize with empty memos", () => {
    const { result } = renderHook(() => useAudioMemos());
    expect(result.current.memos).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.playingId).toBeNull();
    expect(result.current.playbackPosition).toBe(0);
    expect(result.current.playbackDuration).toBe(0);
  });

  describe("fetchMemos", () => {
    it("should fetch memos and set loading state", async () => {
      const mockMemos = [
        {
          uuid: "1",
          audioUri: "file:///test1.m4a",
          durationMs: 5000,
          waveformPeaks: [0.5],
          workspaceSlug: null,
          transcript: null,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];
      (AudioMemo.find as jest.Mock).mockResolvedValue(mockMemos);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      expect(result.current.memos).toEqual(mockMemos);
      expect(result.current.loading).toBe(false);
    });

    it("should set loading to false after fetch completes", async () => {
      (AudioMemo.find as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      expect(result.current.loading).toBe(false);
    });

    it("should pass workspace slug filter to AudioMemo.find", async () => {
      (AudioMemo.find as jest.Mock).mockResolvedValue([]);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos("my-workspace");
      });

      expect(AudioMemo.find).toHaveBeenCalledWith(
        [{ field: "workspace_slug", value: "my-workspace" }],
        [{ field: "created_at", direction: "desc" }],
      );
    });
  });

  describe("createMemo", () => {
    it("should create a memo and add to list", async () => {
      const newMemo = {
        uuid: "new-uuid",
        audioUri: "file:///new.m4a",
        durationMs: 3000,
        waveformPeaks: [0.1, 0.2],
        workspaceSlug: null,
        transcript: "hello",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      (AudioMemo.create as jest.Mock).mockResolvedValue(newMemo);

      const { result } = renderHook(() => useAudioMemos());

      let created;
      await act(async () => {
        created = await result.current.createMemo({
          audioUri: "file:///new.m4a",
          durationMs: 3000,
          waveformPeaks: [0.1, 0.2],
          transcript: "hello",
        });
      });

      expect(created).toEqual(newMemo);
      expect(result.current.memos).toContainEqual(newMemo);
    });
  });

  describe("deleteMemo", () => {
    it("should delete memo and remove from list", async () => {
      const existingMemo = {
        uuid: "to-delete",
        audioUri: "file:///del.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        workspaceSlug: null,
        transcript: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.delete as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.deleteMemo("to-delete");
      });

      expect(AudioMemo.delete).toHaveBeenCalledWith([
        { field: "uuid", value: "to-delete" },
      ]);
      expect(result.current.memos).toHaveLength(0);
    });

    it("should unlink the audio file from disk", async () => {
      const existingMemo = {
        uuid: "to-delete",
        audioUri: "file:///del.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        workspaceSlug: null,
        transcript: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.delete as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.deleteMemo("to-delete");
      });

      expect(RNFS.unlink).toHaveBeenCalledWith("file:///del.m4a");
    });

    it("should not throw if the file is already gone", async () => {
      const existingMemo = {
        uuid: "to-delete",
        audioUri: "file:///del.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        workspaceSlug: null,
        transcript: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.delete as jest.Mock).mockResolvedValue(true);
      (RNFS.unlink as jest.Mock).mockRejectedValueOnce(
        new Error("file not found"),
      );

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await expect(
        act(async () => {
          await result.current.deleteMemo("to-delete");
        }),
      ).resolves.not.toThrow();
      expect(result.current.memos).toHaveLength(0);
    });

    it("should delete the memo's vectors from VectorDB when present", async () => {
      const existingMemo = {
        uuid: "to-delete",
        audioUri: "file:///del.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        vectorBoxIds: [10, 11],
        workspaceSlug: "ws-1",
        transcript: "text",
        createdAt: 1000,
        updatedAt: 1000,
      };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.delete as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.deleteMemo("to-delete");
      });

      expect(VectorDB.deleteVectorsByIds).toHaveBeenCalledWith([10, 11]);
    });

    it("should not call VectorDB.deleteVectorsByIds when the memo has no vectors", async () => {
      const existingMemo = {
        uuid: "to-delete",
        audioUri: "file:///del.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        vectorBoxIds: [],
        workspaceSlug: null,
        transcript: null,
        createdAt: 1000,
        updatedAt: 1000,
      };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.delete as jest.Mock).mockResolvedValue(true);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.deleteMemo("to-delete");
      });

      expect(VectorDB.deleteVectorsByIds).not.toHaveBeenCalled();
    });
  });

  describe("updateMemo", () => {
    it("should update memo in the list", async () => {
      const existingMemo = {
        uuid: "to-update",
        audioUri: "file:///old.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        workspaceSlug: null,
        transcript: "old",
        createdAt: 1000,
        updatedAt: 1000,
      };
      const updatedMemo = { ...existingMemo, transcript: "new" };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.update as jest.Mock).mockResolvedValue(updatedMemo);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.updateMemo("to-update", { transcript: "new" });
      });

      expect(result.current.memos[0].transcript).toBe("new");
    });

    it("should trigger embedding and persist the returned vectorBoxIds when the transcript changes", async () => {
      const existingMemo = {
        uuid: "to-update",
        audioUri: "file:///old.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        vectorBoxIds: [],
        workspaceSlug: "ws-1",
        transcript: "old",
        createdAt: 1000,
        updatedAt: 1000,
      };
      const updatedMemo = { ...existingMemo, transcript: "new" };
      const withVectors = { ...updatedMemo, vectorBoxIds: [42, 43] };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.update as jest.Mock)
        .mockResolvedValueOnce(updatedMemo)
        .mockResolvedValueOnce(withVectors);
      (embedMemoTranscript as jest.Mock).mockResolvedValue([42, 43]);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.updateMemo("to-update", { transcript: "new" });
      });

      expect(embedMemoTranscript).toHaveBeenCalledWith(updatedMemo);
      expect(AudioMemo.update).toHaveBeenNthCalledWith(2, "to-update", {
        vectorBoxIds: [42, 43],
      });
      expect(result.current.memos[0].vectorBoxIds).toEqual([42, 43]);
    });

    it("should not trigger embedding when the transcript is not part of the update", async () => {
      const existingMemo = {
        uuid: "to-update",
        audioUri: "file:///old.m4a",
        durationMs: 1000,
        waveformPeaks: [],
        vectorBoxIds: [],
        workspaceSlug: "ws-1",
        transcript: "old",
        createdAt: 1000,
        updatedAt: 1000,
      };
      const updatedMemo = { ...existingMemo, durationMs: 2000 };

      (AudioMemo.find as jest.Mock).mockResolvedValue([existingMemo]);
      (AudioMemo.update as jest.Mock).mockResolvedValue(updatedMemo);

      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.fetchMemos();
      });

      await act(async () => {
        await result.current.updateMemo("to-update", { durationMs: 2000 });
      });

      expect(embedMemoTranscript).not.toHaveBeenCalled();
      expect(AudioMemo.update).toHaveBeenCalledTimes(1);
    });
  });

  describe("playback controls", () => {
    it("should set playingId on playMemo", async () => {
      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.playMemo("memo-1", "file:///test.m4a");
      });

      expect(result.current.playingId).toBe("memo-1");
    });

    it("should clear playingId on pauseMemo", async () => {
      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.playMemo("memo-1", "file:///test.m4a");
      });

      await act(async () => {
        await result.current.pauseMemo();
      });

      expect(result.current.playingId).toBeNull();
    });

    it("should clear playingId and position on stopMemo", async () => {
      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.playMemo("memo-1", "file:///test.m4a");
      });

      await act(async () => {
        await result.current.stopMemo();
      });

      expect(result.current.playingId).toBeNull();
      expect(result.current.playbackPosition).toBe(0);
    });

    it("should update playbackPosition on seekTo", async () => {
      const { result } = renderHook(() => useAudioMemos());

      await act(async () => {
        await result.current.seekTo(5000);
      });

      expect(result.current.playbackPosition).toBe(5000);
    });

    it("should update both position and duration on updatePlaybackTime", () => {
      const { result } = renderHook(() => useAudioMemos());

      act(() => {
        result.current.updatePlaybackTime(12000, 65000);
      });

      expect(result.current.playbackPosition).toBe(12000);
      expect(result.current.playbackDuration).toBe(65000);
    });
  });
});
