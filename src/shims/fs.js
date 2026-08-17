// Minimal fs shim for @sctg/sentencepiece-js.
// The package imports fs at the top level but we only use loadFromB64StringModel(),
// so readFileSync is never called. This shim satisfies the import without pulling
// in Node's fs module.
module.exports = {
  readFileSync: () => {
    throw new Error("fs.readFileSync is not available in React Native");
  },
  writeFileSync: () => {
    throw new Error("fs.writeFileSync is not available in React Native");
  },
  existsSync: () => false,
};
