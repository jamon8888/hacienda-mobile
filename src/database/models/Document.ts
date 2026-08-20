import { field, json, text } from "@nozbe/watermelondb/decorators";
import { database } from "@/database";
import { Q, Model } from "@nozbe/watermelondb";
import { generateUUID } from "@/utils/constants";
import VectorDB from "@/utils/VectorDB";
import sanitizeVectorBoxIds from "./shared/sanitizeVectorBoxIds";
import { invalidateWorkspaceCache } from "@/utils/AiProviders/semanticSearchCache";

export type DocumentType = {
  name: string;
  uuid: string;
  workspaceSlug: string;
  vectorBoxIds: number[];
  contentHash?: string | null;
  createdAt: number;
};

export default class Document extends Model {
  static table = "workspace_documents";

  @text("name") name!: string;
  @text("uuid") uuid!: string;
  @text("workspace_slug") workspaceSlug!: string;
  @json("vector_box_ids", sanitizeVectorBoxIds) vectorBoxIds!: number[];
  @text("content_hash") contentHash!: string | null;
  @field("created_at") createdAt!: number;

  static log(message: any, ...args: any[]) {
    console.log(`\x1b[32m[db:Document]\x1b[0m`, message, ...args); // eslint-disable-line no-console
  }

  static toDocumentObject(data: any): DocumentType {
    const { name, uuid, workspaceSlug, vectorBoxIds, contentHash, createdAt } =
      data;
    return {
      name: name,
      uuid: uuid,
      workspaceSlug: workspaceSlug,
      vectorBoxIds: vectorBoxIds,
      contentHash,
      createdAt,
    };
  }

  /**
   * Find a document by its content hash within a workspace
   * @param workspaceSlug - The workspace the document belongs to
   * @param contentHash - The SHA256 hash of the source file content
   * @returns The first matching document, or null if none exists
   */
  static async findByContentHash(
    workspaceSlug: string,
    contentHash: string,
  ): Promise<DocumentType | null> {
    if (!workspaceSlug || !contentHash) return null;
    const documents = await database
      .get(Document.table)
      .query(
        Q.where("workspace_slug", workspaceSlug),
        Q.where("content_hash", contentHash),
      )
      .fetch();
    if (documents.length === 0) return null;
    return this.toDocumentObject(documents[0]);
  }

  /**
   * Find documents by a given set of where clauses
   * @param where - An array of where clauses
   * @returns An array of documents with the DocumentType interface
   */
  static async find(
    where: { field: string; value: string }[] = [],
  ): Promise<DocumentType[]> {
    const documents = await database
      .get(Document.table)
      .query(where.map(({ field, value }) => Q.where(field, value)))
      .fetch();
    return documents.map(document => this.toDocumentObject(document));
  }

  static async create({
    name = "New Document",
    workspaceSlug,
    vectorBoxIds = [],
    contentHash,
  }: {
    name: string;
    workspaceSlug: string;
    vectorBoxIds: number[];
    contentHash?: string | null;
  }): Promise<DocumentType | null> {
    if (!workspaceSlug) {
      this.log("no workspace slug provided for document creation", { name });
      return null;
    }

    let newDocument: any;
    await database.write(async () => {
      newDocument = await database
        .get(Document.table)
        .create((document: any) => {
          document.name = name;
          document.uuid = generateUUID();
          document.workspaceSlug = workspaceSlug;
          document.vectorBoxIds = vectorBoxIds;
          document.contentHash = contentHash ?? null;
          document.createdAt = Date.now();
        });
    });
    newDocument = this.toDocumentObject(newDocument);
    this.log(`newDocument created ${newDocument.uuid} - ${newDocument.name}`);
    return newDocument;
  }

  static async update(
    uuid: string,
    updates: Partial<Pick<DocumentType, "vectorBoxIds" | "contentHash">>,
  ): Promise<DocumentType | null> {
    try {
      return await database.write(async () => {
        const documents = await database
          .get(Document.table)
          .query(Q.where("uuid", uuid))
          .fetch();
        if (documents.length === 0) return null;

        const document = documents[0];
        await document.update((doc: any) => {
          if (updates.vectorBoxIds !== undefined)
            doc.vectorBoxIds = updates.vectorBoxIds;
          if (updates.contentHash !== undefined)
            doc.contentHash = updates.contentHash;
        });
        return this.toDocumentObject(document);
      });
    } catch (error) {
      console.error("Error updating document:", error);
      return null;
    }
  }

  static async deleteByUuids(
    uuids: string[],
    withVectors: boolean = false,
  ): Promise<any> {
    try {
      if (!uuids.length) return true;

      let vectorBoxIds: number[] = [];
      let workspaceSlugs = new Set<string>();
      await database.write(async () => {
        const documents = await database
          .get(Document.table)
          .query(Q.where("uuid", Q.oneOf(uuids)))
          .fetch();

        if (documents.length === 0) return;
        this.log(`deleting ${documents.length} documents by uuids`);
        for (const document of documents) {
          const doc = document as Document;
          vectorBoxIds = [...vectorBoxIds, ...(doc.vectorBoxIds || [])];
          if (doc.workspaceSlug) workspaceSlugs.add(doc.workspaceSlug);
          await document.destroyPermanently();
        }
      });

      if (withVectors) {
        this.log(
          `deleting ${vectorBoxIds.length} vectors associated with documents`,
        );
        await VectorDB.deleteVectorsByIds(vectorBoxIds);
      }
      for (const slug of workspaceSlugs) invalidateWorkspaceCache(slug);

      this.log("documents successfully deleted");
      return true;
    } catch (error) {
      console.error("Error deleting documents:", error);
      return false;
    }
  }

  static async delete(
    where: { field: string; value: string }[] = [],
    withVectors: boolean = false,
  ): Promise<any> {
    try {
      if (!where.length) return true;

      let vectorBoxIds: number[] = [];
      let workspaceSlugs = new Set<string>();
      await database.write(async () => {
        const documents = await database
          .get(Document.table)
          .query(where.map(({ field, value }) => Q.where(field, value)))
          .fetch();

        if (documents.length === 0) return;
        this.log(`deleting ${documents.length} documents`, where);
        for (const document of documents) {
          const doc = document as Document;
          vectorBoxIds = [...vectorBoxIds, ...(doc.vectorBoxIds || [])];
          if (doc.workspaceSlug) workspaceSlugs.add(doc.workspaceSlug);
          await document.destroyPermanently();
        }
      });

      if (withVectors) {
        this.log(
          `deleting ${vectorBoxIds.length} vectors associated with documents`,
        );
        await VectorDB.deleteVectorsByIds(vectorBoxIds);
      }
      for (const slug of workspaceSlugs) invalidateWorkspaceCache(slug);

      this.log("documents successfully deleted");
      return true;
    } catch (error) {
      console.error("Error deleting documents:", error);
      return false;
    }
  }

  static async deleteAll(withVectors: boolean = false) {
    const documents = (await database
      .get(Document.table)
      .query()
      .fetch()) as (Model & DocumentType)[];
    if (!documents || documents.length === 0) return true;
    await database.write(async () => {
      this.log(`deleting ${documents.length} documents`);
      await database.batch(
        documents.map(document => document.prepareMarkAsDeleted()),
      );
    });
    if (withVectors) await VectorDB.reset();
  }
}
