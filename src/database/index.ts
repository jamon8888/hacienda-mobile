import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import schema from './schema';
import migrations from './migrations';

// models
import Workspace from './models/Workspace';
import WorkspaceThread from './models/WorkspaceThread';
import Document from './models/Document';
import WorkspaceChat from './models/WorkspaceChat';
import Subscription from './models/Subscription';

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  dbName: 'anythingllm',
  jsi: true,
  onSetUpError: error => console.error('Database setup error:', error),
});

export const database = new Database({
  adapter,
  modelClasses: [
    Workspace,
    WorkspaceThread,
    Document,
    WorkspaceChat,
    Subscription,
  ],
});

export const databaseTables = [
  Workspace.table,
  WorkspaceThread.table,
  Document.table,
  WorkspaceChat.table,
  Subscription.table,
];

export { default as Subscription } from "./models/Subscription";
