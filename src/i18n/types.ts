export type TranslationKeys = {
  common: typeof import("./locales/en/common.json");
  onboarding: typeof import("./locales/en/onboarding.json");
  workspace: typeof import("./locales/en/workspace.json");
  settings: typeof import("./locales/en/settings.json");
  audio: typeof import("./locales/en/audio.json");
  subscription: typeof import("./locales/en/subscription.json");
};

export type SupportedLanguage = "en" | "fr";
