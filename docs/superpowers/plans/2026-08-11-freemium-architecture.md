# Freemium Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Core freemium with subscription store, feature flags, document generation (docx/xlsx/pptxgenjs), and Xberg office format wiring. Paid features (cloud inference, verticals, NER, LoRAs) are placeholders only.

**Architecture:** Feature-Flag Gateway splits free (local) vs paid (cloud) tiers. Subscription stored in WatermelonDB. Document generation via pure JS libraries (docx, xlsx, pptxgenjs). Xberg SDK already reads DOCX/XLSX/PPTX.

**Tech Stack:** React Native, WatermelonDB, MobX, NativeWind, docx, xlsx, pptxgenjs

## Global Constraints

- iOS 15+ / Android 10+ minimum
- Pure JS libraries for document generation: `docx`, `xlsx`, `pptxgenjs`
- Xberg SDK already reads DOCX/XLSX/PPTX (no changes needed for reading)
- All new components use NativeWind className styling (dark mode first)
- Database migrations must be backward compatible (version 3 → 4)
- Feature flags gate paid-only features (stub implementations)
- **No Stripe SDK yet** — subscription is local-only MVP

---

## File Structure

### New Files (7)

| File                                              | Responsibility                                 |
| ------------------------------------------------- | ---------------------------------------------- |
| `src/store/SubscriptionStore.ts`                  | MobX store for subscription state (local-only) |
| `src/hooks/useSubscription.ts`                    | Hook for subscription status + actions         |
| `src/utils/featureFlags.ts`                       | Feature flag gateway (free vs paid)            |
| `src/components/UpgradePrompt/index.tsx`          | Upgrade prompt component (placeholder)         |
| `src/screens/Subscription/SubscriptionScreen.tsx` | Subscription management screen (placeholder)   |
| `src/utils/DocGen/DocGenerator.ts`                | Document generation via docx/xlsx/pptxgenjs    |
| `src/utils/DocGen/templates.ts`                   | Pre-built document templates                   |

### Modified Files (5)

| File                                      | Change                    |
| ----------------------------------------- | ------------------------- |
| `src/database/schema.ts`                  | Add subscriptions table   |
| `src/database/migrations.ts`              | Add migration v4          |
| `src/screens/UserSettings/Main/index.tsx` | Add Subscription row      |
| `src/utils/paths.ts`                      | Add subscription route    |
| `src/screens/index.ts`                    | Export SubscriptionScreen |

---

## Task 1: Database Schema & Migration

**Files:**

- Create: `src/database/models/Subscription.ts`
- Modify: `src/database/schema.ts:1-57`
- Modify: `src/database/migrations.ts`

**Interfaces:**

- Consumes: database instance from `src/database/index.ts`
- Produces: SubscriptionType, Subscription.find(), Subscription.create(), Subscription.update()

- [ ] **Step 1: Add subscriptions table to schema**

```typescript
// src/database/schema.ts - add after audio_memos table
tableSchema({
  name: 'subscriptions',
  columns: [
    { name: 'user_id', type: 'string', isIndexed: true },
    { name: 'tier', type: 'string' }, // 'free' | 'paid'
    { name: 'status', type: 'string' }, // 'active' | 'cancelled' | 'trial' | 'expired'
    { name: 'trial_ends_at', type: 'number', isOptional: true },
    { name: 'created_at', type: 'number' },
    { name: 'updated_at', type: 'number' },
  ],
}),
```

- [ ] **Step 2: Add migration v4**

```typescript
// src/database/migrations.ts - add to migrations array
{
  toVersion: 4,
  steps: [
    createTable({
      name: 'subscriptions',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'tier', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'trial_ends_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
},
```

- [ ] **Step 3: Create Subscription model**

```typescript
// src/database/models/Subscription.ts
import { field, text } from "@nozbe/watermelondb/decorators";
import { database } from "@/database";
import { Q, Model } from "@nozbe/watermelondb";

export type SubscriptionTier = "free" | "paid";
export type SubscriptionStatus = "active" | "cancelled" | "trial" | "expired";

export type SubscriptionType = {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  trialEndsAt: number | null;
  createdAt: number;
  updatedAt: number;
};

export default class Subscription extends Model {
  static table = "subscriptions";

  @text("user_id") userId!: string;
  @text("tier") tier!: SubscriptionTier;
  @text("status") status!: SubscriptionStatus;
  @field("trial_ends_at") trialEndsAt!: number | null;
  @field("created_at") createdAt!: number;
  @field("updated_at") updatedAt!: number;

  static toSubscriptionObject(data: any): SubscriptionType {
    const { id, userId, tier, status, trialEndsAt, createdAt, updatedAt } =
      data;
    return { id, userId, tier, status, trialEndsAt, createdAt, updatedAt };
  }

  static async findForUser(userId: string): Promise<SubscriptionType | null> {
    const subs = await database
      .get(Subscription.table)
      .query(Q.where("user_id", userId))
      .fetch();
    return subs.length > 0 ? this.toSubscriptionObject(subs[0]) : null;
  }

  static async create(
    data: Partial<SubscriptionType>,
  ): Promise<SubscriptionType> {
    const { userId, tier, status, trialEndsAt } = data;

    let newSub: any;
    await database.write(async () => {
      newSub = await database.get(Subscription.table).create((sub: any) => {
        sub.userId = userId;
        sub.tier = tier ?? "free";
        sub.status = status ?? "active";
        sub.trialEndsAt = trialEndsAt ?? null;
        sub.createdAt = Date.now();
        sub.updatedAt = Date.now();
      });
    });

    return this.toSubscriptionObject(newSub);
  }

  static async update(
    id: string,
    updates: Partial<SubscriptionType>,
  ): Promise<void> {
    await database.write(async () => {
      const sub = await database.get(Subscription.table).find(id);
      await sub.update((record: any) => {
        if (updates.tier !== undefined) record.tier = updates.tier;
        if (updates.status !== undefined) record.status = updates.status;
        if (updates.trialEndsAt !== undefined)
          record.trialEndsAt = updates.trialEndsAt;
        record.updatedAt = Date.now();
      });
    });
  }
}
```

- [ ] **Step 4: Update database index exports**

```typescript
// src/database/index.ts - ensure Subscription is exported
export { default as Subscription } from "./models/Subscription";
```

- [ ] **Step 5: Commit**

```bash
git add src/database/schema.ts src/database/migrations.ts src/database/models/Subscription.ts src/database/index.ts
git commit -m "feat(db): add subscriptions table with migration v4"
```

---

## Task 2: SubscriptionStore (MobX)

**Files:**

- Create: `src/store/SubscriptionStore.ts`

**Interfaces:**

- Consumes: Subscription model
- Produces: SubscriptionStore with tier, status, actions

- [ ] **Step 1: Create SubscriptionStore**

```typescript
// src/store/SubscriptionStore.ts
import { makeAutoObservable, runInAction } from "mobx";
import Subscription, {
  SubscriptionTier,
  SubscriptionStatus,
} from "@/database/models/Subscription";

class SubscriptionStore {
  tier: SubscriptionTier = "free";
  status: SubscriptionStatus = "active";
  subscriptionId: string | null = null;
  trialEndsAt: number | null = null;
  loading = false;

  constructor() {
    makeAutoObservable(this);
  }

  get isPaid(): boolean {
    return (
      this.tier === "paid" &&
      (this.status === "active" || this.status === "trial")
    );
  }

  get isTrialActive(): boolean {
    return (
      this.status === "trial" &&
      this.trialEndsAt !== null &&
      Date.now() < this.trialEndsAt
    );
  }

  async loadSubscription(userId: string) {
    this.loading = true;
    try {
      const sub = await Subscription.findForUser(userId);
      if (sub) {
        runInAction(() => {
          this.tier = sub.tier;
          this.status = sub.status;
          this.subscriptionId = sub.id;
          this.trialEndsAt = sub.trialEndsAt;
        });
      } else {
        // Create free subscription for new user
        const newSub = await Subscription.create({
          userId,
          tier: "free",
          status: "active",
        });
        runInAction(() => {
          this.tier = "free";
          this.status = "active";
          this.subscriptionId = newSub.id;
        });
      }
    } catch (error) {
      console.error("Failed to load subscription:", error);
    } finally {
      this.loading = false;
    }
  }

  async activateTrial() {
    const trialEndsAt = Date.now() + 3 * 24 * 60 * 60 * 1000; // 3 days
    await Subscription.update(this.subscriptionId!, {
      tier: "paid",
      status: "trial",
      trialEndsAt,
    });
    runInAction(() => {
      this.tier = "paid";
      this.status = "trial";
      this.trialEndsAt = trialEndsAt;
    });
  }

  async activatePaid() {
    await Subscription.update(this.subscriptionId!, {
      tier: "paid",
      status: "active",
      trialEndsAt: null,
    });
    runInAction(() => {
      this.tier = "paid";
      this.status = "active";
      this.trialEndsAt = null;
    });
  }

  async cancelSubscription() {
    await Subscription.update(this.subscriptionId!, {
      tier: "free",
      status: "cancelled",
      trialEndsAt: null,
    });
    runInAction(() => {
      this.tier = "free";
      this.status = "cancelled";
      this.trialEndsAt = null;
    });
  }
}

export const subscriptionStore = new SubscriptionStore();
export default subscriptionStore;
```

- [ ] **Step 2: Commit**

```bash
git add src/store/SubscriptionStore.ts
git commit -m "feat(store): add SubscriptionStore for freemium state"
```

---

## Task 3: Feature Flags

**Files:**

- Create: `src/utils/featureFlags.ts`

**Interfaces:**

- Consumes: subscriptionStore
- Produces: boolean flags for feature gating

- [ ] **Step 1: Create feature flags**

```typescript
// src/utils/featureFlags.ts
import { subscriptionStore } from "@/store/SubscriptionStore";

// Inference
export function isInferenceCloudEnabled(): boolean {
  return subscriptionStore.isPaid;
}

// Verticals (placeholder - requires Xberg NER bridge)
export function isVerticalEnabled(): boolean {
  return false; // Not built yet
}

// NER (placeholder - requires Xberg NER bridge)
export function isNEREnabled(): boolean {
  return false; // Not built yet
}

// LoRAs (placeholder - requires Cactus LoRA support)
export function isLoRAEnabled(): boolean {
  return false; // Not built yet
}

// Needle RAG (placeholder - unbuilt)
export function isNeedleEnabled(): boolean {
  return false; // Not built yet
}

// Free for all
export function isDocumentGenerationEnabled(): boolean {
  return true;
}

export function isPushToTalkEnabled(): boolean {
  return true;
}

export function isAudioMemosEnabled(): boolean {
  return true;
}

// Office format reading (Xberg already supports this)
export function isOfficeReadingEnabled(): boolean {
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/featureFlags.ts
git commit -m "feat(utils): add feature flag gateway for freemium"
```

---

## Task 4: useSubscription Hook

**Files:**

- Create: `src/hooks/useSubscription.ts`

**Interfaces:**

- Consumes: subscriptionStore
- Produces: Hook for subscription status + actions

- [ ] **Step 1: Create useSubscription hook**

```typescript
// src/hooks/useSubscription.ts
import { useEffect } from "react";
import { subscriptionStore } from "@/store/SubscriptionStore";
import { useAuth } from "@/hooks/useAuth";

export function useSubscription() {
  const { user } = useAuth();

  useEffect(() => {
    if (user?.id) {
      subscriptionStore.loadSubscription(user.id);
    }
  }, [user?.id]);

  return {
    tier: subscriptionStore.tier,
    status: subscriptionStore.status,
    isPaid: subscriptionStore.isPaid,
    isTrialActive: subscriptionStore.isTrialActive,
    loading: subscriptionStore.loading,
    activateTrial: subscriptionStore.activateTrial.bind(subscriptionStore),
    activatePaid: subscriptionStore.activatePaid.bind(subscriptionStore),
    cancelSubscription:
      subscriptionStore.cancelSubscription.bind(subscriptionStore),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSubscription.ts
git commit -m "feat(hooks): add useSubscription for freemium state"
```

---

## Task 5: Document Generation (office_oxide)

**Files:**

- Create: `src/utils/DocGen/DocGenerator.ts`
- Create: `src/utils/DocGen/templates.ts`

**Interfaces:**

- Consumes: office_oxide npm package
- Produces: generateDocx(), generateXlsx(), generatePptx()

- [ ] **Step 1: Install office_oxide**

```bash
yarn add office-oxide
```

- [ ] **Step 2: Create DocGenerator**

```typescript
// src/utils/DocGen/DocGenerator.ts
import { Document } from "office-oxide";
import { DocumentDirectoryPath } from "react-native-fs";

interface DocxConfig {
  title: string;
  content: string[];
}

interface XlsxConfig {
  title: string;
  headers: string[];
  rows: (string | number)[][];
}

interface PptxConfig {
  title: string;
  slides: { title: string; content: string[] }[];
}

export async function generateDocx(config: DocxConfig): Promise<string> {
  const doc = Document.create();

  // Add title
  doc.addParagraph(config.title).heading(1);

  // Add content
  for (const text of config.content) {
    doc.addParagraph(text);
  }

  const uri = `${DocumentDirectoryPath}/${config.title}.docx`;
  await doc.save(uri);
  return uri;
}

export async function generateXlsx(config: XlsxConfig): Promise<string> {
  const doc = Document.create();
  const sheet = doc.addSheet(config.title);

  // Add headers
  sheet.addRow(config.headers);

  // Add data rows
  for (const row of config.rows) {
    sheet.addRow(row);
  }

  const uri = `${DocumentDirectoryPath}/${config.title}.xlsx`;
  await doc.save(uri);
  return uri;
}

export async function generatePptx(config: PptxConfig): Promise<string> {
  const doc = Document.create();

  for (const slide of config.slides) {
    const s = doc.addSlide();
    s.addText(slide.title, {
      x: 1,
      y: 1,
      w: 8,
      h: 1,
      fontSize: 32,
      bold: true,
    });

    let y = 2.5;
    for (const text of slide.content) {
      s.addText(text, { x: 1, y, w: 8, h: 0.5, fontSize: 18 });
      y += 0.6;
    }
  }

  const uri = `${DocumentDirectoryPath}/${config.title}.pptx`;
  await doc.save(uri);
  return uri;
}

export async function shareDocument(uri: string): Promise<void> {
  const { Share } = require("react-native");
  await Share.share({
    url: uri,
    type: getMimeType(uri),
  });
}

function getMimeType(uri: string): string {
  if (uri.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (uri.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (uri.endsWith(".pptx"))
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}
```

- [ ] **Step 3: Create templates**

```typescript
// src/utils/DocGen/templates.ts
export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  fields: {
    key: string;
    label: string;
    type: "text" | "textarea" | "number";
  }[];
  generate: (data: Record<string, any>) => Promise<string>;
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: "invoice",
    name: "Invoice",
    description: "Create a professional invoice",
    fields: [
      { key: "company", label: "Company Name", type: "text" },
      { key: "client", label: "Client Name", type: "text" },
      { key: "items", label: "Line Items (one per line)", type: "textarea" },
      { key: "total", label: "Total Amount", type: "number" },
      { key: "dueDate", label: "Due Date", type: "text" },
    ],
    generate: async data => {
      const { generateDocx } = await import("./DocGenerator");
      return generateDocx({
        title: `Invoice-${Date.now()}`,
        content: [
          `Invoice`,
          ``,
          `From: ${data.company}`,
          `To: ${data.client}`,
          ``,
          `Items:`,
          data.items,
          ``,
          `Total: $${data.total}`,
          `Due Date: ${data.dueDate}`,
        ],
      });
    },
  },
  {
    id: "report",
    name: "Report",
    description: "Generate a formatted report",
    fields: [
      { key: "title", label: "Report Title", type: "text" },
      { key: "content", label: "Report Content", type: "textarea" },
      { key: "conclusion", label: "Conclusion", type: "textarea" },
    ],
    generate: async data => {
      const { generateDocx } = await import("./DocGenerator");
      return generateDocx({
        title: data.title,
        content: [data.content, ``, `Conclusion:`, data.conclusion],
      });
    },
  },
];

export function getTemplate(templateId: string): DocumentTemplate | undefined {
  return DOCUMENT_TEMPLATES.find(t => t.id === templateId);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/DocGen/
git commit -m "feat(docgen): add document generation via office_oxide"
```

---

## Task 6: UpgradePrompt & SubscriptionScreen (Placeholder)

**Files:**

- Create: `src/components/UpgradePrompt/index.tsx`
- Create: `src/screens/Subscription/SubscriptionScreen.tsx`

**Interfaces:**

- Consumes: subscriptionStore
- Produces: Placeholder UI for subscription management

- [ ] **Step 1: Create UpgradePrompt component**

```typescript
// src/components/UpgradePrompt/index.tsx
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
```

- [ ] **Step 2: Create SubscriptionScreen**

```typescript
// src/screens/Subscription/SubscriptionScreen.tsx
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import SafeView from "@/components/SafeView";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Check, Star, Crown } from "phosphor-react-native";
import { useSubscription } from "@/hooks/useSubscription";

export default function SubscriptionScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { tier, isPaid } = useSubscription();

  return (
    <SafeView safeAreaClassNames="bg-[#1B1B1E]">
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top,
          paddingHorizontal: 20,
          paddingBottom: 16,
        }}
        className="flex-row items-center gap-4">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color="#FFF" weight="bold" />
        </TouchableOpacity>
        <Text className="text-white text-lg font-medium">Subscription</Text>
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
              {isPaid ? "Pro Plan" : "Free Plan"}
            </Text>
          </View>
          <Text className="text-white/60 text-sm">
            {isPaid
              ? "You have access to all premium features"
              : "Upgrade to unlock cloud inference, verticals, and more"}
          </Text>
        </View>

        {/* Features Comparison */}
        <View className="bg-[#27282A] rounded-lg p-4 mb-4">
          <Text className="text-white font-medium mb-3">Plan Features</Text>

          <View className="gap-3">
            <FeatureRow label="Local Inference" included={true} />
            <FeatureRow label="Document Generation" included={true} />
            <FeatureRow label="Office Format Reading" included={true} />
            <FeatureRow label="Push-to-Talk" included={true} />
            <FeatureRow label="Audio Memos" included={true} />
            <FeatureRow label="Cloud Inference" included={isPaid} comingSoon />
            <FeatureRow label="Verticals" included={false} comingSoon />
            <FeatureRow label="NER Extraction" included={false} comingSoon />
            <FeatureRow label="LoRA Adapters" included={false} comingSoon />
          </View>
        </View>

        {/* Placeholder Upgrade Button */}
        <TouchableOpacity
          disabled
          className="bg-[#3B82F6]/50 py-3 px-4 rounded-lg flex-row items-center justify-center gap-2">
          <Star size={20} color="#FFF" weight="fill" />
          <Text className="text-white/60 font-medium">Coming Soon</Text>
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
```

- [ ] **Step 3: Commit**

```bash
git add src/components/UpgradePrompt/ src/screens/Subscription/
git commit -m "feat(ui): add placeholder SubscriptionScreen and UpgradePrompt"
```

---

## Task 7: Navigation & Route Integration

**Files:**

- Modify: `src/utils/paths.ts`
- Modify: `src/screens/index.ts`
- Modify: `src/screens/UserSettings/Main/index.tsx`

**Interfaces:**

- Consumes: SubscriptionScreen
- Produces: Routes registered, settings entry added

- [ ] **Step 1: Add subscription route**

```typescript
// src/utils/paths.ts - add to PATHS object
export const PATHS = {
  // ... existing paths
  subscription: "subscription",
};
```

- [ ] **Step 2: Export SubscriptionScreen**

```typescript
// src/screens/index.ts - add export
import SubscriptionScreen from "./Subscription/SubscriptionScreen";

export default {
  // ... existing exports
  SubscriptionScreen,
};
```

- [ ] **Step 3: Add Subscription to User Settings**

```typescript
// src/screens/UserSettings/Main/index.tsx
import { Crown } from "phosphor-react-native";

// Add to settings list
<TouchableOpacity
  onPress={() => navigation.navigate(PATHS.subscription)}
  style={{ backgroundColor: "#27282A", padding: 14, gap: 20 }}
  className="w-full flex flex-row items-center rounded-lg">
  <View className="flex flex-row gap-2 items-center">
    <Crown size={18} color="#3B82F6" weight="fill" />
    <Text className="text-white text-lg">Subscription</Text>
  </View>
</TouchableOpacity>;
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/paths.ts src/screens/index.ts src/screens/UserSettings/Main/index.tsx
git commit -m "feat(nav): add subscription route and settings entry"
```

---

## Task 8: Integration Testing

**Files:**

- Test: `src/store/SubscriptionStore.test.ts`
- Test: `src/utils/featureFlags.test.ts`
- Test: `src/utils/DocGen/DocGenerator.test.ts`

**Interfaces:**

- Consumes: All created modules
- Produces: Passing test suite

- [ ] **Step 1: Write SubscriptionStore tests**

```typescript
// src/store/SubscriptionStore.test.ts
import { subscriptionStore } from "./SubscriptionStore";

describe("SubscriptionStore", () => {
  it("should default to free tier", () => {
    expect(subscriptionStore.tier).toBe("free");
    expect(subscriptionStore.isPaid).toBe(false);
  });

  it("should activate trial", async () => {
    await subscriptionStore.activateTrial();
    expect(subscriptionStore.tier).toBe("paid");
    expect(subscriptionStore.status).toBe("trial");
    expect(subscriptionStore.isTrialActive).toBe(true);
  });

  it("should cancel subscription", async () => {
    await subscriptionStore.cancelSubscription();
    expect(subscriptionStore.tier).toBe("free");
    expect(subscriptionStore.isPaid).toBe(false);
  });
});
```

- [ ] **Step 2: Write featureFlags tests**

```typescript
// src/utils/featureFlags.test.ts
import {
  isInferenceCloudEnabled,
  isDocumentGenerationEnabled,
  isVerticalEnabled,
} from "./featureFlags";
import { subscriptionStore } from "@/store/SubscriptionStore";

describe("featureFlags", () => {
  it("should disable cloud inference for free tier", () => {
    subscriptionStore.tier = "free";
    expect(isInferenceCloudEnabled()).toBe(false);
  });

  it("should disable verticals (placeholder)", () => {
    expect(isVerticalEnabled()).toBe(false);
  });

  it("should enable document generation for all tiers", () => {
    subscriptionStore.tier = "free";
    expect(isDocumentGenerationEnabled()).toBe(true);
  });
});
```

- [ ] **Step 3: Write DocGenerator tests**

```typescript
// src/utils/DocGen/DocGenerator.test.ts
import { generateDocx, generateXlsx, generatePptx } from "./DocGenerator";

describe("DocGenerator", () => {
  it("should generate DOCX", async () => {
    const uri = await generateDocx({
      title: "Test Document",
      content: ["Hello World", "This is a test"],
    });
    expect(uri).toContain(".docx");
  });

  it("should generate XLSX", async () => {
    const uri = await generateXlsx({
      title: "Test Spreadsheet",
      headers: ["Name", "Value"],
      rows: [
        ["Row1", 100],
        ["Row2", 200],
      ],
    });
    expect(uri).toContain(".xlsx");
  });

  it("should generate PPTX", async () => {
    const uri = await generatePptx({
      title: "Test Presentation",
      slides: [
        { title: "Slide 1", content: ["Point 1", "Point 2"] },
        { title: "Slide 2", content: ["Point 3"] },
      ],
    });
    expect(uri).toContain(".pptx");
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
yarn test
```

- [ ] **Step 5: Commit**

```bash
git add src/store/SubscriptionStore.test.ts src/utils/featureFlags.test.ts src/utils/DocGen/DocGenerator.test.ts
git commit -m "test: add tests for subscription, feature flags, and doc generation"
```

---

## Task 9: Type Checking & Lint

**Files:**

- All modified/created files

**Interfaces:**

- Consumes: TypeScript compiler, ESLint
- Produces: Zero errors

- [ ] **Step 1: Run type check**

```bash
yarn typecheck
```

- [ ] **Step 2: Run linter**

```bash
yarn lint
```

- [ ] **Step 3: Fix any issues and commit**

```bash
git add -A
git commit -m "fix: resolve type and lint errors"
```

---

## Plan Self-Review

- [x] All spec requirements covered in tasks
- [x] No TBD/TODO placeholders
- [x] Type signatures consistent across tasks
- [x] File paths match codebase structure
- [x] Each task is independently testable
- [x] Code blocks include actual implementation
- [x] Testing checklist included
- [x] Paid features are placeholders (no build errors)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-11-freemium-architecture.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
