package io.github.emre1001.gigashare

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

/** Notifications driven from Rust (`src-tauri/src/android.rs`): requests with Accept / Decline,
 *  transfer progress, results, and the background service. */
object GigaNotify {
  private const val CH_REQUESTS = "requests"
  private const val CH_TRANSFERS = "transfers"
  const val CH_BACKGROUND = "background"
  const val SERVICE_NOTIFICATION = 1

  @JvmStatic external fun nativeRespond(id: String, accept: Boolean)
  @JvmStatic external fun nativeCancel(id: String)
  @JvmStatic external fun nativeEnsureWindow()

  // Transfers keep the CPU and Wi-Fi awake while the screen is off.
  private val running = mutableSetOf<String>()
  private var wake: PowerManager.WakeLock? = null
  private var wifi: WifiManager.WifiLock? = null

  fun notifId(id: String) = id.hashCode() or 0x10000

  @JvmStatic
  fun post(context: Context, json: String) {
    val ctx = context.applicationContext
    val o = JSONObject(json)
    channels(ctx)
    val id = o.optString("id")
    val nid = notifId(id)
    when (o.getString("kind")) {
      "service" -> {
        val i = Intent(ctx, GigaService::class.java)
          .putExtra("title", o.optString("title")).putExtra("text", o.optString("text"))
        if (o.getBoolean("on")) ContextCompat.startForegroundService(ctx, i) else ctx.stopService(i)
      }
      "request" -> show(ctx, nid, builder(ctx, CH_REQUESTS, o)
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setOngoing(true)
        .setTimeoutAfter(120_000)
        .addAction(0, o.optString("decline"), action(ctx, "decline", id))
        .addAction(0, o.optString("accept"), action(ctx, "accept", id)))
      "progress" -> {
        val p = o.optInt("percent", -1)
        hold(ctx, id, true)
        show(ctx, nid, builder(ctx, CH_TRANSFERS, o)
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setProgress(100, maxOf(p, 0), p < 0)
          .setSubText(if (p >= 0) "$p %" else null)
          .addAction(0, o.optString("cancel"), action(ctx, "cancel", id)))
      }
      "done" -> {
        hold(ctx, id, false)
        show(ctx, nid, builder(ctx, CH_TRANSFERS, o).setAutoCancel(true))
      }
      "clear" -> {
        hold(ctx, id, false)
        NotificationManagerCompat.from(ctx).cancel(nid)
      }
    }
  }

  private fun show(ctx: Context, nid: Int, b: NotificationCompat.Builder) {
    try {
      NotificationManagerCompat.from(ctx).notify(nid, b.build())
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS denied: the in-app UI still works.
    }
  }

  fun builder(ctx: Context, channel: String, o: JSONObject): NotificationCompat.Builder =
    NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(R.drawable.ic_stat_giga)
      .setContentTitle(o.optString("title"))
      .setContentText(o.optString("text"))
      .setStyle(NotificationCompat.BigTextStyle().bigText(o.optString("text")))
      .setContentIntent(openApp(ctx))

  fun openApp(ctx: Context): PendingIntent {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)!!
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun action(ctx: Context, act: String, id: String): PendingIntent {
    val i = Intent(ctx, GigaActionReceiver::class.java).setAction(act).putExtra("id", id)
    return PendingIntent.getBroadcast(ctx, (act + id).hashCode(), i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  @Synchronized
  private fun hold(ctx: Context, id: String, on: Boolean) {
    if (on) running.add(id) else running.remove(id)
    if (running.isNotEmpty() && wake == null) {
      wake = (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "giga-share:transfer").apply { acquire(6 * 3600_000L) }
      @Suppress("DEPRECATION")
      val mode = if (Build.VERSION.SDK_INT >= 29) WifiManager.WIFI_MODE_FULL_LOW_LATENCY else WifiManager.WIFI_MODE_FULL_HIGH_PERF
      wifi = (ctx.getSystemService(Context.WIFI_SERVICE) as WifiManager)
        .createWifiLock(mode, "giga-share:transfer").apply { acquire() }
    } else if (running.isEmpty()) {
      wake?.let { if (it.isHeld) it.release() }
      wifi?.let { if (it.isHeld) it.release() }
      wake = null; wifi = null
    }
  }

  private var channelsMade = false
  private fun channels(ctx: Context) {
    if (channelsMade || Build.VERSION.SDK_INT < 26) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CH_REQUESTS, ctx.getString(R.string.ch_requests), NotificationManager.IMPORTANCE_HIGH))
    nm.createNotificationChannel(NotificationChannel(CH_TRANSFERS, ctx.getString(R.string.ch_transfers), NotificationManager.IMPORTANCE_LOW))
    nm.createNotificationChannel(NotificationChannel(CH_BACKGROUND, ctx.getString(R.string.ch_background), NotificationManager.IMPORTANCE_MIN))
    channelsMade = true
  }
}

/** Accept / Decline / Cancel buttons on the notifications. */
class GigaActionReceiver : BroadcastReceiver() {
  override fun onReceive(c: Context, i: Intent) {
    val id = i.getStringExtra("id") ?: return
    try {
      when (i.action) {
        "accept" -> GigaNotify.nativeRespond(id, true)
        "decline" -> GigaNotify.nativeRespond(id, false)
        "cancel" -> GigaNotify.nativeCancel(id)
      }
    } catch (e: UnsatisfiedLinkError) {
      // Process was restarted without the app: nothing is waiting for this answer any more.
    }
    if (i.action != "cancel") NotificationManagerCompat.from(c).cancel(GigaNotify.notifId(id))
  }
}

/** Keeps the process (and with it the Rust receiver: LAN server, discovery, P2P) alive in the background. */
class GigaService : Service() {
  private var multicast: WifiManager.MulticastLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    // Discovery broadcasts are dropped without it, also while the activity is gone.
    multicast = (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager)
      .createMulticastLock("giga-share-service").apply { setReferenceCounted(false); acquire() }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val o = JSONObject().put("title", intent?.getStringExtra("title")).put("text", intent?.getStringExtra("text"))
    val n = GigaNotify.builder(this, GigaNotify.CH_BACKGROUND, o)
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(GigaNotify.SERVICE_NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    else startForeground(GigaNotify.SERVICE_NOTIFICATION, n)
    // Not sticky: a restart by the system would have no Rust runtime behind it.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    multicast?.release()
    super.onDestroy()
  }
}
