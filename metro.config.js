const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const { withNativeWind } = require("nativewind/metro");

const defaultConfig = getDefaultConfig(__dirname);
const { assetExts, sourceExts } = defaultConfig.resolver;

const configOptions = {
  resolver: {
    assetExts: assetExts.filter(ext => ext !== "svg"),
    sourceExts: [...sourceExts, "svg"],
    // @sctg/sentencepiece-js (SentencePiece tokenizer for EmbeddingGemma, see
    // src/utils/Embedder/onDevice/tokenizer.ts) statically imports Node's `fs` module at the
    // top of its bundle, which Metro has no RN-side module for. The function that actually
    // uses it (SentencePieceProcessor.load(url)) is never called -- our tokenizer uses
    // loadFromB64StringModel() instead -- so a stub that throws if ever reached is safe. See
    // scripts/stubs/fs.js. `module` and `url` are imported by the same bundle and need the
    // same treatment. Jest has its own `^fs$` mapping to src/shims/fs.js (jest.config.js).
    extraNodeModules: {
      fs: require.resolve("./scripts/stubs/fs.js"),
      module: require.resolve("./scripts/stubs/module.js"),
      url: require.resolve("./scripts/stubs/url.js"),
    },
  },
  transformer: {
    babelTransformerPath: require.resolve(
      "react-native-svg-transformer/react-native",
    ),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    enableBabelRuntime: true,
  },
};

const config = mergeConfig(getDefaultConfig(__dirname), configOptions);
module.exports = withNativeWind(config, { input: "./global.css" });
