package com.havenllm;

import android.util.Log;

/**
 * Native bridge for Haven LLM Studio Android app.
 * Provides inference capabilities via the native C++ library.
 *
 * In production, this loads the native .so library via JNI.
 * Currently stubbed for build completeness.
 */
public class NativeBridge {

    private static final String TAG = "HavenNative";
    private static boolean libraryLoaded = false;

    static {
        try {
            System.loadLibrary("haven_core");
            libraryLoaded = true;
            Log.i(TAG, "Native library loaded successfully");
        } catch (UnsatisfiedLinkError e) {
            Log.w(TAG, "Native library not available, using fallback", e);
        }
    }

    public static boolean isAvailable() {
        return libraryLoaded;
    }

    public native boolean loadModel(String modelPath, String configJson);

    public native void unloadModel();

    public native boolean isModelLoaded();

    public native String infer(String prompt, String configJson);

    public native String getLastError();
}
