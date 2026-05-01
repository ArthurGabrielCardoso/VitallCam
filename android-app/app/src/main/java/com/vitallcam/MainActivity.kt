package com.vitallcam

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Color
import android.hardware.usb.UsbDevice
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.TextureView
import android.view.View
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
import com.serenegiant.usb.USBMonitor
import com.serenegiant.usb.UVCCamera
import java.io.ByteArrayOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var uvcTextureView: TextureView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var usbMonitor: USBMonitor? = null
    private var uvcCamera: UVCCamera? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        uvcTextureView = findViewById(R.id.uvcTextureView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = false
        }

        webView.addJavascriptInterface(AndroidBridge(), "Android")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.contains("vitallcam")) {
                    view.loadUrl(url)
                    return true
                }
                return false
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

        setupUSBMonitor()

        val url = getString(R.string.app_url)
        webView.loadUrl(url)
    }

    private fun setupUSBMonitor() {
        usbMonitor = USBMonitor(this, object : USBMonitor.OnDeviceConnectListener {
            override fun onAttach(device: UsbDevice) {
                Log.d(TAG, "USB device attached: ${device.deviceName}")
                usbMonitor?.requestPermission(device)
            }

            override fun onConnect(
                device: UsbDevice,
                ctrlBlock: USBMonitor.UsbControlBlock,
                createNew: Boolean
            ) {
                Log.d(TAG, "USB device connected: ${device.deviceName}")
                openUVCCamera(ctrlBlock)
            }

            override fun onDisconnect(
                device: UsbDevice,
                ctrlBlock: USBMonitor.UsbControlBlock
            ) {
                Log.d(TAG, "USB device disconnected: ${device.deviceName}")
                closeUVCCamera()
                webView.post {
                    webView.evaluateJavascript(
                        "window.onUVCCameraDisconnected && window.onUVCCameraDisconnected()", null
                    )
                }
            }

            override fun onDetach(device: UsbDevice) {
                Log.d(TAG, "USB device detached: ${device.deviceName}")
            }

            override fun onCancel(device: UsbDevice) {
                Log.d(TAG, "USB permission cancelled for: ${device.deviceName}")
            }
        })
    }

    private fun openUVCCamera(ctrlBlock: USBMonitor.UsbControlBlock) {
        val camera = UVCCamera()
        try {
            camera.open(ctrlBlock)

            // Try MJPEG at 720p, fallback to 480p, then YUV
            val opened = tryPreviewSize(camera, 1280, 720, UVCCamera.FRAME_FORMAT_MJPEG)
                || tryPreviewSize(camera, 640, 480, UVCCamera.FRAME_FORMAT_MJPEG)
                || tryPreviewSize(camera, 640, 480, UVCCamera.DEFAULT_PREVIEW_MODE)

            if (!opened) {
                Log.e(TAG, "Could not set any preview size")
                camera.destroy()
                return
            }

            val st = uvcTextureView.surfaceTexture
            if (st == null) {
                Log.e(TAG, "SurfaceTexture not ready")
                camera.destroy()
                return
            }

            camera.setPreviewTexture(st)
            camera.startPreview()
            uvcCamera = camera

            runOnUiThread {
                uvcTextureView.visibility = View.VISIBLE
            }
            webView.post {
                webView.evaluateJavascript(
                    "window.onUVCCameraConnected && window.onUVCCameraConnected()", null
                )
            }
            Log.d(TAG, "UVC camera started")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open UVC camera", e)
            camera.destroy()
        }
    }

    private fun tryPreviewSize(camera: UVCCamera, w: Int, h: Int, format: Int): Boolean {
        return try {
            camera.setPreviewSize(w, h, format)
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun closeUVCCamera() {
        try {
            uvcCamera?.stopPreview()
            uvcCamera?.close()
            uvcCamera?.destroy()
        } catch (e: Exception) {
            Log.e(TAG, "Error closing UVC camera", e)
        }
        uvcCamera = null
        runOnUiThread {
            uvcTextureView.visibility = View.GONE
            webView.setBackgroundColor(Color.BLACK)
        }
    }

    override fun onStart() {
        super.onStart()
        usbMonitor?.register()
    }

    override fun onStop() {
        usbMonitor?.unregister()
        super.onStop()
    }

    override fun onDestroy() {
        closeUVCCamera()
        usbMonitor?.destroy()
        usbMonitor = null
        super.onDestroy()
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
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    inner class AndroidBridge {

        @JavascriptInterface
        fun isUVCAvailable(): String = if (uvcCamera != null) "true" else "false"

        @JavascriptInterface
        fun startUVCMode() {
            runOnUiThread {
                webView.setBackgroundColor(Color.TRANSPARENT)
            }
        }

        @JavascriptInterface
        fun stopUVCMode() {
            runOnUiThread {
                webView.setBackgroundColor(Color.BLACK)
            }
        }

        @JavascriptInterface
        fun captureUVCPhoto(callbackName: String) {
            val bmp: Bitmap? = try { uvcTextureView.bitmap } catch (e: Exception) { null }
            if (bmp == null) {
                webView.post { webView.evaluateJavascript("$callbackName(null)", null) }
                return
            }
            val baos = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 95, baos)
            val b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
            val dataUrl = "data:image/jpeg;base64,$b64"
            webView.post {
                webView.evaluateJavascript("$callbackName('$dataUrl')", null)
            }
        }
    }

    companion object {
        private const val TAG = "VitallCam"
        private const val CAMERA_PERMISSION_CODE = 1001
    }
}
