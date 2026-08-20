// Stub for Node's `fs` module, aliased in metro.config.js purely so Metro can statically
// resolve @sctg/sentencepiece-js's top-level `import * as fs from 'fs'`. That import backs
// SentencePieceProcessor.load(url), which our tokenizer (src/utils/Embedder/onDevice/
// tokenizer.ts) never calls -- we use loadFromB64StringModel() instead, reading the bundled
// model via react-native-fs. Throwing here (rather than silently no-op'ing) makes it obvious
// if that ever changes and .load() actually gets called on-device.
function unsupported() {
  throw new Error(
    "Node's fs module is not available in React Native. This stub exists only to satisfy " +
      "@sctg/sentencepiece-js's static import; SentencePieceProcessor.load(url) (the only " +
      "caller of fs.readFileSync) is unused -- see scripts/stubs/fs.js.",
  );
}

module.exports = {
  readFileSync: unsupported,
  readFile: unsupported,
  existsSync: unsupported,
};
