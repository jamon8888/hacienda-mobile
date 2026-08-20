"use strict";

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import NativeWaveformRecorderView, { Commands } from './WaveformRecorderViewNativeComponent';
import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Request `RECORD_AUDIO` on Android. On iOS this is a no-op — the native
 * recorder engine auto-prompts via `AVAudioApplication.requestRecordPermission`
 * the first time `start()` is invoked.
 *
 * Returns `true` when permission is granted (or not needed), `false` when
 * the user denied or selected "Never ask again".
 *
 * This helper is also called automatically inside `ref.start()`. Host apps
 * can invoke it ahead of time to drive their own pre-flight UI (e.g. an
 * onboarding screen explaining why mic access is needed).
 */
export async function ensureMicrophonePermission() {
  if (Platform.OS !== 'android') return true;
  try {
    const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (already) return true;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'This app needs microphone access to record audio with a live waveform.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel'
    });
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
function WaveformRecorderViewInner(props, ref) {
  const nativeRef = useRef(null);

  // Keep a ref pointing at the latest `onPermissionDenied` so the imperative
  // `start()` can fire it directly when JS-side permission request returns
  // false (Android only). Without the ref, we'd capture the *initial*
  // callback at mount time and stale-callback bugs would silently swallow
  // the event.
  const onPermissionDeniedRef = useRef(props.onPermissionDenied);
  onPermissionDeniedRef.current = props.onPermissionDenied;
  const {
    output,
    state,
    onStateChange,
    onMeter,
    onComplete,
    onMaxDurationReached,
    onPermissionDenied,
    onError,
    onSeek,
    onPlaybackTimeUpdate,
    onSlideProgress,
    onSlideCancel,
    onSlideLock,
    onSilenceDetected,
    onPcmChunk,
    ...rest
  } = props;

  // Flatten the public `output` prop into the codegen-friendly individual
  // props. Splitting on the JS side keeps the native spec simple (no nested
  // Readonly<{ ... }> objects with optional fields, which codegen handles
  // unevenly across RN versions).
  const outputUri = useMemo(() => output?.uri ?? '', [output?.uri]);
  const outputFormat = useMemo(() => output?.format ?? 'm4a', [output?.format]);
  const outputSampleRate = useMemo(() => output?.sampleRate ?? 44100, [output?.sampleRate]);
  const outputChannels = useMemo(() => output?.channels ?? 1, [output?.channels]);
  const outputBitrate = useMemo(() => output?.bitrate ?? 128000, [output?.bitrate]);
  const outputQuality = useMemo(() => output?.quality ?? 'high', [output?.quality]);

  // 'auto' = uncontrolled (sentinel). Anything else means the host app is
  // driving the state machine via the prop. `error` is internal-only and
  // can never be assigned from outside, so it's not a valid value here.

  const controlledState = useMemo(() => {
    if (state === undefined || state === 'error') return 'auto';
    return state;
  }, [state]);
  useImperativeHandle(ref, () => ({
    start: () => {
      // Fire-and-forget: we request the permission on Android before
      // delegating to the native start command. On iOS the native engine
      // already auto-prompts via `AVAudioApplication.requestRecordPermission`,
      // so we delegate immediately.
      ensureMicrophonePermission().then(granted => {
        if (!granted) {
          onPermissionDeniedRef.current?.();
          return;
        }
        if (nativeRef.current) Commands.start(nativeRef.current);
      });
    },
    pause: () => {
      if (nativeRef.current) Commands.pause(nativeRef.current);
    },
    resume: () => {
      if (nativeRef.current) Commands.resume(nativeRef.current);
    },
    stop: () => {
      if (nativeRef.current) Commands.stop(nativeRef.current);
    },
    cancel: () => {
      if (nativeRef.current) Commands.cancel(nativeRef.current);
    },
    enterPreview: () => {
      if (nativeRef.current) Commands.enterPreview(nativeRef.current);
    },
    exitPreview: () => {
      if (nativeRef.current) Commands.exitPreview(nativeRef.current);
    },
    togglePreviewPlayback: () => {
      if (nativeRef.current) Commands.togglePreviewPlayback(nativeRef.current);
    },
    seekPreview: positionMs => {
      if (nativeRef.current) {
        Commands.seekPreview(nativeRef.current, Math.max(0, Math.floor(positionMs)));
      }
    }
  }), []);
  return /*#__PURE__*/_jsx(NativeWaveformRecorderView, {
    ref: nativeRef,
    ...rest,
    outputUri: outputUri,
    outputFormat: outputFormat,
    outputSampleRate: outputSampleRate,
    outputChannels: outputChannels,
    outputBitrate: outputBitrate,
    outputQuality: outputQuality,
    controlledState: controlledState,
    onStateChange: onStateChange ? e => {
      onStateChange({
        state: e.nativeEvent.state,
        durationMs: e.nativeEvent.durationMs
      });
    } : undefined,
    onMeter: onMeter ? e => onMeter(e.nativeEvent) : undefined,
    onComplete: onComplete ? e => {
      const ne = e.nativeEvent;
      // Parse the codegen-friendly CSV payload back into a real
      // number[]. Empty string -> empty array (rare but legal: a
      // zero-duration recording).
      const samples = ne.samplesCsv.length === 0 ? [] : ne.samplesCsv.split(',').map(part => {
        const n = Number(part);
        return Number.isFinite(n) ? n : 0;
      });
      const event = {
        uri: ne.uri,
        durationMs: ne.durationMs,
        format: ne.format,
        mimeType: ne.mimeType,
        sizeBytes: ne.sizeBytes,
        sampleRate: ne.sampleRate,
        channels: ne.channels,
        samples,
        peakAmplitude: ne.peakAmplitude
      };
      onComplete(event);
    } : undefined,
    onMaxDurationReached: onMaxDurationReached ? () => onMaxDurationReached() : undefined,
    onPermissionDenied: onPermissionDenied ? () => onPermissionDenied() : undefined,
    onError: onError ? e => {
      const {
        message,
        code
      } = e.nativeEvent;
      const ev = {
        message,
        code: code && code.length > 0 ? code : undefined
      };
      onError(ev);
    } : undefined,
    onSeek: onSeek ? e => onSeek({
      positionMs: e.nativeEvent.positionMs
    }) : undefined,
    onPlaybackTimeUpdate: onPlaybackTimeUpdate ? e => onPlaybackTimeUpdate(e.nativeEvent) : undefined,
    onSlideProgress: onSlideProgress ? e => onSlideProgress(e.nativeEvent) : undefined,
    onSlideCancel: onSlideCancel ? () => onSlideCancel() : undefined,
    onSlideLock: onSlideLock ? () => onSlideLock() : undefined,
    onSilenceDetected: onSilenceDetected ? e => onSilenceDetected({
      durationMs: e.nativeEvent.durationMs
    }) : undefined,
    onPcmChunk: onPcmChunk ? e => onPcmChunk(e.nativeEvent) : undefined
  });
}
export const WaveformRecorderView = /*#__PURE__*/forwardRef(WaveformRecorderViewInner);
WaveformRecorderView.displayName = 'WaveformRecorderView';
//# sourceMappingURL=WaveformRecorderView.native.js.map