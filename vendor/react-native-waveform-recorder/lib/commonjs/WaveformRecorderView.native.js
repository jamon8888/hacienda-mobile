"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.WaveformRecorderView = void 0;
exports.ensureMicrophonePermission = ensureMicrophonePermission;
var _react = require("react");
var _reactNative = require("react-native");
var _WaveformRecorderViewNativeComponent = _interopRequireWildcard(require("./WaveformRecorderViewNativeComponent"));
var _jsxRuntime = require("react/jsx-runtime");
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function (e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
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
async function ensureMicrophonePermission() {
  if (_reactNative.Platform.OS !== 'android') return true;
  try {
    const already = await _reactNative.PermissionsAndroid.check(_reactNative.PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (already) return true;
    const result = await _reactNative.PermissionsAndroid.request(_reactNative.PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'This app needs microphone access to record audio with a live waveform.',
      buttonPositive: 'Allow',
      buttonNegative: 'Cancel'
    });
    return result === _reactNative.PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}
function WaveformRecorderViewInner(props, ref) {
  const nativeRef = (0, _react.useRef)(null);

  // Keep a ref pointing at the latest `onPermissionDenied` so the imperative
  // `start()` can fire it directly when JS-side permission request returns
  // false (Android only). Without the ref, we'd capture the *initial*
  // callback at mount time and stale-callback bugs would silently swallow
  // the event.
  const onPermissionDeniedRef = (0, _react.useRef)(props.onPermissionDenied);
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
  const outputUri = (0, _react.useMemo)(() => output?.uri ?? '', [output?.uri]);
  const outputFormat = (0, _react.useMemo)(() => output?.format ?? 'm4a', [output?.format]);
  const outputSampleRate = (0, _react.useMemo)(() => output?.sampleRate ?? 44100, [output?.sampleRate]);
  const outputChannels = (0, _react.useMemo)(() => output?.channels ?? 1, [output?.channels]);
  const outputBitrate = (0, _react.useMemo)(() => output?.bitrate ?? 128000, [output?.bitrate]);
  const outputQuality = (0, _react.useMemo)(() => output?.quality ?? 'high', [output?.quality]);

  // 'auto' = uncontrolled (sentinel). Anything else means the host app is
  // driving the state machine via the prop. `error` is internal-only and
  // can never be assigned from outside, so it's not a valid value here.

  const controlledState = (0, _react.useMemo)(() => {
    if (state === undefined || state === 'error') return 'auto';
    return state;
  }, [state]);
  (0, _react.useImperativeHandle)(ref, () => ({
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
        if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.start(nativeRef.current);
      });
    },
    pause: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.pause(nativeRef.current);
    },
    resume: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.resume(nativeRef.current);
    },
    stop: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.stop(nativeRef.current);
    },
    cancel: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.cancel(nativeRef.current);
    },
    enterPreview: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.enterPreview(nativeRef.current);
    },
    exitPreview: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.exitPreview(nativeRef.current);
    },
    togglePreviewPlayback: () => {
      if (nativeRef.current) _WaveformRecorderViewNativeComponent.Commands.togglePreviewPlayback(nativeRef.current);
    },
    seekPreview: positionMs => {
      if (nativeRef.current) {
        _WaveformRecorderViewNativeComponent.Commands.seekPreview(nativeRef.current, Math.max(0, Math.floor(positionMs)));
      }
    }
  }), []);
  return /*#__PURE__*/(0, _jsxRuntime.jsx)(_WaveformRecorderViewNativeComponent.default, {
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
const WaveformRecorderView = exports.WaveformRecorderView = /*#__PURE__*/(0, _react.forwardRef)(WaveformRecorderViewInner);
WaveformRecorderView.displayName = 'WaveformRecorderView';
//# sourceMappingURL=WaveformRecorderView.native.js.map