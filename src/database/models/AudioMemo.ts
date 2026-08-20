import { field, json, text } from "@nozbe/watermelondb/decorators";
import { database } from "@/database";
import { Q, Model } from "@nozbe/watermelondb";
import { generateUUID } from "@/utils/constants";
import * as RNFS from "@dr.pogodin/react-native-fs";
import VectorDB from "@/utils/VectorDB";
import sanitizeVectorBoxIds from "./shared/sanitizeVectorBoxIds";
import {
  invalidateWorkspaceCache,
  queryCache,
} from "@/utils/AiProviders/semanticSearchCache";

function warnIfUnscoped(where: { field: string; value: string | null }[]) {
  if (!__DEV__) return;
  const scoped = where.some(
    w => w.field === "workspace_slug" || w.field === "uuid",
  );
  if (!scoped) {
    console.warn(
      "AudioMemo query has no workspace_slug/uuid filter - this will match memos across every workspace:",
      where,
    );
  }
}

export type AudioMemoType = {
  uuid: string;
  workspaceSlug: string | null;
  audioUri: string;
  transcript: string | null;
  durationMs: number;
  waveformPeaks: number[];
  vectorBoxIds: number[];
  createdAt: number;
  updatedAt: number;
};

export default class AudioMemo extends Model {
  static table = "audio_memos";

  @text("uuid") uuid!: string;
  @text("workspace_slug") workspaceSlug!: string | null;
  @text("audio_uri") audioUri!: string;
  @text("transcript") transcript!: string | null;
  @field("duration_ms") durationMs!: number;
  @json("waveform_peaks", peaks => peaks) waveformPeaks!: number[];
  @json("vector_box_ids", sanitizeVectorBoxIds) vectorBoxIds!: number[];
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  static toAudioMemoObject(data: AudioMemo): AudioMemoType {
    const {
      uuid,
      workspaceSlug,
      audioUri,
      transcript,
      durationMs,
      waveformPeaks,
      vectorBoxIds,
      createdAt,
      updatedAt,
    } = data;
    return {
      uuid,
      workspaceSlug,
      audioUri,
      transcript,
      durationMs,
      waveformPeaks,
      vectorBoxIds: vectorBoxIds ?? [],
      createdAt,
      updatedAt,
    };
  }

  static async find(
    where: { field: string; value: string | null }[] = [],
    orderBy: { field: string; direction: "asc" | "desc" }[] = [],
  ): Promise<AudioMemoType[]> {
    warnIfUnscoped(where);
    const memos = await database
      .get(AudioMemo.table)
      .query(
        ...where.map(({ field, value }) => Q.where(field, value)),
        ...orderBy.map(({ field, direction }) => Q.sortBy(field, direction)),
      )
      .fetch();
    return memos.map(memo => this.toAudioMemoObject(memo as AudioMemo));
  }

  static async create(data: Partial<AudioMemoType>): Promise<AudioMemoType> {
    const {
      uuid,
      workspaceSlug,
      audioUri,
      transcript,
      durationMs,
      waveformPeaks,
      vectorBoxIds,
      updatedAt,
    } = data;

    let newMemo: AudioMemo | null = null;
    await database.write(async () => {
      newMemo = (await database.get(AudioMemo.table).create((memo: Model) => {
        const audioMemo = memo as AudioMemo;
        audioMemo.uuid = uuid ?? generateUUID();
        audioMemo.workspaceSlug = workspaceSlug ?? null;
        audioMemo.audioUri = audioUri ?? "";
        audioMemo.transcript = transcript ?? null;
        audioMemo.durationMs = durationMs ?? 0;
        audioMemo.waveformPeaks = waveformPeaks ?? [];
        audioMemo.vectorBoxIds = vectorBoxIds ?? [];
        audioMemo.createdAt = Date.now();
        audioMemo.updatedAt = updatedAt ?? Date.now();
      })) as AudioMemo;
    });

    if (!newMemo) {
      throw new Error("Failed to create AudioMemo");
    }
    return this.toAudioMemoObject(newMemo);
  }

  static async update(
    uuid: string,
    updates: Partial<AudioMemoType>,
  ): Promise<AudioMemoType | null> {
    try {
      return await database.write(async () => {
        const memos = (await database
          .get(AudioMemo.table)
          .query(Q.where("uuid", uuid))
          .fetch()) as (Model & AudioMemoType)[];
        if (memos.length === 0) return null;

        const memo = memos[0];
        await memo.update((m: Model) => {
          const audioMemo = m as AudioMemo;
          if (updates.audioUri !== undefined)
            audioMemo.audioUri = updates.audioUri;
          if (updates.transcript !== undefined)
            audioMemo.transcript = updates.transcript;
          if (updates.durationMs !== undefined)
            audioMemo.durationMs = updates.durationMs;
          if (updates.waveformPeaks !== undefined)
            audioMemo.waveformPeaks = updates.waveformPeaks;
          if (updates.vectorBoxIds !== undefined)
            audioMemo.vectorBoxIds = updates.vectorBoxIds;
          if (updates.workspaceSlug !== undefined)
            audioMemo.workspaceSlug = updates.workspaceSlug;
          audioMemo.updatedAt = Date.now();
        });
        return this.toAudioMemoObject(memo as AudioMemo);
      });
    } catch (error) {
      console.error("Error updating audio memo", error);
      return null;
    }
  }

  static async delete(
    where: { field: string; value: string }[],
    withVectors: boolean = false,
  ): Promise<boolean> {
    try {
      warnIfUnscoped(where);
      let audioUris: string[] = [];
      let vectorBoxIds: number[] = [];
      let workspaceSlugs = new Set<string>();
      let found = false;
      await database.write(async () => {
        const memos = (await database
          .get(AudioMemo.table)
          .query(where.map(({ field, value }) => Q.where(field, value)))
          .fetch()) as (Model & AudioMemoType)[];
        if (memos.length === 0) return;
        found = true;

        for (const memo of memos) {
          if (memo.audioUri) audioUris.push(memo.audioUri);
          vectorBoxIds = [...vectorBoxIds, ...(memo.vectorBoxIds ?? [])];
          if (memo.workspaceSlug) workspaceSlugs.add(memo.workspaceSlug);
        }
        await database.batch(memos.map(memo => memo.prepareMarkAsDeleted()));
      });
      if (!found) return false;

      for (const uri of audioUris) {
        try {
          await RNFS.unlink(uri);
        } catch (err) {
          console.warn("Failed to delete memo file:", uri, err);
        }
      }
      if (withVectors && vectorBoxIds.length) {
        try {
          await VectorDB.deleteVectorsByIds(vectorBoxIds);
        } catch (err) {
          console.warn("Failed to delete memo vectors:", err);
        }
      }
      for (const slug of workspaceSlugs) invalidateWorkspaceCache(slug);
      return true;
    } catch (error) {
      console.error("Error deleting audio memos", error);
      return false;
    }
  }

  static async deleteAll(): Promise<boolean> {
    const memos = (await database
      .get(AudioMemo.table)
      .query()
      .fetch()) as (Model & AudioMemoType)[];
    if (!memos || memos.length === 0) return true;

    const audioUris = memos.map(m => m.audioUri).filter(Boolean);
    await database.write(async () => {
      await database.batch(memos.map(memo => memo.prepareMarkAsDeleted()));
    });

    for (const uri of audioUris) {
      try {
        await RNFS.unlink(uri);
      } catch (err) {
        console.warn("Failed to delete memo file:", uri, err);
      }
    }
    // Vector cleanup is intentionally left to the caller (e.g. a full app
    // reset already calls VectorDB.reset() once for everything, which is
    // cheaper and avoids racing a second per-id deletion pass here).
    queryCache.clear();
    return true;
  }
}
