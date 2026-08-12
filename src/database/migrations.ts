import {
  schemaMigrations,
  addColumns,
  createTable,
} from "@nozbe/watermelondb/Schema/migrations";

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: "workspace_documents",
          columns: [
            {
              name: "content_hash",
              type: "string",
              isOptional: true,
              isIndexed: true,
            },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: "audio_memos",
          columns: [
            { name: "uuid", type: "string", isIndexed: true },
            {
              name: "workspace_slug",
              type: "string",
              isIndexed: true,
              isOptional: true,
            },
            { name: "audio_uri", type: "string" },
            { name: "transcript", type: "string", isOptional: true },
            { name: "duration_ms", type: "number" },
            { name: "waveform_peaks", type: "string" },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        createTable({
          name: "subscriptions",
          columns: [
            { name: "user_id", type: "string", isIndexed: true },
            { name: "tier", type: "string" },
            { name: "status", type: "string" },
            { name: "trial_ends_at", type: "number", isOptional: true },
            { name: "created_at", type: "number" },
            { name: "updated_at", type: "number" },
          ],
        }),
      ],
    },
  ],
});
