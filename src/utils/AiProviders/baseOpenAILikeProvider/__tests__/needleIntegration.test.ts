import BaseOpenAILikeProvider from "../index";
import { queryCache } from "@/utils/AiProviders/semanticSearchCache";

jest.mock("react-native-device-info", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("react-native-get-random-values", () => ({}));

jest.mock("uuid", () => ({
  __esModule: true,
  v4: jest.fn(() => "mock-uuid"),
}));

jest.mock("@/utils/ToolsManager", () => ({
  __esModule: true,
  default: {},
}));

jest.mock("@/store/NeedleStore", () => {
  const routeRag = jest.fn();
  const selectTools = jest.fn();
  const init = jest.fn().mockResolvedValue(undefined);
  return {
    __esModule: true,
    NEEDLE_ROUTER_ENABLED: true,
    default: { init, routeRag, selectTools, ready: true },
    __mockStore: { init, routeRag, selectTools },
  };
});

jest.mock("@/utils/VectorDB", () => {
  const getWorkspaceVectorCount = jest.fn();
  const runSemanticSearch = jest.fn();
  const api = { getWorkspaceVectorCount, runSemanticSearch };
  return {
    __esModule: true,
    default: api,
    getWorkspaceVectorCount,
    runSemanticSearch,
    __mockFns: { getWorkspaceVectorCount, runSemanticSearch },
  };
});

jest.mock("@/utils/Embedder", () => {
  const embed = jest.fn().mockResolvedValue([0.1, 0.2, 0.3]);
  return {
    __esModule: true,
    default: jest.fn(),
    getEmbeddingProvider: jest.fn().mockReturnValue({ embed }),
    MultilingualEmbeddingModelId: {},
    __mockEmbed: embed,
  };
});

jest.mock("@/database/models/Workspace", () => ({
  __esModule: true,
  default: {
    toWorkspaceObject: (w: any) => w,
  },
  toWorkspaceObject: (w: any) => w,
}));

const { __mockStore: mockStore } = jest.requireMock("@/store/NeedleStore");
const { __mockFns: vectorDbMocks } = jest.requireMock("@/utils/VectorDB");
const { __mockEmbed: mockEmbed } = jest.requireMock("@/utils/Embedder");

class TestProvider extends BaseOpenAILikeProvider {
  client = {} as any;
  isOTypeModel = false;
  model = "test-model";
  temperature = 0.7;
  log = jest.fn();
  loadNewModel = jest.fn().mockResolvedValue(undefined);
  unloadModel = jest.fn().mockResolvedValue(undefined);
  availableModels = jest.fn().mockResolvedValue([]);
}

beforeEach(() => {
  jest.clearAllMocks();
  // The semantic-search cache is shared (module-level) rather than
  // per-instance now, so it needs resetting between tests the same way the
  // mocks do - otherwise an earlier test's cached result for the same
  // prompt/workspace/topN can be served back here instead of a fresh search.
  queryCache.clear();
  vectorDbMocks.getWorkspaceVectorCount.mockResolvedValue(10);
  vectorDbMocks.runSemanticSearch.mockResolvedValue([
    {
      score: 0.1,
      metadata: { name: "doc1", content: "budget travel policy", id: "1" },
    },
  ]);
});

describe("getContextTexts Needle integration", () => {
  it("returns empty array when Needle routes to skip", async () => {
    mockStore.routeRag.mockResolvedValue({ type: "skip" });

    const provider = new TestProvider({ provider: "test", config: {} });
    provider.attachWorkspaceToProvider({
      slug: "test-ws",
      embeddingConfig: null,
    } as any);

    const results = await provider.getContextTexts(
      "What is the capital of France?",
    );

    expect(results).toEqual([]);
    expect(mockStore.routeRag).toHaveBeenCalledWith(
      "What is the capital of France?",
      { maxTopK: 6 },
    );
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("uses route.topK and route.query for expand", async () => {
    mockStore.routeRag.mockResolvedValue({
      type: "expand",
      query: "travel budget policy",
      topK: 4,
    });

    const provider = new TestProvider({ provider: "test", config: {} });
    provider.attachWorkspaceToProvider({
      slug: "test-ws",
      embeddingConfig: null,
    } as any);

    await provider.getContextTexts("Tell me about travel budget");

    expect(mockEmbed).toHaveBeenCalledWith(
      "travel budget policy",
      "query",
      undefined,
    );
    expect(vectorDbMocks.runSemanticSearch).toHaveBeenCalledWith(
      "test-ws",
      [0.1, 0.2, 0.3],
      4,
    );
  });

  it("falls back to default topN and user prompt on fallback route", async () => {
    mockStore.routeRag.mockResolvedValue({ type: "fallback" });

    const provider = new TestProvider({ provider: "test", config: {} });
    provider.attachWorkspaceToProvider({
      slug: "test-ws",
      embeddingConfig: null,
    } as any);

    await provider.getContextTexts("What does the budget say about travel?");

    expect(mockEmbed).toHaveBeenCalledWith(
      "What does the budget say about travel?",
      "query",
      undefined,
    );
    expect(vectorDbMocks.runSemanticSearch).toHaveBeenCalledWith(
      "test-ws",
      [0.1, 0.2, 0.3],
      6,
    );
  });

  it("does not serve a cached fallback result to a later expand route for the same prompt", async () => {
    // Same userPrompt both times -- only the route differs. A cache keyed on the raw
    // userPrompt would incorrectly serve the first (fallback) search's cached results
    // to the second (expand) call instead of running the routed search.
    const prompt = "What does the budget say about travel?";

    mockStore.routeRag.mockResolvedValueOnce({ type: "fallback" });

    const provider = new TestProvider({ provider: "test", config: {} });
    provider.attachWorkspaceToProvider({
      slug: "test-ws",
      embeddingConfig: null,
    } as any);

    await provider.getContextTexts(prompt);
    expect(vectorDbMocks.runSemanticSearch).toHaveBeenCalledWith(
      "test-ws",
      [0.1, 0.2, 0.3],
      6,
    );

    mockStore.routeRag.mockResolvedValueOnce({
      type: "expand",
      query: "travel budget policy expanded",
      topK: 3,
    });
    await provider.getContextTexts(prompt);

    expect(mockEmbed).toHaveBeenLastCalledWith(
      "travel budget policy expanded",
      "query",
      undefined,
    );
    expect(vectorDbMocks.runSemanticSearch).toHaveBeenLastCalledWith(
      "test-ws",
      [0.1, 0.2, 0.3],
      3,
    );
  });
});
