import { Text, TouchableOpacity, View } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "phosphor-react-native";
import { IWorkspacePageKey } from "./index";
import { useTranslation } from "@/hooks/useTranslation";
import { changeLanguage, getCurrentLanguage } from "@/i18n";
import type { SupportedLanguage } from "@/i18n/types";

const languages: { code: SupportedLanguage; name: string }[] = [
  { code: "en", name: "English" },
  { code: "fr", name: "Français" },
];

interface LanguageSettingsProps {
  goToPage: (page: IWorkspacePageKey) => void;
}

export default function LanguageSettings({ goToPage }: LanguageSettingsProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("settings");
  const currentLanguage = getCurrentLanguage();

  async function handleLanguageChange(code: SupportedLanguage) {
    await changeLanguage(code);
  }

  return (
    <SafeView
      scrollable={false}
      safeAreaClassNames="pt-[21px]"
      containerClassNames="flex flex-col"
      safeAreaStyle={{ backgroundColor: "#0E0F0F" }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingBottom: 20,
        }}
        className="w-full flex flex-row items-center justify-center relative">
        <TouchableOpacity
          onPress={() => goToPage("main")}
          className="absolute left-0 flex flex-row items-center gap-2">
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">
          {t("language.title")}
        </Text>
      </View>

      {/* Language selection */}
      <View style={{ gap: 16 }} className="flex flex-col">
        <View className="flex flex-col" style={{ gap: 4 }}>
          <Text className="text-white font-semibold text-lg">
            {t("language.title")}
          </Text>
          <Text style={{ color: "#9F9FA0" }} className="text-sm">
            {t("language.subtitle")}
          </Text>
        </View>

        <View className="flex flex-col" style={{ gap: 12 }}>
          {languages.map(lang => {
            const isActive = currentLanguage === lang.code;
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => handleLanguageChange(lang.code)}
                style={{
                  backgroundColor: isActive ? "#3B82F6" : "#27282A",
                  padding: 14,
                  gap: 12,
                }}
                className="w-full flex flex-row items-center rounded-lg">
                <Text className="text-lg font-medium" style={{ color: "#FFF" }}>
                  {lang.name}
                </Text>
                <View className="flex flex-1 flex-row items-center justify-end">
                  {isActive && (
                    <Text
                      className="text-sm"
                      style={{ color: "rgba(255,255,255,0.8)" }}>
                      {t("language.current", {
                        language: lang.name,
                      })}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeView>
  );
}
