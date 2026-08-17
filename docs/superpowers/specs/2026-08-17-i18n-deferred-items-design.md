# Design: Finalize Deferred i18n Items

**Date:** 2026-08-17
**Status:** Implemented
**PR:** https://github.com/jamon8888/hacienda-mobile/pull/21 (4 new commits)

## Context

The i18n wiring effort (23 tasks) left 4 plan gaps identified during review:
1. ModelChip literals still English
2. WorkspaceItem/ThreadItem literals still English
3. DataHandling writes hardcoded "My Workspace" to DB
4. SimpleModelCard tier labels not localized

## Design

### Approach

4 independent string→t() replacements + locale key additions. No architecture changes. Each item is a single commit, pushed to the existing `feat/i18n-wiring-work` branch.

### Item 1: ModelChip

**File:** `src/components/TopBar/ModelChip/index.tsx`

Replace 6 hardcoded strings with `t("common:topbar.modelChip.*")`:

| String | Key |
|--------|-----|
| "No model loaded" | `topbar.modelChip.noModelLoaded` |
| "Search" | Reuse existing `components.provider.search` |
| "No models found for \"{{query}}\"" | `topbar.modelChip.noModelsFound` |
| "Additional LLMs" | `topbar.modelChip.additionalLLMs` |
| "Please manage your model preferences in the settings page." | `topbar.modelChip.externalProviderToast` |
| "This workspace is managed remotely. You cannot change the model here." | `topbar.modelChip.remoteWorkspaceToast` |

**Keys added to:** `en/common.json`, `fr/common.json`

### Item 2: WorkspaceItem/ThreadItem

**Files:**
- `src/components/WorkspaceDrawer/SidebarContent/WorkspaceItem/index.tsx`
- `src/components/WorkspaceDrawer/SidebarContent/WorkspaceItem/ThreadItem/index.tsx`

Replace 13 hardcoded strings with `t("workspace:...")` + cross-namespace `t("common:buttons.cancel")` / `t("common:buttons.delete")`:

| String | Key |
|--------|-----|
| "Delete thread" | `workspace.thread.deleteTitle` |
| "Are you sure you want to delete this thread? All chat history will be lost." | `workspace.thread.deleteMessage` |
| "Delete workspace" | `workspace.deleteTitle` |
| "Are you sure you want to delete this workspace? All threads will be lost." | `workspace.deleteMessage` |
| "This will not delete the workspace in your remote instance." | `workspace.deleteRemoteNote` |
| "Rename Thread" | `workspace.thread.renameTitle` |
| "Enter new thread name" | `workspace.thread.renamePlaceholder` |
| "Rename" | `workspace.thread.rename` |

**Keys added to:** `en/workspace.json`, `fr/workspace.json`

### Item 3: DataHandling "My Workspace"

**File:** `src/screens/Onboarding/DataHandling/index.tsx`

Replace hardcoded `"My Workspace"` with existing `common.home.defaultWorkspaceName` key (EN: "My Workspace", FR: "Mon espace de travail").

**No new keys needed** — key already existed from Task 14.

### Item 4: SimpleModelCard

**File:** `src/screens/Onboarding/ModelSelection/Simple/SimpleModelCard/index.tsx`

Replace tier labels and quality suffix with `t("onboarding:...")`:

| String | Key |
|--------|-----|
| "optimal" | `onboarding.modelSelection.deviceTier.optimal` |
| "good" | `onboarding.modelSelection.deviceTier.good` |
| "acceptable" | `onboarding.modelSelection.deviceTier.acceptable` |
| "not_recommended" | `onboarding.modelSelection.deviceTier.not_recommended` |
| "/100" | `onboarding.modelSelection.qualitySuffix` |

**Implementation:** Tier values are runtime keys from `ModelRecommendation` interface, used as object keys for colors/icons. Translation happens at display time via a mapping object:
```tsx
const tierTranslations: Record<string, string> = {
  optimal: t("onboarding.modelSelection.deviceTier.optimal"),
  // ...
};
```

**Keys added to:** `en/onboarding.json`, `fr/onboarding.json`

## Verification

- `yarn typecheck`: 0 new errors
- All 4 commits pushed to `feat/i18n-wiring-work` → PR #21 updated

## Commits

| Commit | Item |
|--------|------|
| `720868d` | ModelChip |
| `4b6b84d` | WorkspaceItem/ThreadItem |
| `f8c038e` | DataHandling |
| `5196cac` | SimpleModelCard |
