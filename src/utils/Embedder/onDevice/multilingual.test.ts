export {};

const mockLmInstance = {
  init: jest.fn().mockResolvedValue(undefined),
  embed: jest.fn().mockResolvedValue({ embedding: [0.1, 0.2, 0.3, 0.4] }),
  destroy: jest.fn().mockResolvedValue(undefined),
};
const mockCactusLM = jest.fn().mockImplementation(() => mockLmInstance);
jest.mock('cactus-react-native', () => ({
  CactusLM: mockCactusLM,
}));

jest.mock('@dr.pogodin/react-native-fs', () => ({
  exists: jest.fn().mockResolvedValue(true),
  mkdir: jest.fn().mockResolvedValue(undefined),
  downloadFile: jest.fn(),
}));

jest.mock('@/utils/models/defaults', () => ({
  MULTILINGUAL_EMBEDDING_MODELS: {
    'multilingual-e5-small': {
      id: 'multilingual-e5-small',
      modelId: 'cstr/multilingual-e5-small-GGUF',
      tag: 'https://huggingface.co/cstr/multilingual-e5-small-GGUF/resolve/main/multilingual-e5-small-q4_k.gguf',
      dimensions: 384,
      contextLength: 512,
      languages: ['en', 'fr'],
    },
  },
  resolveDestinationPathFromGGUFUrl: () => '/mock/models/e5-small.gguf',
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MultilingualEmbedderProvider = require('./multilingual').default;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (MultilingualEmbedderProvider as any).instances = new Map();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('embed', () => {
  it('constructs CactusLM from the local model path, initializes it, and embeds with L2 normalize enabled', async () => {
    const provider = new MultilingualEmbedderProvider('multilingual-e5-small');

    const embedding = await provider.embed('bonjour le monde', 'query');

    expect(mockCactusLM).toHaveBeenCalledWith({ model: '/mock/models/e5-small.gguf' });
    expect(mockLmInstance.init).toHaveBeenCalled();
    expect(mockLmInstance.embed).toHaveBeenCalledWith({ text: 'query: bonjour le monde', normalize: true });
    expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('reuses the same provider instance per model id', () => {
    const a = new MultilingualEmbedderProvider('multilingual-e5-small');
    const b = new MultilingualEmbedderProvider('multilingual-e5-small');

    expect(a).toBe(b);
  });
});

describe('cleanup', () => {
  it('destroys the CactusLM instance', async () => {
    const provider = new MultilingualEmbedderProvider('multilingual-e5-small');
    await provider.embed('hello', 'query');

    await provider.cleanup();

    expect(mockLmInstance.destroy).toHaveBeenCalled();
    expect(provider.isInitialized()).toBe(false);
  });
});
