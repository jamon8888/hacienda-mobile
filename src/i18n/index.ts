import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as RNLocalize from "react-native-localize";

import en from "./locales/en";
import fr from "./locales/fr";

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

const getDeviceLanguage = (): string => {
  try {
    const locales = RNLocalize.getLocales();
    if (locales.length > 0) {
      const languageCode = locales[0].languageCode;
      return languageCode in resources ? languageCode : "en";
    }
  } catch (error) {
    console.warn("Failed to detect device language:", error);
  }
  return "en";
};

export const initI18n = (): void => {
  if (i18n.isInitialized) {
    return;
  }

  i18n.use(initReactI18next).init({
    resources,
    lng: getDeviceLanguage(),
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  });
};

initI18n();

export const changeLanguage = (language: string): void => {
  i18n.changeLanguage(language);
};

export const getCurrentLanguage = (): string => i18n.language;

export default i18n;
