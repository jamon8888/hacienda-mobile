# Freemium Architecture Design Spec

**Date:** 2026-08-11
**Status:** Draft
**Author:** opencode + brainstorming session

---

## Overview

This spec defines the freemium architecture for AnythingLLM Mobile, splitting features between free (local inference) and paid tiers ($49/mo subscription via Stripe). The tier split is in **inference**, not extraction — both tiers use the same Xberg extraction pipeline; the difference is local vs cloud LLM.

---

## Key Decisions

| Decision              | Choice                       | Rationale                                            |
| --------------------- | ---------------------------- | ---------------------------------------------------- |
| Subscription provider | Stripe                       | User preference, direct billing control              |
| Pricing               | $49/mo                       | Competitive for mobile AI apps                       |
| Free trial            | 3 days                       | Low barrier to test premium                          |
| Tier split            | Inference only               | Both tiers extract; difference is local vs cloud LLM |
| Office generation     | office_oxide (Rust)          | Fastest, all 6 formats, has npm bindings             |
| Verticals             | Pre-built (not user-created) | Legal, medical, invoice, financial                   |
| OCR                   | Tesseract only (currently)   | Xberg NER/OCR not bridged to RN yet                  |
| Embeddings            | Gemma (not nomic)            | User correction                                      |
| Voice ASR             | Parakeet (not Whisper)       | User correction                                      |
| Voice LLM             | Gemma 4 E2B                  | User correction                                      |

---

## System Architecture

### Feature Matrix

| Feature               | Free Tier                       | Paid Tier ($49/mo)                             |
| --------------------- | ------------------------------- | ---------------------------------------------- |
| **Inference**         | Local llama.cpp (device models) | Cloud Cactus Compute (large models)            |
| **Extraction**        | Tesseract OCR                   | Tesseract OCR (same)                           |
| **NER**               | None                            | Xberg GLiNER2 (when bridged)                   |
| **Verticals**         | None                            | Pre-built (legal, medical, invoice, financial) |
| **LoRAs**             | None                            | Vertical-specific adapters                     |
| **Office Generation** | Templates + AI                  | Templates + AI (same)                          |
| **Voice Input**       | Push-to-talk (local)            | Push-to-talk (local)                           |
| **Audio Memos**       | Yes                             | Yes                                            |
| **Needle RAG**        | None                            | Smart routing (when built)                     |

### Subscription Layer (Stripe)

**Flow:**

1. User installs app → Free tier (local inference)
2. User taps "Upgrade" → Stripe Checkout (3-day trial)
3. Subscription active → Cloud inference enabled
4. Subscription cancelled → Reverts to free tier

**Implementation:**

- New store: `src/store/SubscriptionStore.ts`
- New hook: `src/hooks/useSubscription.ts`
- Stripe React Native SDK: `@stripe/stripe-react-native`

### Cloud Inference Client

**New file:** `src/utils/AiProviders/cloud/CloudInferenceClient.ts`

```typescript
interface CloudConfig {
  apiKey: string;
  baseUrl: string; // Cactus Compute API
  model: string; // e.g., "gemma-4-e2b-it-int4"
}

class CloudInferenceClient {
  async chat(
    messages: Message[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    // OpenAI-compatible API format
    // Falls back to local if cloud fails
  }
}
```

### Feature Flag Gateway

**New file:** `src/utils/featureFlags.ts`

```typescript
function isInferenceCloudEnabled(): boolean {
  return subscriptionStore.isActive && subscriptionStore.tier === "paid";
}

function isVerticalEnabled(): boolean {
  return subscriptionStore.isActive && subscriptionStore.tier === "paid";
}
```

---

## Document Generation (Free for All)

### Library Choice: office_oxide (Rust)

**Why office_oxide:**

- Fastest Office document processing library for Rust
- Supports DOCX, XLSX, PPTX + legacy DOC, XLS, PPT
- Has npm package (`office-oxide`) for React Native integration
- MIT/Apache-2.0 license
- Active development, good documentation

**Integration Path:**

1. Add `office-oxide` npm package
2. Create bridge module similar to Xberg
3. Expose generation APIs:
   ```typescript
   generateDocx(config: DocxConfig): Promise<string>
   generateXlsx(config: XlsxConfig): Promise<string>
   generatePptx(config: PptxConfig): Promise<string>
   ```

**Template System:**

- Pre-built templates for common document types
- AI fills in content based on workspace context
- User can edit before export

---

## Verticals (Pre-built)

### Supported Verticals

| Vertical  | NER Model         | LoRA Adapter | Use Case                             |
| --------- | ----------------- | ------------ | ------------------------------------ |
| Legal     | GLiNER2-legal     | legal-v1     | Contract analysis, clause extraction |
| Medical   | GLiNER2-medical   | medical-v1   | Patient notes, diagnosis codes       |
| Invoice   | GLiNER2-invoice   | invoice-v1   | Line item extraction, totals         |
| Financial | GLiNER2-financial | financial-v1 | Earnings, metrics extraction         |

**Note:** NER and LoRAs require Xberg bridge to React Native (currently unbuilt).

---

## Needle RAG Router

**Status:** Unbuilt (only specs exist)

**Purpose:** Smart routing based on query complexity

- Simple queries → Small local model
- Complex queries → Large cloud model
- Domain queries → Vertical-specific model

**Integration:** Future phase (after core freemium is working)

---

## Database Changes

### New Tables

1. **subscriptions** - Stripe subscription data
2. **cloud_history** - Cloud inference chat history (optional sync)

### Migration v4

```typescript
{
  toVersion: 4,
  steps: [
    createTable({
      name: 'subscriptions',
      columns: [
        { name: 'user_id', type: 'string' },
        { name: 'stripe_subscription_id', type: 'string' },
        { name: 'tier', type: 'string' }, // 'free' | 'paid'
        { name: 'status', type: 'string' }, // 'active' | 'cancelled' | 'trial'
        { name: 'trial_ends_at', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),
  ],
}
```

---

## UI Changes

### Upgrade Prompt

**Location:** Workspace chat (when user tries cloud-only feature)

**Components:**

- `src/components/UpgradePrompt/index.tsx`
- `src/screens/Subscription/SubscriptionScreen.tsx`

### Settings Integration

**Location:** User Settings → Subscription

**Show:**

- Current tier (Free/Paid)
- Subscription status
- Manage subscription (Stripe portal)
- Upgrade button (if free)

---

## Error Handling

| Scenario               | Handling                                |
| ---------------------- | --------------------------------------- |
| Cloud API failure      | Fallback to local inference with toast  |
| Subscription expired   | Grace period (24h), then revert to free |
| Network unavailable    | Local only, no cloud features           |
| Stripe checkout failed | Show error, retry option                |

---

## Accessibility

- **VoiceOver/TalkBack:** All subscription buttons labeled
- **Dynamic Type:** Text scales with system font size
- **Color contrast:** Subscription UI meets WCAG AA
- **Haptics:** Light impact on subscription actions

---

## Testing Checklist

### Subscription Flow

- [ ] Free tier works (local inference)
- [ ] Upgrade button shows Stripe Checkout
- [ ] 3-day trial activates
- [ ] Subscription status updates in settings
- [ ] Cancel subscription reverts to free
- [ ] Cloud inference works when subscribed
- [ ] Fallback to local when cloud fails

### Document Generation

- [ ] Generate DOCX from template
- [ ] Generate XLSX from template
- [ ] Generate PPTX from template
- [ ] AI fills content correctly
- [ ] Export works on device

### Verticals (Future)

- [ ] Select vertical in workspace settings
- [ ] NER extracts entities correctly
- [ ] LoRA improves domain accuracy

---

## Rollout Plan

1. **Phase 1:** Subscription store + Stripe integration
2. **Phase 2:** Cloud inference client + feature flags
3. **Phase 3:** Document generation (office_oxide)
4. **Phase 4:** Verticals (requires Xberg NER bridge)
5. **Phase 5:** Needle RAG router (future)

---

## Open Questions

| Question                 | Status                                     |
| ------------------------ | ------------------------------------------ |
| Stripe product/price IDs | Need to create in Stripe dashboard         |
| Cloud API endpoint       | Cactus Compute platform (separate project) |
| office_oxide RN bridge   | Need to create native module               |
| Xberg NER bridge         | User confirmed not built yet               |

---

## Spec Self-Review

- [ ] No TBD/TODO placeholders (except future phases)
- [ ] Architecture matches feature descriptions
- [ ] Scope focused (freemium core, not all features)
- [ ] No ambiguous requirements — all decisions explicit
- [ ] Database migration versioned (v4)
- [ ] Dependencies identified with rationale
- [ ] Accessibility considered
- [ ] Testing checklist included
