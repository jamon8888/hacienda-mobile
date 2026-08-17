import { useTranslation as useReactI18nextTranslation } from "react-i18next";

export const useTranslation = (namespace?: string) => {
  const { t, i18n, ready } = useReactI18nextTranslation(namespace);

  return {
    t,
    i18n,
    ready,
    language: i18n.language,
  };
};

export default useTranslation;
