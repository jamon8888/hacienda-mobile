/**
 * Optional raw-PCM streaming helpers.
 *
 * This entry point is opt-in — importing it should not pull anything new
 * into the default `react-native-waveform-recorder` bundle. The codegen
 * spec already declares `enablePcmStream` + `onPcmChunk` on the main view;
 * the helpers below just make the base64 payload easy to consume.
 *
 * ## Usage
 *
 * ```tsx
 * import {
 *   WaveformRecorderView,
 * } from 'react-native-waveform-recorder';
 * import {
 *   decodePcmChunk,
 *   pcmToMonoFloat32,
 * } from 'react-native-waveform-recorder/pcm-stream';
 *
 * <WaveformRecorderView
 *   output={{ format: 'wav', sampleRate: 16000, channels: 1 }}
 *   enablePcmStream
 *   pcmChunkMs={100}
 *   onPcmChunk={(e) => {
 *     const int16 = decodePcmChunk(e.chunk);
 *     const float32 = pcmToMonoFloat32(int16, e.channels);
 *     // feed `float32` into Whisper / VAD / your STT pipeline of choice.
 *   }}
 * />
 * ```
 *
 * ## Caveats
 *
 *  - Streaming only works with `output.format = 'wav'`. The m4a / opus
 *    paths don't hand us pre-encoded samples.
 *  - Payloads cross the bridge as base64 strings, not zero-copy buffers.
 *    For multi-MB/s pipelines, prefer [`react-native-audio-api`] which
 *    exposes a true JSI ringbuffer.
 *
 * [`react-native-audio-api`]: https://github.com/software-mansion/react-native-audio-api
 */
/**
 * Decode the base64 `chunk` payload from an `onPcmChunk` event into an
 * `Int16Array` (one entry per interleaved sample-per-channel).
 *
 * Implemented with `global.atob` (Hermes ships it as part of the WHATWG
 * URL/Encoding shim) — no third-party dependency.
 */
export declare function decodePcmChunk(chunkBase64: string): Int16Array;
/**
 * Convert an interleaved Int16 PCM block into a mono Float32 array in
 * [-1, 1]. Pass the channel count from the `onPcmChunk` event.
 *
 * For 2-channel input, this averages each L/R pair into a single mono
 * sample, which is what most VAD / STT models expect.
 */
export declare function pcmToMonoFloat32(samples: Int16Array, channels: number): Float32Array;
//# sourceMappingURL=index.d.ts.map