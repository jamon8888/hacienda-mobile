/**
 * Completion settings version constants and migration utilities
 *
 * This file handles the versioning and migration of completion settings.
 * It contains the default completion settings and migration logic.
 *
 * When adding new settings:
 * 1. Add the setting to defaultCompletionParams
 * 2. Increment CURRENT_COMPLETION_SETTINGS_VERSION
 * 3. Add a migration step in migrateCompletionSettings to handle the new setting
 */

import { CompletionParams } from "./completionTypes";

// Current version of the completion settings schema
// Increment this when adding new settings or changing existing ones
export const CURRENT_COMPLETION_SETTINGS_VERSION = 2;

/**
 * Default completion parameters used throughout the app
 */
export const defaultCompletionParams: CompletionParams = {
  // App-specific properties
  version: CURRENT_COMPLETION_SETTINGS_VERSION,
  include_thinking_in_context: true,

  // cactus-react-native 1.13.1 CompletionParams (v2 field names)
  temperature: 0.7,
  topK: 40,
  topP: 0.95,
  maxTokens: 1024,
  stopSequences: [""],
};

// Keys present in version-0/1 (llama.cpp-style) settings that have no equivalent
// in cactus-react-native 1.13.1's CompletionParams and are dropped on migration.
const V1_KEYS_WITHOUT_SDK_EQUIVALENT = [
  "prompt",
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
  "chat_template",
  "jinja",
  "tool_choice",
];

/**
 * Migrates completion settings to the latest version
 * @param settings The settings object to migrate
 * @returns The migrated settings object
 */
export function migrateCompletionSettings(settings: any): any {
  // Clone the settings to avoid modifying the original
  const migratedSettings = { ...settings };

  // If no version is specified, assume it's the initial version (0)
  if (migratedSettings.version === undefined) {
    migratedSettings.version = 0;
  }

  // Apply migrations sequentially
  if (migratedSettings.version < 1) {
    // Migration to version 1: Add include_thinking_in_context
    migratedSettings.include_thinking_in_context =
      defaultCompletionParams.include_thinking_in_context;
    migratedSettings.version = 1;
  }

  if (migratedSettings.version < 2) {
    // Migration to version 2: rename llama.cpp-style fields to the
    // cactus-react-native 1.13.1 CompletionParams field names, and
    // drop sampling knobs that no longer exist in the SDK.
    if ("n_predict" in migratedSettings) {
      migratedSettings.maxTokens = migratedSettings.n_predict;
      delete migratedSettings.n_predict;
    }
    if ("top_p" in migratedSettings) {
      migratedSettings.topP = migratedSettings.top_p;
      delete migratedSettings.top_p;
    }
    if ("top_k" in migratedSettings) {
      migratedSettings.topK = migratedSettings.top_k;
      delete migratedSettings.top_k;
    }
    if ("stop" in migratedSettings) {
      migratedSettings.stopSequences = migratedSettings.stop;
      delete migratedSettings.stop;
    }
    for (const key of V1_KEYS_WITHOUT_SDK_EQUIVALENT) {
      delete migratedSettings[key];
    }
    migratedSettings.version = 2;
  }

  return migratedSettings;
}
