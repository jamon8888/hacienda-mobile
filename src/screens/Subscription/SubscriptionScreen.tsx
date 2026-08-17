import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, Star, Crown } from "phosphor-react-native";
import { useSubscription } from "@/hooks/useSubscription";
import { useTranslation } from "@/hooks/useTranslation";

export default function SubscriptionScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isPaid } = useSubscription();
  const { t } = useTranslation("subscription");

  return (
    <SafeView safeAreaClassNames="bg-[#1B1B1E]">
      {/* Header */}
      <View
        className="flex-row items-center gap-4 px-4 pt-[var(--inset-top, 0)] pb-4"
        style={{ paddingTop: insets.top }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">{t("title")}</Text>
      </View>

      <View className="flex-1 px-4">
        {/* Current Plan */}
        <View className="bg-[#27282A] rounded-lg p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-2">
            <Crown
              size={20}
              color={isPaid ? "#3B82F6" : "#9F9FA0"}
              weight="fill"
            />
            <Text className="text-white font-medium">
              {isPaid ? t("plans.pro") : t("plans.free")}
            </Text>
          </View>
          <Text className="text-white/60 text-sm">
            {isPaid ? t("descriptions.pro") : t("descriptions.free")}
          </Text>
        </View>

        {/* Features Comparison */}
        <View className="bg-[#27282A] rounded-lg p-4 mb-4">
          <Text className="text-white font-medium mb-3">
            {t("features.title")}
          </Text>

          <View className="gap-3">
            <FeatureRow label={t("features.localInference")} included={true} />
            <FeatureRow
              label={t("features.documentGeneration")}
              included={true}
            />
            <FeatureRow
              label={t("features.officeFormatReading")}
              included={true}
            />
            <FeatureRow label={t("features.pushToTalk")} included={true} />
            <FeatureRow label={t("features.audioMemos")} included={true} />
            <FeatureRow
              label={t("features.cloudInference")}
              included={isPaid}
              comingSoon
            />
            <FeatureRow
              label={t("features.verticals")}
              included={false}
              comingSoon
            />
            <FeatureRow
              label={t("features.nerExtraction")}
              included={false}
              comingSoon
            />
            <FeatureRow
              label={t("features.loraAdapters")}
              included={false}
              comingSoon
            />
          </View>
        </View>

        {/* Placeholder Upgrade Button */}
        <TouchableOpacity
          disabled
          className="bg-[#3B82F6]/50 py-3 px-4 rounded-lg flex-row items-center justify-center gap-2">
          <Star size={20} color="#FFF" weight="fill" />
          <Text className="text-white/60 font-medium">
            {t("badges.comingSoon")}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeView>
  );
}

function FeatureRow({
  label,
  included,
  comingSoon,
}: {
  label: string;
  included: boolean;
  comingSoon?: boolean;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Check size={16} color={included ? "#22C55E" : "#9F9FA0"} weight="bold" />
      <Text className={`text-sm ${included ? "text-white" : "text-white/40"}`}>
        {label}
      </Text>
      {comingSoon && (
        <Text className="text-xs text-[#3B82F6] ml-auto">Coming Soon</Text>
      )}
    </View>
  );
}
