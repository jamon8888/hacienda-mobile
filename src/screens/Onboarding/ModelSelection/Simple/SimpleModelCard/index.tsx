import React from "react";
import {
  View,
  TouchableOpacity,
  Text,
  Image,
  StyleProp,
  ViewStyle,
  ActivityIndicator,
} from "react-native";
import { Cube, CheckCircle, ShieldCheck, TrendUp } from "phosphor-react-native";
import { useTranslation } from "react-i18next";
import MODEL_CARDS from "@/utils/models/defaults";

interface ModelRecommendation {
  isRecommended: boolean;
  reason: string;
  ramEstimate: string;
  qualityScore: number;
  quantization: string;
  deviceTier: "optimal" | "good" | "acceptable" | "not_recommended";
}

interface ModelCardProps {
  model: any;
  recommendation?: ModelRecommendation;
  isSelected: boolean;
  isDownloaded: boolean;
  modelDownloadUrl: string | null;
  downloadProgress: number;
  onSelect: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

export default function ModelCard({
  model,
  recommendation,
  isSelected,
  isDownloaded,
  modelDownloadUrl,
  downloadProgress,
  onSelect,
  containerStyle = {},
}: ModelCardProps) {
  const { t } = useTranslation("onboarding");
  const tierTranslations: Record<string, string> = {
    optimal: t("modelSelection.deviceTier.optimal"),
    good: t("modelSelection.deviceTier.good"),
    acceptable: t("modelSelection.deviceTier.acceptable"),
    not_recommended: t("modelSelection.deviceTier.not_recommended"),
  };

  const getModelIcon = () => {
    if (model.imageUrl) {
      return (
        <Image
          source={{ uri: model.imageUrl }}
          style={{ width: 48, height: 48 }}
          className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center"
        />
      );
    }
    const defaultCard = MODEL_CARDS.find(
      card => card.modelId === model.modelId,
    );
    const Icon = defaultCard?.Icon || Cube;
    return (
      <View
        style={{ width: 48, height: 48 }}
        className="shrink-0 grow-0 bg-white rounded-lg flex items-center justify-center">
        <Icon size={24} color={isSelected ? "#61baff" : "#000"} />
      </View>
    );
  };

  const getRecommendationBadge = () => {
    if (!recommendation?.isRecommended) return null;

    const tierColors = {
      optimal: "bg-emerald-500",
      good: "bg-blue-500",
      acceptable: "bg-amber-500",
      not_recommended: "bg-gray-500",
    };

    const tierIcons = {
      optimal: TrendUp,
      good: ShieldCheck,
      acceptable: CheckCircle,
      not_recommended: CheckCircle,
    };

    const TierIcon = tierIcons[recommendation.deviceTier] || CheckCircle;

    return (
      <View
        className={`flex flex-row items-center gap-1 px-2 py-1 rounded ${
          tierColors[recommendation.deviceTier] || "bg-blue-500"
        }`}>
        <TierIcon size={10} color="#fff" weight="bold" />
        <Text className="text-white text-xs font-medium capitalize">
          {tierTranslations[recommendation.deviceTier]}
        </Text>
      </View>
    );
  };

  const getQualityIndicator = () => {
    if (!recommendation) return null;

    const score = recommendation.qualityScore;
    let color = "text-red-400";
    if (score >= 85) color = "text-emerald-400";
    else if (score >= 70) color = "text-blue-400";
    else if (score >= 55) color = "text-amber-400";

    return (
      <View className="flex flex-row items-center gap-1">
        <Text className={`${color} text-xs font-mono`}>
          {recommendation.qualityScore}
        </Text>
        <Text className="text-white/50 text-xs">{t("modelSelection.qualitySuffix")}</Text>
      </View>
    );
  };

  const getQuantizationBadge = () => {
    if (
      !recommendation?.quantization ||
      recommendation.quantization === "Unknown"
    )
      return null;

    return (
      <View className="flex flex-row items-center gap-1 px-2 py-0.5 bg-white/10 rounded">
        <Text className="text-white/80 text-xs font-mono">
          {recommendation.quantization}
        </Text>
      </View>
    );
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{
        width: "90%",
        maxWidth: 380,
        maxHeight: 82,
        padding: 16,
        backgroundColor: isSelected ? "#7cd4fd65" : "rgba(255, 255, 255, 0.1)",
        borderWidth: isSelected ? 2 : 0,
        borderColor: isSelected ? "#7cd4fd" : "transparent",
        ...(containerStyle as object),
      }}
      className={`flex flex-row rounded-lg gap-x-4 items-center ${
        !!downloadProgress ? "disabled:opacity-50" : ""
      }`}
      disabled={!!modelDownloadUrl && modelDownloadUrl !== model.downloadUrl}
      onPress={onSelect}>
      <View className="flex flex-row gap-x-4 items-center justify-between">
        {getModelIcon()}
        <View className="flex flex-col gap-y-1 flex-1">
          <View className="flex flex-row gap-x-2 items-center justify-between">
            <View className="flex flex-row gap-x-2 items-center flex-1">
              <Text className="text-white text-2xl font-bold">
                {model.name}
              </Text>
              {getRecommendationBadge()}
            </View>
            {modelDownloadUrl === model.downloadUrl && !isDownloaded ? (
              <View className="flex-row items-center gap-2 ml-4">
                <ActivityIndicator size="small" color="#6ce9a6" />
                <Text className="text-xs text-white min-w-[32px]">
                  {downloadProgress}%
                </Text>
              </View>
            ) : null}
          </View>
          <View className="flex flex-row gap-x-2 items-center justify-between">
            <Text
              numberOfLines={2}
              style={{ maxWidth: "70%" }}
              ellipsizeMode="tail"
              className="text-white/60 text-sm">
              {model.description}
            </Text>
            <View className="flex flex-row gap-x-2 items-center">
              {getQuantizationBadge()}
              {getQualityIndicator()}
            </View>
          </View>
          {recommendation?.isRecommended && (
            <Text
              className="text-emerald-400 text-xs italic"
              numberOfLines={1}
              ellipsizeMode="tail">
              {recommendation.reason}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
