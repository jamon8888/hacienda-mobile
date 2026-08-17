// jest.setup.js
// Global mocks for React Native native modules.
// Must run BEFORE any test file imports.

import { NativeModules } from "react-native";

// ── AsyncStorage ──────────────────────────────────────────────
// @react-native-async-storage/async-storage
const mockStorage = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key) => Promise.resolve(mockStorage[key] || null)),
    setItem: jest.fn((key, value) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
    multiGet: jest.fn((keys) =>
      Promise.resolve(keys.map((k) => [k, mockStorage[k] || null]))
    ),
    multiSet: jest.fn((entries) => {
      entries.forEach(([k, v]) => (mockStorage[k] = v));
      return Promise.resolve();
    }),
    multiRemove: jest.fn((keys) => {
      keys.forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
      return Promise.resolve();
    }),
  },
}));

// ── NativeEventEmitter ────────────────────────────────────────
jest.mock("react-native/Libraries/EventEmitter/NativeEventEmitter", () => {
  const { EventEmitter } = require("events");
  return {
    __esModule: true,
    default: class MockNativeEventEmitter {
      constructor() {
        this._emitter = new EventEmitter();
      }
      addListener(event, callback) {
        this._emitter.on(event, callback);
        return { remove: jest.fn() };
      }
      removeAllListeners(event) {
        this._emitter.removeAllListeners(event);
      }
      emit(event, data) {
        this._emitter.emit(event, data);
      }
      removeSubscription(subscription) {
        subscription.remove();
      }
    },
  };
});

// ── NativeModules stubs ───────────────────────────────────────
// Each native module used by the app gets a minimal mock.
NativeModules.DeviceInfoModule = {
  getCPUInfo: jest.fn().mockResolvedValue({ cores: 8 }),
  getDeviceModel: jest.fn().mockResolvedValue("Test Device"),
};

NativeModules.StorageModule = {
  getDocumentDir: jest.fn().mockResolvedValue("/tmp/test-docs"),
  getCacheDir: jest.fn().mockResolvedValue("/tmp/test-cache"),
};

NativeModules.DownloadModule = {
  downloadFile: jest.fn().mockResolvedValue({ jobId: 1 }),
  cancelDownload: jest.fn().mockResolvedValue(undefined),
};

NativeModules.VectorBox = {
  insertVector: jest.fn().mockResolvedValue(1),
  searchVectors: jest.fn().mockResolvedValue([]),
  deleteVector: jest.fn().mockResolvedValue(undefined),
};

NativeModules.EmbeddingGemmaModule = {
  embed: jest.fn().mockResolvedValue(new Array(128).fill(0.1)),
};

NativeModules.XbergModule = {
  extractText: jest.fn().mockResolvedValue({ text: "mock content", metadata: {} }),
};

NativeModules.PdfParserModule = {
  parse: jest.fn().mockResolvedValue({ pages: [] }),
};

NativeModules.WebScraperModule = {
  scrape: jest.fn().mockResolvedValue({ content: "mock html", title: "test" }),
};

NativeModules.AudioDecoderModule = {
  decodeToPCM16: jest.fn().mockResolvedValue({ samples: Array(16000).fill(0), sampleRate: 16000, durationMs: 1000 }),
};

NativeModules.TextToSpeechModule = {
  speak: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
};

NativeModules.VoiceAudioModule = {
  startRecording: jest.fn().mockResolvedValue(undefined),
  stopRecording: jest.fn().mockResolvedValue({ uri: "file:///tmp/test.m4a" }),
};

NativeModules.KeepAwakeModule = {
  activate: jest.fn().mockResolvedValue(undefined),
  deactivate: jest.fn().mockResolvedValue(undefined),
};

// ── cactus-react-native (on-device LLM) ───────────────────────
jest.mock("cactus-react-native", () => {
  const mockContext = {
    completion: jest.fn().mockResolvedValue({ text: "mock response" }),
    isModelLoaded: jest.fn().mockReturnValue(true),
    tokenize: jest.fn().mockReturnValue([1, 2, 3]),
    detokenize: jest.fn().mockReturnValue("hello"),
    abort: jest.fn(),
  };

  return {
    __esModule: true,
    CactusLM: jest.fn().mockImplementation(() => mockContext),
    CactusSTT: jest.fn().mockImplementation(() => ({
      download: jest.fn().mockResolvedValue(undefined),
      init: jest.fn().mockResolvedValue(undefined),
      transcribe: jest.fn().mockResolvedValue({ response: "mock transcription" }),
      destroy: jest.fn().mockResolvedValue(undefined),
    })),
    CactusTTS: jest.fn().mockImplementation(() => ({
      synthesize: jest.fn().mockResolvedValue(new Float32Array(1024)),
    })),
  };
});

// ── react-native-fs ───────────────────────────────────────────
jest.mock("@dr.pogodin/react-native-fs", () => {
  const fs = {
    DocumentDirectoryPath: "/tmp/test-docs",
    CachesDirectoryPath: "/tmp/test-cache",
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue("mock file content"),
    readFileAssets: jest.fn().mockResolvedValue("mock asset content"),
    exists: jest.fn().mockResolvedValue(true),
    mkdir: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    readDir: jest.fn().mockResolvedValue([]),
    stat: jest.fn().mockResolvedValue({ size: 1024, mtime: Date.now() }),
  };
  return {
    __esModule: true,
    default: fs,
    ...fs,
  };
});

// ── react-native-keychain ─────────────────────────────────────
jest.mock("react-native-keychain", () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(null),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

// ── react-native-haptic-feedback ──────────────────────────────
jest.mock("react-native-haptic-feedback", () => ({
  trigger: jest.fn(),
}));

// ── react-native-linear-gradient ───────────────────────────────
jest.mock("react-native-linear-gradient", () => ({
  __esModule: true,
  default: "LinearGradient",
}));

// ── react-native-get-random-values ────────────────────────────
jest.mock("react-native-get-random-values", () => {});

// ── react-native-sse ──────────────────────────────────────────
jest.mock("react-native-sse", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeAllEventListeners: jest.fn(),
  })),
}));

// ── react-native-vision-camera ────────────────────────────────
jest.mock("react-native-vision-camera", () => ({
  useCameraDevices: jest.fn().mockReturnValue({ back: null, front: null }),
  useCameraPermission: jest.fn().mockReturnValue({ granted: true, requestPermission: jest.fn() }),
  Camera: "Camera",
}));

// ── react-native-waveform-player ───────────────────────────────
jest.mock("react-native-waveform-player", () => ({
  __esModule: true,
  AudioWaveformView: "AudioWaveformView",
}));

// ── react-native-waveform-recorder ─────────────────────────────
jest.mock("react-native-waveform-recorder", () => ({
  __esModule: true,
  WaveformRecorderView: "WaveformRecorderView",
  ensureMicrophonePermission: jest.fn().mockResolvedValue(true),
}));

// ── react-native-nitro-modules ─────────────────────────────────
jest.mock("react-native-nitro-modules", () => ({
  NitroModules: {
    createHybridObject: jest.fn().mockReturnValue({}),
  },
}));

// ── @nozbe/watermelondb (will be overridden per-test) ──────────
// Only mock the parts that touch native SQLite at import time.
// Actual WatermelonDB tests use an in-memory adapter (Task 3).
jest.mock("@nozbe/watermelondb/adapters/sqlite", () => {
  const { SQLiteAdapter: RealAdapter } = jest.requireActual(
    "@nozbe/watermelondb/adapters/sqlite"
  );
  return { __esModule: true, default: RealAdapter };
});

// ── @op-engineering/op-sqlite ──────────────────────────────────
jest.mock("@op-engineering/op-sqlite", () => ({
  open: jest.fn().mockReturnValue({
    execute: jest.fn().mockReturnValue({ rows: [] }),
    close: jest.fn(),
  }),
}));

// ── MobX persist-store (prevent AsyncStorage import in tests) ──
jest.mock("mobx-persist-store", () => {
  const actual = jest.requireActual("mobx-persist-store");
  return {
    ...actual,
    makePersistable: jest.fn((target, config) => {
      // In tests, just make it a no-op — stores stay in-memory
      return Promise.resolve(target);
    }),
  };
});

// ── Firebase ───────────────────────────────────────────────────
jest.mock("@react-native-firebase/app", () => ({
  __esModule: true,
  default: {
    app: { name: "[DEFAULT]" },
    firebase: {},
  },
}));

jest.mock("@react-native-firebase/analytics", () => ({
  __esModule: true,
  default: () => ({
    logEvent: jest.fn().mockResolvedValue(undefined),
    setUserId: jest.fn().mockResolvedValue(undefined),
    setUserProperties: jest.fn().mockResolvedValue(undefined),
  }),
}));
