import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Star, Lightning } from "phosphor-react-native";

interface UpgradePromptProps {
  feature: string;
}

export default function UpgradePrompt({ feature }: UpgradePromptProps) {
  return (
    <View className="bg-[#27282A] rounded-lg p-4 border border-[#3B82F6]/30">
      <View className="flex-row items-center gap-2 mb-2">
        <Star size={20} color="#3B82F6" weight="fill" />
        <Text className="text-white font-medium">Premium Feature</Text>
      </View>
      <Text className="text-white/60 text-sm mb-3">
        {feature} requires a paid subscription.
      </Text>
      <TouchableOpacity
        disabled
        className="bg-[#3B82F6]/50 py-2 px-4 rounded-lg flex-row items-center justify-center gap-2">
        <Lightning size={16} color="#FFF" weight="fill" />
        <Text className="text-white/60 font-medium">Coming Soon</Text>
      </TouchableOpacity>
    </View>
  );
}
