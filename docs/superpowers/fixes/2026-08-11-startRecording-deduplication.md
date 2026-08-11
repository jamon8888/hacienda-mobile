# Fix: startRecording Deduplication

**Date:** 2026-08-11
**Files Changed:**
- `src/hooks/useVoiceTranscription.ts:72`
- `android/app/src/main/java/com/anythingllm/voice/VoiceAudioModule.java:125`
- `ios/AnythingLLM/VoiceAudioModule.m:29`

## Problem

Calling `startRecording` while already recording caused different failures:
- **Hook level:** Created a second `VoiceAudioStream` and leaked the first one
- **Native level:** Android/iOS rejected with `ALREADY_RECORDING` error

## Solution

No-op approach — if already recording, the second call is silently ignored:

1. **`useVoiceTranscription.ts`**: Added `if (isRecording) return;` guard at start of `startRecording`, added `isRecording` to deps array
2. **`VoiceAudioModule.java`**: Changed from `promise.reject()` to `promise.resolve(true)` when `isRecording`
3. **`VoiceAudioModule.m`**: Changed from `reject()` to `resolve(@YES)` when `_isRecording`

## Rationale

No-op is safer than rejection:
- Prevents race conditions from double-taps
- No error handling needed in callers
- Consistent with `VoiceAudioStream.start()` behavior (line 62)

## Tests

All 12 tests in `useVoiceTranscription.test.ts` pass.
