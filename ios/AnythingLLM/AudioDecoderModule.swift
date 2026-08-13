import Foundation
import AVFoundation

@objc(AudioDecoderModule)
class AudioDecoderModule: NSObject {
    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func decodeToPCM16(_ filePath: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: filePath) else {
            reject("FILE_NOT_FOUND", "File not found: \(filePath)", nil)
            return
        }

        let url = URL(fileURLWithPath: filePath)
        guard let audioFile = try? AVAudioFile(forReading: url) else {
            reject("DECODE_ERROR", "Could not open audio file: \(filePath)", nil)
            return
        }

        let sourceFormat = audioFile.processingFormat
        let sourceSampleRate = Float(sourceFormat.sampleRate)
        let sourceChannels = sourceFormat.channelCount
        let frameLength = AVAudioFramePosition(audioFile.length)

        // Read entire file into buffer
        let buffer = AVAudioPCMBuffer(pcmFormat: sourceFormat, frameCapacity: AVAudioFrameCount(frameLength))!
        try? audioFile.read(into: buffer)

        guard let channelData = buffer.floatChannelData else {
            reject("DECODE_ERROR", "No audio data in file", nil)
            return
        }

        // Convert to mono float samples
        let monoFloats: [Float]
        if sourceChannels > 1 {
            monoFloats = (0..<Int(buffer.frameLength)).map { i in
                var sum: Float = 0
                for ch in 0..<sourceChannels {
                    sum += channelData[ch][i]
                }
                return sum / Float(sourceChannels)
            }
        } else {
            monoFloats = Array(UnsafeBufferPointer(start: channelData[0], count: Int(buffer.frameLength)))
        }

        // Resample to 16kHz
        let targetSampleRate: Float = 16000
        let resampled: [Float]
        if sourceSampleRate != targetSampleRate {
            let ratio = Double(sourceSampleRate) / Double(targetSampleRate)
            let outputLength = Int(Double(monoFloats.count) / ratio)
            resampled = (0..<outputLength).map { i in
                let srcPos = Double(i) * ratio
                let srcIndex = Int(srcPos)
                let frac = Float(srcPos - Double(srcIndex))
                let s0 = monoFloats[min(srcIndex, monoFloats.count - 1)]
                let s1 = monoFloats[min(srcIndex + 1, monoFloats.count - 1)]
                return s0 + frac * (s1 - s0)
            }
        } else {
            resampled = monoFloats
        }

        // Convert float [-1.0, 1.0] to Int16
        let int16Samples = resampled.map { sample -> Int in
            let clamped = max(-1.0, min(1.0, sample))
            return Int(clamped * 32767.0)
        }

        let durationMs = Int(Double(resampled.count) / Double(targetSampleRate) * 1000)

        let result: [String: Any] = [
            "samples": int16Samples,
            "sampleRate": Int(targetSampleRate),
            "durationMs": durationMs
        ]
        resolve(result)
    }
}
