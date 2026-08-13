# Ghost Logo Replacement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AnythingLLM PNG logo with a reusable `Ghost` icon component from `phosphor-react-native` in the TopBar and Onboarding DataHandling screen.

**Architecture:** A new `LogoIcon` component wraps the Phosphor `Ghost` icon with sensible defaults (white, filled, size 40). Existing screens import and render `LogoIcon` at the sizes appropriate for their contexts. No new dependencies or image assets are added.

**Tech Stack:** React Native, TypeScript, `phosphor-react-native`, `react-test-renderer`, Jest, NativeWind.

## Global Constraints

- Use `phosphor-react-native` icons; do not add new image assets.
- Keep existing layout containers untouched.
- Run `yarn typecheck` after code changes.
- Keep the `Image` import in `DataHandling` because it is still used for the privacy item icon.

---

### Task 1: Create the `LogoIcon` component

**Files:**
- Create: `src/components/LogoIcon/index.tsx`
- Create: `src/components/LogoIcon/index.test.tsx`

**Interfaces:**
- Consumes: `Ghost` icon from `phosphor-react-native`.
- Produces: `LogoIcon` component accepting optional `size`, `color`, and `weight` props.

- [ ] **Step 1: Write the failing test**

```tsx
import React from "react";
import renderer from "react-test-renderer";
import LogoIcon from "./index";

jest.mock("phosphor-react-native", () => {
  const React = jest.requireActual("react");
  return {
    Ghost: React.forwardRef((props: any, ref: any) => {
      return React.createElement("Ghost", { ...props, ref });
    }),
  };
});

describe("LogoIcon", () => {
  it("renders the Ghost icon with default props", () => {
    const tree = renderer.create(<LogoIcon />);
    const root = tree.root;
    const ghost = root.findByType("Ghost");
    expect(ghost.props.size).toBe(40);
    expect(ghost.props.color).toBe("#FFF");
    expect(ghost.props.weight).toBe("fill");
  });

  it("accepts custom size, color, and weight", () => {
    const tree = renderer.create(
      <LogoIcon size={80} color="#000" weight="bold" />,
    );
    const root = tree.root;
    const ghost = root.findByType("Ghost");
    expect(ghost.props.size).toBe(80);
    expect(ghost.props.color).toBe("#000");
    expect(ghost.props.weight).toBe("bold");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `yarn test src/components/LogoIcon/index.test.tsx`

Expected: FAIL — `LogoIcon` component does not exist.

- [ ] **Step 3: Implement the component**

Create `src/components/LogoIcon/index.tsx`:

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

- [ ] **Step 4: Run the test and confirm it passes**

Run: `yarn test src/components/LogoIcon/index.test.tsx`

Expected: PASS.

- [ ] **Step 5: Stage changes**

```bash
git add src/components/LogoIcon/index.tsx src/components/LogoIcon/index.test.tsx
```

---

### Task 2: Replace the logo in `TopBar`

**Files:**
- Modify: `src/components/TopBar/index.tsx`

**Interfaces:**
- Consumes: `LogoIcon` from `src/components/LogoIcon`.

- [ ] **Step 1: Update imports**

In the `react-native` import block, remove `Image`. Then add:

```tsx
import LogoIcon from "@/components/LogoIcon";
```

The `react-native` import should now be:

```tsx
import {
  View,
  TouchableOpacity,
  NativeEventEmitter,
} from "react-native";
```

- [ ] **Step 2: Replace the logo image**

Replace:

```tsx
<Image
  source={require("@/assets/logo/anything-llm.png")}
  style={{
    width: 150,
    height: 50,
  }}
  resizeMode="center"
/>
```

With:

```tsx
<LogoIcon size={40} />
```

- [ ] **Step 3: Run typecheck for this file**

Run: `yarn typecheck`

Expected: No errors related to `TopBar`.

- [ ] **Step 4: Stage changes**

```bash
git add src/components/TopBar/index.tsx
```

---

### Task 3: Replace the logo in `Onboarding/DataHandling`

**Files:**
- Modify: `src/screens/Onboarding/DataHandling/index.tsx`

**Interfaces:**
- Consumes: `LogoIcon` from `src/components/LogoIcon`.

- [ ] **Step 1: Add import**

Add below the existing imports:

```tsx
import LogoIcon from "@/components/LogoIcon";
```

- [ ] **Step 2: Replace the onboarding logo image**

Replace:

```tsx
<Image
  source={require("@/assets/logo/anything-llm.png")}
  resizeMode="contain"
  className="w-[70vw]"
/>
```

With:

```tsx
<LogoIcon size={120} />
```

- [ ] **Step 3: Run typecheck for this file**

Run: `yarn typecheck`

Expected: No errors related to `DataHandling`.

- [ ] **Step 4: Stage changes**

```bash
git add src/screens/Onboarding/DataHandling/index.tsx
```

---

### Task 4: Final verification

**Files:**
- All files modified above.

- [ ] **Step 1: Run the full test suite**

Run: `yarn test`

Expected: All tests pass, including the new `LogoIcon` tests.

- [ ] **Step 2: Run the type checker**

Run: `yarn typecheck`

Expected: No TypeScript errors.

- [ ] **Step 3: Run the linter**

Run: `yarn lint`

Expected: No lint errors.

- [ ] **Step 4: Confirm no remaining references to the old logo**

Run:

```bash
grep -r "anything-llm.png" src/
```

Expected: Only the privacy item reference in `DataHandling` remains (`anything-llm-infinity.png` is separate and should not be changed).

- [ ] **Step 5: Stage and commit**

```bash
git add docs/superpowers/specs/2026-08-13-ghost-logo-replacement-design.md
```

```bash
git commit -m "feat(ui): replace app logo with reusable Ghost icon component

- Add LogoIcon component wrapping phosphor-react-native Ghost
- Replace AnythingLLM PNG logo in TopBar
- Replace AnythingLLM PNG logo in Onboarding DataHandling screen
- Add unit tests for LogoIcon"
```

---

## Self-Review

**Spec coverage:**
- Reusable `LogoIcon` component: Task 1.
- TopBar replacement: Task 2.
- Onboarding DataHandling replacement: Task 3.
- Typecheck verification: Task 4.

**Placeholder scan:** No TBD/TODO or vague steps.

**Type consistency:** `LogoIconProps` matches the props passed in `TopBar` (`size={40}`) and `DataHandling` (`size={120}`).
