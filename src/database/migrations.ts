import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';
import { createTable } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // Initial migration is handled by the schema
    {
      toVersion: 2,
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
