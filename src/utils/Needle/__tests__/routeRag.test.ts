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
    const tools: CactusLMTool[] = [
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
    const result = await client.selectTools("hello", tools, 2);

    expect(result).toEqual([tools[0]]);
  });
});
