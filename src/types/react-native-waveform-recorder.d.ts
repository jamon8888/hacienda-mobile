// Hand-written ambient declaration for react-native-waveform-recorder@1.0.1.
// The vendored copy (vendor/react-native-waveform-recorder) ships lib/module
// and lib/commonjs (built via `bob build --target module|commonjs`), but its
// own `lib/typescript` target requires the package's own devDependencies
// (react-native, @types/react) which aren't resolvable when building it in
// isolation. Mirrors the real src/WaveformRecorderView.tsx type surface.
declare module "react-native-waveform-recorder" {
  import type { ColorValue, ViewProps } from "react-native";
  import type { ForwardRefExoticComponent, RefAttributes } from "react";

  export type WaveformRecorderState =
    | "idle"
    | "recording"
    | "paused"
    | "preview"
    | "stopped"
    | "error";

  export type WaveformRecorderTimeMode = "count-up" | "count-down";
  export type WaveformRecorderOutputFormat = "m4a" | "aac" | "wav" | "opus";
  export type WaveformRecorderRecordingMode = "scroll" | "morph" | "centered";
  export type WaveformRecorderFutureBarStyle = "dot" | "line" | "hidden";
  export type WaveformRecorderNewSampleEntry = "grow" | "fade" | "none";

  export type WaveformRecorderOutputConfig = {
    uri?: string;
    format?: WaveformRecorderOutputFormat;
    sampleRate?: number;
    channels?: 1 | 2;
    bitrate?: number;
    quality?: "low" | "medium" | "high";
  };

  export type WaveformRecorderStateChangeEvent = {
    state: WaveformRecorderState;
    durationMs: number;
  };

  export type WaveformRecorderMeterEvent = {
    amplitude: number;
    peak: number;
    db: number;
  };

  export type WaveformRecorderCompleteEvent = {
    uri: string;
    durationMs: number;
    format: WaveformRecorderOutputFormat;
    mimeType: string;
    sizeBytes: number;
    sampleRate: number;
    channels: number;
    /** WhatsApp-compatible 64-bucket sample array, values in [0, 1]. */
    samples: number[];
    peakAmplitude: number;
  };

  export type WaveformRecorderErrorEvent = {
    message: string;
    code?: string;
  };

  export type WaveformRecorderSeekEvent = { positionMs: number };
  export type WaveformRecorderPlaybackTimeUpdateEvent = {
    positionMs: number;
    durationMs: number;
  };
  export type WaveformRecorderSlideProgressEvent = {
    cancelProgress: number;
    lockProgress: number;
  };
  export type WaveformRecorderSilenceDetectedEvent = { durationMs: number };
  export type WaveformRecorderPcmChunkEvent = {
    chunk: string;
    sampleRate: number;
    channels: number;
    bytesPerSample: number;
    timestampMs: number;
  };

  export type WaveformRecorderViewProps = Omit<ViewProps, "children"> & {
    output?: WaveformRecorderOutputConfig;
    maxDurationMs?: number;
    minDurationMs?: number;
    playedBarColor?: ColorValue;
    unplayedBarColor?: ColorValue;
    futureBarColor?: ColorValue;
    barWidth?: number;
    barGap?: number;
    barRadius?: number;
    containerBackgroundColor?: ColorValue;
    containerBorderRadius?: number;
    showBackground?: boolean;
    showTime?: boolean;
    timeColor?: ColorValue;
    timeMode?: WaveformRecorderTimeMode;
    recordingMode?: WaveformRecorderRecordingMode;
    futureBarStyle?: WaveformRecorderFutureBarStyle;
    newSampleEntry?: WaveformRecorderNewSampleEntry;
    meterUpdatesPerSecond?: number;
    samplesPerSecond?: number;
    enablePreview?: boolean;
    enableContinueRecording?: boolean;
    showPlayButton?: boolean;
    playButtonColor?: ColorValue;
    enableSlideToCancel?: boolean;
    slideToCancelThresholdDp?: number;
    enableSlideToLock?: boolean;
    slideToLockThresholdDp?: number;
    enablePcmStream?: boolean;
    pcmChunkMs?: number;
    backgroundRecording?: boolean;
    backgroundNotificationTitle?: string;
    backgroundNotificationBody?: string;
    silenceThresholdDb?: number;
    silenceTimeoutMs?: number;
    autoStopOnSilence?: boolean;
    state?: WaveformRecorderState;
    onStateChange?: (event: WaveformRecorderStateChangeEvent) => void;
    onMeter?: (event: WaveformRecorderMeterEvent) => void;
    onComplete?: (event: WaveformRecorderCompleteEvent) => void;
    onMaxDurationReached?: () => void;
    onPermissionDenied?: () => void;
    onError?: (event: WaveformRecorderErrorEvent) => void;
    onSeek?: (event: WaveformRecorderSeekEvent) => void;
    onPlaybackTimeUpdate?: (
      event: WaveformRecorderPlaybackTimeUpdateEvent,
    ) => void;
    onSlideProgress?: (event: WaveformRecorderSlideProgressEvent) => void;
    onSlideCancel?: () => void;
    onSlideLock?: () => void;
    onSilenceDetected?: (event: WaveformRecorderSilenceDetectedEvent) => void;
    onPcmChunk?: (event: WaveformRecorderPcmChunkEvent) => void;
  };

  export type WaveformRecorderViewRef = {
    start: () => void;
    pause: () => void;
    resume: () => void;
    stop: () => void;
    cancel: () => void;
    enterPreview: () => void;
    exitPreview: () => void;
    togglePreviewPlayback: () => void;
    seekPreview: (positionMs: number) => void;
  };

  export const WaveformRecorderView: ForwardRefExoticComponent<
    WaveformRecorderViewProps & RefAttributes<WaveformRecorderViewRef>
  >;

  export function ensureMicrophonePermission(): Promise<boolean>;
}
