import CactusLmWrapper from "../index";

const mockComplete = jest.fn().mockResolvedValue({
  response: "ok",
  prefillTokens: 1,
  decodeTokens: 1,
  totalTokens: 2,
  decodeTps: 0,
  totalTimeMs: 0,
});

jest.mock("cactus-react-native", () => ({
  __esModule: true,
  CactusLM: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    download: jest.fn().mockResolvedValue(undefined),
    complete: mockComplete,
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

jest.mock("@dr.pogodin/react-native-fs", () => ({
  DocumentDirectoryPath: "/mock/Documents",
  exists: jest.fn().mockResolvedValue(false),
  readDir: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/store/NeedleStore", () => {
  const init = jest.fn().mockResolvedValue(undefined);
  const selectTools = jest.fn();
  const store = { init, selectTools, ready: true, routerEnabled: true };
  return {
    __esModule: true,
    default: store,
    __mockStore: store,
  };
});

const { __mockStore: mockStore } = jest.requireMock("@/store/NeedleStore");

let keepAliveSpy: jest.SpyInstance;

beforeAll(() => {
  keepAliveSpy = jest
    .spyOn(CactusLmWrapper.prototype as any, "keepAlive")
    .mockImplementation(() => {});
});

afterAll(() => {
  keepAliveSpy.mockRestore();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.ready = true;
  mockComplete.mockResolvedValue({
    response: "ok",
    prefillTokens: 1,
    decodeTokens: 1,
    totalTokens: 2,
    decodeTps: 0,
    totalTimeMs: 0,
  });
});

describe("CactusLmWrapper tool ranking", () => {
  it("does not rank when tool list is <= 5", async () => {
    mockStore.selectTools.mockResolvedValue([]);

    const wrapper = new CactusLmWrapper({
      model: "test-model",
      parent: { workspace: undefined } as any,
    });
    (wrapper as any).cactusLmContext = {
      complete: mockComplete,
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    const tools = Array.from({ length: 5 }, (_, i) => ({
      function: {
        name: `tool-${i}`,
        description: `tool ${i}`,
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    }));

    await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "hello" }],
      () => {},
      tools,
    );

    expect(mockStore.selectTools).not.toHaveBeenCalled();
    const completeTools = mockComplete.mock.calls[0][0].tools;
    expect(completeTools).toHaveLength(5);
  });

  it("ranks long tool lists with Needle and passes the subset", async () => {
    const selected = [
      {
        name: "tool-0",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "tool-3",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "tool-7",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    ];
    mockStore.selectTools.mockResolvedValue(selected);

    const wrapper = new CactusLmWrapper({
      model: "test-model",
      parent: { workspace: undefined } as any,
    });
    (wrapper as any).cactusLmContext = {
      complete: mockComplete,
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    const tools = Array.from({ length: 8 }, (_, i) => ({
      function: {
        name: `tool-${i}`,
        description: `tool ${i}`,
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    }));

    await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "hello" }],
      () => {},
      tools,
    );

    expect(mockStore.selectTools).toHaveBeenCalledWith(
      "hello",
      expect.arrayContaining([
        expect.objectContaining({ name: "tool-0" }),
        expect.objectContaining({ name: "tool-7" }),
      ]),
      5,
    );
    const completeTools = mockComplete.mock.calls[0][0].tools;
    expect(completeTools).toEqual(selected);
  });

  it("falls back to full tool list when Needle is not ready", async () => {
    mockStore.ready = false;

    const wrapper = new CactusLmWrapper({
      model: "test-model",
      parent: { workspace: undefined } as any,
    });
    (wrapper as any).cactusLmContext = {
      complete: mockComplete,
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    const tools = Array.from({ length: 8 }, (_, i) => ({
      function: {
        name: `tool-${i}`,
        description: `tool ${i}`,
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    }));

    await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "hello" }],
      () => {},
      tools,
    );

    expect(mockStore.selectTools).not.toHaveBeenCalled();
    const completeTools = mockComplete.mock.calls[0][0].tools;
    expect(completeTools).toHaveLength(8);
  });
});
