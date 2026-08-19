import dayjs from "dayjs";
import { getEmbeddingProvider } from "@/utils/Embedder/factory";
import VectorDB from "@/utils/VectorDB";
import Workspace from "@/database/models/Workspace";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { MultilingualEmbeddingModelId } from "@/utils/models/defaults";

// AudioMemo has no title field - synthesize a stable, human-readable label
// from the recording time. Shared so citations (CitationsActionSheet) show
// the same name as whatever gets stored in each chunk's metadata.
export function getMemoDisplayName(memo: AudioMemoType): string {
  return `Voice memo — ${dayjs(memo.createdAt).format("MMM D, YYYY, h:mm A")}`;
}

/**
 * Embeds a memo's transcript into the workspace's vector store, so it
 * becomes retrievable via RAG like an uploaded Document. Idempotent: any
 * vectors the memo already owns are deleted first, so this also serves as
 * the re-embed path when a transcript is edited.
 *
 * Global memos (workspaceSlug === null) are skipped - the RAG stack (like
 * Document) requires every vector to belong to exactly one workspace, and
 * there's no "search across workspaces" concept to plug a global memo into.
 *
 * Never throws - embedding is best-effort background work; a failure here
 * should not block saving a transcript. Returns the new vector IDs (or []
 * if skipped/failed) for the caller to persist onto the memo.
 */
export async function embedMemoTranscript(
  memo: AudioMemoType,
): Promise<number[]> {
  try {
    if (!memo.workspaceSlug) return [];

    // Idempotent: always clear prior vectors first, whether re-embedding
    // after a transcript edit or the transcript was cleared out entirely.
    if (memo.vectorBoxIds.length > 0) {
      await VectorDB.deleteVectorsByIds(memo.vectorBoxIds);
    }

    if (!memo.transcript || !memo.transcript.trim()) return [];

    const workspace = await Workspace.first([
      { field: "slug", value: memo.workspaceSlug },
    ]);
    if (!workspace) return [];

    const embeddingConfig = workspace.embeddingConfig;
    const embedder = embeddingConfig
      ? getEmbeddingProvider(embeddingConfig.engine as MultilingualEmbeddingModelId)
      : getEmbeddingProvider();

    const name = getMemoDisplayName(memo);
    const transcript = memo.transcript.trim();
    const baseMetadata = {
      name,
      sourceType: "audio-memo" as const,
      memoUuid: memo.uuid,
    };

    // Memo transcripts are typically far shorter than documents - skip
    // TextSplitter entirely when the whole transcript fits in one chunk.
    const estimatedTokens = Math.ceil(transcript.length / 4);
    const contextBudget = embedder.getContextLength() - 50;

    let vectors: { embedding: number[]; metadata: object }[];
    if (estimatedTokens <= contextBudget) {
      const embedding = await embedder.embed(
        transcript,
        "embed_document",
        embeddingConfig?.dimensions,
      );
      vectors = [{ embedding, metadata: { content: transcript, ...baseMetadata } }];
    } else {
      const chunkSize = embeddingConfig ? Math.min(400, contextBudget) : 2048;
      const results = await embedder.splitAndEmbed(
        transcript,
        { chunkSize, chunkOverlap: 50 },
        "embed_document",
      );
      vectors = results.map(result => ({
        embedding: result.embedding,
        metadata: { ...result.metadata, ...baseMetadata },
      }));
    }

    const { ids } = await VectorDB.bulkInsert(memo.workspaceSlug, vectors);
    return ids;
  } catch (err) {
    console.warn("Failed to embed memo transcript:", memo.uuid, err);
    return [];
  }
}
