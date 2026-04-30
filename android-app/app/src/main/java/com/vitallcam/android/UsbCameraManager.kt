package com.vitallcam.android

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.util.Log
import com.jiangdg.ausbc.MultiCameraClient
import com.jiangdg.ausbc.callback.ICameraStateCallBack
import com.jiangdg.ausbc.callback.IPreviewDataCallBack
import com.jiangdg.ausbc.camera.CameraUVC
import com.jiangdg.ausbc.camera.bean.CameraRequest
import com.jiangdg.ausbc.widget.AspectRatioSurfaceView
import java.io.ByteArrayOutputStream

private const val TAG = "UsbCameraManager"

/**
 * Gerencia a câmera USB UVC usando a biblioteca AndroidUSBCamera (jiangdongguo).
 * Envia frames JPEG via WebSocket para o WebView ao vivo.
 */
class UsbCameraManager(
    private val context: Context,
    private val wsServer: FrameWebSocketServer,
    private val onCameraOpened: () -> Unit,
    private val onCameraClosed: () -> Unit,
) {
    private var cameraClient: MultiCameraClient? = null
    private var currentCamera: MultiCameraClient.ICamera? = null
    private var surfaceView: AspectRatioSurfaceView? = null

    fun attach(surface: AspectRatioSurfaceView) {
        surfaceView = surface
    }

    fun openCamera() {
        val sf = surfaceView ?: return
        cameraClient = MultiCameraClient(context, object : ICameraStateCallBack {
            override fun onCameraState(
                self: MultiCameraClient.ICamera,
                code: ICameraStateCallBack.State,
                msg: String?
            ) {
                when (code) {
                    ICameraStateCallBack.State.OPENED -> {
                        Log.d(TAG, "Câmera USB aberta")
                        currentCamera = self
                        startPreviewData(self)
                        onCameraOpened()
                    }
                    ICameraStateCallBack.State.CLOSED -> {
                        Log.d(TAG, "Câmera USB fechada")
                        currentCamera = null
                        onCameraClosed()
                    }
                    ICameraStateCallBack.State.ERROR -> {
                        Log.e(TAG, "Erro na câmera USB: $msg")
                        onCameraClosed()
                    }
                }
            }
        })
        cameraClient?.openCamera(sf, object : CameraRequest.Builder()
            .setPreviewWidth(1280)
            .setPreviewHeight(720)
            .setRawPreviewData(true)
            .create())
    }

    private fun startPreviewData(camera: MultiCameraClient.ICamera) {
        camera.addPreviewDataCallBack(object : IPreviewDataCallBack {
            override fun onPreviewData(
                data: ByteArray?,
                width: Int,
                height: Int,
                format: IPreviewDataCallBack.DataFormat
            ) {
                if (data == null || !wsServer.hasClients) return
                try {
                    val jpegBytes = when (format) {
                        IPreviewDataCallBack.DataFormat.NV21 -> nv21ToJpeg(data, width, height)
                        IPreviewDataCallBack.DataFormat.JPEG -> data
                        else -> nv21ToJpeg(data, width, height)
                    }
                    wsServer.broadcastFrame(jpegBytes)
                } catch (e: Exception) {
                    Log.w(TAG, "Erro ao converter frame: ${e.message}")
                }
            }
        })
    }

    /** Captura um único frame como Bitmap (para salvar foto). */
    fun capturePhoto(callback: (Bitmap?) -> Unit) {
        val camera = currentCamera ?: run { callback(null); return }
        camera.captureImage({ captureFile ->
            if (captureFile != null) {
                val bmp = BitmapFactory.decodeFile(captureFile.absolutePath)
                callback(bmp)
            } else {
                callback(null)
            }
        }, context.cacheDir)
    }

    fun closeCamera() {
        cameraClient?.closeCamera()
        cameraClient = null
    }

    fun isOpen(): Boolean = currentCamera != null

    private fun nv21ToJpeg(nv21: ByteArray, width: Int, height: Int): ByteArray {
        val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
        val out = ByteArrayOutputStream()
        yuvImage.compressToJpeg(Rect(0, 0, width, height), 80, out)
        return out.toByteArray()
    }
}
