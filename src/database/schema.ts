import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 5,
  tables: [
    tableSchema({
      name: "workspaces",
      columns: [
        { name: "name", type: "string" },
        { name: "slug", type: "string", isIndexed: true },
        { name: "system_prompt", type: "string", isOptional: true },
        { name: "temperature", type: "number", isOptional: true },
        { name: "context_length", type: "number", isOptional: true },
        { name: "is_remote", type: "boolean", isOptional: true },
        { name: "remote_config", type: "string", isOptional: true },
        { name: "embedding_config", type: "string", isOptional: true },
        { name: "xberg_config", type: "string", isOptional: true },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "workspace_threads",
      columns: [
        { name: "name", type: "string" },
        { name: "workspace_slug", type: "string", isIndexed: true },
        { name: "slug", type: "string", isIndexed: true },
        { name: "is_remote", type: "boolean", isOptional: true },
        { name: "remote_config", type: "string", isOptional: true },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "workspace_documents",
      columns: [
        { name: "name", type: "string" },
        { name: "uuid", type: "string", isIndexed: true },
        { name: "workspace_slug", type: "string", isIndexed: true },
        { name: "vector_box_ids", type: "string", isOptional: true },
        {
          name: "content_hash",
          type: "string",
          isOptional: true,
          isIndexed: true,
        },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
      name: "workspace_chats",
      columns: [
        { name: "uuid", type: "string", isIndexed: true },
        { name: "workspace_thread_slug", type: "string", isIndexed: true },
        { name: "prompt", type: "string" },
        { name: "response", type: "string" },
        { name: "created_at", type: "number" },
      ],
    }),
    tableSchema({
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
    tableSchema({
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
});
