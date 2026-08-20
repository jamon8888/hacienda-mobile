import Workspace from "@/database/models/Workspace";
import AudioMemo from "@/database/models/AudioMemo";
import Document from "@/database/models/Document";
import { generateUUID } from "@/utils/constants";

jest.mock("@/database", () => ({
  database: {
    write: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock("@/utils/constants", () => ({
  generateUUID: jest.fn(),
}));

jest.mock("@/database/models/WorkspaceThread", () => ({
  __esModule: true,
  default: {
    create: jest.fn().mockResolvedValue({ slug: "thread-slug" }),
    get: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock("@/database/models/Document", () => ({
  __esModule: true,
  default: { delete: jest.fn().mockResolvedValue(true) },
}));
jest.mock("@/database/models/AudioMemo", () => ({
  __esModule: true,
  default: { delete: jest.fn().mockResolvedValue(true) },
}));
jest.mock("@/database/models/WorkspaceChat", () => ({
  __esModule: true,
  default: { delete: jest.fn().mockResolvedValue(true) },
}));
jest.mock("@/store/UIStore", () => ({
  __esModule: true,
  default: { emitter: { emit: jest.fn() } },
}));
jest.mock("@/utils/AnythingLLMExternal", () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock("@/utils/Telemetry", () => ({
  __esModule: true,
  default: { logEvent: jest.fn(), CUSTOM_EVENTS: { ACTIONS: { WORKSPACE_CREATED: "workspace_created" } } },
}));

describe("Workspace.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sets camelCase fields that round-trip through the model's decorators", async () => {
    const workspaceObj: any = {
      name: "",
      slug: "",
      systemPrompt: "",
      temperature: 0,
      contextLength: 0,
      isRemote: undefined,
      remoteConfig: undefined,
      embeddingConfig: undefined,
      xbergConfig: undefined,
      createdAt: 0,
    };

    const mockCreate = jest.fn().mockImplementation(callback => {
      callback(workspaceObj);
      return Promise.resolve(workspaceObj);
    });
    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) });
    const mockGet = jest
      .fn()
      .mockReturnValue({ create: mockCreate, query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;
    (generateUUID as jest.Mock).mockReturnValue("generated-uuid");

    await Workspace.create({ name: "My Workspace" });

    // The bug: these used to be written as snake_case (workspace.system_prompt,
    // etc.), which never reaches the model's decorated properties and so never
    // persists. Assert the real camelCase properties were set instead.
    expect(workspaceObj.name).toBe("My Workspace");
    expect(workspaceObj.systemPrompt).toBe(Workspace.defaultSystemPrompt);
    expect(workspaceObj.temperature).toBe(Workspace.defaultTemperature);
    expect(workspaceObj.contextLength).toBe(Workspace.defaultContextLength);
    expect(workspaceObj.isRemote).toBe(false);
    expect(workspaceObj.remoteConfig).toBeNull();
    expect(workspaceObj.embeddingConfig).toBeTruthy();
    expect(workspaceObj.xbergConfig).toBeTruthy();
    expect(workspaceObj.createdAt).toBeGreaterThan(0);

    // And confirm no stray snake_case properties were created instead.
    expect(workspaceObj.system_prompt).toBeUndefined();
    expect(workspaceObj.context_length).toBeUndefined();
    expect(workspaceObj.is_remote).toBeUndefined();
    expect(workspaceObj.remote_config).toBeUndefined();
    expect(workspaceObj.embedding_config).toBeUndefined();
    expect(workspaceObj.xberg_config).toBeUndefined();
    expect(workspaceObj.created_at).toBeUndefined();
  });
});

describe("Workspace.update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a plain WorkspaceType object, not the raw Model", async () => {
    const existingWorkspace: any = {
      slug: "my-workspace",
      name: "My Workspace",
      temperature: 0.5,
      update: jest.fn().mockImplementation(callback => {
        callback(existingWorkspace);
        return Promise.resolve(existingWorkspace);
      }),
    };

    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([existingWorkspace]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    const result = await Workspace.update(
      [{ field: "slug", value: "my-workspace" }],
      { temperature: 0.8 },
    );

    expect(existingWorkspace.temperature).toBe(0.8);
    // The Model.update() callback's return value is discarded by
    // WatermelonDB - the plain object must be derived after the write, not
    // returned from inside the updater callback.
    expect(result).not.toBe(existingWorkspace);
    expect(result?.name).toBe("My Workspace");
    expect(result?.temperature).toBe(0.8);
  });

  it("rejects an unknown update field instead of throwing an unguarded TypeError", async () => {
    const existingWorkspace: any = {
      slug: "my-workspace",
      update: jest.fn(),
    };
    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([existingWorkspace]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    const result = await Workspace.update(
      [{ field: "slug", value: "my-workspace" }],
      { notARealField: "x" } as any,
    );

    expect(result).toBeNull();
    expect(existingWorkspace.update).not.toHaveBeenCalled();
  });

  it("rejects a null embeddingConfig with a real validation error instead of crashing", async () => {
    const existingWorkspace: any = {
      slug: "my-workspace",
      update: jest.fn(),
    };
    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([existingWorkspace]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    const result = await Workspace.update(
      [{ field: "slug", value: "my-workspace" }],
      { embeddingConfig: null } as any,
    );

    expect(result).toBeNull();
    expect(existingWorkspace.update).not.toHaveBeenCalled();
  });
});

describe("Workspace.delete", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (require("@/database/models/WorkspaceThread").default.get as jest.Mock)
      .mockResolvedValue([]);
  });

  it("cleans up audio memos (with vectors) for each deleted workspace", async () => {
    const workspaceA: any = { slug: "workspace-a", prepareMarkAsDeleted: jest.fn() };
    const workspaceB: any = { slug: "workspace-b", prepareMarkAsDeleted: jest.fn() };

    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([workspaceA, workspaceB]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());
    const mockBatch = jest.fn().mockResolvedValue(undefined);

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;
    require("@/database").database.batch = mockBatch;

    const result = await Workspace.delete([
      { field: "slug", value: "workspace-a" },
    ]);

    expect(result).toBe(true);
    expect(AudioMemo.delete).toHaveBeenCalledWith(
      [{ field: "workspace_slug", value: "workspace-a" }],
      true,
    );
    expect(AudioMemo.delete).toHaveBeenCalledWith(
      [{ field: "workspace_slug", value: "workspace-b" }],
      true,
    );
    expect(AudioMemo.delete).toHaveBeenCalledTimes(2);
  });

  it("reports failure when the underlying deletion throws", async () => {
    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });

    require("@/database").database.get = mockGet;

    const result = await Workspace.delete([
      { field: "slug", value: "nonexistent" },
    ]);

    expect(result).toBe(false);
    expect(AudioMemo.delete).not.toHaveBeenCalled();
  });
});
