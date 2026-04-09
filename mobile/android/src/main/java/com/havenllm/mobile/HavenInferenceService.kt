package com.havenllm.mobile

import android.app.*
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import com.havenllm.mobile.R

/**
 * Haven Inference Foreground Service
 * Prevents Android from killing the inference process (phantom process killer)
 * Shows persistent notification during inference
 */
class HavenInferenceService : Service() {

    companion object {
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "haven_inference_channel"
        const val ACTION_START_INFERENCE = "com.havenllm.mobile.START_INFERENCE"
        const val ACTION_STOP_INFERENCE = "com.havenllm.mobile.STOP_INFERENCE"
        const val ACTION_UPDATE_STATUS = "com.havenllm.mobile.UPDATE_STATUS"

        const val EXTRA_PROMPT = "prompt"
        const val EXTRA_CONFIG = "config"
        const val EXTRA_STATUS = "status"

        private var wakeLock: PowerManager.WakeLock? = null
        var isRunning = false
            private set
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        isRunning = true
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_INFERENCE -> {
                startForeground(NOTIFICATION_ID, createNotification("Starting inference..."))
                acquireWakeLock()
                // Start inference in background thread
                startInference(intent.getStringExtra(EXTRA_PROMPT) ?: "")
            }
            ACTION_STOP_INFERENCE -> {
                stopInference()
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            ACTION_UPDATE_STATUS -> {
                val status = intent.getStringExtra(EXTRA_STATUS) ?: "Processing..."
                updateNotification(status)
            }
        }

        return START_STICKY // Restart if killed
    }

    override fun onDestroy() {
        super.onDestroy()
        releaseWakeLock()
        isRunning = false
    }

    // ── Wake Lock (Prevents CPU sleep) ─────────────────────────

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "HavenLLM::InferenceWakeLock"
        ).apply {
            acquire(10 * 60 * 1000L) // 10 minutes max
        }
    }

    private fun releaseWakeLock() {
        if (wakeLock?.isHeld == true) {
            wakeLock?.release()
        }
        wakeLock = null
    }

    // ── Inference ───────────────────────────────────────────────

    private fun startInference(prompt: String) {
        Thread {
            try {
                updateNotification("Loading model...")

                // TODO: Call native inference
                // HavenNativeModule.infer(prompt, config)

                updateNotification("Generating response...")

                // Update notification with progress
                updateNotification("Inference complete")

            } catch (e: Exception) {
                updateNotification("Error: ${e.message}")
            }
        }.start()
    }

    private fun stopInference() {
        // TODO: Signal native layer to stop
    }

    // ── Notifications ───────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Haven LLM Inference",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows when Haven LLM is running inference on your device"
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
            }

            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }

    private fun createNotification(text: String): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Haven LLM Studio")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(
                R.drawable.ic_stop,
                "Stop",
                PendingIntent.getService(
                    this,
                    1,
                    Intent(this, HavenInferenceService::class.java).apply {
                        action = ACTION_STOP_INFERENCE
                    },
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            .build()
    }

    private fun updateNotification(text: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        notificationManager.notify(NOTIFICATION_ID, createNotification(text))
    }
}
