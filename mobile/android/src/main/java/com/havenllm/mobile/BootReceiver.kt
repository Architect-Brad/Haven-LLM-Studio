package com.havenllm.mobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Boot Receiver - Auto-start Haven inference service on device boot
 * Ensures Haven is available after reboot without user interaction
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_LOCKED_BOOT_COMPLETED) {

            // Start the inference service as foreground service
            val serviceIntent = Intent(context, HavenInferenceService::class.java).apply {
                action = HavenInferenceService.ACTION_START_INFERENCE
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
