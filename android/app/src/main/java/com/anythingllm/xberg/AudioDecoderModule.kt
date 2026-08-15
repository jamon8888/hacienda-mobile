package com.anythingllm.xberg

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Decodes audio files to PCM16 samples at 16kHz mono for CactusSTT.
 *
 * Uses MediaExtractor + MediaCodec (hardware-accelerated) for decoding,
 * with manual resampling if the source isn't 16kHz.
 */
class AudioDecoderModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "AudioDecoderModule"

    @ReactMethod
    fun decodeToPCM16(filePath: String, promise: Promise) {
        try {
            val extractor = MediaExtractor()
            extractor.setDataSource(filePath)

            if (extractor.trackCount == 0) {
                extractor.release()
                promise.reject("NO_AUDIO_TRACK", "No audio track found in: $filePath")
                return
            }

            // Find the audio track
            var audioTrackIndex = -1
            var audioFormat: MediaFormat? = null
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (mime.startsWith("audio/")) {
                    audioTrackIndex = i
                    audioFormat = format
                    break
                }
            }

            if (audioTrackIndex < 0 || audioFormat == null) {
                extractor.release()
                promise.reject("NO_AUDIO_TRACK", "No audio track found in: $filePath")
                return
            }

            extractor.selectTrack(audioTrackIndex)
            val sourceSampleRate = audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            val sourceChannels = audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT)

            // Set up decoder
            val mime = audioFormat.getString(MediaFormat.KEY_MIME)!!
            val decoder = MediaCodec.createDecoderByType(mime)
            decoder.configure(audioFormat, null, null, 0)
            decoder.start()

            val pcmData = mutableListOf<Short>()
            val bufferInfo = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false

            while (!outputDone) {
                // Feed input
                if (!inputDone) {
                    val inputIndex = decoder.dequeueInputBuffer(10_000)
                    if (inputIndex >= 0) {
                        val inputBuffer = decoder.getInputBuffer(inputIndex)!!
                        val sampleSize = extractor.readSampleData(inputBuffer, 0)
                        if (sampleSize < 0) {
                            decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            decoder.queueInputBuffer(inputIndex, 0, sampleSize, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }

                // Drain output
                val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, 10_000)
                if (outputIndex >= 0) {
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        outputDone = true
                    }
                    if (bufferInfo.size > 0) {
                        val outputBuffer = decoder.getOutputBuffer(outputIndex)!!
                        val shorts = ShortArray(bufferInfo.size / 2)
                        outputBuffer.order(java.nio.ByteOrder.LITTLE_ENDIAN)
                        outputBuffer.asShortBuffer().get(shorts)
                        pcmData.addAll(shorts.toList())
                    }
                    decoder.releaseOutputBuffer(outputIndex, false)
                }
            }

            decoder.stop()
            decoder.release()
            extractor.release()

            // Resample to 16kHz mono if needed
            val targetSampleRate = 16000
            val monoSamples = if (sourceChannels > 1) {
                // Convert stereo to mono by averaging channels
                val mono = mutableListOf<Short>()
                var i = 0
                while (i < pcmData.size - sourceChannels + 1) {
                    var sum = 0L
                    for (ch in 0 until sourceChannels) {
                        sum += pcmData[i + ch].toLong()
                    }
                    mono.add((sum / sourceChannels).toShort())
                    i += sourceChannels
                }
                mono
            } else {
                pcmData
            }

            val resampled = if (sourceSampleRate != targetSampleRate) {
                // Linear interpolation resampling
                val ratio = sourceSampleRate.toDouble() / targetSampleRate
                val outputLength = (monoSamples.size / ratio).toInt()
                val result = ShortArray(outputLength)
                for (i in 0 until outputLength) {
                    val srcPos = i * ratio
                    val srcIndex = srcPos.toInt()
                    val frac = srcPos - srcIndex
                    val s0 = monoSamples[min(srcIndex, monoSamples.size - 1)].toInt()
                    val s1 = monoSamples[min(srcIndex + 1, monoSamples.size - 1)].toInt()
                    result[i] = (s0 + frac * (s1 - s0)).roundToInt().toShort()
                }
                result.toList()
            } else {
                monoSamples
            }

            // Convert Short to Int for React Native bridge (ReadableArray doesn't support Short)
            val intSamples = resampled.map { it.toInt() }

            val durationMs = ((resampled.size.toDouble() / targetSampleRate) * 1000).toLong()

            val result: WritableMap = Arguments.createMap()
            val samplesArray = Arguments.createArray()
            for (sample in intSamples) {
                samplesArray.pushInt(sample)
            }
            result.putArray("samples", samplesArray)
            result.putInt("sampleRate", targetSampleRate)
            result.putLong("durationMs", durationMs)

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DECODE_ERROR", "Failed to decode audio: ${e.message}", e)
        }
    }
}
