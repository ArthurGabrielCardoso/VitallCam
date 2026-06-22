package com.vitallcam

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
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
            ): WebResourceResponse? {
                val response = assetLoader.shouldInterceptRequest(request.url) ?: return null
                // A página vem de https://vitallcam.vercel.app e o fetch vai pra
                // https://appassets.androidplatform.net/captures/* — origem
                // diferente. Sem CORS, o fetch JS é bloqueado e as capturas
                // nunca chegam no Supabase. Libera CORS pra qualquer origem.
                val headers = (response.responseHeaders ?: emptyMap()).toMutableMap()
                headers["Access-Control-Allow-Origin"] = "*"
                headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
                headers["Access-Control-Allow-Headers"] = "*"
                response.responseHeaders = headers
                return response
            }

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

        liveInstance = this
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

    override fun onDestroy() {
        super.onDestroy()
        if (liveInstance === this) liveInstance = null
        usbPermReceiver?.let { runCatching { unregisterReceiver(it) } }
        usbPermReceiver = null
    }

    // ---- Permissão USB pedida AQUI (tela normal, não-fullscreen). Em algumas
    // ROMs de TV box o diálogo de permissão some/é cancelado por cima da tela
    // fullscreen da câmera; pedindo na MainActivity ele costuma aparecer. Se
    // concedida, a permissão vale pro app todo e a IntraoralCaptureActivity
    // abre direto. ----
    private val actionUsbPerm = "com.vitallcam.USB_PERMISSION"
    private var usbPermReceiver: BroadcastReceiver? = null

    private fun isUvcDevice(d: UsbDevice): Boolean {
        if (d.deviceClass == 239 || d.deviceClass == 14 || d.deviceClass == 255) return true
        for (i in 0 until d.interfaceCount) {
            if (d.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_VIDEO) return true
        }
        return false
    }

    private fun launchIntraoral() {
        val intent = Intent(this, IntraoralCaptureActivity::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(intent, IntraoralCaptureActivity.REQUEST_CODE)
    }

    private fun requestUsbThenLaunchIntraoral() {
        val um = getSystemService(Context.USB_SERVICE) as? UsbManager
        val cam = um?.deviceList?.values?.firstOrNull { isUvcDevice(it) }
        if (um == null || cam == null) { launchIntraoral(); return }
        if (um.hasPermission(cam)) {
            Toast.makeText(this, "USB já autorizado — abrindo câmera", Toast.LENGTH_SHORT).show()
            launchIntraoral()
            return
        }
        if (usbPermReceiver == null) {
            usbPermReceiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, i: Intent?) {
                    if (i?.action != actionUsbPerm) return
                    val granted = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    Toast.makeText(this@MainActivity, if (granted) "USB autorizado!" else "USB negado pelo sistema", Toast.LENGTH_LONG).show()
                    launchIntraoral()
                }
            }
            val f = IntentFilter(actionUsbPerm)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(usbPermReceiver, f, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                registerReceiver(usbPermReceiver, f)
            }
        }
        // API 30 (Android 11 do box): PendingIntent é mutável por padrão — NÃO
        // usar FLAG_IMMUTABLE (senão o extra GRANTED some). MUTABLE só >= API 31.
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getBroadcast(this, 0, Intent(actionUsbPerm).setPackage(packageName), flags)
        Toast.makeText(this, "Pedindo permissão USB…", Toast.LENGTH_SHORT).show()
        um.requestPermission(cam, pi)
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
            runOnUiThread { requestUsbThenLaunchIntraoral() }
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

        // Referência viva pra Activity nativa da câmera entregar CADA foto direto
        // pro WebView na hora (igual capturePhoto do web): sem arquivo, sem busca.
        @Volatile private var liveInstance: MainActivity? = null

        /**
         * Entrega UMA foto (dataURL base64) pro web imediatamente.
         * @param capturedAt millis da captura — vira created_at no banco pra
         *   garantir a ORDEM certa mesmo com uploads em paralelo.
         * Retorna true se entregou (WebView vivo); false → cai no fallback do Salvar.
         */
        fun pushIntraoralPhoto(dataUrl: String, id: String, capturedAt: Long): Boolean {
            val act = liveInstance ?: return false
            act.runOnUiThread {
                val js = "if(typeof window.__onIntraoralPhoto==='function'){" +
                    "window.__onIntraoralPhoto(${act.jsString(dataUrl)},${act.jsString(id)},${capturedAt});}"
                runCatching { act.webView.evaluateJavascript(js, null) }
            }
            return true
        }
    }
}
