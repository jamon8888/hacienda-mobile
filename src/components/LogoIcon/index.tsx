import React from "react";
import { Ghost } from "phosphor-react-native";

interface LogoIconProps {
  size?: number;
  color?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
}

export default function LogoIcon({
  size = 40,
  color = "#FFF",
  weight = "fill",
}: LogoIconProps) {
  return <Ghost size={size} color={color} weight={weight} />;
}
