// Stub for Node's `module` module, aliased in metro.config.js alongside scripts/stubs/fs.js.
// @sctg/sentencepiece-js's Emscripten glue does `await import('module')` to get `createRequire`
// inside an `if (ENVIRONMENT_IS_NODE)` branch that's always false in React Native -- Metro still
// statically resolves the literal import specifier regardless of the runtime guard, so this stub
// exists purely to satisfy that resolution. createRequire is never actually called on-device.
function unsupported() {
  throw new Error(
    "Node's module.createRequire is not available in React Native -- see scripts/stubs/module.js.",
  );
}

module.exports = {
  createRequire: unsupported,
};
