import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as RNLocalize from "react-native-localize";
import dayjs from "dayjs";
import "dayjs/locale/en";
import "dayjs/locale/fr";

import type { SupportedLanguage } from "./types";
import en from "./locales/en";
import fr from "./locales/fr";

const resources = {
  en: { ...en },
  fr: { ...fr },
};

let initializationPromise: Promise<void> | undefined;

const isSupportedLanguage = (language: unknown): language is SupportedLanguage =>
  language === "en" || language === "fr";

const normalizeLanguage = (language: unknown): SupportedLanguage =>
  isSupportedLanguage(language) ? language : "en";

const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const locales = RNLocalize.getLocales();
    if (locales.length > 0) {
      return normalizeLanguage(locales[0].languageCode);
    }
  } catch (error) {
    console.warn("Failed to detect device language:", error);
  }
  return "en";
};

const applyDayjsLocale = (language: SupportedLanguage): void => {
  dayjs.locale(language);
};

i18n.on("languageChanged", (lng: string) => {
  applyDayjsLocale(normalizeLanguage(lng));
});

export const initI18n = (): Promise<void> => {
  if (i18n.isInitialized) {
    return Promise.resolve();
  }

  if (!initializationPromise) {
    initializationPromise = i18n
      .use(initReactI18next)
      .init({
        resources,
        lng: getDeviceLanguage(),
        fallbackLng: "en",
        defaultNS: "common",
        interpolation: {
          escapeValue: false,
        },
        react: {
          useSuspense: false,
        },
      })
      .then(() => {
        applyDayjsLocale(normalizeLanguage(i18n.language));
        return undefined;
      })
      .catch((error: unknown) => {
        initializationPromise = undefined;
        throw error;
      });

    // The module-level startup call must not create an unhandled rejection.
    initializationPromise.catch(() => undefined);
  }

  return initializationPromise;
};

initI18n();

export const changeLanguage = (language: SupportedLanguage): Promise<void> => {
  const nextLanguage = normalizeLanguage(language);
  return i18n.changeLanguage(nextLanguage).then(() => undefined);
};

export const getCurrentLanguage = (): SupportedLanguage =>
  normalizeLanguage(i18n.language);

export default i18n;
