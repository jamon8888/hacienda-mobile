import { pcmBase64ToInt16Samples } from './audioEncoding';

// cactus-react-native ships classes, not the { lm, error }-returning static
// factory this pipeline used to assume. Mock the real shape: `new CactusSTT()`
// / `new CactusLM()`, then instance `.init()`.
const mockSttInstance = {
  download: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
  transcribe: jest.fn().mockResolvedValue({ success: true, response: 'hello world', confidence: 0.95 }),
  destroy: jest.fn().mockResolvedValue(undefined),
};
const mockLlmInstance = {
  download: jest.fn().mockResolvedValue(undefined),
  init: jest.fn().mockResolvedValue(undefined),
  complete: jest.fn().mockResolvedValue({
    success: true,
    response: 'hi there',
    confidence: 0.82,
    cloudHandoff: false,
    thinking: 'the user greeted me',
  }),
  destroy: jest.fn().mockResolvedValue(undefined),
};
const mockCactusSTT = jest.fn().mockImplementation(() => mockSttInstance);
const mockCactusLM = jest.fn().mockImplementation(() => mockLlmInstance);
jest.mock('cactus-react-native', () => ({
  CactusSTT: mockCactusSTT,
  CactusLM: mockCactusLM,
}));

const mockSpeakText = jest.fn().mockResolvedValue(undefined);
jest.mock('./NativeTTS', () => ({ speakText: mockSpeakText }));

jest.mock('@/utils/models/defaults', () => ({
  CACTUS_VOICE_MODELS: {
    'parakeet-tdt-0.6b-v3-int4': { name: 'Parakeet TDT 0.6B (4-bit)', slug: 'parakeet-tdt-0.6b-v3', quantization: 'int4' },
    'gemma-4-e2b-it-int8': { name: 'Gemma 4 E2B (8-bit)', slug: 'gemma-4-e2b-it', quantization: 'int8' },
  },
  DEFAULT_CACTUS_ASR_MODEL: 'parakeet-tdt-0.6b-v3-int4',
  DEFAULT_CACTUS_LLM_MODEL: 'gemma-4-e2b-it-int8',
}));

type SpeechSegmentHandler = (segment: { audioBase64: string; isFinal: boolean }) => void;

let audioStreamHandlers: Record<string, (...args: unknown[]) => void>;
const mockAudioStreamInstance = {
  on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
    audioStreamHandlers[event] = cb;
    return () => {
      delete audioStreamHandlers[event];
    };
  }),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};
jest.mock('./VoiceAudioStream', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockAudioStreamInstance),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { VoicePipelineProvider } = require('./VoicePipelineProvider');

beforeEach(() => {
  jest.clearAllMocks();
  audioStreamHandlers = {};
});

function emitSpeechSegment(audioBase64: string, isFinal = true) {
  const handler = audioStreamHandlers.onSpeechSegment as SpeechSegmentHandler;
  return handler({ audioBase64, isFinal });
}

describe('initialize', () => {
  it('constructs CactusSTT and CactusLM from registry slugs, downloads before init, and initializes both', async () => {
    const provider = new VoicePipelineProvider();

    await provider.initialize();

    expect(mockCactusSTT).toHaveBeenCalledWith({
      model: 'parakeet-tdt-0.6b-v3',
      options: { quantization: 'int4', pro: undefined },
    });
    expect(mockCactusLM).toHaveBeenCalledWith({
      model: 'gemma-4-e2b-it',
      options: { quantization: 'int8', pro: undefined },
    });
    expect(mockSttInstance.download.mock.invocationCallOrder[0]).toBeLessThan(
      mockSttInstance.init.mock.invocationCallOrder[0]
    );
    expect(mockLlmInstance.download.mock.invocationCallOrder[0]).toBeLessThan(
      mockLlmInstance.init.mock.invocationCallOrder[0]
    );
    expect(provider.getState()).toBe('idle');
    expect(provider.isReady()).toBe(true);
  });
});

describe('speech segment pipeline', () => {
  it('transcribes decoded PCM audio via CactusSTT, answers via CactusLM, and speaks the response', async () => {
    const provider = new VoicePipelineProvider();
    const responses: unknown[] = [];
    const transcripts: unknown[] = [];
    provider.onResponse((r: unknown) => responses.push(r));
    provider.onTranscript((text: string, isFinal: boolean) => transcripts.push({ text, isFinal }));

    await provider.startListening();
    await emitSpeechSegment('AAABAA==');

    expect(mockSttInstance.transcribe).toHaveBeenCalledWith({
      audio: pcmBase64ToInt16Samples('AAABAA=='),
    });
    expect(mockLlmInstance.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'hello world' })]),
      })
    );
    expect(transcripts).toEqual([{ text: 'hello world', isFinal: true }]);
    expect(responses).toEqual([
      expect.objectContaining({
        text: 'hi there',
        confidence: 0.82,
        cloudHandoff: false,
        thinking: 'the user greeted me',
      }),
    ]);
    expect(mockSpeakText).toHaveBeenCalledWith('hi there');
  });

  it('does not call the LLM or TTS when transcription comes back empty', async () => {
    mockSttInstance.transcribe.mockResolvedValueOnce({ success: true, response: '   ' });
    const provider = new VoicePipelineProvider();

    await provider.startListening();
    await emitSpeechSegment('AAABAA==');

    expect(mockLlmInstance.complete).not.toHaveBeenCalled();
    expect(mockSpeakText).not.toHaveBeenCalled();
  });

  it('skips speaking the response when TTS is disabled', async () => {
    const provider = new VoicePipelineProvider({ enableTTS: false });

    await provider.startListening();
    await emitSpeechSegment('AAABAA==');

    expect(mockLlmInstance.complete).toHaveBeenCalled();
    expect(mockSpeakText).not.toHaveBeenCalled();
  });
});

describe('cleanup', () => {
  it('destroys both cactus models', async () => {
    const provider = new VoicePipelineProvider();
    await provider.initialize();

    await provider.cleanup();

    expect(mockSttInstance.destroy).toHaveBeenCalled();
    expect(mockLlmInstance.destroy).toHaveBeenCalled();
  });
});
