package com.vitallcam

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
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
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.Icon
import androidx.compose.material.LocalContentColor
import androidx.compose.material.Slider
import androidx.compose.material.SliderDefaults
import androidx.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Search
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.herohan.uvcapp.CameraHelper
import com.herohan.uvcapp.ICameraHelper
import com.herohan.uvcapp.IImageCapture
import com.herohan.uvcapp.VideoCapture
import com.serenegiant.usb.Size
import com.serenegiant.widget.AspectRatioSurfaceView
import com.vitallcam.ui.theme.*
import kotlinx.coroutines.delay
import java.io.File

/**
 * Tela nativa de captura intraoral — espelha o design React do CameraCapture.tsx
 * pixel-a-pixel mas sem WebView. Resolve definitivamente os problemas de
 * z-order/punch-through/portal que existiam no fluxo via WebView.
 *
 * Bridge: web chama window.VitallCam.openIntraoralCamera(callback) → essa
 * Activity abre, captura fotos/vídeos, retorna array de dataURLs no callback.
 */
class IntraoralCaptureActivity : ComponentActivity() {

    private var cameraHelper: ICameraHelper? = null
    private var connectedDevice: UsbDevice? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val captured = mutableStateListOf<CapturedItem>()
    private var previewState by mutableStateOf<PreviewState>(PreviewState.Connecting)
    private var isMirrored by mutableStateOf(false)
    private var captureMode by mutableStateOf(CaptureMode.PHOTO)
    private var isRecording by mutableStateOf(false)
    private var recordingSeconds by mutableStateOf(0)
    private var capabilities by mutableStateOf<CameraCapabilities?>(null)
    private var recordingFile: File? = null

    // Surface attach state
    private val surfaceViewRef = mutableStateOf<AspectRatioSurfaceView?>(null)
    private var surfaceReady = false
    private var openWatchdog: Runnable? = null
    private var openRetries = 0

    sealed class PreviewState {
        object Connecting : PreviewState()
        object Ready : PreviewState()
        object Lost : PreviewState()
        data class Error(val message: String) : PreviewState()
    }

    enum class CaptureMode { PHOTO, VIDEO }

    sealed class CapturedItem {
        data class Photo(val file: File) : CapturedItem()
        data class Video(val file: File, val durationSeconds: Int) : CapturedItem()
    }

    data class CameraCapabilities(
        val deviceVid: String?,
        val devicePid: String?,
        val deviceName: String?,
        val currentSize: Size?,
        val supportedSizes: List<Size>,
        val supportedFormats: List<String>,
        val zoomEnabled: Boolean,
        val zoomMin: Int?,
        val zoomMax: Int?,
        val zoomCurrent: Int?,
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Tela imersiva — esconde status bar / nav bar pra parecer fullscreen igual web
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
        )

        setContent {
            VitallCamTheme {
                CaptureScreen(
                    captured = captured,
                    previewState = previewState,
                    isMirrored = isMirrored,
                    captureMode = captureMode,
                    isRecording = isRecording,
                    recordingSeconds = recordingSeconds,
                    capabilities = capabilities,
                    onSurfaceReady = { surfaceView ->
                        surfaceViewRef.value = surfaceView
                    },
                    onClose = ::onCancel,
                    onSave = ::onSave,
                    onMirrorToggle = { isMirrored = !isMirrored },
                    onModeChange = { captureMode = it },
                    onCapture = ::captureImage,
                    onStartRecording = ::startRecording,
                    onStopRecording = ::stopRecording,
                    onRequestCapabilities = ::loadCapabilities,
                    onSelectResolution = ::changeResolution,
                    onReconnect = ::reconnect,
                    onRemoveItem = { idx -> if (idx in captured.indices) captured.removeAt(idx) },
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        if (cameraHelper == null) {
            initHelperAndOpen()
            registerUsbReceiver()
        }
    }

    override fun onStop() {
        super.onStop()
        unregisterUsbReceiver()
        tearDownHelper()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Limpa arquivos de captura caso usuário tenha matado a Activity sem salvar
        captured.forEach {
            when (it) {
                is CapturedItem.Photo -> runCatching { it.file.delete() }
                is CapturedItem.Video -> runCatching { it.file.delete() }
            }
        }
        captured.clear()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        onCancel()
    }

    // ---------- Lógica da câmera ----------

    private val stateListener = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            connectedDevice = device
            cameraHelper?.selectDevice(device)
            previewState = PreviewState.Connecting
        }

        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            cameraHelper?.openCamera()
        }

        override fun onCameraOpen(device: UsbDevice) {
            cancelOpenWatchdog()
            openRetries = 0
            // Forçar resolução conhecida (evita negociação inválida → preto)
            runCatching {
                val helper = cameraHelper ?: return@runCatching
                val supported = helper.supportedSizeList
                val chosen = supported.firstOrNull { it.width == 1280 && it.height == 720 }
                    ?: supported.firstOrNull { it.width == 640 && it.height == 480 }
                    ?: supported.maxByOrNull { it.width * it.height }
                if (chosen != null) {
                    helper.previewSize = chosen
                    runOnUiThread {
                        runCatching { surfaceViewRef.value?.setAspectRatio(chosen.width, chosen.height) }
                    }
                }
            }
            cameraHelper?.startPreview()
            attachSurface()
            // Re-attach 200ms depois (race contra surface destruction)
            mainHandler.postDelayed({ attachSurface() }, 200)
            previewState = PreviewState.Ready
        }

        override fun onCameraClose(device: UsbDevice) {
            surfaceViewRef.value?.let { sv ->
                runCatching { cameraHelper?.removeSurface(sv.holder.surface) }
            }
        }

        override fun onDeviceClose(device: UsbDevice) {}

        override fun onDetach(device: UsbDevice) {
            previewState = PreviewState.Lost
        }

        override fun onCancel(device: UsbDevice) {}
    }

    private val usbReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            when (intent?.action) {
                UsbManager.ACTION_USB_DEVICE_ATTACHED -> {
                    if (cameraHelper == null) initHelperAndOpen()
                    else if (cameraHelper?.isCameraOpened != true) scheduleOpenWatchdog()
                }
                UsbManager.ACTION_USB_DEVICE_DETACHED -> {
                    previewState = PreviewState.Lost
                }
            }
        }
    }
    private var usbReceiverRegistered = false

    private fun registerUsbReceiver() {
        if (usbReceiverRegistered) return
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

    private fun unregisterUsbReceiver() {
        if (!usbReceiverRegistered) return
        runCatching { unregisterReceiver(usbReceiver) }
        usbReceiverRegistered = false
    }

    private fun initHelperAndOpen() {
        if (cameraHelper != null) tearDownHelper()
        cameraHelper = CameraHelper().apply { setStateCallback(stateListener) }
        scheduleOpenWatchdog()
    }

    private fun scheduleOpenWatchdog() {
        cancelOpenWatchdog()
        openWatchdog = Runnable {
            val helper = cameraHelper ?: return@Runnable
            if (!helper.isCameraOpened && openRetries < 2) {
                openRetries++
                previewState = PreviewState.Error("Tentando reconectar...")
                runCatching { helper.releaseAll() }
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
        val helper = cameraHelper
        if (helper != null) {
            runCatching { if (helper.isRecording) helper.stopRecording() }
            surfaceViewRef.value?.let { sv ->
                runCatching { helper.removeSurface(sv.holder.surface) }
            }
            runCatching { helper.stopPreview() }
            runCatching { helper.closeCamera() }
            runCatching { helper.releaseAll() }
            runCatching { helper.release() }
        }
        cameraHelper = null
        recordingFile = null
    }

    private fun attachSurface() {
        val helper = cameraHelper ?: return
        if (!helper.isCameraOpened) return
        val sv = surfaceViewRef.value ?: return
        if (!surfaceReady) return
        runCatching { helper.addSurface(sv.holder.surface, false) }
    }

    fun onSurfaceCreated() {
        surfaceReady = true
        attachSurface()
    }

    fun onSurfaceDestroyed() {
        surfaceReady = false
        surfaceViewRef.value?.let { sv ->
            runCatching { cameraHelper?.removeSurface(sv.holder.surface) }
        }
    }

    private fun captureImage() {
        val helper = cameraHelper
        if (helper == null || !helper.isCameraOpened) return
        val file = File(cacheDir, "intraoral_${System.currentTimeMillis()}_${captured.size}.jpg")
        val opts = IImageCapture.OutputFileOptions.Builder(file).build()
        helper.takePicture(opts, object : IImageCapture.OnImageCaptureCallback {
            override fun onImageSaved(result: IImageCapture.OutputFileResults) {
                runOnUiThread {
                    captured.add(0, CapturedItem.Photo(file))
                }
            }
            override fun onError(code: Int, message: String, cause: Throwable?) {
                runCatching { file.delete() }
            }
        })
    }

    private fun startRecording() {
        val helper = cameraHelper
        if (helper == null || !helper.isCameraOpened || recordingFile != null) return
        val file = File(cacheDir, "intraoral_${System.currentTimeMillis()}_${captured.size}.mp4")
        recordingFile = file
        val opts = VideoCapture.OutputFileOptions.Builder(file).build()
        runCatching {
            helper.startRecording(opts, object : VideoCapture.OnVideoCaptureCallback {
                override fun onStart() {
                    runOnUiThread {
                        isRecording = true
                        recordingSeconds = 0
                        startRecordingTimer()
                    }
                }
                override fun onVideoSaved(result: VideoCapture.OutputFileResults) {
                    val saved = recordingFile
                    val dur = recordingSeconds
                    recordingFile = null
                    runOnUiThread {
                        isRecording = false
                        stopRecordingTimer()
                        if (saved != null) captured.add(0, CapturedItem.Video(saved, dur))
                    }
                }
                override fun onError(code: Int, message: String, cause: Throwable?) {
                    recordingFile?.let { runCatching { it.delete() } }
                    recordingFile = null
                    runOnUiThread {
                        isRecording = false
                        stopRecordingTimer()
                    }
                }
            })
        }.onFailure {
            recordingFile = null
        }
    }

    private fun stopRecording() {
        runCatching { cameraHelper?.stopRecording() }
    }

    private val recordingTimer = object : Runnable {
        override fun run() {
            if (isRecording) {
                recordingSeconds += 1
                mainHandler.postDelayed(this, 1000)
            }
        }
    }

    private fun startRecordingTimer() {
        mainHandler.postDelayed(recordingTimer, 1000)
    }

    private fun stopRecordingTimer() {
        mainHandler.removeCallbacks(recordingTimer)
    }

    private fun changeResolution(width: Int, height: Int) {
        val helper = cameraHelper ?: return
        val target = runCatching { helper.supportedSizeList }
            .getOrNull()
            ?.firstOrNull { it.width == width && it.height == height } ?: return
        runOnUiThread {
            runCatching {
                if (helper.isCameraOpened) {
                    surfaceViewRef.value?.let { sv ->
                        runCatching { helper.removeSurface(sv.holder.surface) }
                    }
                    runCatching { helper.stopPreview() }
                    runCatching { helper.closeCamera() }
                }
                helper.previewSize = target
                connectedDevice?.let { helper.selectDevice(it) } ?: helper.openCamera(target)
                mainHandler.postDelayed({ loadCapabilities() }, 1500)
            }
        }
    }

    private fun reconnect() {
        previewState = PreviewState.Connecting
        tearDownHelper()
        mainHandler.postDelayed({ initHelperAndOpen() }, 600)
    }

    private fun loadCapabilities() {
        val helper = cameraHelper ?: return
        val dev = connectedDevice
        val cur = runCatching { helper.previewSize }.getOrNull()
        val sizes = runCatching { helper.supportedSizeList?.toList() ?: emptyList() }.getOrDefault(emptyList())
        val formats = runCatching {
            helper.supportedFormatList?.map { it.toString() } ?: emptyList()
        }.getOrDefault(emptyList())
        val uvc = runCatching { helper.uvcControl }.getOrNull()
        val zoomEnabled = runCatching { uvc?.isZoomAbsoluteEnable == true }.getOrDefault(false)
        val zoomLimit = runCatching { uvc?.updateZoomAbsoluteLimit() }.getOrNull()
        val zoomVal = runCatching { uvc?.zoomAbsolute }.getOrNull()
        capabilities = CameraCapabilities(
            deviceVid = dev?.vendorId?.let { String.format("0x%04X", it) },
            devicePid = dev?.productId?.let { String.format("0x%04X", it) },
            deviceName = dev?.let {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) it.productName ?: it.deviceName else it.deviceName
            },
            currentSize = cur,
            supportedSizes = sizes,
            supportedFormats = formats,
            zoomEnabled = zoomEnabled,
            zoomMin = zoomLimit?.getOrNull(0),
            zoomMax = zoomLimit?.getOrNull(1),
            zoomCurrent = zoomVal,
        )
    }

    private fun onSave() {
        if (captured.isEmpty()) {
            setResult(Activity.RESULT_CANCELED)
            finish()
            return
        }
        // Retorna paths dos arquivos pro MainActivity converter em dataURLs e
        // entregar via callback JS (mantém o contrato existente do bridge).
        val paths = captured.map {
            when (it) {
                is CapturedItem.Photo -> it.file.absolutePath
                is CapturedItem.Video -> it.file.absolutePath
            }
        }.toTypedArray()
        val data = Intent().apply { putExtra(EXTRA_IMAGE_PATHS, paths) }
        setResult(Activity.RESULT_OK, data)
        finish()
    }

    private fun onCancel() {
        // Apaga os arquivos não salvos
        captured.forEach {
            when (it) {
                is CapturedItem.Photo -> runCatching { it.file.delete() }
                is CapturedItem.Video -> runCatching { it.file.delete() }
            }
        }
        captured.clear()
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    companion object {
        const val EXTRA_IMAGE_PATHS = "image_paths"
        const val REQUEST_CODE = 4243
    }
}
