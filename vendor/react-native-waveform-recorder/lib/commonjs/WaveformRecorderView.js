"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WaveformRecorderView = void 0;
exports.ensureMicrophonePermission = ensureMicrophonePermission;
var _react = require("react");
/**
 * Audio container/encoder used for the recorded file.
 *
 *  - `'m4a'` (default) — AAC inside an MPEG-4 container. Universally
 *    supported. Best balance of size and quality.
 *  - `'aac'` — Same encoder as `m4a`, library still wraps the output in
 *    `m4a` since raw AAC ADTS is rarely useful in app code.
 *  - `'wav'` — 16-bit linear PCM (RIFF/WAVE). Largest files, lossless.
 *    Library writes a canonical 44-byte header.
 *  - `'opus'` — Opus codec. **OS-version gated:** requires iOS 11+ /
 *    Android 10 (API 29)+. On older systems the engine falls back to
 *    AAC/`m4a` and fires `onError({ code: 'format-unsupported' })`.
 *    The container differs by platform — `.ogg` on Android (OGG/OPUS) and
 *    `.caf` on iOS (`kAudioFormatOpus` inside an Apple Core Audio
 *    Format). Inspect `onComplete.mimeType` (`audio/ogg` vs
 *    `audio/opus`) and `onComplete.uri` for the platform-specific output.
 */

/** v0.2 — fired when the preview playhead jumps (scrub or imperative seek). */

/** v0.2 — fired periodically while the preview player is running. */

/**
 * v0.3 — fired continuously while a recording-mode pan gesture is active. Use
 * the progress values (clamped to [0, 1]) to drive your mic-button chevron
 * follow-along animation. Fires only while the component is in `recording`
 * state and `enableSlideToCancel` and/or `enableSlideToLock` is on.
 */

/**
 * v0.3 — fired when the rolling mean dB level stays below
 * `silenceThresholdDb` for at least `silenceTimeoutMs` while recording.
 */

/**
 * v1.0 — payload of `onPcmChunk` while raw-PCM streaming is active.
 * `chunk` is base64-encoded little-endian 16-bit PCM. Decode it with the
 * helper exported from `react-native-waveform-recorder/pcm-stream`.
 */

function WaveformRecorderViewInner(_props, _ref) {
  throw new Error("'react-native-waveform-recorder' is only supported on native platforms.");
}
const WaveformRecorderView = exports.WaveformRecorderView = /*#__PURE__*/(0, _react.forwardRef)(WaveformRecorderViewInner);
WaveformRecorderView.displayName = 'WaveformRecorderView';

/**
 * Web stub — always resolves `false` since browser-side recording isn't
 * supported by this library.
 */
async function ensureMicrophonePermission() {
  return false;
}
//# sourceMappingURL=WaveformRecorderView.js.map