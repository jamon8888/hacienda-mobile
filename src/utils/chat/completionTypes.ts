import type { CactusLMCompleteOptions as NativeCompletionParams } from "cactus-react-native";

// Alias allows flexibility to switch API providers later
// We should move towards OpenAI Compatible API Params
export type ApiCompletionParams = NativeCompletionParams;

/**
 * App-specific completion parameters that are not part of the cactus.lm API.
 * These parameters are used only within the app and should be stripped before
 * sending to the cactus.lm API.
 */
export type AppOnlyCompletionParams = {
  /**
   * Schema version for the completion parameters.
   * Used for migrations when the schema changes.
   */
  version?: number;

  /**
   * Whether to include thinking parts in the context sent to the model.
   * When false, thinking parts are removed from the context to save context space.
   */
  include_thinking_in_context?: boolean;

  /**
   * Legacy aliases used throughout the app that don't match the native API.
   * Mapped to native fields in `toApiCompletionParams`.
   */
  stop?: string[];
  top_p?: number;
  top_k?: number;
  n_predict?: number;
  // Add other app-specific fields here
};

/**
 * List of keys that are app-specific and should be stripped before
 * sending to the cactus.lm API.
 */
const APP_ONLY_KEYS: (keyof AppOnlyCompletionParams)[] = [
  "version",
  "include_thinking_in_context",
  "stop",
  "top_p",
  "top_k",
  "n_predict",
];

/**
 * The merged type used throughout the app.
 * This includes both API parameters and app-specific parameters.
 */
export type CompletionParams = ApiCompletionParams & AppOnlyCompletionParams;

/**
 * Strips app-specific fields and maps legacy aliases before sending to cactus.lm.
 *
 * @param params - The app completion parameters that may include app-specific properties
 * @returns A clean API completion parameters object with only properties supported by the API
 */
export function toApiCompletionParams(
  params: CompletionParams,
): ApiCompletionParams {
  const apiParams: Record<string, unknown> = { ...params };

  for (const key of APP_ONLY_KEYS) {
    delete apiParams[key];
  }

  if (params.stop !== undefined) {
    apiParams.stopSequences = params.stop;
  }
  if (params.top_p !== undefined) {
    apiParams.topP = params.top_p;
  }
  if (params.top_k !== undefined) {
    apiParams.topK = params.top_k;
  }
  if (params.n_predict !== undefined) {
    apiParams.maxTokens = params.n_predict;
  }

  return apiParams as unknown as ApiCompletionParams;
}
