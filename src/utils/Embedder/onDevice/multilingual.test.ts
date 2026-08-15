export {};

const mockLmInstance = {
  download: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
  embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3, 0.4] }),
  destroy: jest.fn().mockResolvedValue(undefined),
};
const mockCactusLM = jest.fn().mockImplementation(() => mockLmInstance);
jest.mock("cactus-react-native", () => ({
  CactusLM: mockCactusLM,
}));

jest.mock("@/utils/models/defaults", () => ({
  MULTILINGUAL_EMBEDDING_MODELS: {
    "nomic-embed-text-v2-moe": {
      id: "nomic-embed-text-v2-moe",
      modelId: "Cactus-Compute/nomic-embed-text-v2-moe",
      tag: "",
      dimensions: 768,
      contextLength: 512,
      languages: ["en", "fr"],
    },
  },
  CACTUS_EMBEDDING_MODELS: {
    "nomic-embed-text-v2-moe": {
      slug: "nomic-embed-text-v2-moe",
      quantization: "int8",
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MultilingualEmbedderProvider = require("./multilingual").default;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (MultilingualEmbedderProvider as any).instances = new Map();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("embed", () => {
  it("constructs CactusLM from the registry slug, downloads, initializes it, and embeds with L2 normalize enabled", async () => {
    const provider = new MultilingualEmbedderProvider(
      "nomic-embed-text-v2-moe",
    );

    const embedding = await provider.embed("bonjour le monde", "query");

    expect(mockCactusLM).toHaveBeenCalledWith({
      model: "nomic-embed-text-v2-moe",
      options: { quantization: "int8" },
    });
    expect(mockLmInstance.download).toHaveBeenCalled();
    expect(mockLmInstance.init).toHaveBeenCalled();
    expect(mockLmInstance.embed).toHaveBeenCalledWith({
      text: "search_query: bonjour le monde",
      normalize: true,
    });
    expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("reuses the same provider instance per model id", () => {
    const a = new MultilingualEmbedderProvider("nomic-embed-text-v2-moe");
    const b = new MultilingualEmbedderProvider("nomic-embed-text-v2-moe");

    expect(a).toBe(b);
  });
});

describe("cleanup", () => {
  it("destroys the CactusLM instance", async () => {
    const provider = new MultilingualEmbedderProvider(
      "nomic-embed-text-v2-moe",
    );
    await provider.embed("hello", "query");

    await provider.cleanup();

    expect(mockLmInstance.destroy).toHaveBeenCalled();
    expect(provider.isInitialized()).toBe(false);
  });
});
