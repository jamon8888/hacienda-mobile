package com.anythingllm.embedding

import com.facebook.react.bridge.*
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class EmbeddingGemmaModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Any? = null
    private val MODEL_FILE = "embeddinggemma_300m_q4_0.tflite"
    private val EMBEDDING_DIMS = 128

    override fun getName(): String = "EmbeddingGemmaModule"

    @ReactMethod
    fun isAvailable(promise: Promise) {
        promise.resolve(interpreter != null)
    }

    @ReactMethod
    fun initModel(promise: Promise) {
        try {
            // Check if model file exists in assets
            val assetManager = reactApplicationContext.assets
            val modelExists = try {
                assetManager.open(MODEL_FILE).close()
                true
            } catch (e: Exception) {
                false
            }

            if (!modelExists) {
                promise.reject(
                    "MODEL_NOT_FOUND",
                    "EmbeddingGemma model not found. Run 'scripts/downloadEmbeddingGemma.sh' to download the model."
                )
                return
            }

            val model = loadModelFile()
            // Initialize LiteRT interpreter
            // Note: Actual LiteRT initialization requires the LiteRT SDK
            // For now, we'll store the model and mark as available
            interpreter = model
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("MODEL_INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun embed(text: String, dims: Int = EMBEDDING_DIMS, promise: Promise) {
        try {
            if (interpreter == null) {
                throw Exception("Model not initialized")
            }

            // Placeholder: Implement actual LiteRT inference
            // For now, return a dummy embedding
            val embedding = FloatArray(dims) { 0.0f }
            val result = Arguments.createArray()
            embedding.forEach { result.pushDouble(it.toDouble()) }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("EMBED_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun embedBatch(texts: ReadableArray, dims: Int = EMBEDDING_DIMS, promise: Promise) {
        try {
            if (interpreter == null) {
                throw Exception("Model not initialized")
            }

            val results = Arguments.createArray()
            for (i in 0 until texts.size()) {
                val text = texts.getString(i) ?: continue
                // Placeholder: Process each text
                val embedding = FloatArray(dims) { 0.0f }
                val embeddingArray = Arguments.createArray()
                embedding.forEach { embeddingArray.pushDouble(it.toDouble()) }
                results.pushArray(embeddingArray)
            }
            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("EMBED_BATCH_ERROR", e.message, e)
        }
    }

    private fun loadModelFile(): MappedByteBuffer {
        val fd = reactApplicationContext.assets.openFd(MODEL_FILE)
        val inputStream = FileInputStream(fd.fileDescriptor)
        val channel = inputStream.channel
        return channel.map(
            FileChannel.MapMode.READ_ONLY,
            fd.startOffset,
            fd.declaredLength
        )
    }
}
