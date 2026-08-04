package com.anythingllm.xberg

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import io.xberg.ExtractInput
import io.xberg.ExtractionConfig
import io.xberg.Xberg

class XbergModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "XbergModule"

    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024L
    }

    @ReactMethod
    fun extract(filePath: String, configJson: String, promise: Promise) {
        try {
            val file = java.io.File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "File not found: $filePath")
                return
            }
            if (file.length() > MAX_FILE_SIZE) {
                promise.reject("FILE_TOO_LARGE", "File exceeds 50MB limit")
                return
            }
            val input = ExtractInput.from_uri(filePath)
            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extract(input, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun extractBatch(filePaths: ReadableArray, configJson: String, promise: Promise) {
        try {
            val inputs = mutableListOf<ExtractInput>()
            val localErrors = org.json.JSONArray()
            for (i in 0 until filePaths.size()) {
                val filePath = filePaths.getString(i)
                val file = java.io.File(filePath)
                if (!file.exists()) {
                    localErrors.put(org.json.JSONObject()
                        .put("source", filePath)
                        .put("code", "FILE_NOT_FOUND")
                        .put("error", "File not found: $filePath"))
                    continue
                }
                if (file.length() > MAX_FILE_SIZE) {
                    localErrors.put(org.json.JSONObject()
                        .put("source", filePath)
                        .put("code", "FILE_TOO_LARGE")
                        .put("error", "File exceeds 50MB: $filePath"))
                    continue
                }
                try {
                    inputs.add(ExtractInput.from_uri(filePath))
                } catch (e: Exception) {
                    localErrors.put(org.json.JSONObject()
                        .put("source", filePath)
                        .put("code", "INVALID_INPUT")
                        .put("error", e.message ?: "Failed to read file"))
                }
            }

            val config = ExtractionConfig.fromJson(configJson)
            val resultJson = if (inputs.isEmpty()) {
                """{"results":[],"errors":[],"summary":{}}"""
            } else {
                Xberg.extractBatch(inputs, config).toJson()
            }

            if (localErrors.length() > 0) {
                try {
                    val envelope = org.json.JSONObject(resultJson)
                    val errors = envelope.optJSONArray("errors") ?: org.json.JSONArray()
                    for (j in 0 until localErrors.length()) errors.put(localErrors.get(j))
                    envelope.put("errors", errors)
                    promise.resolve(envelope.toString())
                } catch (e: Exception) {
                    android.util.Log.w("XbergModule", "extractBatch: could not merge localErrors: ${e.message}")
                    promise.resolve(resultJson)
                }
            } else {
                promise.resolve(resultJson)
            }
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getSupportedFormats(promise: Promise) {
        try {
            val formats = Xberg.listSupportedFormats()
            val result: WritableArray = Arguments.createArray()
            for (format in formats) {
                val map: WritableMap = Arguments.createMap()
                map.putString("extension", format.extension)
                map.putString("mimeType", format.mimeType)
                result.pushMap(map)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun transcribeAudio(filePath: String, model: String, language: String?, promise: Promise) {
        try {
            val file = java.io.File(filePath)
            if (!file.exists()) {
                promise.reject("FILE_NOT_FOUND", "Audio file not found: $filePath")
                return
            }
            val audioExtensions = listOf(".mp3", ".m4a", ".wav", ".webm", ".mpga")
            if (!audioExtensions.any { filePath.lowercase().endsWith(it) }) {
                promise.reject("INVALID_FORMAT", "Not an audio file: $filePath")
                return
            }
            val input = ExtractInput.from_uri(filePath)
            val configJson = buildString {
                append("""{"transcription":{"model":"$model"""")
                if (language != null) append(""","language":"$language"""")
                append("}}")
            }
            val config = ExtractionConfig.fromJson(configJson)
            val result = Xberg.extract(input, config)
            promise.resolve(result.toJson())
        } catch (e: Exception) {
            promise.reject("TRANSCRIPTION_ERROR", e.message, e)
        }
    }
}
