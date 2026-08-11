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
  EMBEDDING_MODEL: {
    modelId: "Cactus-Compute/nomic-embed-text-v2-moe",
    tag: "",
    dimensions: 768,
    contextLength: 512,
    languages: ["en"],
  },
  CACTUS_EMBEDDING_MODELS: {
    "nomic-embed-text-v2-moe": {
      slug: "nomic-embed-text-v2-moe",
      quantization: "int8",
    },
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const OnDeviceEmbedderProvider = require("./index").default;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (OnDeviceEmbedderProvider as any).instance = undefined;
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe("embed", () => {
  it("constructs CactusLM from the registry slug, downloads, initializes it, and embeds with normalize disabled", async () => {
    const provider = new OnDeviceEmbedderProvider();

    const embedding = await provider.embed("hello world", "query");

    expect(mockCactusLM).toHaveBeenCalledWith({
      model: "nomic-embed-text-v2-moe",
      options: { quantization: "int8" },
    });
    expect(mockLmInstance.download).toHaveBeenCalled();
    expect(mockLmInstance.init).toHaveBeenCalled();
    expect(mockLmInstance.embed).toHaveBeenCalledWith({
      text: "search_query: hello world",
      normalize: false,
    });
    expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("truncates the embedding to the requested Matryoshka dimensions", async () => {
    const provider = new OnDeviceEmbedderProvider();

    const embedding = await provider.embed("hello world", "query", 2);

    expect(embedding).toEqual([0.1, 0.2]);
  });

  it("reuses the same CactusLM instance across calls instead of re-initializing", async () => {
    const provider = new OnDeviceEmbedderProvider();

    await provider.embed("first", "query");
    await provider.embed("second", "query");

    expect(mockCactusLM).toHaveBeenCalledTimes(1);
    expect(mockLmInstance.init).toHaveBeenCalledTimes(1);
  });
});

describe("embedBatch", () => {
  it("embeds every text with the document prefix", async () => {
    const provider = new OnDeviceEmbedderProvider();

    await provider.embedBatch(["a", "b"], "embed_document");

    expect(mockLmInstance.embed).toHaveBeenNthCalledWith(1, {
      text: "search_document: a",
      normalize: false,
    });
    expect(mockLmInstance.embed).toHaveBeenNthCalledWith(2, {
      text: "search_document: b",
      normalize: false,
    });
  });
});

describe("cleanup", () => {
  it("destroys the CactusLM instance", async () => {
    const provider = new OnDeviceEmbedderProvider();
    await provider.embed("hello", "query");

    await provider.cleanup();

    expect(mockLmInstance.destroy).toHaveBeenCalled();
    expect(provider.isInitialized()).toBe(false);
  });
});
