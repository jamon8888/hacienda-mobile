# Ghost Logo Replacement — Design Spec

**Date:** 2026-08-13  
**Status:** Approved for implementation  
**Scope:** UI only

## Context

The app currently displays the AnythingLLM wordmark logo as a PNG image in two places:

1. `src/components/TopBar/index.tsx` — the main header logo shown during normal app use.
2. `src/screens/Onboarding/DataHandling/index.tsx` — the onboarding data-handling screen.

Both use `require("@/assets/logo/anything-llm.png")`. The project already uses `phosphor-react-native` as its icon library throughout the UI.

## Objective

Replace the AnythingLLM PNG logo with the `Ghost` icon from `phosphor-react-native` in both locations, using a reusable component so the logo stays consistent.

## Design

### New component: `src/components/LogoIcon/index.tsx`

A thin wrapper around Phosphor’s `Ghost` icon that exposes the same props we typically care about (`size`, `color`, `weight`) while defaulting to a white, filled ghost.

```tsx
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
```

### Changes to existing files

#### `src/components/TopBar/index.tsx`

- Remove the `Image` import.
- Import `LogoIcon`.
- Replace the `<Image source={require("@/assets/logo/anything-llm.png")} … />` block with `<LogoIcon size={40} />`.
- Keep the surrounding `TouchableOpacity` and `View` layout unchanged so the long-press debug gesture and chip alignment stay intact.

#### `src/screens/Onboarding/DataHandling/index.tsx`

- Keep the `Image` import (it is still used for the privacy item).
- Import `LogoIcon`.
- Replace the onboarding logo `<Image source={require("@/assets/logo/anything-llm.png")} className="w-[70vw]" resizeMode="contain" />` with `<LogoIcon size={120} />`.

## Rationale

- **Phosphor `Ghost`** is the requested icon from the existing library; no new dependencies or assets.
- **Reusable component** prevents duplicated configuration and makes future logo tweaks trivial.
- **Minimal layout changes** — the existing containers stay the same; only the inner logo element changes.

## Acceptance Criteria

- [ ] `src/components/LogoIcon/index.tsx` exists and exports a `Ghost` icon with sensible defaults.
- [ ] TopBar shows the ghost icon instead of the AnythingLLM PNG logo.
- [ ] Onboarding `DataHandling` screen shows the ghost icon instead of the AnythingLLM PNG logo.
- [ ] `yarn typecheck` passes.
- [ ] No runtime errors in the TopBar or Onboarding flows.
- [ ] The removed `anything-llm.png` image import is no longer referenced in the modified files.
