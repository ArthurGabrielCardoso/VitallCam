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
import android.annotation.SuppressLint
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.ImageReader
import android.os.Build
import android.os.HandlerThread
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.KeyEvent
import android.view.MotionEvent
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
    // Log de diagnóstico (enviado pro /api/debug-log; não renderizado)
    @Volatile private var debugLog = ""

    // Surface attach state
    private val surfaceViewRef = mutableStateOf<AspectRatioSurfaceView?>(null)
    private var surfaceReady = false
    private var openWatchdog: Runnable? = null
    private var openRetries = 0

    // ===== Camera2 (HAL/V4L2) — caminho que NÃO precisa de permissão USB =====
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var cameraBgThread: HandlerThread? = null
    private var cameraBgHandler: Handler? = null
    private var photoSize: android.util.Size? = null
    private var previewSize: android.util.Size? = null
    private var lastPedalCaptureMs = 0L

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
                    onModeChange = { newMode ->
                        if (newMode != captureMode) {
                            captureMode = newMode
                            applyResolutionForMode()
                        }
                    },
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
        dbg("onStart — abrindo via Camera2 (HAL, sem permissão USB)")
        dumpCamera2Info()
        dumpUsbInfo()
        startCameraBg()
        if (checkSelfPermission(android.Manifest.permission.CAMERA) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) {
            dbg("permissão CAMERA não concedida — solicitando")
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 7777)
        } else {
            openCamera2()
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7777) {
            if (grantResults.isNotEmpty() &&
                grantResults[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
                dbg("permissão CAMERA concedida — abrindo Camera2")
                openCamera2()
            } else {
                dbg("permissão CAMERA NEGADA")
                previewState = PreviewState.Error("Permissão de câmera negada — autorize nas configurações")
            }
        }
    }

    override fun onStop() {
        super.onStop()
        closeCamera2()
        stopCameraBg()
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

    // Diagnóstico: acumula cada passo, loga no logcat e ENVIA automaticamente
    // pro endpoint /api/debug-log (eu leio daqui). Debounce de 2.5s pra bater
    // a sequência inteira de uma vez.
    private val uploadDebugRunnable = Runnable { uploadDebug() }
    private fun dbg(msg: String) {
        android.util.Log.d("VitallCamUVC", msg)
        val t = android.text.format.DateFormat.format("HH:mm:ss", System.currentTimeMillis())
        debugLog = (debugLog + "[$t] $msg\n").takeLast(8000)
        mainHandler.removeCallbacks(uploadDebugRunnable)
        mainHandler.postDelayed(uploadDebugRunnable, 2500)
    }

    private fun uploadDebug() {
        val payload = debugLog
        Thread {
            runCatching {
                val url = java.net.URL("https://vitallcam.vercel.app/api/debug-log")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.setRequestProperty("Content-Type", "text/plain; charset=utf-8")
                conn.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                val code = conn.responseCode
                conn.disconnect()
                runOnUiThread {
                    android.widget.Toast.makeText(this, "Diagnóstico enviado (HTTP $code)", android.widget.Toast.LENGTH_SHORT).show()
                }
            }.onFailure {
                runOnUiThread {
                    android.widget.Toast.makeText(this, "Falha ao enviar diagnóstico: ${it.message}", android.widget.Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    // Captura TUDO do USB sem precisar de permissão: ambiente + descritores,
    // interfaces e endpoints (tipo ISÓCRONO = vídeo UVC). É o que diz se esse
    // box consegue streamar a câmera.
    private fun dumpUsbInfo() {
        dbg("=== AMBIENTE: ${Build.MANUFACTURER} ${Build.MODEL} / Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) ===")
        dbg("usb.host feature = ${packageManager.hasSystemFeature("android.hardware.usb.host")}")
        val um = getSystemService(Context.USB_SERVICE) as? UsbManager
        val list = um?.deviceList?.values?.toList().orEmpty()
        dbg("UsbManager: ${list.size} device(s)")
        list.forEach { d ->
            dbg("DEV vid=${d.vendorId} pid=${d.productId} cls=${d.deviceClass}/${d.deviceSubclass} '${runCatching { d.manufacturerName }.getOrNull() ?: "?"}' '${runCatching { d.productName }.getOrNull() ?: d.deviceName}' perm=${um?.hasPermission(d)} ifaces=${d.interfaceCount}")
            for (i in 0 until d.interfaceCount) {
                val itf = d.getInterface(i)
                dbg("  IF$i cls=${itf.interfaceClass} sub=${itf.interfaceSubclass} eps=${itf.endpointCount}")
                for (e in 0 until itf.endpointCount) {
                    val ep = itf.getEndpoint(e)
                    val type = when (ep.type) { 0 -> "CTRL"; 1 -> "ISO"; 2 -> "BULK"; 3 -> "INT"; else -> "?" }
                    val dir = if (ep.direction == 128) "IN" else "OUT"
                    dbg("    EP $type $dir maxPkt=${ep.maxPacketSize} attr=${ep.attributes}")
                }
            }
        }
    }

    private val stateListener = object : ICameraHelper.StateCallback {
        override fun onAttach(device: UsbDevice) {
            dbg("onAttach (device detectado)")
            connectedDevice = device
            cameraHelper?.selectDevice(device)
            previewState = PreviewState.Connecting
        }

        override fun onDeviceOpen(device: UsbDevice, isFirstOpen: Boolean) {
            dbg("onDeviceOpen (permissão ok) → openCamera")
            cameraHelper?.openCamera()
        }

        override fun onCameraOpen(device: UsbDevice) {
            dbg("onCameraOpen (câmera abriu!)")
            cancelOpenWatchdog()
            openRetries = 0
            applyResolutionForMode()
            cameraHelper?.startPreview()
            attachSurface()
            // Re-attach 200ms depois (race contra surface destruction)
            mainHandler.postDelayed({ attachSurface() }, 200)
            previewState = PreviewState.Ready
        }

        override fun onCameraClose(device: UsbDevice) {
            dbg("onCameraClose")
            surfaceViewRef.value?.let { sv ->
                runCatching { cameraHelper?.removeSurface(sv.holder.surface) }
            }
        }

        override fun onDeviceClose(device: UsbDevice) {
            dbg("onDeviceClose")
        }

        override fun onDetach(device: UsbDevice) {
            dbg("onDetach (device removido)")
            previewState = PreviewState.Lost
        }

        override fun onCancel(device: UsbDevice) {
            dbg("onCancel (permissão USB negada/auto-cancelada pelo sistema)")
            previewState = PreviewState.Error(
                "A TV box bloqueou a permissão USB.\n\n" +
                    "Solução: desconecte e reconecte o cabo da câmera, e quando o " +
                    "Android perguntar, toque em \"Abrir VitallCam\" e marque " +
                    "\"Usar por padrão para este dispositivo USB\".",
            )
        }
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

    // Enumera as câmeras via Camera2 (HAL/V4L2) — caminho que NÃO precisa de
    // permissão USB. Lista os tamanhos JPEG que a câmera externa oferece; se
    // tiver 2592x1944, dá pra capturar 5MP por aqui (FOV cheio) sem a permissão
    // USB que o box bloqueia.
    private fun dumpCamera2Info() {
        runCatching {
            val cm = getSystemService(Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            val ids = cm.cameraIdList
            dbg("=== CAMERA2: ${ids.size} camera(s) ===")
            for (id in ids) {
                val ch = cm.getCameraCharacteristics(id)
                val facing = ch.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING)
                val facingStr = when (facing) { 0 -> "FRONT"; 1 -> "BACK"; 2 -> "EXTERNAL"; else -> "?" }
                val map = ch.get(android.hardware.camera2.CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
                val jpeg = map?.getOutputSizes(android.graphics.ImageFormat.JPEG)
                    ?.sortedByDescending { it.width * it.height }
                    ?.joinToString(",") { "${it.width}x${it.height}" }
                val yuv = map?.getOutputSizes(android.graphics.ImageFormat.YUV_420_888)
                    ?.sortedByDescending { it.width * it.height }
                    ?.take(3)?.joinToString(",") { "${it.width}x${it.height}" }
                dbg("CAM id=$id facing=$facingStr JPEG=[$jpeg] YUVtop=[$yuv]")
            }
        }.onFailure { dbg("Camera2 erro: ${it.message}") }
    }

    // ---------- Motor Camera2 (HAL) — preview + foto 5MP sem permissão USB ----------

    private fun startCameraBg() {
        if (cameraBgThread != null) return
        cameraBgThread = HandlerThread("cam2").also { it.start() }
        cameraBgHandler = Handler(cameraBgThread!!.looper)
    }

    private fun stopCameraBg() {
        cameraBgThread?.quitSafely()
        runCatching { cameraBgThread?.join() }
        cameraBgThread = null
        cameraBgHandler = null
    }

    @SuppressLint("MissingPermission")
    private fun openCamera2() {
        if (cameraDevice != null) { dbg("openCamera2: já aberta"); return }
        val cm = getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: run {
            previewState = PreviewState.Error("Sem CameraManager"); return
        }
        val id = runCatching {
            cm.cameraIdList.firstOrNull {
                cm.getCameraCharacteristics(it).get(CameraCharacteristics.LENS_FACING) ==
                    CameraCharacteristics.LENS_FACING_EXTERNAL
            } ?: cm.cameraIdList.firstOrNull()
        }.getOrNull()
        if (id == null) {
            dbg("Camera2: nenhuma câmera no cameraIdList")
            previewState = PreviewState.Error("Câmera não encontrada"); return
        }
        val chars = cm.getCameraCharacteristics(id)
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val jpegSizes = map?.getOutputSizes(ImageFormat.JPEG)?.toList().orEmpty()
        // Capturar em alta resolução (2048/2592) derruba o HAL externo desse box
        // (onError 4 — ele só sustenta resolução baixa, igual o preview). Captura
        // no MAIOR 4:3 até 1024 de largura (1024x768) = MESMO FOV, mesma banda do
        // preview, sem trocar o modo da câmera → estável.
        photoSize = jpegSizes
            .filter { it.width <= 1024 && kotlin.math.abs(it.width.toFloat() / it.height - 4f / 3f) < 0.05f }
            .maxByOrNull { it.width.toLong() * it.height }
            ?: jpegSizes.filter { it.width <= 1024 }.maxByOrNull { it.width.toLong() * it.height }
            ?: jpegSizes.minByOrNull { it.width.toLong() * it.height }
            ?: android.util.Size(1024, 768)
        // Preview: maior 4:3 disponível pro SurfaceView (mesmo FOV da foto 4:3)
        val surfSizes = map?.getOutputSizes(SurfaceHolder::class.java)?.toList().orEmpty()
        previewSize = surfSizes.filter { kotlin.math.abs(it.width.toFloat() / it.height - 4f / 3f) < 0.05f }
            .maxByOrNull { it.width.toLong() * it.height }
            ?: surfSizes.maxByOrNull { it.width.toLong() * it.height }
            ?: android.util.Size(1024, 768)
        dbg("Camera2 abrindo id=$id foto=$photoSize preview=$previewSize")
        runCatching { imageReader?.close() }
        imageReader = ImageReader.newInstance(photoSize!!.width, photoSize!!.height, ImageFormat.JPEG, 2).apply {
            setOnImageAvailableListener({ r -> onJpegAvailable(r) }, cameraBgHandler)
        }
        runCatching {
            cm.openCamera(id, object : CameraDevice.StateCallback() {
                override fun onOpened(device: CameraDevice) {
                    dbg("Camera2 onOpened ✓")
                    cameraDevice = device
                    createSessionIfReady()
                }
                override fun onDisconnected(device: CameraDevice) {
                    dbg("Camera2 onDisconnected")
                    device.close()
                    if (cameraDevice == device) cameraDevice = null
                    runOnUiThread { previewState = PreviewState.Lost }
                }
                override fun onError(device: CameraDevice, error: Int) {
                    dbg("Camera2 onError code=$error")
                    device.close()
                    if (cameraDevice == device) cameraDevice = null
                    runOnUiThread { previewState = PreviewState.Error("Camera2 erro $error") }
                }
            }, cameraBgHandler)
        }.onFailure {
            dbg("openCamera2 EXCEÇÃO: ${it.message}")
            runOnUiThread { previewState = PreviewState.Error("Falha ao abrir: ${it.message}") }
        }
    }

    private fun createSessionIfReady() {
        val device = cameraDevice ?: return
        val reader = imageReader ?: return
        val sv = surfaceViewRef.value ?: return
        if (!surfaceReady) return
        if (captureSession != null) return
        val ps = previewSize ?: return
        runOnUiThread {
            runCatching {
                sv.holder.setFixedSize(ps.width, ps.height)
                sv.setAspectRatio(ps.width, ps.height)
            }
            val previewSurface = sv.holder.surface
            runCatching {
                val req = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                    addTarget(previewSurface)
                }
                @Suppress("DEPRECATION")
                device.createCaptureSession(
                    listOf(previewSurface, reader.surface),
                    object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(session: CameraCaptureSession) {
                            captureSession = session
                            runCatching { session.setRepeatingRequest(req.build(), null, cameraBgHandler) }
                            runOnUiThread { previewState = PreviewState.Ready }
                            dbg("Camera2 preview ON (Ready) ✓")
                        }
                        override fun onConfigureFailed(session: CameraCaptureSession) {
                            dbg("Camera2 createCaptureSession FALHOU")
                            runOnUiThread { previewState = PreviewState.Error("Falha na sessão da câmera") }
                        }
                    },
                    cameraBgHandler,
                )
            }.onFailure { dbg("createSession EXCEÇÃO: ${it.message}") }
        }
    }

    private fun onJpegAvailable(reader: ImageReader) {
        val image = runCatching { reader.acquireNextImage() }.getOrNull() ?: return
        runCatching {
            val buf = image.planes[0].buffer
            val bytes = ByteArray(buf.remaining())
            buf.get(bytes)
            val file = File(File(cacheDir, "captures").apply { mkdirs() }, "intraoral_${System.currentTimeMillis()}_${captured.size}.jpg")
            file.writeBytes(bytes)
            dbg("foto salva ${file.name} (${bytes.size / 1024}KB)")
            runOnUiThread { captured.add(0, CapturedItem.Photo(file)) }
        }.onFailure { dbg("salvar JPEG ERRO: ${it.message}") }
        runCatching { image.close() }
    }

    private fun closeCamera2() {
        runCatching { captureSession?.close() }
        captureSession = null
        runCatching { cameraDevice?.close() }
        cameraDevice = null
        runCatching { imageReader?.close() }
        imageReader = null
    }

    // ---------- (LEGADO UVC — inerte; mantido só pra compilar) ----------

    private fun initHelperAndOpen() {
        dbg("initHelperAndOpen")
        dumpCamera2Info()
        dumpUsbInfo()
        if (cameraHelper != null) tearDownHelper()
        cameraHelper = CameraHelper().apply { setStateCallback(stateListener) }
        // A câmera costuma já estar plugada ANTES do app abrir. Nesse caso o
        // onAttach do monitor interno da lib frequentemente NÃO dispara pra um
        // device já presente — e fica eternamente "Conectando". Por isso
        // enumeramos manualmente o USB e chamamos selectDevice. Delay pequeno
        // pra dar tempo do monitor da lib registrar.
        mainHandler.postDelayed({ trySelectConnectedDevice() }, 600)
        scheduleOpenWatchdog()
    }

    // Seleciona a câmera já conectada usando a lista da PRÓPRIA lib
    // (helper.getDeviceList) — são os devices que o monitor interno dela
    // reconhece, o que selectDevice espera pra disparar o fluxo de permissão
    // corretamente. (Antes usávamos UsbManager do Android, que não casava com
    // o fluxo interno da lib.) Toast pra diagnóstico visível na TV box.
    private fun trySelectConnectedDevice() {
        val helper = cameraHelper ?: run { dbg("trySelect: helper null"); return }
        if (helper.isCameraOpened) { dbg("trySelect: já aberta"); return }
        val libList = runCatching { helper.deviceList }.getOrNull().orEmpty()
        val usbMgr = getSystemService(Context.USB_SERVICE) as? UsbManager
        val androidCount = usbMgr?.deviceList?.size ?: -1
        dbg("getDeviceList(lib)=${libList.size} | UsbManager(android)=$androidCount")
        // Loga o que o Android enxerga (mesmo que a lib não filtre como UVC)
        usbMgr?.deviceList?.values?.forEach {
            dbg("  android dev: vid=${it.vendorId} pid=${it.productId} cls=${it.deviceClass} ${it.productName ?: it.deviceName}")
        }
        val cam = libList.firstOrNull()
        if (cam == null) { dbg("lib não retornou device — selectDevice não chamado"); return }
        dbg("device escolhido: vid=${cam.vendorId} pid=${cam.productId} ${cam.productName ?: cam.deviceName}")
        connectedDevice = cam
        dbg("chamando selectDevice…")
        runCatching { helper.selectDevice(cam) }.onFailure { dbg("selectDevice ERRO: ${it.message}") }
    }

    private fun scheduleOpenWatchdog() {
        cancelOpenWatchdog()
        openWatchdog = Runnable {
            val helper = cameraHelper ?: return@Runnable
            if (!helper.isCameraOpened && openRetries < 3) {
                openRetries++
                // NÃO destrói o helper aqui — isso cancelaria o diálogo de
                // permissão USB que pode estar aberto, criando o loop de
                // "conecta/desconecta". Só tenta selecionar de novo.
                trySelectConnectedDevice()
                scheduleOpenWatchdog()
            }
        }
        // 12s (era 5s): dá tempo do usuário aceitar a permissão USB e da
        // câmera negociar o stream UVC num box lento, sem ser interrompido.
        mainHandler.postDelayed(openWatchdog!!, 12000)
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
        createSessionIfReady()
    }

    fun onSurfaceDestroyed() {
        surfaceReady = false
        runCatching { captureSession?.close() }
        captureSession = null
    }

    private fun captureImage() {
        val device = cameraDevice ?: run { dbg("captureImage: câmera não aberta"); return }
        val session = captureSession ?: run { dbg("captureImage: sem sessão"); return }
        val reader = imageReader ?: return
        runCatching {
            // TEMPLATE_PREVIEW (não STILL_CAPTURE): o HAL externo não suporta a
            // sequência de pré-captura/AE do still e dá erro fatal.
            val req = device.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                addTarget(reader.surface)
                set(CaptureRequest.JPEG_ORIENTATION, 0)
            }
            session.capture(req.build(), object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureFailed(
                    s: CameraCaptureSession,
                    r: CaptureRequest,
                    failure: android.hardware.camera2.CaptureFailure,
                ) {
                    dbg("captura FALHOU reason=${failure.reason}")
                }
            }, cameraBgHandler)
        }.onFailure { dbg("captureImage ERRO: ${it.message}") }
    }

    // Pedal/mouse: botão do meio (scroll) tira UMA foto. O pedal manda vários
    // cliques por pisada, então o debounce de 1.2s garante 1 foto por pisada.
    private fun triggerPedalCapture() {
        val now = System.currentTimeMillis()
        if (now - lastPedalCaptureMs < 1200) return
        lastPedalCaptureMs = now
        captureImage()
    }

    // O pedal varia: pode emular clique do mouse (meio/direito) OU mandar uma
    // tecla (Enter/Espaço/OK). Aceitamos todos esses. NÃO usamos o clique
    // esquerdo (PRIMARY) pra não disparar ao tocar nos botões da tela.
    private fun isPedalButton(buttonState: Int): Boolean {
        return (buttonState and MotionEvent.BUTTON_TERTIARY) != 0 ||
            (buttonState and MotionEvent.BUTTON_SECONDARY) != 0 ||
            (buttonState and MotionEvent.BUTTON_STYLUS_PRIMARY) != 0
    }

    private fun handlePedalMotion(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_BUTTON_PRESS) {
            // Loga o sinal exato do pedal pra eu identificar (sobe pro debug-log)
            dbg("PEDAL? motion btnState=${event.buttonState} src=${event.source} dev='${event.device?.name ?: "?"}'")
            if (isPedalButton(event.buttonState)) {
                triggerPedalCapture()
                return true
            }
        }
        return false
    }

    override fun dispatchGenericMotionEvent(event: MotionEvent): Boolean {
        if (handlePedalMotion(event)) return true
        return super.dispatchGenericMotionEvent(event)
    }

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (handlePedalMotion(event)) return true
        return super.onGenericMotionEvent(event)
    }

    // Pedal que emula teclado (Enter/Espaço/OK) — comum em pedais USB.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            dbg("PEDAL? key code=${event.keyCode} scan=${event.scanCode} src=${event.source} dev='${event.device?.name ?: "?"}'")
            when (event.keyCode) {
                KeyEvent.KEYCODE_ENTER,
                KeyEvent.KEYCODE_NUMPAD_ENTER,
                KeyEvent.KEYCODE_DPAD_CENTER,
                KeyEvent.KEYCODE_SPACE -> {
                    triggerPedalCapture()
                    return true
                }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    private fun startRecording() {
        // Vídeo via Camera2 será adicionado depois; foco agora é foto 5MP.
        runOnUiThread {
            android.widget.Toast.makeText(this, "Vídeo em breve — use o modo Foto", android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    @Suppress("unused")
    private fun startRecordingLegacy() {
        val helper = cameraHelper
        if (helper == null || !helper.isCameraOpened || recordingFile != null) return
        val file = File(File(cacheDir, "captures").apply { mkdirs() }, "intraoral_${System.currentTimeMillis()}_${captured.size}.mp4")
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
                        if (saved != null) {
                            // Renomeia o arquivo embutindo a duração no nome
                            // (web extrai pra alimentar uploadVideoItem.duration).
                            // Formato: <basename>_d<segundos>.mp4
                            val parent = saved.parentFile
                            val base = saved.nameWithoutExtension
                            val renamed = File(parent, "${base}_d${dur}.mp4")
                            val finalFile = if (saved.renameTo(renamed)) renamed else saved
                            captured.add(0, CapturedItem.Video(finalFile, dur))
                        }
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

    /**
     * Resolução escolhida varia por modo:
     *  - PHOTO: 5MP nativo do sensor (FOV total)
     *  - VIDEO: 1280×720 / 1024×768 — encoder H.264 da lib não tem
     *    setBitRate exposto, e a 5MP gera arquivos enormes que estouram
     *    o limite do bucket no Supabase + ficam impossíveis de decodificar
     *    no WebView (preview preto).
     */
    private fun applyResolutionForMode() {
        val helper = cameraHelper ?: return
        val supported = runCatching { helper.supportedSizeList }.getOrNull() ?: return
        val chosen = if (captureMode == CaptureMode.PHOTO) {
            supported.firstOrNull { it.width == 2592 && it.height == 1944 }
                ?: supported.firstOrNull { it.width == 2048 && it.height == 1536 }
                ?: supported.firstOrNull { it.width == 1024 && it.height == 768 }
                ?: supported.firstOrNull { it.width == 640 && it.height == 480 }
                ?: supported.maxByOrNull { it.width * it.height }
        } else {
            // Vídeo — prioriza 4:3 nativo do sensor pra manter o MESMO FOV
            // da foto (16:9 corta vertical). Resolução baixa pra caber no
            // bucket Supabase e ser decodificável pelo WebView.
            supported.firstOrNull { it.width == 1024 && it.height == 768 }
                ?: supported.firstOrNull { it.width == 800 && it.height == 600 }
                ?: supported.firstOrNull { it.width == 640 && it.height == 480 }
                ?: supported.firstOrNull { it.width == 1280 && it.height == 720 }
                ?: supported.minByOrNull { it.width * it.height }
        } ?: return
        val current = runCatching { helper.previewSize }.getOrNull()
        if (chosen == current) {
            runOnUiThread {
                runCatching { surfaceViewRef.value?.setAspectRatio(chosen.width, chosen.height) }
            }
            return
        }
        // Câmera já rodando — precisa reabrir pra trocar de resolução
        if (helper.isCameraOpened) {
            changeResolution(chosen.width, chosen.height)
        } else {
            runCatching { helper.previewSize = chosen }
            runOnUiThread {
                runCatching { surfaceViewRef.value?.setAspectRatio(chosen.width, chosen.height) }
            }
        }
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
        closeCamera2()
        startCameraBg()
        mainHandler.postDelayed({ openCamera2() }, 500)
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
