package com.vitallcam

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingJsCallback: String? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = false
        }

        webView.addJavascriptInterface(VitallCamBridge(), "VitallCam")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.contains("vitallcam")) {
                    view.loadUrl(url)
                    return true
                }
                return false
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                view.evaluateJavascript(
                    "window.__VITALLCAM_NATIVE__ = true;" +
                    "window.dispatchEvent(new Event('vitallcam:ready'));",
                    null
                )
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val cameraGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.CAMERA
                ) == PackageManager.PERMISSION_GRANTED

                if (cameraGranted) {
                    request.grant(request.resources)
                } else {
                    pendingPermissionRequest = request
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.CAMERA),
                        CAMERA_PERMISSION_CODE
                    )
                }
            }
        }

        val url = getString(R.string.app_url)
        webView.loadUrl(url)
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest?.grant(pendingPermissionRequest!!.resources)
            } else {
                pendingPermissionRequest?.deny()
            }
            pendingPermissionRequest = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == UsbCameraActivity.REQUEST_CODE) {
            val callback = pendingJsCallback ?: "window.__onIntraoralCapture"
            pendingJsCallback = null

            if (resultCode == Activity.RESULT_OK && data != null) {
                val paths = data.getStringArrayExtra(UsbCameraActivity.EXTRA_IMAGE_PATHS)
                    ?: emptyArray()
                val dataUrls = paths.mapNotNull { path ->
                    runCatching {
                        val bytes = java.io.File(path).readBytes()
                        "data:image/jpeg;base64," + android.util.Base64.encodeToString(
                            bytes, android.util.Base64.NO_WRAP
                        )
                    }.getOrNull()
                }
                paths.forEach { runCatching { java.io.File(it).delete() } }

                val arrayJs = dataUrls.joinToString(",") { jsString(it) }
                val js = "if(typeof $callback==='function'){$callback([$arrayJs],null);}"
                webView.evaluateJavascript(js, null)
            } else {
                val js = "if(typeof $callback==='function'){$callback([],'cancelled');}"
                webView.evaluateJavascript(js, null)
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private fun jsString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> sb.append(c)
            }
        }
        sb.append("\"")
        return sb.toString()
    }

    inner class VitallCamBridge {
        @JavascriptInterface
        fun isNative(): Boolean = true

        @JavascriptInterface
        fun openIntraoralCamera(jsCallbackName: String?) {
            pendingJsCallback = if (jsCallbackName.isNullOrBlank())
                "window.__onIntraoralCapture" else jsCallbackName
            runOnUiThread {
                val intent = Intent(this@MainActivity, UsbCameraActivity::class.java)
                @Suppress("DEPRECATION")
                startActivityForResult(intent, UsbCameraActivity.REQUEST_CODE)
            }
        }

        @JavascriptInterface
        fun openIntraoralCamera() = openIntraoralCamera(null)
    }

    companion object {
        private const val CAMERA_PERMISSION_CODE = 1001
    }
}
