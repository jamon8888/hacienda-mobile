// Stub for Node's `url` module, aliased in metro.config.js alongside scripts/stubs/fs.js and
// module.js. @sctg/sentencepiece-js's Emscripten glue calls require("url").fileURLToPath(...)
// inside an `if (ENVIRONMENT_IS_NODE)` branch that's always false in React Native -- Metro
// still statically resolves the literal require() specifier regardless of the runtime guard,
// so this stub exists purely to satisfy that resolution. Never actually called on-device.
function unsupported() {
  throw new Error(
    "Node's url.fileURLToPath is not available in React Native -- see scripts/stubs/url.js.",
  );
}

module.exports = {
  fileURLToPath: unsupported,
};
