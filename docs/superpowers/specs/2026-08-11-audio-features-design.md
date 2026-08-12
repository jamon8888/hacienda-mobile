# Audio Features Design Spec

**Date:** 2026-08-11  
**Status:** Approved for Implementation  
**Author:** opencode + brainstorming session

---

## Overview

This spec covers two related audio features for the AnythingLLM mobile app:

1. **Push-to-Talk Voice Input** in the PromptInput (chat box) — hold mic button, speak, release to insert transcription into the text field
2. **Audio Memos** — record, list, and play voice notes organized by workspace (and a global scratchpad)

Both features leverage the existing Cactus/llama.cpp on-device inference stack.

---

## Feature 1: Push-to-Talk in PromptInput

### User Flow

1. User sees a **microphone button** to the left of the text input (next to attachment button)
2. **Hold** the button → recording starts immediately with live waveform feedback (red pulse + bar waveform)
3. **Speak** → real-time transcription preview appears above input (gray/italic while pending)
4. **Release** → final transcription inserts at cursor position in text field, ready to edit or send
5. **Cancel** (drag finger off button while holding) → discards recording

### Technical Approach: Lightweight ASR-Only Hook

**New file:** `src/hooks/useVoiceTranscription.ts`

```typescript
interface UseVoiceTranscriptionReturn {
  isRecording: boolean;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  currentTranscript: string;
  isFinal: boolean;
  error: Error | null;
}
```

**Why not reuse `VoicePipelineProvider`?**

- VoicePipelineProvider loads **both ASR (Parakeet) + LLM (Gemma)** — ~1.5GB RAM, 2-3s init
- Push-to-talk needs **instant response** (<500ms)
- Transcription-only hook loads **only CactusSTT** — ~200MB RAM, ~500ms init
- Shares model download with VoiceChat (same Parakeet model) via existing `CACTUS_VOICE_MODELS` catalog

**Key Implementation Details:**

- Use `CactusSTT` directly (same as VoicePipelineProvider's ASR path)
- VAD configuration from user's Voice Settings (`vadThreshold`)
- Transcription callback feeds `chatHandler.setPrompt(text)` — inserts at cursor
- Long-press gesture via `Pressable` with `onLongPress` / `onPressOut` / `onPressIn`
- Live waveform: reuse `VoiceAudioStream` volume callback (already emits `onVolumeChange`)

### Integration Points

| File                                                                        | Change                                                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/screens/WorkspaceChat/PromptInput/Actions/AttachmentsButton/index.tsx` | Add mic button alongside attachment button                        |
| `src/screens/WorkspaceChat/PromptInput/index.tsx`                           | Wire up `useVoiceTranscription` hook, handle transcript insertion |
| `src/hooks/useVoiceTranscription.ts`                                        | **New** — ASR-only hook with push-to-talk semantics               |
| `src/utils/AiProviders/onDevice/voice/VoiceAudioStream.ts`                  | Reuse for volume metering (no changes needed)                     |

### Settings

Add to `VoiceSettingsView`:

- **Push-to-talk in chat** (toggle, default: on)
- Uses existing `vadThreshold` for silence detection

---

## Feature 2: Audio Memos (Workspace + Global)

### User Flow

**Entry Points:**

- Workspace Drawer: "Audio Memos" item (below workspaces list)
- Global: User Settings → "Audio Memos" (quick access)

**Memos Screen (`AudioMemosScreen`):**

- Segmented control: **Workspace** / **Global**
- List of memos, each row shows:
  - Play/pause button
  - Waveform thumbnail (64 pre-computed peaks)
  - Title: first 30 chars of transcript (or "Memo 1", "Memo 2" if empty)
  - Duration (mm:ss)
  - Date created
- Swipe actions: **Rename**, **Delete**, **Share**
- Tap row → full-screen **MemoPlayer** with:
  - Full-width waveform with scrubber
  - Playback speed (0.5x, 1x, 1.5x, 2x)
  - Transcript display (editable)
  - Delete button

**Recording Flow:**

- FAB or "New Memo" button → starts recording immediately
- Live waveform during recording (same visual as VoiceChat)
- Stop → auto-saves with transcript (first phrase = title)
- Cancel → discards

### Technical Approach: `react-native-waveform-recorder` + New DB Table

**Dependency:** `react-native-waveform-recorder` (GitHub: `maitrungduc1410/react-native-waveform-recorder`)

- Native Fabric component with imperative `start()`/`stop()`/`pause()`/`resume()`
- Live waveform rendering during recording (zero JS on hot path)
- Returns onComplete: `{ uri, durationMs, samples: number[64] }` — peaks ready for list thumbnails
- Pair with `react-native-waveform-player` (same author) for playback

**Why not reuse VoicePipelineProvider?**

- Memo recording needs **live waveform visual** — `react-native-waveform-recorder` does this natively
- VoicePipelineProvider has no waveform UI during record (only volume bars)
- Pre-computed 64 peaks = instant list rendering, no decode-on-scroll
- Pause/resume segments = natural memo UX

### Database Schema (WatermelonDB)

**New migration v3:** `src/database/migrations.ts`

```typescript
// tableSchema for audio_memos
tableSchema({
  name: 'audio_memos',
  columns: [
    { name: 'uuid', type: 'string', isIndexed: true },
    { name: 'workspace_slug', type: 'string', isIndexed: true, isOptional: true }, // null = global
    { name: 'audio_uri', type: 'string' },
    { name: 'transcript', type: 'string', isOptional: true },
    { name: 'duration_ms', type: 'number' },
    { name: 'waveform_peaks', type: 'string' }, // JSON stringified number[64]
    { name: 'created_at', type: 'number' },
    { name: 'updated_at', type: 'number' },
  ],
}),
```

**Model:** `src/database/models/AudioMemo.ts` (new file)

```typescript
export type AudioMemoType = {
  uuid: string;
  workspaceSlug: string | null;
  audioUri: string;
  transcript: string | null;
  durationMs: number;
  waveformPeaks: number[]; // length 64
  createdAt: number;
  updatedAt: number;
};
```

### Integration Points

| File                                                      | Change                                        |
| --------------------------------------------------------- | --------------------------------------------- |
| `src/database/schema.ts`                                  | Add `audio_memos` table                       |
| `src/database/migrations.ts`                              | Add migration v3                              |
| `src/database/models/AudioMemo.ts`                        | **New** model                                 |
| `src/screens/index.ts`                                    | Export `AudioMemosScreen`, `MemoPlayerScreen` |
| `src/utils/paths.ts`                                      | Add `audio_memos`, `audio_memo_player` routes |
| `src/components/WorkspaceDrawer/SidebarContent/index.tsx` | Add "Audio Memos" nav item                    |
| `src/screens/UserSettings/Main/index.tsx`                 | Add "Audio Memos" quick access                |
| `src/screens/AudioMemos/AudioMemosScreen.tsx`             | **New** — list with segmented control         |
| `src/screens/AudioMemos/MemoPlayerScreen.tsx`             | **New** — full-screen player                  |
| `src/hooks/useAudioMemos.ts`                              | **New** — CRUD + playback hook                |

### UI Components (New)

```
src/screens/AudioMemos/
├── AudioMemosScreen.tsx          # Main list with Workspace/Global tabs
├── MemoPlayerScreen.tsx          # Full-screen player with waveform scrubber
├── MemoRow.tsx                   # List item: play | waveform | title | duration | date
├── MemoRecorder.tsx              # Recording overlay with live waveform
└── index.ts                      # Exports
```

---

## Shared Infrastructure

### Model Download Sharing

Both features use **Parakeet (ASR)** from `CACTUS_VOICE_MODELS`. The model downloads once and is reused:

- VoiceChat loads it via `VoicePipelineProvider`
- Push-to-talk loads it via `useVoiceTranscription`
- Memo recorder loads it via `react-native-waveform-recorder` (which uses platform speech recognition, not Cactus)

**Note:** `react-native-waveform-recorder` uses **platform-native ASR** (iOS SpeechFramework, Android SpeechRecognizer), not Cactus. This is actually better for memos — no model download needed, works offline on-device, supports many languages.

### Permissions

- **Microphone** — already declared in `android/app/src/main/AndroidManifest.xml` and `ios/Info.plist` for VoiceChat
- No new permissions needed

### Error Handling

| Scenario                 | Handling                                                 |
| ------------------------ | -------------------------------------------------------- |
| Mic permission denied    | Toast + open settings deep link                          |
| ASR model not downloaded | Auto-download with progress (reuse existing download UI) |
| Transcription empty      | Don't insert, show "No speech detected" toast            |
| Audio file corrupted     | Delete memo, show error                                  |
| Disk full                | Toast, disable recording                                 |

---

## Accessibility

- **VoiceOver/TalkBack:** All buttons labeled ("Start recording", "Stop recording", "Play memo", "Delete memo")
- **Dynamic Type:** Text scales with system font size
- **Color contrast:** Waveform colors meet WCAG AA (use semantic tokens)
- **Haptics:** Light impact on record start/stop (platform default)

---

## Testing Checklist

### Push-to-Talk

- [ ] Hold mic → waveform animates
- [ ] Speak → live transcript appears
- [ ] Release → text inserts at cursor
- [ ] Drag off → cancels, no insert
- [ ] Works with keyboard open/closed
- [ ] Respects VAD threshold from settings
- [ ] Model downloads on first use if needed

### Audio Memos

- [ ] Record → live waveform
- [ ] Pause/resume segments
- [ ] Stop → saves with transcript
- [ ] List shows waveform thumbnails instantly
- [ ] Tap → player opens, scrub works
- [ ] Speed control works
- [ ] Swipe delete removes from DB + file
- [ ] Workspace filter works (null = global)
- [ ] Rename updates transcript/title

---

## Rollout Plan

1. **Phase 1:** Push-to-talk in PromptInput (high value, low risk)
2. **Phase 2:** Audio Memos DB + recorder (new dependency)
3. **Phase 3:** Audio Memos list + player screens
4. **Phase 4:** Workspace drawer + settings integration

---

## Open Questions (Resolved)

| Question                  | Decision                                                                 |
| ------------------------- | ------------------------------------------------------------------------ |
| Voice input UX            | Push-to-talk (hold → record, release → transcribe)                       |
| Transcription destination | Insert into prompt text field                                            |
| Memo organization         | Workspace-specific + Global (nullable workspace_slug)                    |
| Waveform library          | `react-native-waveform-recorder` + `react-native-waveform-player`        |
| ASR for memos             | Platform-native (SpeechFramework/SpeechRecognizer) via waveform-recorder |

---

## Spec Self-Review

- [x] No TBD/TODO placeholders
- [x] Architecture matches feature descriptions
- [x] Scope focused (two features, no unrelated refactoring)
- [x] No ambiguous requirements — all decisions explicit
- [x] Database migration versioned (v3)
- [x] Dependencies identified with rationale
- [x] Accessibility considered
- [x] Testing checklist included
