package com.vitallcam

import android.app.Activity
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.SurfaceHolder
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.herohan.uvcapp.CameraHelper
import com.herohan.uvcapp.ICameraHelper
import com.herohan.uvcapp.IImageCapture
import com.serenegiant.widget.AspectRatioSurfaceView
import java.io.File

class UsbCameraActivity : AppCompatActivity() {

    private var cameraHelper: ICameraHelper? = null
    private lateinit var surfaceView: AspectRatioSurfaceView
    private lateinit var statusText: TextView
    private var surfaceReady = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_usb_camera)

        statusText = findViewById(R.id.statusText)
        surfaceView = findViewById(R.id.cameraSurface)

        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                surfaceReady = true
                cameraHelper?.let {
                    if (it.isCameraOpened) {
                        it.addSurface(holder.surface, false)
                    }
                }
            }

            override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, ht: Int) {}

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                surfaceReady = false
                cameraHelper?.removeSurface(holder.surface)
            }
        })

        findViewById<Button>(R.id.btnCancel).setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        findViewById<Button>(R.id.btnCapture).setOnClickListener { captureImage() }
    }

    override fun onStart() {
        super.onStart()
        if (cameraHelper == null) {
            cameraHelper = CameraHelper().apply {
                setStateCallback(stateListener)
            }
        }
    }

    override fun onStop() {
        super.onStop()
        cameraHelper?.release()
        cameraHelper = null
    }

    private val stateListener = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            runOnUiThread { statusText.text = "Câmera detectada, conectando..." }
            cameraHelper?.selectDevice(device)
        }

        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            cameraHelper?.openCamera()
        }

        override fun onCameraOpen(device: UsbDevice) {
            runOnUiThread { statusText.text = "Câmera intraoral conectada" }
            cameraHelper?.startPreview()
            if (surfaceReady) {
                cameraHelper?.addSurface(surfaceView.holder.surface, false)
            }
        }

        override fun onCameraClose(device: UsbDevice) {
            cameraHelper?.removeSurface(surfaceView.holder.surface)
        }

        override fun onDeviceClose(device: UsbDevice) {}
        override fun onDetach(device: UsbDevice) {
            runOnUiThread { statusText.text = "Câmera desconectada" }
        }
        override fun onCancel(device: UsbDevice) {
            runOnUiThread { statusText.text = "Permissão USB negada" }
        }
    }

    private fun captureImage() {
        val helper = cameraHelper
        if (helper == null || !helper.isCameraOpened) {
            Toast.makeText(this, "Câmera USB não conectada", Toast.LENGTH_SHORT).show()
            return
        }
        statusText.text = "Capturando..."
        val file = File(cacheDir, "intraoral_${System.currentTimeMillis()}.jpg")
        val options = IImageCapture.OutputFileOptions.Builder(file).build()
        helper.takePicture(options, object : IImageCapture.OnImageCaptureCallback {
            override fun onImageSaved(result: IImageCapture.OutputFileResults) {
                runOnUiThread { onCaptureDone(file) }
            }

            override fun onError(code: Int, message: String, cause: Throwable?) {
                runOnUiThread {
                    statusText.text = "Erro: $message"
                    Toast.makeText(this@UsbCameraActivity, message, Toast.LENGTH_LONG).show()
                }
            }
        })
    }

    private fun onCaptureDone(file: File) {
        try {
            val bytes = file.readBytes()
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            val data = Intent().apply {
                putExtra(EXTRA_IMAGE_BASE64, b64)
                putExtra(EXTRA_IMAGE_PATH, file.absolutePath)
            }
            setResult(Activity.RESULT_OK, data)
            finish()
        } catch (e: Exception) {
            statusText.text = "Erro ao ler imagem: ${e.message}"
        }
    }

    companion object {
        const val EXTRA_IMAGE_BASE64 = "image_base64"
        const val EXTRA_IMAGE_PATH = "image_path"
        const val REQUEST_CODE = 4242
    }
}
