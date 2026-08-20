/// <reference types="react" />
import type { WaveformRecorderCompleteEvent, WaveformRecorderErrorEvent, WaveformRecorderMeterEvent, WaveformRecorderState, WaveformRecorderViewRef } from './WaveformRecorderView';
export type { WaveformRecorderCompleteEvent, WaveformRecorderErrorEvent, WaveformRecorderFutureBarStyle, WaveformRecorderMeterEvent, WaveformRecorderNewSampleEntry, WaveformRecorderOutputConfig, WaveformRecorderOutputFormat, WaveformRecorderPlaybackTimeUpdateEvent, WaveformRecorderRecordingMode, WaveformRecorderSeekEvent, WaveformRecorderSilenceDetectedEvent, WaveformRecorderSlideProgressEvent, WaveformRecorderState, WaveformRecorderStateChangeEvent, WaveformRecorderTimeMode, WaveformRecorderViewProps, WaveformRecorderViewRef, } from './WaveformRecorderView';
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
export declare function ensureMicrophonePermission(): Promise<boolean>;
export declare const WaveformRecorderView: import("react").ForwardRefExoticComponent<Omit<import("react-native").ViewProps, "children"> & {
    output?: import("./WaveformRecorderView").WaveformRecorderOutputConfig | undefined;
    maxDurationMs?: number | undefined;
    minDurationMs?: number | undefined;
    playedBarColor?: import("react-native").ColorValue | undefined;
    unplayedBarColor?: import("react-native").ColorValue | undefined;
    futureBarColor?: import("react-native").ColorValue | undefined;
    barWidth?: number | undefined;
    barGap?: number | undefined;
    barRadius?: number | undefined;
    containerBackgroundColor?: import("react-native").ColorValue | undefined;
    containerBorderRadius?: number | undefined;
    showBackground?: boolean | undefined;
    showTime?: boolean | undefined;
    timeColor?: import("react-native").ColorValue | undefined;
    timeMode?: import("./WaveformRecorderView").WaveformRecorderTimeMode | undefined;
    recordingMode?: import("./WaveformRecorderView").WaveformRecorderRecordingMode | undefined;
    futureBarStyle?: import("./WaveformRecorderView").WaveformRecorderFutureBarStyle | undefined;
    newSampleEntry?: import("./WaveformRecorderView").WaveformRecorderNewSampleEntry | undefined;
    meterUpdatesPerSecond?: number | undefined;
    samplesPerSecond?: number | undefined;
    enablePreview?: boolean | undefined;
    enableContinueRecording?: boolean | undefined;
    showPlayButton?: boolean | undefined;
    playButtonColor?: import("react-native").ColorValue | undefined;
    enableSlideToCancel?: boolean | undefined;
    slideToCancelThresholdDp?: number | undefined;
    enableSlideToLock?: boolean | undefined;
    slideToLockThresholdDp?: number | undefined;
    enablePcmStream?: boolean | undefined;
    pcmChunkMs?: number | undefined;
    backgroundRecording?: boolean | undefined;
    backgroundNotificationTitle?: string | undefined;
    backgroundNotificationBody?: string | undefined;
    silenceThresholdDb?: number | undefined;
    silenceTimeoutMs?: number | undefined;
    autoStopOnSilence?: boolean | undefined;
    state?: WaveformRecorderState | undefined;
    onStateChange?: ((event: import("./WaveformRecorderView").WaveformRecorderStateChangeEvent) => void) | undefined;
    onMeter?: ((event: WaveformRecorderMeterEvent) => void) | undefined;
    onComplete?: ((event: WaveformRecorderCompleteEvent) => void) | undefined;
    onMaxDurationReached?: (() => void) | undefined;
    onPermissionDenied?: (() => void) | undefined;
    onError?: ((event: WaveformRecorderErrorEvent) => void) | undefined;
    onSeek?: ((event: import("./WaveformRecorderView").WaveformRecorderSeekEvent) => void) | undefined;
    onPlaybackTimeUpdate?: ((event: import("./WaveformRecorderView").WaveformRecorderPlaybackTimeUpdateEvent) => void) | undefined;
    onSlideProgress?: ((event: import("./WaveformRecorderView").WaveformRecorderSlideProgressEvent) => void) | undefined;
    onSlideCancel?: (() => void) | undefined;
    onSlideLock?: (() => void) | undefined;
    onSilenceDetected?: ((event: import("./WaveformRecorderView").WaveformRecorderSilenceDetectedEvent) => void) | undefined;
    onPcmChunk?: ((event: import("./WaveformRecorderView").WaveformRecorderPcmChunkEvent) => void) | undefined;
} & import("react").RefAttributes<WaveformRecorderViewRef>>;
//# sourceMappingURL=WaveformRecorderView.native.d.ts.map