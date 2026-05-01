package com.vitallcam

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Base64
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.jiangdg.ausbc.callback.ICaptureCallBack
import java.io.File

class UsbCameraActivity : AppCompatActivity() {

    private lateinit var fragment: UvcCameraFragment
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_usb_camera)

        statusText = findViewById(R.id.statusText)

        fragment = (supportFragmentManager.findFragmentByTag("uvc") as? UvcCameraFragment)
            ?: UvcCameraFragment().also {
                supportFragmentManager.beginTransaction()
                    .replace(R.id.cameraContainer, it, "uvc")
                    .commit()
            }

        findViewById<Button>(R.id.btnCancel).setOnClickListener {
            setResult(Activity.RESULT_CANCELED)
            finish()
        }

        findViewById<Button>(R.id.btnCapture).setOnClickListener {
            statusText.text = "Capturando..."
            fragment.capture(object : ICaptureCallBack {
                override fun onBegin() {}

                override fun onError(error: String?) {
                    runOnUiThread {
                        statusText.text = "Erro: ${error ?: "desconhecido"}"
                        Toast.makeText(
                            this@UsbCameraActivity,
                            "Falha ao capturar. Verifique se a câmera USB está conectada.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }

                override fun onComplete(path: String?) {
                    runOnUiThread {
                        if (path.isNullOrEmpty()) {
                            statusText.text = "Captura sem caminho retornado"
                            return@runOnUiThread
                        }
                        try {
                            val bytes = File(path).readBytes()
                            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                            val data = Intent().apply {
                                putExtra(EXTRA_IMAGE_BASE64, b64)
                                putExtra(EXTRA_IMAGE_PATH, path)
                            }
                            setResult(Activity.RESULT_OK, data)
                            finish()
                        } catch (e: Exception) {
                            statusText.text = "Erro ao ler imagem: ${e.message}"
                        }
                    }
                }
            })
        }
    }

    companion object {
        const val EXTRA_IMAGE_BASE64 = "image_base64"
        const val EXTRA_IMAGE_PATH = "image_path"
        const val REQUEST_CODE = 4242
    }
}
