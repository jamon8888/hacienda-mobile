import schema from "@/database/schema";
import migrations from "@/database/migrations";
import AudioMemo from "@/database/models/AudioMemo";
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

describe("AudioMemo Database Schema", () => {
  it("should have audio_memos table in schema", () => {
    expect(schema.tables["audio_memos"]).toBeDefined();
  });

  it("should have correct columns in audio_memos table", () => {
    const audioMemosTable = schema.tables["audio_memos"];
    expect(audioMemosTable).toBeDefined();

    const columns = audioMemosTable.columnArray;
    expect(columns).toHaveLength(8);

    expect(columns.find(c => c.name === "uuid")).toEqual({
      name: "uuid",
      type: "string",
      isIndexed: true,
    });

    expect(columns.find(c => c.name === "workspace_slug")).toEqual({
      name: "workspace_slug",
      type: "string",
      isIndexed: true,
      isOptional: true,
    });

    expect(columns.find(c => c.name === "audio_uri")).toEqual({
      name: "audio_uri",
      type: "string",
    });

    expect(columns.find(c => c.name === "transcript")).toEqual({
      name: "transcript",
      type: "string",
      isOptional: true,
    });

    expect(columns.find(c => c.name === "duration_ms")).toEqual({
      name: "duration_ms",
      type: "number",
    });

    expect(columns.find(c => c.name === "waveform_peaks")).toEqual({
      name: "waveform_peaks",
      type: "string",
    });

    expect(columns.find(c => c.name === "created_at")).toEqual({
      name: "created_at",
      type: "number",
    });

    expect(columns.find(c => c.name === "updated_at")).toEqual({
      name: "updated_at",
      type: "number",
    });
  });

  it("should have schema version 5", () => {
    expect(schema.version).toBe(5);
  });
});

describe("AudioMemo Migration", () => {
  it("should have migration to version 3", () => {
    const migrationV3 = migrations.sortedMigrations.find(
      m => m.toVersion === 3,
    );
    expect(migrationV3).toBeDefined();
  });

  it("should have createTable step for audio_memos in migration v3", () => {
    const migrationV3 = migrations.sortedMigrations.find(
      m => m.toVersion === 3,
    );
    expect(migrationV3).toBeDefined();

    const steps = migrationV3!.steps;
    expect(steps).toHaveLength(1);

    const createTableStep = steps[0] as any;
    expect(createTableStep.type).toBe("create_table");
    expect(createTableStep.schema.name).toBe("audio_memos");
  });
});

describe("AudioMemo.create", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should serialize waveformPeaks to JSON string", async () => {
    const mockCreate = jest.fn().mockImplementation(callback => {
      const memo = {
        uuid: "test-uuid",
        workspaceSlug: "test-slug",
        audioUri: "test-uri",
        transcript: null,
        durationMs: 1000,
        waveformPeaks: "", // will be set by callback
        createdAt: 0,
        updatedAt: 0,
      };
      callback(memo);
      return Promise.resolve(memo);
    });

    const mockGet = jest.fn().mockReturnValue({ create: mockCreate });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;
    (generateUUID as jest.Mock).mockReturnValue("generated-uuid");

    const input = {
      audioUri: "file:///test.m4a",
      waveformPeaks: [0.1, 0.2, 0.3, 0.4, 0.5],
    };

    const result = await AudioMemo.create(input);

    expect(mockGet).toHaveBeenCalledWith("audio_memos");
    expect(mockCreate).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalled();

    const callback = mockCreate.mock.calls[0][0];
    const memoObj = {
      uuid: "",
      workspaceSlug: null,
      audioUri: "",
      transcript: null,
      durationMs: 0,
      waveformPeaks: "",
      createdAt: 0,
      updatedAt: 0,
    };
    callback(memoObj);

    expect(memoObj.waveformPeaks).toBe(
      JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]),
    );
    expect(memoObj.uuid).toBe("generated-uuid");
    expect(memoObj.audioUri).toBe("file:///test.m4a");
    expect(memoObj.createdAt).toBeGreaterThan(0);
  });

  it("should return AudioMemoType with correct shape", async () => {
    const mockCreate = jest.fn().mockImplementation(callback => {
      const memo = {
        uuid: "test-uuid",
        workspaceSlug: null,
        audioUri: "test-uri",
        transcript: null,
        durationMs: 1000,
        waveformPeaks: JSON.stringify([1, 2, 3]),
        createdAt: 1234567890,
        updatedAt: 1234567890,
      };
      callback(memo);
      return Promise.resolve(memo);
    });

    const mockGet = jest.fn().mockReturnValue({ create: mockCreate });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;
    (generateUUID as jest.Mock).mockReturnValue("generated-uuid");

    const result = await AudioMemo.create({ audioUri: "test" });

    expect(result).toHaveProperty("uuid");
    expect(result).toHaveProperty("workspaceSlug");
    expect(result).toHaveProperty("audioUri");
    expect(result).toHaveProperty("transcript");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("waveformPeaks");
    expect(result).toHaveProperty("createdAt");
    expect(result).toHaveProperty("updatedAt");
    expect(typeof result.waveformPeaks).toBe("string"); // raw string from mock
  });
});

describe("AudioMemo.update", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should update memo fields and persist to database", async () => {
    const existingMemo = {
      uuid: "test-uuid",
      workspaceSlug: "test-slug",
      audioUri: "file:///old.m4a",
      transcript: "old transcript",
      durationMs: 1000,
      waveformPeaks: "[1,2,3]",
      createdAt: 1000,
      updatedAt: 1000,
      update: jest.fn().mockImplementation(callback => {
        callback(existingMemo);
        return Promise.resolve(existingMemo);
      }),
    };

    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([existingMemo]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    const result = await AudioMemo.update("test-uuid", {
      transcript: "new transcript",
      audioUri: "file:///new.m4a",
    });

    expect(mockGet).toHaveBeenCalledWith("audio_memos");
    expect(mockQuery).toHaveBeenCalled();
    expect(existingMemo.update).toHaveBeenCalled();
    expect(existingMemo.transcript).toBe("new transcript");
    expect(existingMemo.audioUri).toBe("file:///new.m4a");
    expect(result).toBeDefined();
  });

  it("should return null when memo not found", async () => {
    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    const result = await AudioMemo.update("nonexistent-uuid", {
      transcript: "new",
    });

    expect(result).toBeNull();
  });

  it("should serialize waveformPeaks when updating", async () => {
    const existingMemo = {
      uuid: "test-uuid",
      update: jest.fn().mockImplementation(callback => {
        callback(existingMemo);
        return Promise.resolve(existingMemo);
      }),
    };

    const mockQuery = jest
      .fn()
      .mockReturnValue({ fetch: jest.fn().mockResolvedValue([existingMemo]) });
    const mockGet = jest.fn().mockReturnValue({ query: mockQuery });
    const mockWrite = jest.fn().mockImplementation(fn => fn());

    require("@/database").database.write = mockWrite;
    require("@/database").database.get = mockGet;

    await AudioMemo.update("test-uuid", { waveformPeaks: [0.1, 0.2] });

    expect(existingMemo.waveformPeaks).toBe(JSON.stringify([0.1, 0.2]));
  });
});

describe("AudioMemo.toAudioMemoObject", () => {
  it("should return correct shape", () => {
    const data = {
      uuid: "uuid",
      workspaceSlug: "slug",
      audioUri: "uri",
      transcript: "text",
      durationMs: 100,
      waveformPeaks: [1, 2, 3],
      createdAt: 1000,
      updatedAt: 2000,
    };
    const result = AudioMemo.toAudioMemoObject(data as any);
    expect(result).toEqual(data);
  });
});
