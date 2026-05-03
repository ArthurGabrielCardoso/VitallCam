package com.vitallcam

import android.annotation.SuppressLint
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.SurfaceHolder
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import android.Manifest
import android.content.pm.PackageManager
import com.herohan.uvcapp.CameraHelper
import com.herohan.uvcapp.ICameraHelper
import com.herohan.uvcapp.IImageCapture
import com.serenegiant.widget.AspectRatioSurfaceView
import java.io.File

class MainActivity : AppCompatActivity() {

    private lateinit var rootLayout: FrameLayout
    private lateinit var webView: WebView
    private lateinit var previewSurface: AspectRatioSurfaceView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingJsCallback: String? = null

    // Live intraoral preview state
    private var cameraHelper: ICameraHelper? = null
    private var surfaceReady = false
    private var previewActive = false
    private var stateCallbackJs: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var openWatchdog: Runnable? = null
    private var openRetries = 0
    private var usbReceiverRegistered = false

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_NoActionBar)
        super.onCreate(savedInstanceState)

        rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.BLACK)
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }

        previewSurface = AspectRatioSurfaceView(this).apply {
            layoutParams = FrameLayout.LayoutParams(1, 1).apply {
                leftMargin = 0
                topMargin = 0
            }
            visibility = View.GONE
            holder.setFormat(PixelFormat.OPAQUE)
            // Precisa ficar acima do WebView (HW-accelerated) — MEDIA_OVERLAY não basta.
            setZOrderOnTop(true)
            holder.addCallback(surfaceCallback)
        }

        rootLayout.addView(webView)
        rootLayout.addView(previewSurface)
        setContentView(rootLayout)

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
        if (requestCode == UsbCameraActivity.REQUEST_CODE) {
            val callback = pendingJsCallback ?: "window.__onIntraoralCapture"
            pendingJsCallback = null

            if (resultCode == Activity.RESULT_OK && data != null) {
                val paths = data.getStringArrayExtra(UsbCameraActivity.EXTRA_IMAGE_PATHS)
                    ?: emptyArray()
                val dataUrls = paths.mapNotNull { path ->
                    runCatching {
                        val bytes = File(path).readBytes()
                        "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                    }.getOrNull()
                }
                paths.forEach { runCatching { File(it).delete() } }

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

    override fun onPause() {
        super.onPause()
        if (previewActive) {
            // Release helper but keep previewActive=true so onResume reopens
            tearDownHelper()
        }
    }

    override fun onResume() {
        super.onResume()
        if (previewActive && cameraHelper == null) {
            initHelperAndOpen()
        }
    }

    override fun onDestroy() {
        stopIntraoralPreviewInternal()
        super.onDestroy()
    }

    // ---------- Live preview overlay ----------

    private val surfaceCallback = object : SurfaceHolder.Callback {
        override fun surfaceCreated(holder: SurfaceHolder) {
            surfaceReady = true
            cameraHelper?.let {
                if (it.isCameraOpened) it.addSurface(holder.surface, false)
            }
        }
        override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, ht: Int) {}
        override fun surfaceDestroyed(holder: SurfaceHolder) {
            surfaceReady = false
            cameraHelper?.removeSurface(holder.surface)
        }
    }

    private val stateListener = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            cameraHelper?.selectDevice(device)
            emitState("connecting")
        }
        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            cameraHelper?.openCamera()
        }
        override fun onCameraOpen(device: UsbDevice) {
            cancelOpenWatchdog()
            openRetries = 0
            // Force a known good preview size before starting (default negotiation
            // sometimes picks an unsupported format → black frames).
            runCatching {
                val helper = cameraHelper ?: return@runCatching
                val supported = helper.supportedSizeList
                val chosen = supported.firstOrNull { it.width == 1280 && it.height == 720 }
                    ?: supported.firstOrNull { it.width == 640 && it.height == 480 }
                    ?: supported.maxByOrNull { it.width * it.height }
                if (chosen != null) helper.previewSize = chosen
            }
            cameraHelper?.startPreview()
            if (surfaceReady) cameraHelper?.addSurface(previewSurface.holder.surface, false)
            // Re-attach surface 200ms later as a belt-and-suspenders against race
            mainHandler.postDelayed({
                val h = cameraHelper ?: return@postDelayed
                if (h.isCameraOpened && surfaceReady) {
                    runCatching { h.addSurface(previewSurface.holder.surface, false) }
                }
            }, 200)
            emitState("ready")
        }
        override fun onCameraClose(device: UsbDevice) {
            runCatching { cameraHelper?.removeSurface(previewSurface.holder.surface) }
        }
        override fun onDeviceClose(device: UsbDevice) {}
        override fun onDetach(device: UsbDevice) {
            emitState("lost")
        }
        override fun onCancel(device: UsbDevice) {}
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (!previewActive) return
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    val helper = cameraHelper
                    if (helper == null) {
                        initHelperAndOpen()
                    } else if (!helper.isCameraOpened) {
                        // Helper alive but not opened — kick it
                        scheduleOpenWatchdog()
                    }
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    emitState("lost")
                }
            }
        }
    }

    private fun initHelperAndOpen() {
        if (cameraHelper != null) return
        cameraHelper = CameraHelper().apply { setStateCallback(stateListener) }
        scheduleOpenWatchdog()
    }

    private fun scheduleOpenWatchdog() {
        cancelOpenWatchdog()
        openWatchdog = Runnable {
            val helper = cameraHelper
            if (!previewActive || helper == null) return@Runnable
            if (!helper.isCameraOpened && openRetries < 2) {
                openRetries++
                emitState("error")
                runCatching { helper.release() }
                cameraHelper = null
                initHelperAndOpen()
            }
        }
        mainHandler.postDelayed(openWatchdog!!, 5000)
    }

    private fun cancelOpenWatchdog() {
        openWatchdog?.let { mainHandler.removeCallbacks(it) }
        openWatchdog = null
    }

    private fun tearDownHelper() {
        cancelOpenWatchdog()
        runCatching { cameraHelper?.removeSurface(previewSurface.holder.surface) }
        runCatching { cameraHelper?.release() }
        cameraHelper = null
    }

    private fun stopIntraoralPreviewInternal() {
        if (!previewActive && cameraHelper == null) return
        previewActive = false
        tearDownHelper()
        if (usbReceiverRegistered) {
            runCatching { unregisterReceiver(usbReceiver) }
            usbReceiverRegistered = false
        }
        runOnUiThread { previewSurface.visibility = View.GONE }
        stateCallbackJs = null
    }

    private fun emitState(state: String) {
        val cb = stateCallbackJs ?: return
        runOnUiThread {
            webView.evaluateJavascript(
                "if(typeof $cb==='function'){$cb(${jsString(state)});}",
                null,
            )
        }
    }

    /**
     * O JS envia bounds em DEVICE px (já multiplicou por window.devicePixelRatio),
     * então só aplicamos direto. Usar webView.scale aqui é furada — em WebView
     * moderno com viewport meta ele retorna 1.0 e a conta dá errada.
     */
    private fun applyPreviewBounds(xPx: Float, yPx: Float, wPx: Float, hPx: Float) {
        runOnUiThread {
            val left = xPx.toInt().coerceAtLeast(0)
            val top = yPx.toInt().coerceAtLeast(0)
            val width = wPx.toInt().coerceAtLeast(1)
            val height = hPx.toInt().coerceAtLeast(1)
            val lp = previewSurface.layoutParams as FrameLayout.LayoutParams
            lp.width = width
            lp.height = height
            lp.leftMargin = left
            lp.topMargin = top
            previewSurface.layoutParams = lp
            previewSurface.requestLayout()
            if (previewSurface.visibility != View.VISIBLE && previewActive) {
                previewSurface.visibility = View.VISIBLE
            }
        }
    }

    // ---------- JS bridge ----------

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

        @JavascriptInterface
        fun startIntraoralPreview(stateCallbackName: String?) {
            stateCallbackJs = if (stateCallbackName.isNullOrBlank())
                "window.__onIntraoralState" else stateCallbackName
            if (previewActive) {
                emitState("connecting")
                return
            }
            previewActive = true
            runOnUiThread {
                if (!usbReceiverRegistered) {
                    val filter = IntentFilter().apply {
                        addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED)
                        addAction(UsbManager.ACTION_USB_DEVICE_DETACHED)
                    }
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        registerReceiver(usbReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
                    } else {
                        @Suppress("UnspecifiedRegisterReceiverFlag")
                        registerReceiver(usbReceiver, filter)
                    }
                    usbReceiverRegistered = true
                }
                initHelperAndOpen()
                emitState("connecting")
            }
        }

        @JavascriptInterface
        fun startIntraoralPreview() = startIntraoralPreview(null)

        @JavascriptInterface
        fun stopIntraoralPreview() {
            runOnUiThread { stopIntraoralPreviewInternal() }
        }

        @JavascriptInterface
        fun setIntraoralPreviewBounds(x: Float, y: Float, w: Float, h: Float) {
            applyPreviewBounds(x, y, w, h)
        }

        @JavascriptInterface
        fun setIntraoralPreviewBounds(x: Double, y: Double, w: Double, h: Double) {
            applyPreviewBounds(x.toFloat(), y.toFloat(), w.toFloat(), h.toFloat())
        }

        @JavascriptInterface
        fun captureIntraoralFrame(callbackName: String?) {
            val cb = if (callbackName.isNullOrBlank()) "window.__onIntraoralFrame" else callbackName
            val helper = cameraHelper
            if (helper == null || !helper.isCameraOpened) {
                runOnUiThread {
                    webView.evaluateJavascript(
                        "if(typeof $cb==='function'){$cb(null,${jsString("not-ready")});}",
                        null,
                    )
                }
                return
            }
            val file = File(cacheDir, "intraoral_${System.currentTimeMillis()}.jpg")
            val opts = IImageCapture.OutputFileOptions.Builder(file).build()
            helper.takePicture(opts, object : IImageCapture.OnImageCaptureCallback {
                override fun onImageSaved(result: IImageCapture.OutputFileResults) {
                    val dataUrl = runCatching {
                        val bytes = file.readBytes()
                        "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP)
                    }.getOrNull()
                    runCatching { file.delete() }
                    runOnUiThread {
                        if (dataUrl == null) {
                            webView.evaluateJavascript(
                                "if(typeof $cb==='function'){$cb(null,${jsString("read-failed")});}",
                                null,
                            )
                        } else {
                            webView.evaluateJavascript(
                                "if(typeof $cb==='function'){$cb(${jsString(dataUrl)},null);}",
                                null,
                            )
                        }
                    }
                }
                override fun onError(code: Int, message: String, cause: Throwable?) {
                    runCatching { file.delete() }
                    runOnUiThread {
                        webView.evaluateJavascript(
                            "if(typeof $cb==='function'){$cb(null,${jsString(message)});}",
                            null,
                        )
                    }
                }
            })
        }

        @JavascriptInterface
        fun captureIntraoralFrame() = captureIntraoralFrame(null)
    }

    companion object {
        private const val CAMERA_PERMISSION_CODE = 1001
    }
}
