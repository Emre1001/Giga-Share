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
import android.provider.Settings
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.graphics.Insets
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

private const val RELEASES = "https://github.com/Emre1001/Giga-Share/releases/download/"

class MainActivity : TauriActivity() {
  private var multicastLock: WifiManager.MulticastLock? = null
  private var webView: WebView? = null
  private var insets: Insets = Insets.NONE
  @Volatile private var updateCancelled = false
  private var updateHandedOff = false
  private val updateDir get() = File(cacheDir, "updates")

  // Back closes the newest overlay in the web layer; only with nothing open does the system leave the app.
  private val backCallback = object : OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val wv = webView ?: return leave()
      wv.evaluateJavascript("window.__nativeBack ? window.__nativeBack() : false") { r -> if (r != "true") leave() }
    }
    private fun leave() {
      isEnabled = false
      onBackPressedDispatcher.onBackPressed()
      isEnabled = true
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    updateDir.deleteRecursively() // installer files are never kept
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

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bridge(), "GigaNative")
    onBackPressedDispatcher.addCallback(this, backCallback)
    // Edge-to-edge: forward bar/cut-out insets to CSS (--native-inset-*), shrink the WebView above the keyboard.
    ViewCompat.setOnApplyWindowInsetsListener(webView) { v, all ->
      val bars = all.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val imeVisible = all.isVisible(WindowInsetsCompat.Type.ime())
      val ime = all.getInsets(WindowInsetsCompat.Type.ime()).bottom
      (v.layoutParams as? ViewGroup.MarginLayoutParams)?.let {
        val want = if (imeVisible) ime else 0
        if (it.bottomMargin != want) { it.bottomMargin = want; v.layoutParams = it }
      }
      insets = Insets.of(bars.left, bars.top, bars.right, if (imeVisible) 0 else bars.bottom)
      v.post { webView.evaluateJavascript("window.__gsInsets && window.__gsInsets(${insetsJson()})", null) }
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onResume() {
    super.onResume()
    // Back from the system installer (installed or cancelled): the APK is no longer needed.
    if (updateHandedOff) { updateHandedOff = false; updateDir.deleteRecursively() }
  }

  private fun insetsJson(): String {
    val d = resources.displayMetrics.density
    return JSONObject().put("top", insets.top / d).put("right", insets.right / d)
      .put("bottom", insets.bottom / d).put("left", insets.left / d).toString()
  }

  private fun emitUpdate(json: JSONObject) = runOnUiThread {
    webView?.evaluateJavascript("window.__gsUpdate && window.__gsUpdate($json)", null)
  }

  /** `window.GigaNative` in the web layer. */
  inner class Bridge {
    @JavascriptInterface fun insets(): String = insetsJson()

    @JavascriptInterface fun setDarkBars(dark: Boolean) = runOnUiThread {
      WindowCompat.getInsetsController(window, window.decorView).apply {
        isAppearanceLightStatusBars = !dark
        isAppearanceLightNavigationBars = !dark
      }
    }

    @JavascriptInterface fun canInstallPackages(): Boolean =
      Build.VERSION.SDK_INT < 26 || packageManager.canRequestPackageInstalls()

    @JavascriptInterface fun openInstallSettings() {
      if (Build.VERSION.SDK_INT >= 26) startActivity(
        Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
    }

    @JavascriptInterface fun cancelUpdate() { updateCancelled = true }

    /** Downloads the release APK into cache/updates and opens the system installer. */
    @JavascriptInterface fun downloadUpdate(url: String) {
      if (!url.startsWith(RELEASES)) return emitUpdate(JSONObject().put("type", "error").put("message", "unexpected URL"))
      updateCancelled = false
      Thread {
        val file = File(updateDir, "update.apk")
        try {
          updateDir.deleteRecursively(); updateDir.mkdirs()
          val conn = URL(url).openConnection() as HttpURLConnection // follows GitHub's redirect to its CDN
          conn.connectTimeout = 15_000; conn.readTimeout = 15_000
          try {
            val total = conn.contentLengthLong
            conn.inputStream.use { input -> file.outputStream().use { out ->
              val buf = ByteArray(64 * 1024); var done = 0L; var last = -1
              while (true) {
                if (updateCancelled) throw InterruptedException("cancelled")
                val n = input.read(buf); if (n < 0) break
                out.write(buf, 0, n); done += n
                if (total > 0) { val p = (done * 100 / total).toInt(); if (p != last) { last = p; emitUpdate(JSONObject().put("type", "progress").put("percent", p)) } }
              }
            } }
          } finally { conn.disconnect() }
          val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", file)
          runOnUiThread {
            updateHandedOff = true
            startActivity(Intent(Intent.ACTION_VIEW).apply {
              setDataAndType(uri, "application/vnd.android.package-archive")
              addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            })
          }
          emitUpdate(JSONObject().put("type", "handoff"))
        } catch (e: Exception) {
          updateDir.deleteRecursively()
          if (!updateCancelled) emitUpdate(JSONObject().put("type", "error").put("message", e.toString()))
        }
      }.start()
    }
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
