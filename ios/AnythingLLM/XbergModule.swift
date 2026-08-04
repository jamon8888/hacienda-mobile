import Foundation
import Xberg

@objc(XbergModule)
class XbergModule: NSObject {
    private let maxFileSize: Int64 = 50 * 1024 * 1024

    @objc static func requiresMainQueueSetup() -> Bool { false }

    @objc func extract(_ filePath: String, configJson: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: filePath) else { reject("FILE_NOT_FOUND", "File not found: \(filePath)", nil); return }
        do {
            let attrs = try fm.attributesOfItem(atPath: filePath)
            if let size = attrs[.size] as? Int64, size > maxFileSize {
                reject("FILE_TOO_LARGE", "File exceeds 50MB limit", nil); return
            }
            let input = try ExtractInput.from_uri(filePath)
            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extract(input: input, config: config)
            resolve(result.toJson())
        } catch { reject("EXTRACTION_ERROR", error.localizedDescription, error) }
    }

    @objc func extractBatch(_ filePaths: NSArray, configJson: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            var inputs: [ExtractInput] = []
            var localErrors: [[String: Any]] = []
            let fm = FileManager.default
            for case let filePath as String in filePaths {
                guard fm.fileExists(atPath: filePath) else {
                    localErrors.append(["source": filePath, "code": "FILE_NOT_FOUND", "error": "File not found: \(filePath)"])
                    continue
                }
                do {
                    let attrs = try fm.attributesOfItem(atPath: filePath)
                    if let size = attrs[.size] as? Int64, size > maxFileSize {
                        localErrors.append(["source": filePath, "code": "FILE_TOO_LARGE", "error": "File exceeds 50MB: \(filePath)"])
                        continue
                    }
                    inputs.append(try ExtractInput.from_uri(filePath))
                } catch {
                    localErrors.append(["source": filePath, "code": "INVALID_INPUT", "error": error.localizedDescription])
                }
            }

            let resultJson: String
            if inputs.isEmpty {
                resultJson = "{\"results\":[],\"errors\":[],\"summary\":{}}"
            } else {
                let config = try ExtractionConfig.fromJson(configJson)
                resultJson = try Xberg.extractBatch(inputs: inputs, config: config).toJson()
            }

            guard !localErrors.isEmpty else {
                resolve(resultJson)
                return
            }

            if let data = resultJson.data(using: .utf8),
               var envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                var errors = envelope["errors"] as? [[String: Any]] ?? []
                errors.append(contentsOf: localErrors)
                envelope["errors"] = errors
                if let out = try? JSONSerialization.data(withJSONObject: envelope) {
                    resolve(String(data: out, encoding: .utf8))
                    return
                }
            }
            NSLog("[XbergModule] extractBatch: could not merge localErrors into envelope: %@", localErrors)
            resolve(resultJson)
        } catch { reject("EXTRACTION_ERROR", error.localizedDescription, error) }
    }

    @objc func getSupportedFormats(_ resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {
        let formats = Xberg.listSupportedFormats()
        resolve(formats.map { ["extension": $0.extension, "mimeType": $0.mimeType] })
    }

    @objc func transcribeAudio(_ filePath: String, model: String, language: String?,
                               resolver resolve: @escaping RCTPromiseResolveBlock,
                               rejecter reject: @escaping RCTPromiseRejectBlock) {
        let fm = FileManager.default
        guard fm.fileExists(atPath: filePath) else { reject("FILE_NOT_FOUND", "Audio file not found: \(filePath)", nil); return }
        let audioExtensions = [".mp3", ".m4a", ".wav", ".webm", ".mpga"]
        guard audioExtensions.contains(where: { filePath.lowercased().hasSuffix($0) }) else {
            reject("INVALID_FORMAT", "Not an audio file: \(filePath)", nil); return
        }
        do {
            let input = try ExtractInput.from_uri(filePath)
            var configJson = "{\"transcription\":{\"model\":\"\(model)\""
            if let language = language { configJson += ",\"language\":\"\(language)\"" }
            configJson += "}}"
            let config = try ExtractionConfig.fromJson(configJson)
            let result = try Xberg.extract(input: input, config: config)
            resolve(result.toJson())
        } catch {
            reject("TRANSCRIPTION_ERROR", error.localizedDescription, error)
        }
    }
}
