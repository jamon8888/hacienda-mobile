import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'workspace_documents',
          columns: [
            { name: 'content_hash', type: 'string', isOptional: true, isIndexed: true },
          ],
        }),
      ],
    },
  ],
});
