package com.anythingllm.xberg

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.bridge.Arguments
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.datatype.jdk8.Jdk8Module
import com.fasterxml.jackson.module.kotlin.KotlinModule
import io.xberg.ExtractInput
import io.xberg.ExtractInputKind
import io.xberg.ExtractionConfig
import io.xberg.ExtractionResult
import io.xberg.TranscriptionConfig
import io.xberg.WhisperModel
import io.xberg.Xberg

/**
 * React Native bridge over the Xberg document-extraction SDK.
 *
 * Xberg's Kotlin API is typed end to end -- ExtractionConfig is a 47-field object, results come
 * back as ExtractedDocument instances -- while the JS side of a React Native bridge can only carry
 * strings. Jackson does the translation in both directions: the SDK already ships Jackson-annotated
 * DTOs (it uses Jackson for its own serde), so its own types round-trip without hand-mapping.
 */
class XbergModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "XbergModule"

    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024L

        /**
         * Unknown properties are ignored on purpose: the JS caller builds config objects by hand,
         * and a key it sends that this SDK version does not know should degrade to "that option is
         * not applied" rather than fail the whole extraction.
         */
        private val mapper: ObjectMapper = ObjectMapper()
            .registerModule(KotlinModule.Builder().build())
            .registerModule(Jdk8Module())
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)

        private fun parseConfig(configJson: String): ExtractionConfig =
            if (configJson.isBlank() || configJson == "{}") ExtractionConfig()
            else mapper.readValue(configJson, ExtractionConfig::class.java)

        private fun inputFor(file: java.io.File): ExtractInput =
            ExtractInput(kind = ExtractInputKind.URI, uri = file.absolutePath, filename = file.name)

        /** Rejects with a stable code the JS side can branch on, or returns null when usable. */
        private fun validate(filePath: String): Pair<String, String>? {
            val file = java.io.File(filePath)
            return when {
                !file.exists() -> "FILE_NOT_FOUND" to "File not found: $filePath"
                file.length() > MAX_FILE_SIZE -> "FILE_TOO_LARGE" to "File exceeds 50MB: $filePath"
                else -> null
            }
        }
    }

    @ReactMethod
    fun extract(filePath: String, configJson: String, promise: Promise) {
        try {
            validate(filePath)?.let { (code, message) ->
                promise.reject(code, message)
                return
            }
            val result = Xberg.extract(inputFor(java.io.File(filePath)), parseConfig(configJson))
            promise.resolve(mapper.writeValueAsString(result))
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun extractBatch(filePaths: ReadableArray, configJson: String, promise: Promise) {
        try {
            val inputs = mutableListOf<ExtractInput>()
            // Parallel to `inputs`: Xberg's ExtractedDocument carries no identifier of its own, so
            // this is the only way to reattach extracted content to the file it came from.
            val inputPaths = mutableListOf<String>()
            val localErrors = mutableListOf<Map<String, Any?>>()

            for (i in 0 until filePaths.size()) {
                val filePath = filePaths.getString(i) ?: continue
                val failure = validate(filePath)
                if (failure != null) {
                    val (code, message) = failure
                    localErrors.add(mapOf("source" to filePath, "code" to code, "error" to message))
                    continue
                }
                try {
                    inputs.add(inputFor(java.io.File(filePath)))
                    inputPaths.add(filePath)
                } catch (e: Exception) {
                    localErrors.add(
                        mapOf(
                            "source" to filePath,
                            "code" to "INVALID_INPUT",
                            "error" to (e.message ?: "Failed to read file"),
                        )
                    )
                }
            }

            val result: ExtractionResult? =
                if (inputs.isEmpty()) null else Xberg.extractBatch(inputs, parseConfig(configJson))

            val envelope = mapper.createObjectNode()
            val results = envelope.putArray("results")
            val errors = envelope.putArray("errors")

            if (result != null) {
                // Tag each result with the path it came from, assuming extractBatch preserves input
                // order -- the standard contract for batch APIs, but one this SDK does not
                // document. When the counts do not line up 1:1 that assumption is unsafe, so
                // "source" is left off entirely: the JS side treats an untagged result as
                // unusable and re-extracts that file individually, which costs one extra pass,
                // whereas guessing would silently file one document's content under another
                // document's name.
                val ordered = result.results.size == inputPaths.size
                if (!ordered) {
                    android.util.Log.w(
                        "XbergModule",
                        "extractBatch returned ${result.results.size} results for ${inputPaths.size} inputs; omitting source tags",
                    )
                }
                result.results.forEachIndexed { index, document ->
                    val node = mapper.valueToTree<ObjectNode>(document)
                    if (ordered) node.put("source", inputPaths[index])
                    results.add(node)
                }

                // Xberg's own errors carry the index of the input that failed, so these map back
                // exactly rather than positionally. Its field is `message`; the JS side reads
                // `error`, so both are emitted.
                result.errors.forEach { item ->
                    val node = mapper.createObjectNode()
                    node.put("source", inputPaths.getOrNull(item.index.toInt()) ?: item.source)
                    node.put("error", item.message)
                    node.put("code", item.errorType)
                    errors.add(node)
                }
            }

            localErrors.forEach { errors.add(mapper.valueToTree<ObjectNode>(it)) }
            promise.resolve(mapper.writeValueAsString(envelope))
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getSupportedFormats(promise: Promise) {
        try {
            val result: WritableArray = Arguments.createArray()
            for (format in Xberg.listSupportedFormats()) {
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
            validate(filePath)?.let { (code, message) ->
                promise.reject(code, message.replace("File ", "Audio file "))
                return
            }
            val audioExtensions = listOf(".mp3", ".m4a", ".wav", ".webm", ".mpga")
            if (!audioExtensions.any { filePath.lowercase().endsWith(it) }) {
                promise.reject("INVALID_FORMAT", "Not an audio file: $filePath")
                return
            }

            val whisperModel = when (model.lowercase()) {
                "tiny" -> WhisperModel.TINY
                "base" -> WhisperModel.BASE
                "small" -> WhisperModel.SMALL
                "medium" -> WhisperModel.MEDIUM
                "large-v3", "large_v3", "large" -> WhisperModel.LARGE_V3
                else -> {
                    promise.reject("INVALID_MODEL", "Unknown Whisper model: $model")
                    return
                }
            }

            val config = ExtractionConfig(
                transcription = TranscriptionConfig(
                    enabled = true,
                    model = whisperModel,
                    language = language,
                )
            )
            val result = Xberg.extract(inputFor(java.io.File(filePath)), config)
            promise.resolve(mapper.writeValueAsString(result))
        } catch (e: Exception) {
            promise.reject("TRANSCRIPTION_ERROR", e.message, e)
        }
    }
}
