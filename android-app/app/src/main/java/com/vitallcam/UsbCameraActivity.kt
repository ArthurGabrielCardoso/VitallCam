package com.vitallcam

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.ColorDrawable
import android.hardware.usb.UsbDevice
import android.os.Bundle
import android.view.LayoutInflater
import android.view.SurfaceHolder
import android.view.View
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
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
    private lateinit var sidePanel: LinearLayout
    private lateinit var sideTitle: TextView
    private lateinit var thumbsContainer: LinearLayout
    private lateinit var btnSave: ImageButton

    private var surfaceReady = false
    private val capturedFiles = mutableListOf<File>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Fundo preto opaco para evitar enxergar a home do tablet pela "hole" do SurfaceView
        window.setBackgroundDrawable(ColorDrawable(Color.BLACK))
        setContentView(R.layout.activity_usb_camera)

        surfaceView = findViewById(R.id.cameraSurface)
        sidePanel = findViewById(R.id.sidePanel)
        sideTitle = findViewById(R.id.sideTitle)
        thumbsContainer = findViewById(R.id.thumbsContainer)
        btnSave = findViewById(R.id.btnSave)

        // Mantém o SurfaceView opaco (sem furo transparente)
        surfaceView.holder.setFormat(PixelFormat.OPAQUE)
        surfaceView.setZOrderMediaOverlay(false)

        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
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
        })

        findViewById<ImageButton>(R.id.btnCancel).setOnClickListener { onCancel() }
        findViewById<ImageButton>(R.id.btnCapture).setOnClickListener { captureImage() }
        btnSave.setOnClickListener { onSave() }
    }

    override fun onStart() {
        super.onStart()
        if (cameraHelper == null) {
            cameraHelper = CameraHelper().apply { setStateCallback(stateListener) }
        }
    }

    override fun onStop() {
        super.onStop()
        cameraHelper?.release()
        cameraHelper = null
    }

    override fun onDestroy() {
        super.onDestroy()
        capturedFiles.forEach { runCatching { it.delete() } }
    }

    private val stateListener = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            cameraHelper?.selectDevice(device)
        }
        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            cameraHelper?.openCamera()
        }
        override fun onCameraOpen(device: UsbDevice) {
            cameraHelper?.startPreview()
            if (surfaceReady) cameraHelper?.addSurface(surfaceView.holder.surface, false)
        }
        override fun onCameraClose(device: UsbDevice) {
            cameraHelper?.removeSurface(surfaceView.holder.surface)
        }
        override fun onDeviceClose(device: UsbDevice) {}
        override fun onDetach(device: UsbDevice) {}
        override fun onCancel(device: UsbDevice) {}
    }

    private fun captureImage() {
        val helper = cameraHelper
        if (helper == null || !helper.isCameraOpened) {
            Toast.makeText(this, "Câmera USB não conectada", Toast.LENGTH_SHORT).show()
            return
        }
        val file = File(cacheDir, "intraoral_${System.currentTimeMillis()}_${capturedFiles.size}.jpg")
        val options = IImageCapture.OutputFileOptions.Builder(file).build()
        helper.takePicture(options, object : IImageCapture.OnImageCaptureCallback {
            override fun onImageSaved(result: IImageCapture.OutputFileResults) {
                runOnUiThread { addCapturedPhoto(file) }
            }
            override fun onError(code: Int, message: String, cause: Throwable?) {
                runOnUiThread {
                    Toast.makeText(this@UsbCameraActivity, message, Toast.LENGTH_LONG).show()
                }
            }
        })
    }

    private fun addCapturedPhoto(file: File) {
        capturedFiles.add(file)

        val item = LayoutInflater.from(this)
            .inflate(R.layout.item_thumbnail, thumbsContainer, false)
        val img = item.findViewById<ImageView>(R.id.thumbImage)
        val remove = item.findViewById<ImageButton>(R.id.btnRemove)

        val opts = BitmapFactory.Options().apply { inSampleSize = 4 }
        val bmp = BitmapFactory.decodeFile(file.absolutePath, opts)
        img.setImageBitmap(bmp)

        remove.setOnClickListener {
            val index = capturedFiles.indexOf(file)
            if (index >= 0) {
                capturedFiles.removeAt(index)
                runCatching { file.delete() }
                thumbsContainer.removeView(item)
                refreshSidePanel()
            }
        }

        thumbsContainer.addView(item, 0)
        refreshSidePanel()
    }

    private fun refreshSidePanel() {
        val n = capturedFiles.size
        sidePanel.visibility = if (n > 0) View.VISIBLE else View.GONE
        btnSave.visibility = if (n > 0) View.VISIBLE else View.GONE
        sideTitle.text = "Fotos Capturadas ($n)"
    }

    private fun onSave() {
        if (capturedFiles.isEmpty()) {
            setResult(Activity.RESULT_CANCELED)
            finish()
            return
        }
        val paths = capturedFiles.map { it.absolutePath }.toTypedArray()
        val data = Intent().apply { putExtra(EXTRA_IMAGE_PATHS, paths) }
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    private fun onCancel() {
        capturedFiles.forEach { runCatching { it.delete() } }
        capturedFiles.clear()
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        onCancel()
    }

    companion object {
        const val EXTRA_IMAGE_PATHS = "image_paths"
        const val REQUEST_CODE = 4242
    }
}
