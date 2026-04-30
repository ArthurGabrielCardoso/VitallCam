package com.vitallcam.android

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.View
import android.webkit.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.vitallcam.android.databinding.ActivityMainBinding
import java.io.ByteArrayOutputStream

private const val TAG = "VitallCam"

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var wsServer: FrameWebSocketServer
    private lateinit var cameraManager: UsbCameraManager
    private lateinit var bridge: WebAppInterface

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        if (granted.values.all { it }) initWebView()
        else Log.w(TAG, "Permissões negadas")
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        wsServer = FrameWebSocketServer(port = 8766)
        wsServer.start()

        cameraManager = UsbCameraManager(
            context = this,
            wsServer = wsServer,
            onCameraOpened = ::showCameraUI,
            onCameraClosed = ::hideCameraUI,
        )
        cameraManager.attach(binding.cameraPreview)

        binding.btnCapture.setOnClickListener { bridge.capturePhoto() }
        binding.btnClose.setOnClickListener { cameraManager.closeCamera() }

        checkPermissionsAndInit()
    }

    private fun checkPermissionsAndInit() {
        val needed = arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) initWebView() else permissionLauncher.launch(missing.toTypedArray())
    }

    private fun initWebView() {
        val webView = binding.webView

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = userAgentString + " VitallCamAndroid/1.0"
        }

        bridge = WebAppInterface(webView, cameraManager)
        webView.addJavascriptInterface(bridge, "VitallCamBridge")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                // Permite acesso à câmera embutida pelo web app
                request.grant(request.resources)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                injectCameraBridgeScript(view)
            }
        }

        val appUrl = getString(R.string.app_url)
        webView.loadUrl(appUrl)
    }

    /**
     * Injeta JavaScript que:
     * 1. Detecta se a câmera USB está ativa (via VitallCamBridge.hasUsbCamera)
     * 2. Sobrescreve getUserMedia para usar frames do WebSocket quando USB ativa
     * 3. Expõe window.onUsbPhotoCapture para receber fotos capturadas
     */
    private fun injectCameraBridgeScript(webView: WebView) {
        val js = """
(function() {
  if (window.__vitallcamInjected) return;
  window.__vitallcamInjected = true;

  var WS_URL = 'ws://localhost:8766';
  var wsStream = null;
  var activeCanvas = null;
  var activeCtx = null;

  function startUsbStream(canvas, ctx) {
    if (wsStream && wsStream.readyState === WebSocket.OPEN) return;
    wsStream = new WebSocket(WS_URL);
    wsStream.binaryType = 'arraybuffer';
    wsStream.onmessage = function(ev) {
      var blob = new Blob([ev.data], { type: 'image/jpeg' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function() {
        if (activeCtx && activeCanvas) {
          activeCtx.drawImage(img, 0, 0, activeCanvas.width, activeCanvas.height);
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };
  }

  function stopUsbStream() {
    if (wsStream) { wsStream.close(); wsStream = null; }
  }

  // Guarda o getUserMedia original
  var origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = function(constraints) {
    var hasUsb = false;
    try { hasUsb = window.VitallCamBridge && window.VitallCamBridge.hasUsbCamera(); } catch(e) {}

    if (constraints && constraints.video && hasUsb) {
      return new Promise(function(resolve) {
        var canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        activeCanvas = canvas;
        activeCtx = canvas.getContext('2d');
        // Fundo preto até chegar o primeiro frame
        activeCtx.fillStyle = '#000';
        activeCtx.fillRect(0, 0, 1280, 720);

        startUsbStream(canvas, activeCtx);

        var stream = canvas.captureStream(30);
        resolve(stream);
      });
    }
    return origGetUserMedia(constraints);
  };

  // Receber foto capturada pelo botão nativo
  window.onUsbPhotoCapture = function(base64) {
    var dataUrl = 'data:image/jpeg;base64,' + base64;
    // Dispara evento customizado para o app web capturar
    var ev = new CustomEvent('vitallcam-usb-capture', { detail: { dataUrl: dataUrl } });
    document.dispatchEvent(ev);
  };

  console.log('[VitallCam] Bridge USB injetada com sucesso');
})();
        """.trimIndent()

        webView.evaluateJavascript(js, null)
    }

    private fun showCameraUI() {
        runOnUiThread {
            binding.cameraPreview.visibility = View.VISIBLE
            binding.usbCameraControls.visibility = View.VISIBLE
        }
    }

    private fun hideCameraUI() {
        runOnUiThread {
            binding.cameraPreview.visibility = View.GONE
            binding.usbCameraControls.visibility = View.GONE
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        cameraManager.closeCamera()
        try { wsServer.stop() } catch (_: Exception) {}
    }
}
