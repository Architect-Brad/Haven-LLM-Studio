package com.havenllm.mobile

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Haven LLM Native Inference Module
 * Wraps llama.cpp for on-device inference on Android
 * Handles CPU/GPU inference, model management, and Android lifecycle
 */
class HavenNativeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "HavenNative"

        init {
            try {
                System.loadLibrary("haven_inference")
            } catch (e: UnsatisfiedLinkError) {
                // Native library not available — will use mock mode
            }
        }
    }

    override fun getName(): String = NAME

    // Native method declarations (implemented in haven_inference.cpp)
    private external fun nativeInit(modelPath: String, config: String): Boolean
    private external fun nativeUnload(): Boolean
    private external fun nativeIsLoaded(): Boolean
    private external fun nativeInfer(prompt: String, config: String): String
    private external fun nativeInferStreaming(prompt: String, config: String, callbackId: Int): Boolean
    private external fun nativeGetStats(): String
    private external fun nativeGetLastError(): String

    // State
    private var modelLoaded = false
    private var isStreaming = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()
    private val callbackMap = ConcurrentHashMap<Int, (String, Boolean) -> Unit>()
    private var callbackCounter = 0

    // ── Model Management ─────────────────────────────────────────

    @ReactMethod
    fun loadModel(modelPath: String, config: ReadableMap, promise: Promise) {
        executor.execute {
            try {
                val configJson = readableMapToJson(config)
                val success = nativeInit(modelPath, configJson)

                if (success) {
                    modelLoaded = true
                    promise.resolve(true)
                    sendEvent("model:loaded", Arguments.createMap().apply {
                        putString("model", modelPath)
                        putString("mode", "native")
                    })
                } else {
                    val error = nativeGetLastError()
                    promise.reject("LOAD_FAILED", "Failed to load model: $error")
                }
            } catch (e: Exception) {
                promise.reject("LOAD_ERROR", e.message ?: "Unknown error", e)
            }
        }
    }

    @ReactMethod
    fun unloadModel(promise: Promise) {
        executor.execute {
            try {
                nativeUnload()
                modelLoaded = false
                promise.resolve(true)
                sendEvent("model:unloaded", Arguments.createMap())
            } catch (e: Exception) {
                promise.reject("UNLOAD_ERROR", e.message ?: "Unknown error", e)
            }
        }
    }

    @ReactMethod
    fun isModelLoaded(promise: Promise) {
        promise.resolve(modelLoaded && nativeIsLoaded())
    }

    // ── Inference ────────────────────────────────────────────────

    @ReactMethod
    fun infer(prompt: String, config: ReadableMap, promise: Promise) {
        if (!modelLoaded) {
            promise.reject("NO_MODEL", "No model loaded")
            return
        }

        executor.execute {
            try {
                val configJson = readableMapToJson(config)
                val resultJson = nativeInfer(prompt, configJson)

                // Parse result
                val result = Arguments.createMap()
                result.putString("text", parseJsonString(resultJson, "text"))
                result.putInt("tokensGenerated", parseIntJson(resultJson, "tokensGenerated"))
                result.putDouble("inferenceTimeMs", parseDoubleJson(resultJson, "inferenceTimeMs"))
                result.putDouble("tokensPerSecond", parseDoubleJson(resultJson, "tokensPerSecond"))

                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("INFER_ERROR", e.message ?: "Unknown error", e)
            }
        }
    }

    @ReactMethod
    fun inferStreaming(prompt: String, config: ReadableMap, callbackId: Int, promise: Promise) {
        if (!modelLoaded) {
            promise.reject("NO_MODEL", "No model loaded")
            return
        }

        if (isStreaming.get()) {
            promise.reject("STREAMING_BUSY", "Inference already in progress")
            return
        }

        isStreaming.set(true)

        executor.execute {
            try {
                val configJson = readableMapToJson(config)
                nativeInferStreaming(prompt, configJson, callbackId)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("STREAM_ERROR", e.message ?: "Unknown error", e)
            } finally {
                isStreaming.set(false)
            }
        }
    }

    @ReactMethod
    fun stopStreaming(promise: Promise) {
        isStreaming.set(false)
        promise.resolve(true)
    }

    // ── Stats ────────────────────────────────────────────────────

    @ReactMethod
    fun getStats(promise: Promise) {
        executor.execute {
            try {
                val statsJson = nativeGetStats()
                val result = Arguments.createMap()
                result.putDouble("loadTimeMs", parseDoubleJson(statsJson, "loadTimeMs"))
                result.putDouble("inferenceTimeMs", parseDoubleJson(statsJson, "inferenceTimeMs"))
                result.putInt("tokensGenerated", parseIntJson(statsJson, "tokensGenerated"))
                result.putDouble("tokensPerSecond", parseDoubleJson(statsJson, "tokensPerSecond"))
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("STATS_ERROR", e.message ?: "Unknown error", e)
            }
        }
    }

    // ── Android-specific: Battery & Thermal ──────────────────────

    @ReactMethod
    fun getDeviceThermalStatus(promise: Promise) {
        val result = Arguments.createMap()

        try {
            val powerManager = reactApplicationContext.getSystemService(
                android.content.Context.POWER_SERVICE
            ) as android.os.PowerManager

            val thermalManager = reactApplicationContext.getSystemService(
                android.content.Context.THERMAL_SERVICE
            ) as? android.os.ThermalManager

            result.putString("thermalStatus", "normal")
            result.putBoolean("powerSaveMode", powerManager.isPowerSaveMode)
            result.putBoolean("batteryOptimizationExempt", isBatteryOptimizationExempt())

            if (thermalManager != null) {
                val status = thermalManager.currentThermalStatus
                result.putString("thermalStatus", thermalStatusToString(status))
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("THERMAL_ERROR", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun requestBatteryOptimizationExemption(promise: Promise) {
        try {
            val intent = android.content.Intent(
                android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
            ).apply {
                data = android.net.Uri.parse("package:${reactApplicationContext.packageName}")
            }
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INTENT_ERROR", e.message ?: "Unknown error", e)
        }
    }

    private fun isBatteryOptimizationExempt(): Boolean {
        val powerManager = reactApplicationContext.getSystemService(
            android.content.Context.POWER_SERVICE
        ) as android.os.PowerManager
        return powerManager.isIgnoringBatteryOptimizations(reactApplicationContext.packageName)
    }

    // ── Helpers ──────────────────────────────────────────────────

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun readableMapToJson(map: ReadableMap): String {
        // Convert ReadableMap to JSON string for native layer
        val builder = StringBuilder("{")
        val iterator = map.keySetIterator()
        var first = true
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            if (!first) builder.append(",")
            first = false
            builder.append("\"$key\":")

            when (map.getType(key)) {
                ReadableType.Number -> builder.append(map.getDouble(key))
                ReadableType.Boolean -> builder.append(map.getBoolean(key))
                ReadableType.String -> builder.append("\"${map.getString(key)}\"")
                else -> builder.append("null")
            }
        }
        builder.append("}")
        return builder.toString()
    }

    private fun parseJsonString(json: String, key: String): String {
        val pattern = "\"$key\":\""
        val start = json.indexOf(pattern)
        if (start == -1) return ""
        val valueStart = start + pattern.length
        val end = json.indexOf("\"", valueStart)
        return if (end == -1) "" else json.substring(valueStart, end)
    }

    private fun parseIntJson(json: String, key: String): Int {
        val pattern = "\"$key\":"
        val start = json.indexOf(pattern)
        if (start == -1) return 0
        val valueStart = start + pattern.length
        val end = json.indexOfAny(charArrayOf(',', '}'), valueStart)
        return try {
            json.substring(valueStart, end).trim().toInt()
        } catch (e: Exception) {
            0
        }
    }

    private fun parseDoubleJson(json: String, key: String): Double {
        val pattern = "\"$key\":"
        val start = json.indexOf(pattern)
        if (start == -1) return 0.0
        val valueStart = start + pattern.length
        val end = json.indexOfAny(charArrayOf(',', '}'), valueStart)
        return try {
            json.substring(valueStart, end).trim().toDouble()
        } catch (e: Exception) {
            0.0
        }
    }

    private fun thermalStatusToString(status: Int): String {
        return when (status) {
            0 -> "normal"
            1 -> "light"
            2 -> "moderate"
            3 -> "severe"
            4 -> "critical"
            else -> "unknown"
        }
    }
}
