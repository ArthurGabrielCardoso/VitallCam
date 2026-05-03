package com.vitallcam

import android.graphics.BitmapFactory
import android.graphics.PixelFormat
import android.view.SurfaceHolder
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.CircularProgressIndicator
import androidx.compose.material.Icon
import androidx.compose.material.Slider
import androidx.compose.material.SliderDefaults
import androidx.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Flip
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.serenegiant.usb.Size
import com.serenegiant.widget.AspectRatioSurfaceView
import com.vitallcam.ui.theme.*

@Composable
fun CaptureScreen(
    captured: List<IntraoralCaptureActivity.CapturedItem>,
    previewState: IntraoralCaptureActivity.PreviewState,
    isMirrored: Boolean,
    captureMode: IntraoralCaptureActivity.CaptureMode,
    isRecording: Boolean,
    recordingSeconds: Int,
    capabilities: IntraoralCaptureActivity.CameraCapabilities?,
    onSurfaceReady: (AspectRatioSurfaceView) -> Unit,
    onClose: () -> Unit,
    onSave: () -> Unit,
    onMirrorToggle: () -> Unit,
    onModeChange: (IntraoralCaptureActivity.CaptureMode) -> Unit,
    onCapture: () -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onRequestCapabilities: () -> Unit,
    onSelectResolution: (Int, Int) -> Unit,
    onReconnect: () -> Unit,
    onRemoveItem: (Int) -> Unit,
) {
    var showSettings by remember { mutableStateOf(false) }
    var showDebug by remember { mutableStateOf(false) }
    var showGallery by remember { mutableStateOf(false) }
    var galleryIndex by remember { mutableStateOf(0) }

    Box(
        Modifier
            .fillMaxSize()
            .background(Neutral950),
    ) {
        Row(
            Modifier
                .fillMaxSize()
                .padding(vertical = 24.dp),
            verticalAlignment = Alignment.Top,
        ) {
            // Coluna esquerda — Fechar / Salvar / Thumbnail
            LeftSidebar(
                modifier = Modifier
                    .width(180.dp)
                    .fillMaxHeight(),
                capturedCount = captured.size,
                lastItem = captured.firstOrNull(),
                onClose = onClose,
                onSave = onSave,
                onOpenGallery = {
                    galleryIndex = 0
                    showGallery = true
                },
            )

            // Stage central
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .padding(horizontal = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Stage(
                    isMirrored = isMirrored,
                    isRecording = isRecording,
                    recordingSeconds = recordingSeconds,
                    previewState = previewState,
                    onSurfaceReady = onSurfaceReady,
                )
            }

            // Coluna direita — Odontograma / Capture / Espelhar / Ajustes
            RightSidebar(
                modifier = Modifier
                    .width(180.dp)
                    .fillMaxHeight(),
                isMirrored = isMirrored,
                captureMode = captureMode,
                isRecording = isRecording,
                isReady = previewState is IntraoralCaptureActivity.PreviewState.Ready,
                showSettings = showSettings,
                capabilities = capabilities,
                onMirrorToggle = onMirrorToggle,
                onModeChange = onModeChange,
                onCapture = onCapture,
                onStartRecording = onStartRecording,
                onStopRecording = onStopRecording,
                onToggleSettings = {
                    showSettings = !showSettings
                    if (showSettings) onRequestCapabilities()
                },
                onSelectResolution = onSelectResolution,
                onReconnect = onReconnect,
                onOpenDebug = {
                    onRequestCapabilities()
                    showDebug = true
                    showSettings = false
                },
                onCloseSettings = { showSettings = false },
            )
        }
    }

    // Diálogos
    if (showDebug) {
        DiagnosticDialog(
            capabilities = capabilities,
            onRefresh = onRequestCapabilities,
            onDismiss = { showDebug = false },
        )
    }

    if (showGallery && captured.isNotEmpty()) {
        GalleryDialog(
            items = captured,
            initialIndex = galleryIndex.coerceIn(0, captured.size - 1),
            onRemove = onRemoveItem,
            onDismiss = { showGallery = false },
        )
    }
}

// ---------- Sidebar Esquerda ----------

@Composable
private fun LeftSidebar(
    modifier: Modifier = Modifier,
    capturedCount: Int,
    lastItem: IntraoralCaptureActivity.CapturedItem?,
    onClose: () -> Unit,
    onSave: () -> Unit,
    onOpenGallery: () -> Unit,
) {
    Column(
        modifier.padding(vertical = 8.dp, horizontal = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            // Botão Fechar (X)
            IconLabelButton(
                icon = Icons.Filled.Close,
                label = "Fechar",
                onClick = onClose,
            )

            if (capturedCount > 0) {
                Spacer(Modifier.height(20.dp))
                // Botão Salvar (check verde) com badge de contagem
                IconLabelButton(
                    icon = Icons.Filled.Check,
                    label = "Salvar ($capturedCount)",
                    iconTint = Teal400,
                    labelColor = Teal400,
                    onClick = onSave,
                )
            }
        }

        // Thumbnail da última captura (canto inferior esquerdo)
        if (lastItem != null) {
            ThumbnailButton(item = lastItem, onClick = onOpenGallery)
        } else {
            // Placeholder vazio só pra reservar espaço
            Spacer(Modifier.size(72.dp))
        }
    }
}

@Composable
private fun IconLabelButton(
    icon: ImageVector,
    label: String,
    iconTint: Color = White85,
    labelColor: Color = White85,
    onClick: () -> Unit,
) {
    Column(
        Modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 6.dp, horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(icon, contentDescription = label, tint = iconTint, modifier = Modifier.size(28.dp))
        Text(
            label,
            color = labelColor,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun ThumbnailButton(
    item: IntraoralCaptureActivity.CapturedItem,
    onClick: () -> Unit,
) {
    val file = when (item) {
        is IntraoralCaptureActivity.CapturedItem.Photo -> item.file
        is IntraoralCaptureActivity.CapturedItem.Video -> item.file
    }
    val bitmap by remember(file.absolutePath) {
        derivedStateOf {
            runCatching {
                val opts = BitmapFactory.Options().apply { inSampleSize = 4 }
                BitmapFactory.decodeFile(file.absolutePath, opts)
            }.getOrNull()
        }
    }

    Box(
        Modifier
            .size(width = 100.dp, height = 72.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(Neutral800)
            .border(1.dp, White05, RoundedCornerShape(6.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        bitmap?.let { bmp ->
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
        if (item is IntraoralCaptureActivity.CapturedItem.Video) {
            Box(
                Modifier
                    .size(28.dp)
                    .clip(CircleShape)
                    .background(Color.White.copy(alpha = 0.85f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Filled.PlayArrow,
                    contentDescription = "Vídeo",
                    tint = Teal600,
                    modifier = Modifier.size(20.dp),
                )
            }
        }
    }
}

// ---------- Stage Central ----------

@Composable
private fun Stage(
    isMirrored: Boolean,
    isRecording: Boolean,
    recordingSeconds: Int,
    previewState: IntraoralCaptureActivity.PreviewState,
    onSurfaceReady: (AspectRatioSurfaceView) -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .widthIn(max = 1400.dp)
            .shadow(elevation = 30.dp, shape = RoundedCornerShape(8.dp))
            .clip(RoundedCornerShape(8.dp))
            .background(Color.Black)
            .border(1.dp, White05, RoundedCornerShape(8.dp)),
    ) {
        // SurfaceView nativa pra renderizar o frame UVC
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    if (isMirrored) scaleY = -1f
                },
            factory = { ctx ->
                AspectRatioSurfaceView(ctx).apply {
                    holder.setFormat(PixelFormat.OPAQUE)
                    holder.addCallback(object : SurfaceHolder.Callback {
                        override fun surfaceCreated(holder: SurfaceHolder) {
                            (ctx as? IntraoralCaptureActivity)?.onSurfaceCreated()
                        }
                        override fun surfaceChanged(h: SurfaceHolder, f: Int, w: Int, ht: Int) {}
                        override fun surfaceDestroyed(holder: SurfaceHolder) {
                            (ctx as? IntraoralCaptureActivity)?.onSurfaceDestroyed()
                        }
                    })
                    onSurfaceReady(this)
                }
            },
        )

        // Indicador de gravação (topo central)
        if (isRecording) {
            Row(
                Modifier
                    .align(Alignment.TopCenter)
                    .padding(top = 16.dp)
                    .clip(CircleShape)
                    .background(Black55)
                    .border(1.dp, White10, CircleShape)
                    .padding(horizontal = 12.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Box(
                    Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(Red500),
                )
                Text(
                    formatTime(recordingSeconds),
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }

        // Overlay de loading / erro
        if (previewState !is IntraoralCaptureActivity.PreviewState.Ready) {
            Column(
                Modifier
                    .fillMaxSize()
                    .background(Black70),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(color = Teal400, modifier = Modifier.size(32.dp))
                Spacer(Modifier.height(12.dp))
                Text(
                    when (previewState) {
                        is IntraoralCaptureActivity.PreviewState.Lost -> "Câmera desconectada — reconecte o cabo"
                        is IntraoralCaptureActivity.PreviewState.Error -> previewState.message
                        else -> "Conectando câmera intraoral…"
                    },
                    color = White70,
                    fontSize = 14.sp,
                )
            }
        }
    }
}

private fun formatTime(seconds: Int): String {
    val m = seconds / 60
    val s = seconds % 60
    return "%02d:%02d".format(m, s)
}

// ---------- Sidebar Direita ----------

@Composable
private fun RightSidebar(
    modifier: Modifier = Modifier,
    isMirrored: Boolean,
    captureMode: IntraoralCaptureActivity.CaptureMode,
    isRecording: Boolean,
    isReady: Boolean,
    showSettings: Boolean,
    capabilities: IntraoralCaptureActivity.CameraCapabilities?,
    onMirrorToggle: () -> Unit,
    onModeChange: (IntraoralCaptureActivity.CaptureMode) -> Unit,
    onCapture: () -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    onToggleSettings: () -> Unit,
    onSelectResolution: (Int, Int) -> Unit,
    onReconnect: () -> Unit,
    onOpenDebug: () -> Unit,
    onCloseSettings: () -> Unit,
) {
    Box(modifier) {
        Column(
            Modifier
                .fillMaxSize()
                .padding(vertical = 8.dp, horizontal = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(28.dp, alignment = Alignment.CenterVertically),
        ) {
            // Odontograma
            ToothIconButton()

            // Pílula Foto/Vídeo (botão de captura)
            CapturePill(
                captureMode = captureMode,
                isRecording = isRecording,
                isReady = isReady,
                onModeChange = onModeChange,
                onCapture = onCapture,
                onStartRecording = onStartRecording,
                onStopRecording = onStopRecording,
            )

            // Espelhar
            IconLabelButton(
                icon = Icons.Filled.Flip,
                label = "Espelhar",
                iconTint = if (isMirrored) Teal400 else White85,
                labelColor = if (isMirrored) Teal400 else White85,
                onClick = onMirrorToggle,
            )

            // Ajustes
            IconLabelButton(
                icon = Icons.Filled.Tune,
                label = "Ajustes",
                iconTint = if (showSettings) Teal400 else White85,
                labelColor = if (showSettings) Teal400 else White85,
                onClick = onToggleSettings,
            )
        }

        // Popover Ajustes — DENTRO da coluna direita
        if (showSettings) {
            SettingsPopover(
                modifier = Modifier
                    .align(Alignment.Center)
                    .padding(horizontal = 4.dp),
                capabilities = capabilities,
                onSelectResolution = onSelectResolution,
                onReconnect = onReconnect,
                onOpenDebug = onOpenDebug,
                onClose = onCloseSettings,
            )
        }
    }
}

@Composable
private fun ToothIconButton() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // Ícone de dente desenhado via Path (igual ao web)
        androidx.compose.foundation.Canvas(Modifier.size(28.dp)) {
            val w = size.width
            val h = size.height
            val path = Path().apply {
                // Forma simplificada de dente: outline arredondado
                moveTo(w * 0.3f, h * 0.1f)
                cubicTo(w * 0.1f, h * 0.1f, w * 0.05f, h * 0.4f, w * 0.2f, h * 0.6f)
                lineTo(w * 0.25f, h * 0.95f)
                cubicTo(w * 0.25f, h * 1.0f, w * 0.4f, h * 1.0f, w * 0.4f, h * 0.85f)
                lineTo(w * 0.4f, h * 0.6f)
                lineTo(w * 0.6f, h * 0.6f)
                lineTo(w * 0.6f, h * 0.85f)
                cubicTo(w * 0.6f, h * 1.0f, w * 0.75f, h * 1.0f, w * 0.75f, h * 0.95f)
                lineTo(w * 0.8f, h * 0.6f)
                cubicTo(w * 0.95f, h * 0.4f, w * 0.9f, h * 0.1f, w * 0.7f, h * 0.1f)
                cubicTo(w * 0.55f, h * 0.05f, w * 0.45f, h * 0.05f, w * 0.3f, h * 0.1f)
                close()
            }
            drawPath(
                path = path,
                brush = SolidColor(White85),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = 1.6.dp.toPx()),
            )
        }
        Text(
            "Odontograma",
            color = White85,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun CapturePill(
    captureMode: IntraoralCaptureActivity.CaptureMode,
    isRecording: Boolean,
    isReady: Boolean,
    onModeChange: (IntraoralCaptureActivity.CaptureMode) -> Unit,
    onCapture: () -> Unit,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Pílula com fundo teal, ring teal, contém os 2 botões empilhados
        Column(
            Modifier
                .clip(RoundedCornerShape(40.dp))
                .background(Teal700Alpha85)
                .border(1.dp, Teal300Alpha30, RoundedCornerShape(40.dp))
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Botão Foto
            CaptureCircleButton(
                isActive = captureMode == IntraoralCaptureActivity.CaptureMode.PHOTO,
                enabled = isReady,
                onClick = {
                    onModeChange(IntraoralCaptureActivity.CaptureMode.PHOTO)
                    if (isRecording) onStopRecording()
                    onCapture()
                },
            ) {
                Icon(
                    Icons.Filled.PhotoCamera,
                    contentDescription = "Capturar foto",
                    tint = Color.White,
                    modifier = Modifier.size(32.dp),
                )
            }
            // Botão Vídeo
            CaptureCircleButton(
                isActive = captureMode == IntraoralCaptureActivity.CaptureMode.VIDEO,
                enabled = isReady,
                onClick = {
                    onModeChange(IntraoralCaptureActivity.CaptureMode.VIDEO)
                    if (isRecording) onStopRecording() else onStartRecording()
                },
            ) {
                if (isRecording) {
                    Icon(Icons.Filled.Stop, contentDescription = "Parar", tint = Color.White, modifier = Modifier.size(20.dp))
                } else {
                    Icon(Icons.Filled.Videocam, contentDescription = "Gravar", tint = Color.White, modifier = Modifier.size(24.dp))
                }
            }
        }
        Text(
            when {
                captureMode == IntraoralCaptureActivity.CaptureMode.VIDEO && isRecording -> "Parar"
                captureMode == IntraoralCaptureActivity.CaptureMode.VIDEO -> "Gravar"
                else -> "Capturar"
            },
            color = White85,
            fontSize = 11.sp,
            fontWeight = FontWeight.Medium,
        )
    }
}

@Composable
private fun CaptureCircleButton(
    isActive: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    val activeBrush = Brush.linearGradient(listOf(Dourado400, Dourado600))
    val inactiveColor = Color.Transparent
    Box(
        Modifier
            .size(64.dp)
            .clip(CircleShape)
            .then(
                if (isActive) Modifier.background(activeBrush)
                else Modifier.background(inactiveColor)
            )
            .then(
                if (isActive) Modifier.border(2.dp, White40, CircleShape) else Modifier
            )
            .clickable(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.5f),
        contentAlignment = Alignment.Center,
    ) {
        content()
    }
}

// ---------- Popover Ajustes ----------

@Composable
private fun SettingsPopover(
    modifier: Modifier = Modifier,
    capabilities: IntraoralCaptureActivity.CameraCapabilities?,
    onSelectResolution: (Int, Int) -> Unit,
    onReconnect: () -> Unit,
    onOpenDebug: () -> Unit,
    onClose: () -> Unit,
) {
    Box(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(Color.White)
            .border(1.dp, Color.Black.copy(alpha = 0.05f), RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    "Ajustes",
                    color = Gray800,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Box(
                    Modifier
                        .size(28.dp)
                        .clip(CircleShape)
                        .clickable(onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Filled.Close, "Fechar", tint = Gray500, modifier = Modifier.size(16.dp))
                }
            }

            // Lista de resoluções (FOV)
            if (capabilities != null && capabilities.supportedSizes.isNotEmpty()) {
                Text(
                    "RESOLUÇÃO (FOV)",
                    color = Gray500,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                )
                Column(
                    Modifier.heightIn(max = 200.dp).verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    capabilities.supportedSizes.forEach { s ->
                        val isCurrent = capabilities.currentSize?.width == s.width
                                && capabilities.currentSize.height == s.height
                        Box(
                            Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isCurrent) Teal600.copy(alpha = 0.1f) else Color.Transparent)
                                .clickable { onSelectResolution(s.width, s.height) }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text(
                                "${s.width} × ${s.height}${if (isCurrent) " • atual" else ""}",
                                color = if (isCurrent) Teal700 else Gray700,
                                fontSize = 12.sp,
                                fontWeight = if (isCurrent) FontWeight.SemiBold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }

            // Botão Reconectar
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(Teal600)
                    .clickable(onClick = onReconnect)
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Refresh, null, tint = Color.White, modifier = Modifier.size(14.dp))
                    Text("Reconectar câmera", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }

            // Botão Diagnóstico
            Box(
                Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(6.dp))
                    .background(Gray100)
                    .clickable(onClick = onOpenDebug)
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Filled.Search, null, tint = Gray700, modifier = Modifier.size(14.dp))
                    Text("Diagnóstico da câmera", color = Gray700, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }
        }
    }
}

// ---------- Modal Diagnóstico ----------

@Composable
private fun DiagnosticDialog(
    capabilities: IntraoralCaptureActivity.CameraCapabilities?,
    onRefresh: () -> Unit,
    onDismiss: () -> Unit,
) {
    val clipboard = LocalClipboardManager.current
    val jsonText = remember(capabilities) {
        capabilities?.let { capsToJson(it) } ?: "Aguardando dados…"
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            Modifier
                .fillMaxWidth(0.85f)
                .heightIn(max = 600.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White),
        ) {
            Column {
                // Header
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "🔍 Diagnóstico da câmera intraoral",
                        color = Gray800,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Box(
                        Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .clickable(onClick = onDismiss),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Close, "Fechar", tint = Gray500, modifier = Modifier.size(16.dp))
                    }
                }

                // Body
                Box(
                    Modifier
                        .weight(1f)
                        .background(Gray50)
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                ) {
                    Text(
                        jsonText,
                        color = Gray800,
                        fontSize = 11.sp,
                    )
                }

                // Footer
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.End,
                ) {
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Gray100)
                            .clickable(onClick = onRefresh)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Text("Atualizar", color = Gray700, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                    Spacer(Modifier.width(8.dp))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (capabilities != null) Teal600 else Gray200)
                            .clickable(enabled = capabilities != null) {
                                clipboard.setText(AnnotatedString(jsonText))
                            }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Icon(Icons.Filled.ContentCopy, null, tint = Color.White, modifier = Modifier.size(14.dp))
                            Text("Copiar", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

private fun capsToJson(c: IntraoralCaptureActivity.CameraCapabilities): String {
    val sb = StringBuilder()
    sb.appendLine("{")
    sb.appendLine("  \"device\": {")
    sb.appendLine("    \"vid\": \"${c.deviceVid ?: ""}\",")
    sb.appendLine("    \"pid\": \"${c.devicePid ?: ""}\",")
    sb.appendLine("    \"name\": \"${c.deviceName ?: ""}\"")
    sb.appendLine("  },")
    sb.appendLine("  \"currentSize\": ${c.currentSize?.let { "{\"w\": ${it.width}, \"h\": ${it.height}}" } ?: "null"},")
    sb.appendLine("  \"supportedSizes\": [")
    c.supportedSizes.forEachIndexed { i, s ->
        sb.append("    {\"w\": ${s.width}, \"h\": ${s.height}}")
        if (i < c.supportedSizes.size - 1) sb.append(",")
        sb.appendLine()
    }
    sb.appendLine("  ],")
    sb.appendLine("  \"supportedFormats\": [")
    c.supportedFormats.forEachIndexed { i, f ->
        sb.append("    \"${f.replace("\"", "\\\"")}\"")
        if (i < c.supportedFormats.size - 1) sb.append(",")
        sb.appendLine()
    }
    sb.appendLine("  ],")
    sb.appendLine("  \"uvc\": {")
    sb.appendLine("    \"zoomEnabled\": ${c.zoomEnabled},")
    sb.appendLine("    \"zoomMin\": ${c.zoomMin ?: "null"},")
    sb.appendLine("    \"zoomMax\": ${c.zoomMax ?: "null"},")
    sb.appendLine("    \"zoomCurrent\": ${c.zoomCurrent ?: "null"}")
    sb.appendLine("  }")
    sb.append("}")
    return sb.toString()
}

// ---------- Galeria ----------

@Composable
private fun GalleryDialog(
    items: List<IntraoralCaptureActivity.CapturedItem>,
    initialIndex: Int,
    onRemove: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    var index by remember { mutableStateOf(initialIndex) }
    val current = items.getOrNull(index) ?: return Unit.also { onDismiss() }
    val file = when (current) {
        is IntraoralCaptureActivity.CapturedItem.Photo -> current.file
        is IntraoralCaptureActivity.CapturedItem.Video -> current.file
    }
    val bitmap = remember(file.absolutePath) {
        runCatching {
            val opts = BitmapFactory.Options().apply { inSampleSize = 2 }
            BitmapFactory.decodeFile(file.absolutePath, opts)
        }.getOrNull()
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Box(
            Modifier
                .fillMaxWidth(0.9f)
                .heightIn(max = 600.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(Color.White),
        ) {
            Column {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${if (current is IntraoralCaptureActivity.CapturedItem.Video) "Vídeo" else "Foto"} ${index + 1} de ${items.size}",
                        color = Gray800,
                        fontSize = 14.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Box(
                        Modifier
                            .size(32.dp)
                            .clip(CircleShape)
                            .clickable(onClick = onDismiss),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(Icons.Filled.Close, "Fechar", tint = Gray500, modifier = Modifier.size(16.dp))
                    }
                }
                Box(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = 280.dp, max = 480.dp)
                        .background(Color.Black),
                    contentAlignment = Alignment.Center,
                ) {
                    bitmap?.let {
                        Image(
                            bitmap = it.asImageBitmap(),
                            contentDescription = null,
                            contentScale = ContentScale.Fit,
                            modifier = Modifier.fillMaxSize(),
                        )
                    }
                }
                Row(
                    Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    if (items.size > 1) {
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Gray100)
                                .clickable { index = (index - 1).coerceAtLeast(0) }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text("Anterior", color = Gray700, fontSize = 12.sp)
                        }
                        Box(
                            Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(Gray100)
                                .clickable { index = (index + 1).coerceAtMost(items.size - 1) }
                                .padding(horizontal = 12.dp, vertical = 8.dp),
                        ) {
                            Text("Próxima", color = Gray700, fontSize = 12.sp)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    Box(
                        Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(Red500)
                            .clickable {
                                onRemove(index)
                                if (items.size <= 1) onDismiss()
                                else if (index >= items.size - 1) index = items.size - 2
                            }
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                    ) {
                        Text("Excluir", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
