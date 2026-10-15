package io.github.emre1001.gigashare

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // Many Android devices drop UDP broadcasts unless a MulticastLock is held.
    val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
    multicastLock = wifi.createMulticastLock("giga-share-discovery").apply {
      setReferenceCounted(false)
      acquire()
    }
    val wanted = mutableListOf<String>()
    if (Build.VERSION.SDK_INT >= 33) wanted += Manifest.permission.POST_NOTIFICATIONS
    if (Build.VERSION.SDK_INT <= 29) wanted += Manifest.permission.WRITE_EXTERNAL_STORAGE
    val missing = wanted.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
    if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 1)
    handleShare(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShare(intent)
  }

  override fun onDestroy() {
    multicastLock?.release()
    super.onDestroy()
  }

  /** Copies shared content:// files into the cache and appends their paths to
   *  cache/shared/inbox.txt, which the Rust side picks up. */
  private fun handleShare(intent: Intent?) {
    if (intent == null) return
    val uris = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_SEND -> {
        @Suppress("DEPRECATION")
        (intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { uris += it }
        if (uris.isEmpty()) intent.getStringExtra(Intent.EXTRA_TEXT)?.let { text ->
          val dir = File(cacheDir, "shared/${System.currentTimeMillis()}").apply { mkdirs() }
          val f = File(dir, "Shared text.txt").apply { writeText(text) }
          appendInbox(listOf(f.absolutePath))
          return
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris += it }
      }
      else -> return
    }
    if (uris.isEmpty()) return
    Thread {
      val dir = File(cacheDir, "shared/${System.currentTimeMillis()}").apply { mkdirs() }
      val paths = uris.mapNotNull { uri ->
        try {
          val name = displayName(uri) ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"
          val out = File(dir, name.replace('/', '_'))
          contentResolver.openInputStream(uri)?.use { input -> out.outputStream().use { input.copyTo(it) } }
          out.absolutePath
        } catch (e: Exception) {
          null
        }
      }
      appendInbox(paths)
    }.start()
    intent.action = null
  }

  private fun displayName(uri: Uri): String? =
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }

  @Synchronized
  private fun appendInbox(paths: List<String>) {
    if (paths.isEmpty()) return
    val dir = File(cacheDir, "shared").apply { mkdirs() }
    File(dir, "inbox.txt").appendText(paths.joinToString("\n", postfix = "\n"))
  }
}
