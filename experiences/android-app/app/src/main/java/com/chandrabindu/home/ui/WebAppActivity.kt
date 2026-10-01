package com.chandrabindu.home.ui

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.chandrabindu.home.App

/**
 * The complete web app (builders, switch groups, usage, insights, settings,
 * voice) in a WebView. The app's session token is handed over as the
 * `shc_session` cookie, so there is no second sign-in.
 */
class WebAppActivity : ComponentActivity() {
    private lateinit var web: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris ->
        fileCallback?.onReceiveValue(uris.toTypedArray())
        fileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val repo = App.repo
        val base = repo.client.base

        web = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) view.loadDataWithBaseURL(null, offlineHtml(base), "text/html", "utf-8", null)
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(
                    webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams,
                ): Boolean {
                    fileCallback?.onReceiveValue(null)
                    fileCallback = callback
                    val type = params.acceptTypes.firstOrNull { it.isNotBlank() } ?: "*/*"
                    return try {
                        pickFiles.launch(type)
                        true
                    } catch (_: Exception) {
                        fileCallback = null
                        false
                    }
                }
            }
            // Backups download as files; DownloadManager needs the session cookie.
            setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
                try {
                    val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
                    val req = DownloadManager.Request(Uri.parse(url))
                        .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                        .addRequestHeader("User-Agent", userAgent)
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
                    getSystemService(DownloadManager::class.java).enqueue(req)
                    Toast.makeText(this@WebAppActivity, "Downloading $name", Toast.LENGTH_SHORT).show()
                } catch (e: Exception) {
                    Toast.makeText(this@WebAppActivity, "Couldn't download: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(web) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.updatePadding(top = bars.top, bottom = bars.bottom)
            insets
        }
        setContentView(web)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        val token = repo.client.token
        if (token != null) {
            cookies.setCookie(base, "shc_session=$token; Path=/; Max-Age=31536000") {
                cookies.flush()
                web.loadUrl("$base/")
            }
        } else {
            web.loadUrl("$base/")
        }
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    private fun offlineHtml(base: String) = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <style>:root{color-scheme:light dark}body{font-family:sans-serif;display:flex;align-items:center;
        justify-content:center;height:90vh;margin:0 24px;text-align:center}p{opacity:.7;line-height:1.45}
        button{margin-top:14px;font-size:16px;padding:10px 22px;border-radius:10px;border:0;background:#6661F2;color:#fff}</style>
        </head><body><div><h2>Can't reach your home</h2>
        <p>Chandrabindu runs on your home network, so it only works when this phone is on your home Wi-Fi.</p>
        <button onclick="location.href='$base/'">Try again</button></div></body></html>
    """.trimIndent()
}
