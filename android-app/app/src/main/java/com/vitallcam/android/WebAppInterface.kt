package com.vitallcam.android

import android.graphics.Bitmap
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.ByteArrayOutputStream

/**
 * Ponte JavaScript ↔ Kotlin.
 * Exposta ao JS como window.VitallCamBridge.
 */
class WebAppInterface(
    private val webView: WebView,
    private val cameraManager: UsbCameraManager,
) {

    /** Chamado pelo JS para saber se a câmera USB está disponível e ativa. */
    @JavascriptInterface
    fun hasUsbCamera(): Boolean = cameraManager.isOpen()

    /** Chamado pelo JS para abrir o preview da câmera USB. */
    @JavascriptInterface
    fun openUsbCamera() {
        webView.post { cameraManager.openCamera() }
    }

    /** Chamado pelo JS para fechar a câmera USB. */
    @JavascriptInterface
    fun closeUsbCamera() {
        webView.post { cameraManager.closeCamera() }
    }

    /**
     * Chamado pelo JS para capturar uma foto.
     * O resultado volta como base64 via JS callback: window.onUsbPhotoCapture(base64).
     */
    @JavascriptInterface
    fun capturePhoto() {
        cameraManager.capturePhoto { bitmap ->
            if (bitmap != null) {
                val base64 = bitmapToBase64(bitmap)
                webView.post {
                    webView.evaluateJavascript(
                        "if(window.onUsbPhotoCapture) window.onUsbPhotoCapture('$base64');",
                        null
                    )
                }
            }
        }
    }

    private fun bitmapToBase64(bitmap: Bitmap): String {
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 90, out)
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }
}
