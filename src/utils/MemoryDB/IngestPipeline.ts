import { memoryStore } from '../../store/MemoryStore';
import { embedBatch } from '../Embedder/onDevice/EmbeddingGemmaBridge';
import TextSplitter from '../TextSplitter';

export interface IngestOptions {
  workspaceId: string;
  clientId?: string;
  sourceUri?: string;
  sourceType?: string;
  kind?: 'conversation' | 'document' | 'note';
}

const splitter = new TextSplitter({
  chunkSize: 500,
  chunkOverlap: 50,
});

export async function ingestText(
  text: string,
  options: IngestOptions,
): Promise<number> {
  const chunks = await splitter.splitText(text);
  const embeddings = await embedBatch(chunks);

  let count = 0;
  for (let i = 0; i < chunks.length; i++) {
    await memoryStore.insertMemory({
      workspaceId: options.workspaceId,
      kind: options.kind || 'document',
      content: chunks[i],
      sourceUri: options.sourceUri,
      sourceType: options.sourceType,
      clientId: options.clientId,
      embedding: embeddings[i],
      embeddingModel: 'embeddinggemma-300m-q4_0',
      embeddingDims: 128,
      importance: 0.5,
    });
    count++;
  }

  return count;
}

export async function ingestDocument(
  text: string,
  metadata: {
    workspaceId: string;
    clientId?: string;
    filePath: string;
    fileType: string;
  },
): Promise<number> {
  return ingestText(text, {
    workspaceId: metadata.workspaceId,
    clientId: metadata.clientId,
    sourceUri: metadata.filePath,
    sourceType: metadata.fileType,
    kind: 'document',
  });
}
