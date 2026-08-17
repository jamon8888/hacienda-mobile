const isTest = process.env.BABEL_ENV === "test" || process.env.NODE_ENV === "test";

module.exports = {
  presets: [
    "module:@react-native/babel-preset",
    // nativewind/babel wraps RN primitives in react-native-css-interop's
    // interop elements, which breaks findAllByType(TouchableOpacity/Pressable)
    // assertions used across this test suite. Tests intentionally render the
    // plain RN element tree and assert on className props directly instead.
    ...(isTest ? [] : ["nativewind/babel"]),
  ],
  plugins: [
    ["module:react-native-dotenv", { moduleName: "@env" }],
    ["@babel/plugin-proposal-decorators", { legacy: true }],
    "react-native-reanimated/plugin",
    [
      "module-resolver",
      {
        root: ["./src"],
        extensions: [".ios.js", ".android.js", ".js", ".ts", ".tsx", ".json"],
        alias: {
          "@": "./src",
        },
      },
    ],
  ],
};
