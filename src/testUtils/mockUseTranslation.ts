import enAudio from "@/i18n/locales/en/audio.json";
import enCommon from "@/i18n/locales/en/common.json";

type TranslationDict = Record<string, unknown>;

function lookup(dict: TranslationDict, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function createMockT() {
  const t = (key: string, options?: Record<string, unknown>) => {
    if (key.startsWith("common:")) {
      return lookup(enCommon, key.slice("common:".length)) ?? key;
    }
    const count = options?.count;
    const suffix =
      typeof count === "number" ? (count === 1 ? "_one" : "_other") : "";
    return lookup(enAudio, key + suffix) ?? lookup(enAudio, key) ?? key;
  };
  return { t, i18n: { language: "en" }, ready: true, language: "en" };
}
