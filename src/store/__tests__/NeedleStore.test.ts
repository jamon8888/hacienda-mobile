import { NeedleStore } from "../NeedleStore";

const mockLmInstance = {
  init: jest.fn().mockResolvedValue(undefined),
  complete: jest.fn().mockResolvedValue({
    success: true,
    response: "",
    functionCalls: [],
    confidence: 0.9,
  }),
  destroy: jest.fn().mockResolvedValue(undefined),
};

jest.mock("cactus-react-native", () => ({
  CactusLM: jest.fn().mockImplementation(() => mockLmInstance),
}));

jest.mock("@/services/downloads/NeedleBundleDownloader", () => ({
  NeedleBundleDownloader: jest.fn().mockImplementation(() => ({
    ensureDownloaded: jest.fn().mockResolvedValue("/mock/needle-cq4"),
  })),
}));

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
});

describe("NeedleStore", () => {
  it("initializes successfully and sets ready=true", async () => {
    const store = new NeedleStore();
    await store.init();

    expect(store.ready).toBe(true);
    expect(store.busy).toBe(false);
    expect(store.error).toBeNull();
  });

  it("reports error and ready=false when download fails", async () => {
    const { NeedleBundleDownloader } = jest.requireMock(
      "@/services/downloads/NeedleBundleDownloader",
    );
    NeedleBundleDownloader.mockImplementationOnce(() => ({
      ensureDownloaded: jest.fn().mockRejectedValue(new Error("network down")),
    }));

    const store = new NeedleStore();
    await store.init();

    expect(store.ready).toBe(false);
    expect(store.error).toBe("network down");
    expect(store.busy).toBe(false);
  });

  it("returns fallback when routeRag is called before init", async () => {
    const store = new NeedleStore();
    const decision = await store.routeRag("hello");
    expect(decision).toEqual({ type: "fallback" });
  });

  it("returns a RAG decision after init", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "skip_rag", arguments: {} }],
      confidence: 0.95,
    });

    const store = new NeedleStore();
    await store.init();
    const decision = await store.routeRag("hello");

    expect(decision).toEqual({ type: "skip" });
    expect(store.lastRoute).toEqual({ type: "skip" });
  });

  it("returns fallback on routeRag error without throwing", async () => {
    mockLmInstance.complete.mockRejectedValueOnce(new Error("boom"));

    const store = new NeedleStore();
    await store.init();
    const decision = await store.routeRag("hello");

    expect(decision).toEqual({ type: "fallback" });
    expect(store.busy).toBe(false);
  });

  it("serializes concurrent routeRag calls", async () => {
    mockLmInstance.complete.mockImplementation(
      () =>
        new Promise(resolve => {
          setTimeout(
            () =>
              resolve({
                success: true,
                functionCalls: [{ name: "skip_rag", arguments: {} }],
                confidence: 0.95,
              }),
            50,
          );
        }),
    );

    const store = new NeedleStore();
    await store.init();

    const p1 = store.routeRag("first");
    const p2 = store.routeRag("second");

    jest.advanceTimersByTime(100);
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toEqual({ type: "skip" });
    expect(r2).toEqual({ type: "fallback" });
  });

  it("returns all tools when selectTools is called before init", async () => {
    const store = new NeedleStore();
    const tools = [
      {
        name: "a",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    ];
    const result = await store.selectTools("hello", tools, 5);
    expect(result).toEqual(tools);
  });

  it("returns selected tools after init", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "a", arguments: {} }],
      confidence: 0.9,
    });

    const store = new NeedleStore();
    await store.init();
    const tools = [
      {
        name: "a",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "b",
        description: "",
        parameters: { type: "object" as const, properties: {}, required: [] },
      },
    ];
    const result = await store.selectTools("hello", tools, 1);

    expect(result).toEqual([tools[0]]);
  });

  it("cleans up the CactusLM instance on destroy", async () => {
    const store = new NeedleStore();
    await store.init();
    await store.destroy();

    expect(mockLmInstance.destroy).toHaveBeenCalled();
    expect(store.ready).toBe(false);
  });
});
