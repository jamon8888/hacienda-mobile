/// <reference types="react" />
import { type Float, type Int32, type WithDefault, type DirectEventHandler, type ColorValue, type HostComponent, type ViewProps } from 'react-native';
type OnStateChangeEvent = Readonly<{
    state: string;
    durationMs: Int32;
}>;
type OnMeterEvent = Readonly<{
    amplitude: Float;
    peak: Float;
    db: Float;
}>;
type OnCompleteEvent = Readonly<{
    uri: string;
    durationMs: Int32;
    format: string;
    mimeType: string;
    sizeBytes: Int32;
    sampleRate: Int32;
    channels: Int32;
    /**
     * Comma-separated 64-bucket WhatsApp-compatible amplitude string, each
     * value in [0, 1]. Codegen DirectEvent payloads do not support arrays;
     * the JS wrapper parses this into `samples: number[]` before invoking
     * the public `onComplete` callback.
     */
    samplesCsv: string;
    peakAmplitude: Float;
}>;
type OnMaxDurationReachedEvent = Readonly<{}>;
type OnPermissionDeniedEvent = Readonly<{}>;
type OnErrorEvent = Readonly<{
    message: string;
    code: string;
}>;
/** v0.2 — fired when the preview playhead moves (via scrub or imperative seek). */
type OnSeekEvent = Readonly<{
    positionMs: Int32;
}>;
/** v0.2 — fired periodically while preview playback is active. */
type OnPlaybackTimeUpdateEvent = Readonly<{
    positionMs: Int32;
    durationMs: Int32;
}>;
/**
 * v0.3 — fired continuously while a recording-mode pan gesture is active so
 * the host UI can animate a chevron / mic-button follow-along. Values are
 * clamped to [0, 1] where 1 means the threshold has been reached.
 */
type OnSlideProgressEvent = Readonly<{
    cancelProgress: Float;
    lockProgress: Float;
}>;
/** v0.3 — fired once when the slide-to-cancel threshold is crossed. */
type OnSlideCancelEvent = Readonly<{}>;
/** v0.3 — fired once when the slide-to-lock threshold is crossed. */
type OnSlideLockEvent = Readonly<{}>;
/** v0.3 — fired when the rolling dB level stays below threshold for too long. */
type OnSilenceDetectedEvent = Readonly<{
    durationMs: Int32;
}>;
/**
 * v1.0 — fired periodically while raw-PCM streaming is enabled. `chunk` is
 * base64-encoded little-endian 16-bit PCM samples for the configured
 * number of channels. Subscribe via the `/pcm-stream` import path which
 * exposes a decoder helper for turning the base64 payload back into a
 * typed array.
 */
type OnPcmChunkEvent = Readonly<{
    chunk: string;
    sampleRate: Int32;
    channels: Int32;
    bytesPerSample: Int32;
    timestampMs: Int32;
}>;
export interface NativeProps extends ViewProps {
    /** Where to write the file. Empty = library picks a cache-dir path. */
    outputUri?: string;
    /** Container/codec. Only 'm4a' is supported in v0.1. */
    outputFormat?: WithDefault<'m4a' | 'aac' | 'wav' | 'opus', 'm4a'>;
    outputSampleRate?: WithDefault<Int32, 44100>;
    outputChannels?: WithDefault<Int32, 1>;
    outputBitrate?: WithDefault<Int32, 128000>;
    outputQuality?: WithDefault<'low' | 'medium' | 'high', 'high'>;
    /** 0 = no max. */
    maxDurationMs?: WithDefault<Int32, 0>;
    /** 0 = no min. */
    minDurationMs?: WithDefault<Int32, 0>;
    playedBarColor?: ColorValue;
    unplayedBarColor?: ColorValue;
    /** Dotted future-bar color. Defaults to unplayedBarColor when null. */
    futureBarColor?: ColorValue;
    barWidth?: WithDefault<Float, 3.0>;
    barGap?: WithDefault<Float, 2.0>;
    /** -1 sentinel = "auto" (barWidth / 2). */
    barRadius?: WithDefault<Float, -1.0>;
    containerBackgroundColor?: ColorValue;
    containerBorderRadius?: WithDefault<Float, 16.0>;
    showBackground?: WithDefault<boolean, true>;
    showTime?: WithDefault<boolean, true>;
    timeColor?: ColorValue;
    timeMode?: WithDefault<'count-up' | 'count-down', 'count-up'>;
    recordingMode?: WithDefault<'scroll' | 'morph' | 'centered', 'scroll'>;
    futureBarStyle?: WithDefault<'dot' | 'line' | 'hidden', 'hidden'>;
    newSampleEntry?: WithDefault<'grow' | 'fade' | 'none', 'grow'>;
    meterUpdatesPerSecond?: WithDefault<Int32, 30>;
    samplesPerSecond?: WithDefault<Int32, 12>;
    /** When false, `enterPreview()` is a no-op. */
    enablePreview?: WithDefault<boolean, true>;
    /** When false, `resume()` from preview is a no-op (WhatsApp-style continue is gated off). */
    enableContinueRecording?: WithDefault<boolean, true>;
    /** Show the built-in play/pause button during preview state. */
    showPlayButton?: WithDefault<boolean, true>;
    playButtonColor?: ColorValue;
    /** When true, attaches a native pan gesture that emits `onSlideCancel`/`onSlideProgress` while recording. */
    enableSlideToCancel?: WithDefault<boolean, false>;
    /** Horizontal distance (in dp/points) to cross before `onSlideCancel` fires. */
    slideToCancelThresholdDp?: WithDefault<Float, 80.0>;
    /** When true, the same pan gesture also emits `onSlideLock`/`onSlideProgress` for vertical drags. */
    enableSlideToLock?: WithDefault<boolean, false>;
    /** Vertical distance (in dp/points) to cross before `onSlideLock` fires. */
    slideToLockThresholdDp?: WithDefault<Float, 80.0>;
    /**
     * When true, the engine emits chunks of raw 16-bit PCM via `onPcmChunk`
     * while recording. **Only works with `output.format = 'wav'`** because
     * the m4a / opus paths don't expose pre-encoded samples. Subscribe via
     * the `react-native-waveform-recorder/pcm-stream` subpath.
     */
    enablePcmStream?: WithDefault<boolean, false>;
    /**
     * Approximate target chunk duration in ms. The native engine flushes
     * chunks at or near this cadence. Smaller = lower latency + more JS
     * traffic; larger = bigger but cheaper chunks. Default 200ms.
     */
    pcmChunkMs?: WithDefault<Int32, 200>;
    /**
     * When true, the recorder keeps running while the host app is
     * backgrounded. Requires platform-specific setup:
     *
     *   - iOS: the host app must add `audio` to `UIBackgroundModes` in
     *     `Info.plist`. AVAudioSession is already configured as `.playAndRecord`.
     *   - Android: the host app must declare the
     *     `WaveformRecorderBackgroundService` in their `AndroidManifest.xml`
     *     plus the `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MICROPHONE`
     *     permissions. The engine binds a microphone-type foreground service
     *     while recording when this prop is true.
     */
    backgroundRecording?: WithDefault<boolean, false>;
    /** Notification title shown by the Android foreground service. */
    backgroundNotificationTitle?: string;
    /** Notification body shown by the Android foreground service. */
    backgroundNotificationBody?: string;
    /**
     * dBFS threshold (negative number, e.g. -50). When the rolling mean dB
     * stays below this for `silenceTimeoutMs` while recording, the engine
     * fires `onSilenceDetected`. -160 (default) effectively disables it.
     */
    silenceThresholdDb?: WithDefault<Float, -160.0>;
    /**
     * Minimum number of ms the rolling dB must stay below threshold before
     * `onSilenceDetected` fires. 0 = effectively disabled.
     */
    silenceTimeoutMs?: WithDefault<Int32, 0>;
    /** When true, the engine auto-stops recording when silence is detected. */
    autoStopOnSilence?: WithDefault<boolean, false>;
    /**
     * Controlled state machine. 'auto' (default) = uncontrolled; component
     * drives its own state via commands. Otherwise the host app is responsible
     * for advancing the state via prop updates, and component commands become
     * inert (still emit `onStateChange` with the *requested* new state).
     */
    controlledState?: WithDefault<'auto' | 'idle' | 'recording' | 'paused' | 'preview' | 'stopped', 'auto'>;
    onStateChange?: DirectEventHandler<OnStateChangeEvent>;
    onMeter?: DirectEventHandler<OnMeterEvent>;
    onComplete?: DirectEventHandler<OnCompleteEvent>;
    onMaxDurationReached?: DirectEventHandler<OnMaxDurationReachedEvent>;
    onPermissionDenied?: DirectEventHandler<OnPermissionDeniedEvent>;
    onError?: DirectEventHandler<OnErrorEvent>;
    onSeek?: DirectEventHandler<OnSeekEvent>;
    onPlaybackTimeUpdate?: DirectEventHandler<OnPlaybackTimeUpdateEvent>;
    onSlideProgress?: DirectEventHandler<OnSlideProgressEvent>;
    onSlideCancel?: DirectEventHandler<OnSlideCancelEvent>;
    onSlideLock?: DirectEventHandler<OnSlideLockEvent>;
    onSilenceDetected?: DirectEventHandler<OnSilenceDetectedEvent>;
    onPcmChunk?: DirectEventHandler<OnPcmChunkEvent>;
}
interface NativeCommands {
    start: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    pause: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    resume: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    stop: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    cancel: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    enterPreview: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    exitPreview: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    togglePreviewPlayback: (viewRef: React.ElementRef<HostComponent<NativeProps>>) => void;
    seekPreview: (viewRef: React.ElementRef<HostComponent<NativeProps>>, positionMs: Int32) => void;
}
export declare const Commands: NativeCommands;
declare const _default: any;
export default _default;
//# sourceMappingURL=WaveformRecorderViewNativeComponent.d.ts.map