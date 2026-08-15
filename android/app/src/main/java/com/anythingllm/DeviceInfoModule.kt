package com.anythingllm

import com.facebook.react.bridge.*
import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Build.VERSION_CODES
import java.io.File

class DeviceInfoModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DeviceInfoModule"

    @ReactMethod
    fun getChipset(promise: Promise) {
        try {
            val chipset = Build.HARDWARE.takeUnless { it.isNullOrEmpty() } ?: Build.BOARD
            promise.resolve(chipset)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun getCPUInfo(promise: Promise) {
        try {
            val cpuInfo = Arguments.createMap()
            cpuInfo.putInt("cores", Runtime.getRuntime().availableProcessors())
            
            val processors = Arguments.createArray()
            val features = mutableSetOf<String>()
            val cpuInfoFile = File("/proc/cpuinfo")
            
            if (cpuInfoFile.exists()) {
                val cpuInfoLines = cpuInfoFile.readLines()
                var currentProcessor = Arguments.createMap()
                var hasData = false
                
                for (line in cpuInfoLines) {
                    if (line.isEmpty() && hasData) {
                        processors.pushMap(currentProcessor)
                        currentProcessor = Arguments.createMap()
                        hasData = false
                        continue
                    }
                    
                    val parts = line.split(":")
                    if (parts.size >= 2) {
                        val key = parts[0].trim()
                        val value = parts[1].trim()
                        when (key) {
                            "processor", "model name", "cpu MHz", "vendor_id" -> {
                                currentProcessor.putString(key, value)
                                hasData = true
                            }
                            "flags", "Features" -> {  // "flags" for x86, "Features" for ARM
                                features.addAll(value.split(" ").filter { it.isNotEmpty() })
                            }
                        }
                    }
                }
                
                if (hasData) {
                    processors.pushMap(currentProcessor)
                }
                
                cpuInfo.putArray("processors", processors)
                
                // Convert features set to array
                val featuresArray = Arguments.createArray()
                features.forEach { featuresArray.pushString(it) }
                cpuInfo.putArray("features", featuresArray)

                // ML-related CPU features detection
                cpuInfo.putBoolean("hasFp16", features.any { it in setOf("fphp", "fp16") })
                cpuInfo.putBoolean("hasDotProd", features.any { it in setOf("dotprod", "asimddp") })
                cpuInfo.putBoolean("hasSve", features.any { it == "sve" })
                cpuInfo.putBoolean("hasI8mm", features.any { it == "i8mm" })
            }
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                cpuInfo.putString("socModel", Build.SOC_MODEL)
            }
            
            promise.resolve(cpuInfo)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    // NEW: RAM Info
    @ReactMethod
    fun getRAMInfo(promise: Promise) {
        try {
            val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            
            val result = Arguments.createMap()
            result.putString("totalRAM", memInfo.totalMem.toString())
            result.putString("availableRAM", memInfo.availMem.toString())
            result.putString("threshold", memInfo.threshold.toString())
            result.putBoolean("lowMemory", memInfo.lowMemory)
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("RAM_INFO_ERROR", e.message)
        }
    }

    // NEW: NPU Backend Detection
    @ReactMethod
    fun getNPUBackend(promise: Promise) {
        try {
            val backend = detectNPUBackend()
            promise.resolve(backend)
        } catch (e: Exception) {
            promise.reject("NPU_DETECT_ERROR", e.message)
        }
    }

    // NEW: Unified Device Capabilities
    @ReactMethod
    fun getDeviceCapabilities(promise: Promise) {
        try {
            val result = Arguments.createMap()
            
            // CPU Info (reuse existing logic)
            val cpuInfo = getCPUInfoSync()
            result.putMap("cpuInfo", cpuInfo)
            
            // RAM Info
            val ramInfo = Arguments.createMap()
            val activityManager = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val memInfo = ActivityManager.MemoryInfo()
            activityManager.getMemoryInfo(memInfo)
            ramInfo.putString("totalRAM", memInfo.totalMem.toString())
            ramInfo.putString("availableRAM", memInfo.availMem.toString())
            ramInfo.putString("threshold", memInfo.threshold.toString())
            ramInfo.putBoolean("lowMemory", memInfo.lowMemory)
            result.putMap("ramInfo", ramInfo)
            
            // NPU Backend
            result.putString("npuBackend", detectNPUBackend())
            
            // NNAPI Support (no public Java API to query device count; NNAPI is
            // available at the OS level starting with API 27)
            val hasNNAPI = Build.VERSION.SDK_INT >= VERSION_CODES.O_MR1
            result.putBoolean("hasNNAPI", hasNNAPI)
            
            // GPU Vendor
            result.putString("gpuVendor", detectGPUVendor())
            
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DEVICE_CAPS_ERROR", e.message)
        }
    }

    // Internal: Get CPU info synchronously for reuse
    private fun getCPUInfoSync(): WritableMap {
        val cpuInfo = Arguments.createMap()
        cpuInfo.putInt("cores", Runtime.getRuntime().availableProcessors())
        
        val processors = Arguments.createArray()
        val features = mutableSetOf<String>()
        val cpuInfoFile = File("/proc/cpuinfo")
        
        if (cpuInfoFile.exists()) {
            val cpuInfoLines = cpuInfoFile.readLines()
            var currentProcessor = Arguments.createMap()
            var hasData = false
            
            for (line in cpuInfoLines) {
                if (line.isEmpty() && hasData) {
                    processors.pushMap(currentProcessor)
                    currentProcessor = Arguments.createMap()
                    hasData = false
                    continue
                }
                
                val parts = line.split(":")
                if (parts.size >= 2) {
                    val key = parts[0].trim()
                    val value = parts[1].trim()
                    when (key) {
                        "processor", "model name", "cpu MHz", "vendor_id" -> {
                            currentProcessor.putString(key, value)
                            hasData = true
                        }
                        "flags", "Features" -> {
                            features.addAll(value.split(" ").filter { it.isNotEmpty() })
                        }
                    }
                }
            }
            
            if (hasData) {
                processors.pushMap(currentProcessor)
            }
            
            cpuInfo.putArray("processors", processors)
            
            val featuresArray = Arguments.createArray()
            features.forEach { featuresArray.pushString(it) }
            cpuInfo.putArray("features", featuresArray)

            cpuInfo.putBoolean("hasFp16", features.any { it in setOf("fphp", "fp16") })
            cpuInfo.putBoolean("hasDotProd", features.any { it in setOf("dotprod", "asimddp") })
            cpuInfo.putBoolean("hasSve", features.any { it == "sve" })
            cpuInfo.putBoolean("hasI8mm", features.any { it == "i8mm" })
        }
        
        if (Build.VERSION.SDK_INT >= VERSION_CODES.S) {
            cpuInfo.putString("socModel", Build.SOC_MODEL)
        }
        
        return cpuInfo
    }

    // Internal: NPU Backend Detection
    private fun detectNPUBackend(): String {
        // Priority 1: Build.SOC_MODEL (API 31+)
        if (Build.VERSION.SDK_INT >= VERSION_CODES.S) {
            val socModel = Build.SOC_MODEL.uppercase()
            return when {
                // Qualcomm Snapdragon 8 Gen 1+ (SM8450, SM8550, SM8650, SM8750)
                socModel.startsWith("SM8") && (socModel.toIntOrNull() ?: 0) >= 8450 -> "QNN"
                
                // MediaTek Dimensity 9000+ (MT6983, MT6985, MT6989, MT6991)
                socModel.startsWith("MT698") || socModel.startsWith("MT699") -> "MEDIATEK_APU"
                
                // Samsung Exynos 2200+ (S5E9925, S5E9935, S5E9945)
                socModel.startsWith("S5E99") -> "EXYNOS_NPU"
                
                // Google Tensor (GS101, GS201, GS301)
                socModel.startsWith("GS") -> "TENSOR_TPU"
                
                // Huawei Kirin 990+ (HI36A0, HI36B0, HI6250)
                socModel.startsWith("HI36") || socModel.startsWith("HI62") -> "KIRIN_NPU"
                
                else -> detectFromFallback()
            }
        }
        return detectFromFallback()
    }

    private fun detectFromFallback(): String {
        val board = Build.BOARD.uppercase()
        val hardware = Build.HARDWARE.uppercase()
        val brand = Build.BRAND.uppercase()
        val manufacturer = Build.MANUFACTURER.uppercase()
        
        return when {
            // Qualcomm
            board.contains("QCOM") || hardware.contains("QCOM") || 
            board.contains("SNAPDRAGON") || manufacturer.contains("QUALCOMM") -> "QNN"
            
            // MediaTek
            board.contains("MTK") || hardware.contains("MTK") ||
            board.contains("DIMENSITY") || manufacturer.contains("MEDIATEK") -> "MEDIATEK_APU"
            
            // Samsung Exynos
            brand.contains("SAMSUNG") && (board.contains("EXYNOS") || hardware.contains("EXYNOS") ||
                board.contains("S5E99")) -> "EXYNOS_NPU"
            
            // Google Tensor
            brand.contains("GOOGLE") && manufacturer.contains("GOOGLE") -> "TENSOR_TPU"
            
            // Huawei Kirin
            hardware.contains("KIRIN") || hardware.contains("HI36") || hardware.contains("HI62") -> "KIRIN_NPU"
            
            // NNAPI fallback
            else -> if (Build.VERSION.SDK_INT >= VERSION_CODES.O_MR1) "NNAPI" else "CPU"
        }
    }

    // Internal: GPU Vendor Detection
    private fun detectGPUVendor(): String {
        val board = Build.BOARD.uppercase()
        val hardware = Build.HARDWARE.uppercase()
        val brand = Build.BRAND.uppercase()
        val manufacturer = Build.MANUFACTURER.uppercase()
        
        return when {
            // Qualcomm Adreno
            board.contains("QCOM") || hardware.contains("QCOM") || manufacturer.contains("QUALCOMM") -> "qualcomm"
            
            // MediaTek Mali
            board.contains("MTK") || hardware.contains("MTK") || manufacturer.contains("MEDIATEK") -> "mediatek"
            
            // Samsung (Exynos uses Mali, Snapdragon uses Adreno)
            brand.contains("SAMSUNG") && (board.contains("EXYNOS") || hardware.contains("EXYNOS") ||
                board.contains("S5E99")) -> "samsung"
            brand.contains("SAMSUNG") -> "qualcomm"
            
            // Google Tensor (Mali)
            brand.contains("GOOGLE") && manufacturer.contains("GOOGLE") -> "google"
            
            // Huawei Kirin (Mali)
            hardware.contains("KIRIN") || hardware.contains("HI36") || hardware.contains("HI62") -> "huawei"
            
            else -> "unknown"
        }
    }
} 