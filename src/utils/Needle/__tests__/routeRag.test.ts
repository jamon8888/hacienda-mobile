import type { CactusLMTool } from "cactus-react-native";

import { NeedleClient } from "../NeedleClient";

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

jest.useFakeTimers();

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
});

describe("NeedleClient.routeRag", () => {
  it("returns fallback when the model is not initialized", async () => {
    const client = new NeedleClient("/mock/needle-cq4");
    const decision = await client.routeRag("hello");
    expect(decision).toEqual({ type: "fallback" });
  });

  it("returns skip when needle calls skip_rag", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "skip_rag", arguments: {} }],
      confidence: 0.95,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const decision = await client.routeRag("What is the capital of France?");

    expect(decision).toEqual({ type: "skip" });
    expect(mockLmInstance.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "What is the capital of France?" }],
        options: expect.objectContaining({ forceTools: true }),
      }),
    );
  });

  it("returns retrieve with clamped top_k", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [
        {
          name: "retrieve_documents",
          arguments: { query: "budget", top_k: 3 },
        },
      ],
      confidence: 0.85,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const decision = await client.routeRag("What does the budget say?", {
      maxTopK: 2,
    });

    expect(decision).toEqual({
      type: "retrieve",
      query: "budget",
      topK: 2,
    });
  });

  it("returns expand with revised query", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [
        {
          name: "expand_search",
          arguments: { revised_query: "Q3 revenue details", top_k: 4 },
        },
      ],
      confidence: 0.88,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const decision = await client.routeRag("tell me about revenue", {
      maxTopK: 5,
    });

    expect(decision).toEqual({
      type: "expand",
      query: "Q3 revenue details",
      topK: 4,
    });
  });

  it("returns fallback when confidence is below threshold", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "skip_rag", arguments: {} }],
      confidence: 0.5,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const decision = await client.routeRag("hello");

    expect(decision).toEqual({ type: "fallback" });
  });

  it("returns fallback on unknown tool names", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "unknown_tool", arguments: {} }],
      confidence: 0.9,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const decision = await client.routeRag("hello");

    expect(decision).toEqual({ type: "fallback" });
  });

  it("returns fallback on timeout", async () => {
    mockLmInstance.complete.mockImplementationOnce(() => new Promise(() => {}));

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const promise = client.routeRag("hello", {
      maxTopK: 2,
      timeoutMs: 100,
    });

    jest.advanceTimersByTime(100);
    const decision = await promise;

    expect(decision).toEqual({ type: "fallback" });
  });
});

describe("NeedleClient.selectTools", () => {
  const threeTools: CactusLMTool[] = [
    {
      name: "a",
      description: "",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "b",
      description: "",
      parameters: { type: "object", properties: {}, required: [] },
    },
    {
      name: "c",
      description: "",
      parameters: { type: "object", properties: {}, required: [] },
    },
  ];

  it("returns the original list when needle is not initialized", async () => {
    const client = new NeedleClient("/mock/needle-cq4");
    const tools: CactusLMTool[] = [
      {
        name: "a",
        description: "",
        parameters: { type: "object", properties: {}, required: [] },
      },
    ];
    const result = await client.selectTools("hello", tools, 5);
    expect(result).toEqual(tools);
  });

  it("returns only the tools selected by needle", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "a", arguments: {} }],
      confidence: 0.9,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const result = await client.selectTools("hello", threeTools, 2);

    expect(result).toEqual([threeTools[0]]);
  });

  it("returns the original list when the completion rejects", async () => {
    mockLmInstance.complete.mockRejectedValueOnce(new Error("native error"));

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const result = await client.selectTools("hello", threeTools, 2);

    expect(result).toEqual(threeTools);
  });

  it("returns the original list on timeout", async () => {
    mockLmInstance.complete.mockImplementationOnce(() => new Promise(() => {}));

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const promise = client.selectTools("hello", threeTools, 2);

    jest.advanceTimersByTime(500);
    const result = await promise;

    expect(result).toEqual(threeTools);
  });

  it("returns the original list when confidence is below threshold", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "a", arguments: {} }],
      confidence: 0.5,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const result = await client.selectTools("hello", threeTools, 2);

    expect(result).toEqual(threeTools);
  });

  it("returns the original list when no selected name matches a known tool", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "unknown_tool", arguments: {} }],
      confidence: 0.9,
    });

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();
    const result = await client.selectTools("hello", threeTools, 2);

    expect(result).toEqual(threeTools);
  });
});

describe("NeedleClient.init retry", () => {
  it("does not stay permanently unusable after a failed init", async () => {
    mockLmInstance.init.mockRejectedValueOnce(new Error("init failed"));

    const client = new NeedleClient("/mock/needle-cq4");
    await expect(client.init()).rejects.toThrow("init failed");

    // A failed init must not leave `lm` assigned, or every future call falls back
    // forever without ever retrying the underlying CactusLM.init().
    expect(await client.routeRag("hello")).toEqual({ type: "fallback" });

    await client.init();
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      functionCalls: [{ name: "skip_rag", arguments: {} }],
      confidence: 0.95,
    });
    expect(await client.routeRag("hello")).toEqual({ type: "skip" });
  });
});

describe("NeedleClient completion concurrency", () => {
  it("refuses a second call while a timed-out completion is still pending natively", async () => {
    let resolveNative: (value: unknown) => void = () => {};
    mockLmInstance.complete.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveNative = resolve;
        }),
    );

    const client = new NeedleClient("/mock/needle-cq4");
    await client.init();

    const first = client.routeRag("hello", { timeoutMs: 50 });
    jest.advanceTimersByTime(50);
    expect(await first).toEqual({ type: "fallback" });

    // The native completion from the first call never settled -- a second call must
    // not race it against the same non-reentrant CactusLM instance.
    const second = await client.routeRag("hello again");
    expect(second).toEqual({ type: "fallback" });
    expect(mockLmInstance.complete).toHaveBeenCalledTimes(1);

    resolveNative({ success: true, functionCalls: [], confidence: 0.9 });
  });
});
