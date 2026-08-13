import { field, json, text } from "@nozbe/watermelondb/decorators";
import { database } from "@/database";
import { Q, Model } from "@nozbe/watermelondb";
import { generateUUID } from "@/utils/constants";

export type AudioMemoType = {
  uuid: string;
  workspaceSlug: string | null;
  audioUri: string;
  transcript: string | null;
  durationMs: number;
  waveformPeaks: number[];
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
      createdAt,
      updatedAt,
    };
  }

  static async find(
    where: { field: string; value: string | null }[] = [],
    orderBy: { field: string; direction: "asc" | "desc" }[] = [],
  ): Promise<AudioMemoType[]> {
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
        audioMemo.createdAt = Date.now();
        audioMemo.updatedAt = Date.now();
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
  ): Promise<boolean> {
    try {
      return await database.write(async () => {
        const memos = (await database
          .get(AudioMemo.table)
          .query(where.map(({ field, value }) => Q.where(field, value)))
          .fetch()) as (Model & AudioMemoType)[];
        if (memos.length === 0) return false;

        await database.batch(memos.map(memo => memo.prepareMarkAsDeleted()));
        return true;
      });
    } catch (error) {
      console.error("Error deleting audio memos", error);
      return false;
    }
  }
}
