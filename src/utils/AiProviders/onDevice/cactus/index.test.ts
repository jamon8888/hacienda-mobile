export {};

const mockLmInstance = {
  download: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
  complete: jest.fn().mockResolvedValue({
    success: true,
    response: "hi there",
    prefillTokens: 10,
    decodeTokens: 5,
    totalTokens: 15,
    decodeTps: 42,
    totalTimeMs: 123,
  }),
  destroy: jest.fn().mockResolvedValue(undefined),
};
const mockCactusLM = jest.fn().mockImplementation(() => mockLmInstance);
jest.mock("cactus-react-native", () => ({
  CactusLM: mockCactusLM,
}));

jest.mock("@dr.pogodin/react-native-fs", () => ({
  DocumentDirectoryPath: "/mock",
  exists: jest.fn().mockResolvedValue(true),
  readDir: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/utils/models", () => ({ defaultModels: [] }));
jest.mock("@/utils/chat", () => ({ stops: ["</s>"] }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const CactusLmWrapper = require("./index").default;

const mockParent = { workspace: { temperature: 0.5, contextLength: 2048 } };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("initialize", () => {
  it("constructs CactusLM from the registry slug, downloads, and initializes it", async () => {
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });

    await wrapper.initialize();

    expect(mockCactusLM).toHaveBeenCalledWith({
      model: "qwen3-0.6b",
      options: { quantization: "int8" },
    });
    expect(mockLmInstance.download).toHaveBeenCalled();
    expect(mockLmInstance.init).toHaveBeenCalled();
  });

  it("throws for a model with no Cactus registry bundle", async () => {
    const wrapper = new CactusLmWrapper({
      model: "test-model.gguf",
      parent: mockParent,
    });

    await expect(wrapper.initialize()).rejects.toThrow(
      "no Cactus registry bundle",
    );
  });
});

describe("getChatCompletion", () => {
  it("maps the CactusLM result fields onto ICompleteResponse", async () => {
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });

    const result = await wrapper.getChatCompletion([
      { role: "user", content: "hello" },
    ]);

    expect(mockLmInstance.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: "user", content: "hello" }],
        options: expect.objectContaining({ temperature: 0.5 }),
      }),
    );
    expect(result).toEqual({
      textResponse: "hi there",
      metrics: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
        outputTps: 42,
        duration: 123,
      },
    });
  });
});

describe("streamGetChatCompletion tool-call translation", () => {
  it("flattens OpenAI-shaped tool definitions into CactusLMTool before calling complete()", async () => {
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });
    const availableTools = [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Gets the weather",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
    ];

    await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "weather?" }],
      () => {},
      availableTools,
    );

    expect(mockLmInstance.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          {
            name: "get_weather",
            description: "Gets the weather",
            parameters: { type: "object", properties: {}, required: [] },
          },
        ],
      }),
    );
  });

  it("wraps CactusLM functionCalls back into ICompleteResponse toolCalls, JSON-stringifying arguments", async () => {
    mockLmInstance.complete.mockResolvedValueOnce({
      success: true,
      response: "",
      functionCalls: [{ name: "get_weather", arguments: { city: "Paris" } }],
      prefillTokens: 1,
      decodeTokens: 1,
      totalTokens: 2,
      decodeTps: 1,
      totalTimeMs: 1,
    });
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });

    const result = await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "weather?" }],
      () => {},
      [],
    );

    expect(result.toolCalls).toEqual([
      {
        type: "function",
        function: { name: "get_weather", arguments: '{"city":"Paris"}' },
      },
    ]);
  });

  it("forwards streamed tokens directly via onToken", async () => {
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });
    const tokens: string[] = [];
    mockLmInstance.complete.mockImplementationOnce(
      async ({ onToken }: { onToken: (t: string) => void }) => {
        onToken("hi");
        onToken(" there");
        return {
          success: true,
          response: "hi there",
          prefillTokens: 1,
          decodeTokens: 1,
          totalTokens: 2,
          decodeTps: 1,
          totalTimeMs: 1,
        };
      },
    );

    await wrapper.streamGetChatCompletion(
      [{ role: "user", content: "hi" }],
      (t: string) => tokens.push(t),
      [],
    );

    expect(tokens).toEqual(["hi", " there"]);
  });
});

describe("cleanup", () => {
  it("destroys the CactusLM instance", async () => {
    const wrapper = new CactusLmWrapper({
      model: "unsloth/Qwen3-0.6B-GGUF",
      parent: mockParent,
    });
    await wrapper.initialize();

    await wrapper.cleanup();

    expect(mockLmInstance.destroy).toHaveBeenCalled();
  });
});
