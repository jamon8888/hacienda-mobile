package com.anythingllm.xberg

import android.webkit.MimeTypeMap
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import io.xberg.ChunkSizing
import io.xberg.ChunkerType
import io.xberg.ChunkingConfig
import io.xberg.Chunk
import io.xberg.ExtractInput
import io.xberg.ExtractInputKind
import io.xberg.ExtractedDocument
import io.xberg.ExtractionConfig
import io.xberg.ExtractionErrorItem
import io.xberg.ExtractionResult
import io.xberg.OcrConfig
import io.xberg.OutputFormat
import io.xberg.Table
import io.xberg.TranscriptionConfig
import io.xberg.WhisperModel
import io.xberg.Xberg
import org.json.JSONObject

/**
 * Bridges to the real io.xberg:xberg-android Kotlin API, which is a plain data-class
 * surface with no JSON (de)serialization of its own -- config/result mapping to the
 * shape defined in src/utils/Xberg/types.ts happens entirely in this file.
 */
class XbergModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "XbergModule"

    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024L
    }

    private fun guessMimeType(filePath: String): String {
        val ext = filePath.substringAfterLast('.', "").lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    private fun buildInput(file: java.io.File): ExtractInput {
        return ExtractInput(
            kind = ExtractInputKind.BYTES,
            bytes = file.readBytes(),
            uri = file.absolutePath,
            mimeType = guessMimeType(file.absolutePath),
            filename = file.name,
            config = null
        )
    }

    private fun mapOutputFormat(value: String?): OutputFormat? = when (value) {
        "text" -> OutputFormat.Plain
        "markdown" -> OutputFormat.Markdown
        "html" -> OutputFormat.Html
        "json" -> OutputFormat.Json
        else -> null
    }

    private fun buildOcrConfig(json: JSONObject?): OcrConfig? {
        if (json == null) return null
        return OcrConfig(
            enabled = true,
            backend = json.optString("backend", "tesseract"),
            language = json.optString("language").takeIf { it.isNotEmpty() }?.let { listOf(it) } ?: emptyList(),
            autoRotate = json.optBoolean("autoRotate", false)
        )
    }

    private fun buildChunkingConfig(json: JSONObject?): ChunkingConfig? {
        if (json == null || !json.optBoolean("enabled", false)) return null
        val chunkerType = try {
            ChunkerType.fromWire(json.optString("strategy", "text"))
        } catch (e: Exception) {
            ChunkerType.TEXT
        }
        return ChunkingConfig(
            maxCharacters = json.optLong("maxChunkSize", 1000L),
            overlap = json.optLong("chunkOverlap", 0L),
            chunkerType = chunkerType,
            sizing = ChunkSizing.Characters
        )
    }

    private fun buildExtractionConfig(configJson: String): ExtractionConfig {
        val json = JSONObject(configJson)
        return ExtractionConfig(
            outputFormat = mapOutputFormat(json.optString("outputFormat").takeIf { it.isNotEmpty() }) ?: OutputFormat.Markdown,
            forceOcr = json.optBoolean("forceOcr", false),
            ocr = buildOcrConfig(json.optJSONObject("ocr")),
            chunking = buildChunkingConfig(json.optJSONObject("chunking"))
        )
    }

    private fun tableToMap(table: Table): WritableMap {
        val map = Arguments.createMap()
        val rows = Arguments.createArray()
        for (row in table.cells) {
            val rowArr = Arguments.createArray()
            for (cell in row) rowArr.pushString(cell)
            rows.pushArray(rowArr)
        }
        map.putArray("rows", rows)
        table.columns?.let { cols ->
            val header = Arguments.createArray()
            cols.forEach { header.pushString(it) }
            map.putArray("header", header)
        }
        return map
    }

    private fun chunkToMap(chunk: Chunk): WritableMap {
        val map = Arguments.createMap()
        map.putString("content", chunk.content)
        map.putString("chunkType", chunk.chunkType.toWire())
        chunk.embedding?.let { embedding ->
            val arr = Arguments.createArray()
            embedding.forEach { arr.pushDouble(it.toDouble()) }
            map.putArray("embedding", arr)
        }
        val metaMap = Arguments.createMap()
        metaMap.putDouble("index", chunk.metadata.chunkIndex.toDouble())
        metaMap.putDouble("tokenCount", (chunk.metadata.tokenCount ?: 0L).toDouble())
        map.putMap("metadata", metaMap)
        return map
    }

    private fun documentToMap(doc: ExtractedDocument, source: String?, fileSize: Long): WritableMap {
        val map = Arguments.createMap()
        source?.let { map.putString("source", it) }
        map.putString("content", doc.content)

        val metaMap = Arguments.createMap()
        // No direct "format" field on the native side; derive from the mime subtype.
        metaMap.putString("format", doc.mimeType.substringAfter('/', doc.mimeType))
        metaMap.putString("mimeType", doc.mimeType)
        metaMap.putDouble("size", fileSize.toDouble())
        metaMap.putDouble("pages", doc.counts.pages.toDouble())
        doc.metadata?.language?.let { metaMap.putString("language", it) }
        doc.metadata?.title?.let { metaMap.putString("title", it) }
        doc.metadata?.authors?.firstOrNull()?.let { metaMap.putString("author", it) }
        map.putMap("metadata", metaMap)

        val docTables = doc.tables
        if (!docTables.isNullOrEmpty()) {
            val tables = Arguments.createArray()
            docTables.forEach { tables.pushMap(tableToMap(it)) }
            map.putArray("tables", tables)
        }

        val docChunks = doc.chunks
        if (!docChunks.isNullOrEmpty()) {
            val chunks = Arguments.createArray()
            docChunks.forEach { chunks.pushMap(chunkToMap(it)) }
            map.putArray("chunks", chunks)
        }

        return map
    }

    private fun errorToMap(err: ExtractionErrorItem): WritableMap {
        val map = Arguments.createMap()
        err.source?.let { map.putString("source", it) }
        map.putString("error", err.message)
        map.putString("code", err.errorType)
        return map
    }

    private fun resultToWritableMap(
        result: ExtractionResult,
        sources: List<String?>,
        fileSizes: List<Long>,
        localErrors: List<WritableMap>
    ): WritableMap {
        val envelope = Arguments.createMap()

        val results = Arguments.createArray()
        val sizeMatches = result.results.size == sources.size
        result.results.forEachIndexed { i, doc ->
            val source = if (sizeMatches) sources[i] else null
            val size = if (sizeMatches) fileSizes[i] else 0L
            results.pushMap(documentToMap(doc, source, size))
        }
        envelope.putArray("results", results)

        val errors = Arguments.createArray()
        result.errors.forEach { errors.pushMap(errorToMap(it)) }
        localErrors.forEach { errors.pushMap(it) }
        envelope.putArray("errors", errors)

        val summary = Arguments.createMap()
        summary.putDouble("inputs", result.summary.inputs.toDouble())
        summary.putDouble("results", result.summary.results.toDouble())
        summary.putDouble("errors", result.summary.errors.toDouble())
        envelope.putMap("summary", summary)

        return envelope
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
            val input = buildInput(file)
            val config = buildExtractionConfig(configJson)
            val result = Xberg.extract(input, config)
            promise.resolve(
                resultToWritableMap(result, listOf(filePath), listOf(file.length()), emptyList())
            )
        } catch (e: Exception) {
            promise.reject("EXTRACTION_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun extractBatch(filePaths: ReadableArray, configJson: String, promise: Promise) {
        try {
            val inputs = mutableListOf<ExtractInput>()
            // Parallel to `inputs`, tracks which source path/size each accepted input came
            // from. Used to reattach extracted content to the file it came from -- only valid
            // when result count matches input count 1:1 (see resultToWritableMap).
            val inputPaths = mutableListOf<String>()
            val inputSizes = mutableListOf<Long>()
            val localErrors = mutableListOf<WritableMap>()

            for (i in 0 until filePaths.size()) {
                val filePath = filePaths.getString(i)
                val file = java.io.File(filePath)
                if (!file.exists()) {
                    val err = Arguments.createMap()
                    err.putString("source", filePath)
                    err.putString("code", "FILE_NOT_FOUND")
                    err.putString("error", "File not found: $filePath")
                    localErrors.add(err)
                    continue
                }
                if (file.length() > MAX_FILE_SIZE) {
                    val err = Arguments.createMap()
                    err.putString("source", filePath)
                    err.putString("code", "FILE_TOO_LARGE")
                    err.putString("error", "File exceeds 50MB: $filePath")
                    localErrors.add(err)
                    continue
                }
                try {
                    inputs.add(buildInput(file))
                    inputPaths.add(filePath)
                    inputSizes.add(file.length())
                } catch (e: Exception) {
                    val err = Arguments.createMap()
                    err.putString("source", filePath)
                    err.putString("code", "INVALID_INPUT")
                    err.putString("error", e.message ?: "Failed to read file")
                    localErrors.add(err)
                }
            }

            val config = buildExtractionConfig(configJson)
            if (inputs.isEmpty()) {
                val envelope = Arguments.createMap()
                envelope.putArray("results", Arguments.createArray())
                val errors = Arguments.createArray()
                localErrors.forEach { errors.pushMap(it) }
                envelope.putArray("errors", errors)
                promise.resolve(envelope)
                return
            }

            val result = Xberg.extractBatch(inputs, config)
            promise.resolve(resultToWritableMap(result, inputPaths, inputSizes, localErrors))
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

    private fun mapWhisperModel(value: String): WhisperModel = try {
        WhisperModel.fromWire(value)
    } catch (e: Exception) {
        WhisperModel.TINY
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
            val input = buildInput(file)
            val config = ExtractionConfig(
                transcription = TranscriptionConfig(
                    enabled = true,
                    model = mapWhisperModel(model),
                    language = language
                )
            )
            val result = Xberg.extract(input, config)
            promise.resolve(
                resultToWritableMap(result, listOf(filePath), listOf(file.length()), emptyList())
            )
        } catch (e: Exception) {
            promise.reject("TRANSCRIPTION_ERROR", e.message, e)
        }
    }
}
