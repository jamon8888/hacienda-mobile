import { embedMemoTranscript } from "./embedMemoTranscript";
import { getEmbeddingProvider } from "@/utils/Embedder/factory";
import VectorDB from "@/utils/VectorDB";
import Workspace from "@/database/models/Workspace";
import { AudioMemoType } from "@/database/models/AudioMemo";

jest.mock("@/utils/Embedder/factory", () => ({
  getEmbeddingProvider: jest.fn(),
}));

jest.mock("@/utils/VectorDB", () => ({
  __esModule: true,
  default: {
    deleteVectorsByIds: jest.fn().mockResolvedValue(true),
    bulkInsert: jest.fn(),
  },
}));

jest.mock("@/database/models/Workspace", () => ({
  __esModule: true,
  default: {
    first: jest.fn(),
  },
}));

const baseMemo: AudioMemoType = {
  uuid: "memo-1",
  workspaceSlug: "ws-1",
  audioUri: "file:///memo.m4a",
  transcript: "A short voice memo transcript.",
  durationMs: 5000,
  waveformPeaks: [],
  vectorBoxIds: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

describe("embedMemoTranscript", () => {
  const mockEmbedder = {
    embed: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    embedBatch: jest.fn(),
    splitAndEmbed: jest.fn(),
    getContextLength: jest.fn().mockReturnValue(512),
    getDimensions: jest.fn().mockReturnValue(3),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getEmbeddingProvider as jest.Mock).mockReturnValue(mockEmbedder);
    (Workspace.first as jest.Mock).mockResolvedValue({
      slug: "ws-1",
      embeddingConfig: { engine: "multilingual-e5-small", dimensions: 384 },
    });
    (VectorDB.bulkInsert as jest.Mock).mockResolvedValue({
      count: 1,
      ids: [101],
    });
  });

  it("skips embedding entirely for Global (workspace-less) memos", async () => {
    const result = await embedMemoTranscript({
      ...baseMemo,
      workspaceSlug: null,
    });

    // undefined (not []) - the memo's existing vectorBoxIds must be left
    // alone, since skipping isn't the same as "there are now zero vectors".
    expect(result).toBeUndefined();
    expect(Workspace.first).not.toHaveBeenCalled();
    expect(VectorDB.bulkInsert).not.toHaveBeenCalled();
  });

  it("embeds a short transcript as a single chunk without the splitter", async () => {
    const result = await embedMemoTranscript(baseMemo);

    expect(mockEmbedder.embed).toHaveBeenCalledWith(
      baseMemo.transcript,
      "embed_document",
      384,
    );
    expect(mockEmbedder.splitAndEmbed).not.toHaveBeenCalled();
    expect(VectorDB.bulkInsert).toHaveBeenCalledWith("ws-1", [
      {
        embedding: [0.1, 0.2, 0.3],
        metadata: {
          content: baseMemo.transcript,
          name: expect.any(String),
          sourceType: "audio-memo",
          memoUuid: "memo-1",
        },
      },
    ]);
    expect(result).toEqual([101]);
  });

  it("falls back to splitAndEmbed for a transcript exceeding the context budget", async () => {
    const longTranscript = "word ".repeat(1000); // ~5000 chars, well over the 512-token mock budget
    mockEmbedder.splitAndEmbed.mockResolvedValue([
      { embedding: [0.1], metadata: { content: "chunk 1" } },
      { embedding: [0.2], metadata: { content: "chunk 2" } },
    ]);
    (VectorDB.bulkInsert as jest.Mock).mockResolvedValue({
      count: 2,
      ids: [201, 202],
    });

    const result = await embedMemoTranscript({
      ...baseMemo,
      transcript: longTranscript,
    });

    expect(mockEmbedder.embed).not.toHaveBeenCalled();
    // chunkSize/chunkOverlap are token budgets that get converted to
    // characters (×3.5) before being handed to the (character-based)
    // splitter - 400 tokens -> 1400 chars, 50 tokens -> 175 chars.
    expect(mockEmbedder.splitAndEmbed).toHaveBeenCalledWith(
      longTranscript.trim(),
      { chunkSize: 1400, chunkOverlap: 175 },
      "embed_document",
    );
    expect(VectorDB.bulkInsert).toHaveBeenCalledWith(
      "ws-1",
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({ sourceType: "audio-memo" }),
        }),
      ]),
    );
    expect(result).toEqual([201, 202]);
  });

  it("inserts new vectors before deleting the old ones (idempotent re-embed)", async () => {
    const result = await embedMemoTranscript({
      ...baseMemo,
      vectorBoxIds: [50, 51],
    });

    expect(VectorDB.deleteVectorsByIds).toHaveBeenCalledWith([50, 51]);
    // Insert happens before the old vectors are deleted, so a failure
    // between the two never leaves the memo un-embedded.
    const insertOrder = (VectorDB.bulkInsert as jest.Mock).mock
      .invocationCallOrder[0];
    const deleteOrder = (VectorDB.deleteVectorsByIds as jest.Mock).mock
      .invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(deleteOrder);
    expect(result).toEqual([101]);
  });

  it("clears vectors and returns [] when the transcript is empty", async () => {
    const result = await embedMemoTranscript({
      ...baseMemo,
      transcript: "",
      vectorBoxIds: [50],
    });

    expect(VectorDB.deleteVectorsByIds).toHaveBeenCalledWith([50]);
    expect(VectorDB.bulkInsert).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("never throws - returns undefined on failure", async () => {
    (Workspace.first as jest.Mock).mockRejectedValue(new Error("db down"));

    const result = await embedMemoTranscript(baseMemo);

    expect(result).toBeUndefined();
  });
});
