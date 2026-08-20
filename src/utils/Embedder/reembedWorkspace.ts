import { getEmbeddingProvider, MultilingualEmbeddingModelId } from "@/utils/Embedder";
import VectorDB from "@/utils/VectorDB";
import Document, { DocumentType } from "@/database/models/Document";
import AudioMemo from "@/database/models/AudioMemo";
import { WorkspaceType } from "@/database/models/Workspace";
import { searchProcessedFilesFor } from "@/utils/fs";
import { embedMemoTranscript } from "@/utils/AudioMemos/embedMemoTranscript";
import { invalidateWorkspaceCache } from "@/utils/AiProviders/semanticSearchCache";

export type ReembedWorkspaceResult = {
  documentsReembedded: number;
  documentsFailed: number;
  memosReembedded: number;
  memosFailed: number;
};

const CHARS_PER_TOKEN = 4;

async function reembedDocument(
  document: DocumentType,
  workspaceSlug: string,
  embeddingConfig: NonNullable<WorkspaceType["embeddingConfig"]>,
): Promise<boolean> {
  // Documents don't store their extracted text in the DB - it's persisted
  // to the "processed" folder under the same name at embed time (see
  // storeProcessedFileAsText in useAttachments.tsx/IndexingStore.ts), which
  // is what makes re-embedding possible without re-running extraction
  // against the original file (which may no longer be accessible on-device).
  const text = await searchProcessedFilesFor(document.name, "eq");
  if (!text) return false;

  const embedder = getEmbeddingProvider(
    embeddingConfig.engine as MultilingualEmbeddingModelId,
  );
  const contextBudget = embedder.getContextLength() - 50;
  const chunkSize = Math.min(400, contextBudget) * CHARS_PER_TOKEN;

  const embedResults = await embedder.splitAndEmbed(
    text,
    { chunkSize, chunkOverlap: 50 * CHARS_PER_TOKEN },
    "embed_document",
  );
  const vectors = embedResults.map(result => ({
    embedding: result.embedding,
    metadata: { ...result.metadata, name: document.name },
  }));

  const { ids } = await VectorDB.bulkInsert(workspaceSlug, vectors);
  const updated = await Document.update(document.uuid, { vectorBoxIds: ids });
  if (!updated) return false;

  if (document.vectorBoxIds.length > 0) {
    await VectorDB.deleteVectorsByIds(document.vectorBoxIds);
  }
  return true;
}

/**
 * Re-embeds every document and audio memo in a workspace under its current
 * embeddingConfig - used after the user changes a workspace's embedding
 * engine/dimensions, since vectors already in the store were computed under
 * the old config and are otherwise silently stale (wrong dimensionality, or
 * just lower quality than the newly-selected engine).
 *
 * Best-effort per item: one failure doesn't stop the rest. Never throws.
 */
export async function reembedWorkspace(
  workspace: WorkspaceType,
): Promise<ReembedWorkspaceResult> {
  const result: ReembedWorkspaceResult = {
    documentsReembedded: 0,
    documentsFailed: 0,
    memosReembedded: 0,
    memosFailed: 0,
  };

  const embeddingConfig = workspace.embeddingConfig;
  if (!embeddingConfig) return result;

  const documents = await Document.find([
    { field: "workspace_slug", value: workspace.slug },
  ]);
  for (const document of documents) {
    try {
      const ok = await reembedDocument(document, workspace.slug, embeddingConfig);
      if (ok) result.documentsReembedded += 1;
      else result.documentsFailed += 1;
    } catch (err) {
      console.warn("Failed to re-embed document:", document.uuid, err);
      result.documentsFailed += 1;
    }
  }

  const memos = await AudioMemo.find([
    { field: "workspace_slug", value: workspace.slug },
  ]);
  for (const memo of memos) {
    try {
      const vectorBoxIds = await embedMemoTranscript(memo);
      if (vectorBoxIds === undefined) {
        result.memosFailed += 1;
        continue;
      }
      await AudioMemo.update(memo.uuid, { vectorBoxIds });
      result.memosReembedded += 1;
    } catch (err) {
      console.warn("Failed to re-embed memo:", memo.uuid, err);
      result.memosFailed += 1;
    }
  }

  invalidateWorkspaceCache(workspace.slug);
  return result;
}
