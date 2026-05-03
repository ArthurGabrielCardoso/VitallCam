package com.vitallcam

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import android.Manifest
import android.content.pm.PackageManager
import java.io.File

/**
 * MainActivity = host do WebView que carrega a app Next.js.
 *
 * Toda lógica da câmera intraoral foi movida pra IntraoralCaptureActivity
 * (Compose nativo, espelha o design web pixel-a-pixel). O bridge expõe
 * apenas o necessário pra abrir essa Activity e receber os arquivos
 * capturados de volta no callback JS.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingJsCallback: String? = null

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_NoActionBar)
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

        // Asset loader: serve cacheDir/captures/* via
        // https://appassets.androidplatform.net/captures/<arquivo>
        // Permite o JS fazer fetch() das fotos/vídeos sem passar pelo
        // bridge (evita o limite de 1MB da Binder IPC).
        val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/captures/", WebViewAssetLoader.InternalStoragePathHandler(this, capturesDir))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.contains("vitallcam")) {
                    view.loadUrl(url)
                    return true
                }
                return false
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                view.evaluateJavascript(
                    "window.__VITALLCAM_NATIVE__ = true;" +
                    "window.dispatchEvent(new Event('vitallcam:ready'));",
                    null,
                )
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val cameraGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED

                if (cameraGranted) {
                    request.grant(request.resources)
                } else {
                    pendingPermissionRequest = request
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.CAMERA),
                        CAMERA_PERMISSION_CODE,
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
        grantResults: IntArray,
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
        if (requestCode == IntraoralCaptureActivity.REQUEST_CODE
            || requestCode == UsbCameraActivity.REQUEST_CODE) {
            val callback = pendingJsCallback ?: "window.__onIntraoralCapture"
            pendingJsCallback = null

            val extraKey = if (requestCode == IntraoralCaptureActivity.REQUEST_CODE)
                IntraoralCaptureActivity.EXTRA_IMAGE_PATHS
            else UsbCameraActivity.EXTRA_IMAGE_PATHS

            if (resultCode == Activity.RESULT_OK && data != null) {
                val paths = data.getStringArrayExtra(extraKey) ?: emptyArray()
                // Cada arquivo já está em cacheDir/captures/ — converte path
                // absoluto pra URL servida via WebViewAssetLoader.
                // Bridge passa só URLs curtas (não estoura Binder de 1MB).
                val capturesDirPath = File(cacheDir, "captures").absolutePath
                val urls = paths.mapNotNull { path ->
                    val f = File(path)
                    if (!f.exists()) return@mapNotNull null
                    if (path.startsWith(capturesDirPath)) {
                        val name = f.name
                        "https://appassets.androidplatform.net/captures/$name"
                    } else {
                        // Fallback (não deveria ocorrer): copia pro captures
                        val dest = File(File(cacheDir, "captures").apply { mkdirs() }, f.name)
                        runCatching { f.copyTo(dest, overwrite = true); f.delete() }
                        "https://appassets.androidplatform.net/captures/${dest.name}"
                    }
                }
                val arrayJs = urls.joinToString(",") { jsString(it) }
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
                val intent = Intent(this@MainActivity, IntraoralCaptureActivity::class.java)
                @Suppress("DEPRECATION")
                startActivityForResult(intent, IntraoralCaptureActivity.REQUEST_CODE)
            }
        }

        @JavascriptInterface
        fun openIntraoralCamera() = openIntraoralCamera(null)

        // ---- Stubs no-op pra compatibilidade com versões web em cache que
        // ainda chamam estes métodos do fluxo antigo (live preview overlay).
        // Nada acontece; em breve a web simplificada não chama mais. ----

        @JavascriptInterface
        fun startIntraoralPreview(stateCallbackName: String?) {
            // Imediatamente sinaliza "ready" pra qualquer UI antiga que esteja
            // esperando esse estado, evitando travas.
            val cb = if (stateCallbackName.isNullOrBlank()) "window.__onIntraoralState" else stateCallbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(${jsString("ready")});}",
                    null,
                )
            }
        }

        @JavascriptInterface
        fun startIntraoralPreview() = startIntraoralPreview(null)

        @JavascriptInterface fun stopIntraoralPreview() {}
        @JavascriptInterface fun setIntraoralPreviewBounds(x: Float, y: Float, w: Float, h: Float) {}
        @JavascriptInterface fun setIntraoralPreviewBounds(x: Double, y: Double, w: Double, h: Double) {}
        @JavascriptInterface fun setIntraoralMirror(mirror: Boolean) {}
        @JavascriptInterface fun setIntraoralPreviewVisible(visible: Boolean) {}

        @JavascriptInterface
        fun captureIntraoralFrame(callbackName: String?) {
            val cb = if (callbackName.isNullOrBlank()) "window.__onIntraoralFrame" else callbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(null,${jsString("not-supported-use-openIntraoralCamera")});}",
                    null,
                )
            }
        }
        @JavascriptInterface fun captureIntraoralFrame() = captureIntraoralFrame(null)

        @JavascriptInterface
        fun startIntraoralRecording(callbackName: String?) {
            val cb = if (callbackName.isNullOrBlank()) "window.__onIntraoralVideo" else callbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(null,${jsString("not-supported")});}",
                    null,
                )
            }
        }
        @JavascriptInterface fun startIntraoralRecording() = startIntraoralRecording(null)
        @JavascriptInterface fun stopIntraoralRecording() {}
        @JavascriptInterface fun isIntraoralRecording(): Boolean = false
        @JavascriptInterface fun getIntraoralCapabilities(callbackName: String?) {}
        @JavascriptInterface fun getIntraoralCapabilities() {}
        @JavascriptInterface fun setIntraoralResolution(width: Int, height: Int) {}
        @JavascriptInterface fun setIntraoralZoomPercent(percent: Int) {}

        /** Deleta um arquivo capturado do cache depois de upload completo. */
        @JavascriptInterface
        fun deleteCaptureFile(filename: String) {
            if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) return
            val f = File(File(cacheDir, "captures"), filename)
            if (f.exists()) runCatching { f.delete() }
        }
    }

    companion object {
        private const val CAMERA_PERMISSION_CODE = 1001
    }
}
