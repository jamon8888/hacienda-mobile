module.exports = {
  preset: "react-native",
  setupFiles: ["./jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@sctg/sentencepiece-js$":
      "<rootDir>/node_modules/@sctg/sentencepiece-js/dist/index.cjs",
    "^fs$": "<rootDir>/src/shims/fs.js",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!(react-native|@react-native|react-native-.+|@nozbe/watermelondb|mobx|mobx-react|mobx-persist-store|@react-native-async-storage|cactus-react-native|@dr.pogodin/react-native-fs|@sctg/sentencepiece-js|@op-engineering)/)",
  ],
};
