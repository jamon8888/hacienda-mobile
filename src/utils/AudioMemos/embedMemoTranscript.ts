import dayjs from "dayjs";
import { getEmbeddingProvider } from "@/utils/Embedder/factory";
import VectorDB from "@/utils/VectorDB";
import Workspace from "@/database/models/Workspace";
import { AudioMemoType } from "@/database/models/AudioMemo";
import { MultilingualEmbeddingModelId } from "@/utils/models/defaults";
import { invalidateWorkspaceCache } from "@/utils/AiProviders/semanticSearchCache";

// AudioMemo has no title field - synthesize a stable, human-readable label
// from the recording time. Shared so citations (CitationsActionSheet) show
// the same name as whatever gets stored in each chunk's metadata.
export function getMemoDisplayName(memo: AudioMemoType): string {
  return `Voice memo — ${dayjs(memo.createdAt).format("MMM D, YYYY, h:mm A")}`;
}

// Characters-per-token used to convert between the embedder's token-based
// context budget and the character-based TextSplitter. ~4 is a reasonable
// average for English prose; transcribed speech and French text tend to run
// higher tokens-per-character, so both this and CHARS_PER_TOKEN below lean
// conservative rather than risk silently truncating a transcript.
const CHARS_PER_TOKEN = 3.5;

/**
 * Embeds a memo's transcript into the workspace's vector store, so it
 * becomes retrievable via RAG like an uploaded Document. Idempotent: any
 * vectors the memo already owns are replaced, so this also serves as the
 * re-embed path when a transcript is edited.
 *
 * Global memos (workspaceSlug === null) are skipped - the RAG stack (like
 * Document) requires every vector to belong to exactly one workspace, and
 * there's no "search across workspaces" concept to plug a global memo into.
 *
 * Never throws - embedding is best-effort background work; a failure here
 * should not block saving a transcript. Returns:
 * - the memo's new vector IDs (possibly []) on success, for the caller to
 *   persist onto the memo
 * - `undefined` on failure or when skipped, meaning "leave the memo's
 *   existing vectorBoxIds alone" - the caller must not overwrite them with
 *   `[]`, or a transient failure would silently un-embed the memo
 */
export async function embedMemoTranscript(
  memo: AudioMemoType,
): Promise<number[] | undefined> {
  try {
    if (!memo.workspaceSlug) return undefined;

    const transcript = memo.transcript?.trim() ?? "";

    if (!transcript) {
      // Nothing to embed - clear out any vectors left from a prior embed.
      // Safe to delete outright here since there's no replacement pending.
      if (memo.vectorBoxIds.length > 0) {
        await VectorDB.deleteVectorsByIds(memo.vectorBoxIds);
      }
      return [];
    }

    const workspace = await Workspace.first([
      { field: "slug", value: memo.workspaceSlug },
    ]);
    if (!workspace) return undefined;

    const embeddingConfig = workspace.embeddingConfig;
    const embedder = embeddingConfig
      ? getEmbeddingProvider(embeddingConfig.engine as MultilingualEmbeddingModelId)
      : getEmbeddingProvider();

    const name = getMemoDisplayName(memo);
    const baseMetadata = {
      name,
      sourceType: "audio-memo" as const,
      memoUuid: memo.uuid,
    };

    // Memo transcripts are typically far shorter than documents - skip
    // TextSplitter entirely when the whole transcript fits in one chunk.
    const estimatedTokens = Math.ceil(transcript.length / CHARS_PER_TOKEN);
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
      // chunkSize/chunkOverlap here are token budgets, but splitAndEmbed's
      // TextSplitter (LangChain's RecursiveCharacterTextSplitter) counts
      // characters - convert before handing them off.
      const tokenChunkSize = embeddingConfig ? Math.min(400, contextBudget) : 2048;
      const results = await embedder.splitAndEmbed(
        transcript,
        {
          chunkSize: Math.round(tokenChunkSize * CHARS_PER_TOKEN),
          chunkOverlap: Math.round(50 * CHARS_PER_TOKEN),
        },
        "embed_document",
      );
      vectors = results.map(result => ({
        embedding: result.embedding,
        metadata: { ...result.metadata, ...baseMetadata },
      }));
    }

    // Insert the new vectors before deleting the old ones, so a failure here
    // never leaves the memo un-embedded - the prior (still-valid) vectors
    // stay in place until the replacement has actually succeeded.
    const { ids } = await VectorDB.bulkInsert(memo.workspaceSlug, vectors);

    if (memo.vectorBoxIds.length > 0) {
      try {
        await VectorDB.deleteVectorsByIds(memo.vectorBoxIds);
      } catch (err) {
        // The new vectors are already in and searchable but we can't
        // confirm the old ones are gone - roll back the insert rather than
        // leaving both live with no vectorBoxIds anywhere that could clean
        // up `ids` later. The memo keeps pointing at its (still-valid) old
        // vectorBoxIds, since we return undefined below.
        console.warn(
          "Failed to delete old memo vectors, rolling back new insert:",
          memo.uuid,
          err,
        );
        try {
          await VectorDB.deleteVectorsByIds(ids);
        } catch (rollbackErr) {
          console.warn(
            "Failed to roll back newly-inserted memo vectors:",
            memo.uuid,
            rollbackErr,
          );
        }
        return undefined;
      }
    }

    invalidateWorkspaceCache(memo.workspaceSlug);
    return ids;
  } catch (err) {
    console.warn("Failed to embed memo transcript:", memo.uuid, err);
    return undefined;
  }
}
