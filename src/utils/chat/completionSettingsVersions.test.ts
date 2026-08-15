import {
  migrateCompletionSettings,
  CURRENT_COMPLETION_SETTINGS_VERSION,
  defaultCompletionParams,
} from "./completionSettingsVersions";

describe("migrateCompletionSettings", () => {
  it("maps version-0 llama.cpp-style keys onto the cactus-react-native CactusLMCompleteOptions shape", () => {
    const legacy = {
      n_predict: 500,
      temperature: 0.5,
      top_p: 0.9,
      top_k: 30,
      stop: ["<|eot_id|>"],
    };

    const migrated = migrateCompletionSettings(legacy);

    expect(migrated).toMatchObject({
      maxTokens: 500,
      temperature: 0.5,
      topP: 0.9,
      topK: 30,
      stopSequences: ["<|eot_id|>"],
      version: CURRENT_COMPLETION_SETTINGS_VERSION,
    });
  });

  it("drops sampling knobs that have no cactus-react-native 1.13.1 equivalent", () => {
    const legacy = {
      min_p: 0.05,
      xtc_threshold: 0.1,
      xtc_probability: 0.0,
      typical_p: 1.0,
      penalty_last_n: 64,
      penalty_repeat: 1.0,
      penalty_freq: 0.0,
      penalty_present: 0.0,
      mirostat: 0,
      mirostat_tau: 5,
      mirostat_eta: 0.1,
      seed: -1,
      n_probs: 0,
      prompt: "",
    };

    const migrated = migrateCompletionSettings(legacy);

    for (const droppedKey of [
      "min_p",
      "xtc_threshold",
      "xtc_probability",
      "typical_p",
      "penalty_last_n",
      "penalty_repeat",
      "penalty_freq",
      "penalty_present",
      "mirostat",
      "mirostat_tau",
      "mirostat_eta",
      "seed",
      "n_probs",
      "prompt",
    ]) {
      expect(migrated).not.toHaveProperty(droppedKey);
    }
  });

  it("is idempotent on settings already at the current version", () => {
    const migrated = migrateCompletionSettings({ ...defaultCompletionParams });

    expect(migrated).toEqual(defaultCompletionParams);
  });

  it("treats an undefined version as version 0 and stamps the current version after migrating", () => {
    const migrated = migrateCompletionSettings({});

    expect(migrated.version).toBe(CURRENT_COMPLETION_SETTINGS_VERSION);
  });
});
