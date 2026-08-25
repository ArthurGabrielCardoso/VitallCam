package com.vitallcam

import android.graphics.Bitmap
import android.graphics.PointF
import androidx.camera.core.ImageCapture
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.Icon
import androidx.compose.material.Text
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Undo
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.vitallcam.ui.theme.Dourado400
import com.vitallcam.ui.theme.Neutral950
import com.vitallcam.ui.theme.Teal600
import com.vitallcam.ui.theme.Teal700
import java.io.File
import kotlin.math.max
import kotlin.math.min
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Telas do scanner de documentos, nas cores do VitallCam — mesma abordagem do
 * IntraoralCaptureActivity, que ja espelha o design web em Compose nativo.
 */

private val FundoEscuro = Neutral950
private val Realce = Dourado400

/** Raio, em pixels, dentro do qual um toque agarra um canto. */
private const val RAIO_DE_AGARRE = 170f

/**
 * Lado maior da previa. Filtrar a folha em resolucao cheia leva segundos, e
 * trocar de filtro precisa responder na hora; a 1200 px da pra julgar se o
 * papel clareou sem comer a assinatura, que e o que se esta decidindo ali.
 */
private const val LADO_PREVIA = 1200

// --- Camera -----------------------------------------------------------------

@Composable
fun TelaCamera(
    paginas: List<File>,
    ocupado: Boolean,
    onDisparar: () -> Unit,
    onRemoverUltima: () -> Unit,
    onConcluir: () -> Unit,
    onCancelar: () -> Unit,
    onCameraPronta: (ImageCapture) -> Unit,
) {
    val contexto = LocalContext.current
    val dono = LocalLifecycleOwner.current

    Box(Modifier.fillMaxSize().background(FundoEscuro)) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                PreviewView(ctx).also { visor ->
                    visor.scaleType = PreviewView.ScaleType.FILL_CENTER
                    ligarCamera(contexto, dono, visor, onCameraPronta)
                }
            },
        )

        Row(
            Modifier.align(Alignment.TopStart).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BotaoCircular(Icons.Filled.ArrowBack, "Cancelar", onCancelar)
            Text(
                text = if (paginas.isEmpty()) {
                    "Enquadre o documento"
                } else {
                    // Deixa explicito que o disparo soma pagina em vez de
                    // substituir a anterior — sem isso ninguem descobre que da
                    // pra escanear um contrato de 4 folhas de uma vez.
                    "${paginas.size} ${if (paginas.size == 1) "pagina" else "paginas"} · fotografe a proxima"
                },
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 12.dp),
            )
        }

        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Neutral950.copy(alpha = 0.78f))
                .padding(horizontal = 20.dp, vertical = 18.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (paginas.isNotEmpty()) {
                BotaoCircular(Icons.Filled.Undo, "Remover ultima pagina", onRemoverUltima)
            } else {
                Box(Modifier.size(48.dp))
            }

            // Alvo grande e sem firula: em recepcao movimentada, errar o toque
            // custa mais caro que qualquer animacao.
            Box(
                Modifier
                    .size(74.dp)
                    .clip(CircleShape)
                    .background(if (ocupado) Teal700 else Teal600)
                    .border(3.dp, Color.White.copy(alpha = 0.9f), CircleShape)
                    .clickable(enabled = !ocupado, onClick = onDisparar),
            )

            if (paginas.isNotEmpty()) {
                BotaoTexto("Concluir", onConcluir)
            } else {
                Box(Modifier.size(48.dp))
            }
        }
    }
}

// --- Resultado e recorte ----------------------------------------------------

@Composable
fun TelaAjuste(
    captura: DocumentScanActivity.Captura,
    ocupado: Boolean,
    numeroDaPagina: Int,
    onRefazer: () -> Unit,
    onConfirmar: (List<PointF>, DocumentCv.Filtro) -> Unit,
) {
    var cantos by remember(captura) { mutableStateOf(captura.cantos) }
    var filtro by remember(captura) { mutableStateOf(DocumentCv.Filtro.COR) }
    // Abre direto no resultado: a deteccao ja rodou no disparo, entao o recorte
    // chega pronto. Mexer nos cantos vira excecao, nao pedagio de toda pagina.
    var recortando by remember(captura) { mutableStateOf(false) }

    if (recortando) {
        TelaRecorte(
            captura = captura,
            cantos = cantos,
            onCantos = { cantos = it },
            onPronto = { recortando = false },
        )
    } else {
        TelaResultado(
            captura = captura,
            cantos = cantos,
            filtro = filtro,
            ocupado = ocupado,
            numeroDaPagina = numeroDaPagina,
            onFiltro = { filtro = it },
            onRecortar = { recortando = true },
            onRefazer = onRefazer,
            onAdicionar = { onConfirmar(cantos, filtro) },
        )
    }
}

/** Mostra a pagina como ela vai ficar, e troca de filtro mostrando o efeito. */
@Composable
private fun TelaResultado(
    captura: DocumentScanActivity.Captura,
    cantos: List<PointF>,
    filtro: DocumentCv.Filtro,
    ocupado: Boolean,
    numeroDaPagina: Int,
    onFiltro: (DocumentCv.Filtro) -> Unit,
    onRecortar: () -> Unit,
    onRefazer: () -> Unit,
    onAdicionar: () -> Unit,
) {
    var previa by remember(captura) { mutableStateOf<Bitmap?>(null) }
    var calculando by remember(captura) { mutableStateOf(true) }

    // Recalcula so quando o recorte ou o filtro mudam, e fora da thread de UI:
    // o warp mais o filtro travariam a tela por um instante visivel.
    LaunchedEffect(captura, cantos, filtro) {
        calculando = true
        val gerada = withContext(Dispatchers.Default) {
            runCatching {
                DocumentCv.endireitar(captura.bitmap, cantos, filtro, LADO_PREVIA)
            }.getOrNull()
        }
        previa = gerada
        calculando = false
    }

    Column(Modifier.fillMaxSize().background(FundoEscuro)) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "Pagina $numeroDaPagina",
                color = Color.White,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = if (captura.detectou) "  ·  recorte automatico" else "  ·  confira o recorte",
                color = if (captura.detectou) Realce else Color.White.copy(alpha = 0.6f),
                fontSize = 13.sp,
            )
        }

        Box(
            Modifier.fillMaxWidth().weight(1f).padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            val atual = previa
            if (atual != null) {
                Image(
                    bitmap = atual.asImageBitmap(),
                    contentDescription = "Previa da pagina",
                    modifier = Modifier.fillMaxSize(),
                    contentScale = ContentScale.Fit,
                )
            }
            if (calculando) {
                Text("Preparando...", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp)
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            FILTROS.forEach { (valor, rotulo) ->
                Chip(rotulo, valor == filtro) { onFiltro(valor) }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BotaoCircular(Icons.Filled.Refresh, "Refazer a foto", onRefazer)
            BotaoContornado("Ajustar recorte", onRecortar)
            BotaoTexto(
                rotulo = "Adicionar pagina",
                onClique = onAdicionar,
                // So depois da previa: adicionar sem ter visto o resultado e
                // exatamente o que essa tela existe pra evitar.
                habilitado = !ocupado && previa != null,
            )
        }
    }
}

/** Editor dos quatro cantos, aberto so quando o recorte automatico erra. */
@Composable
private fun TelaRecorte(
    captura: DocumentScanActivity.Captura,
    cantos: List<PointF>,
    onCantos: (List<PointF>) -> Unit,
    onPronto: () -> Unit,
) {
    val bitmap = captura.bitmap
    // Converter a cada recomposicao copiaria uma imagem de milhoes de pixels a
    // cada arrasto de canto.
    val imagem = remember(captura) { bitmap.asImageBitmap() }
    // Qual canto o dedo agarrou. Precisa sobreviver de onDragStart ate onDrag,
    // por isso e estado lembrado e nao variavel do bloco do gesto.
    val arrastando = remember(captura) { mutableStateOf(-1) }

    Column(Modifier.fillMaxSize().background(FundoEscuro)) {
        Text(
            text = "Arraste os cantos ate as bordas da folha",
            color = Color.White,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(16.dp),
        )

        Box(Modifier.fillMaxWidth().weight(1f).padding(horizontal = 12.dp)) {
            Image(
                bitmap = imagem,
                contentDescription = "Documento capturado",
                modifier = Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )

            Canvas(
                modifier = Modifier
                    .fillMaxSize()
                    .pointerInput(captura) {
                        detectDragGestures(
                            onDragStart = { inicio ->
                                val ajuste = calcularAjuste(size.width, size.height, bitmap.width, bitmap.height)
                                arrastando.value = cantoMaisProximo(cantos, inicio, ajuste)
                            },
                            onDragEnd = { arrastando.value = -1 },
                            onDragCancel = { arrastando.value = -1 },
                        ) { mudanca, _ ->
                            val indice = arrastando.value
                            if (indice < 0) return@detectDragGestures
                            mudanca.consume()
                            val ajuste = calcularAjuste(size.width, size.height, bitmap.width, bitmap.height)
                            val novo = paraBitmap(mudanca.position, ajuste, bitmap.width, bitmap.height)
                            onCantos(cantos.toMutableList().also { it[indice] = novo })
                        }
                    },
            ) {
                val ajuste = calcularAjuste(size.width.toInt(), size.height.toInt(), bitmap.width, bitmap.height)
                val pontos = cantos.map { paraTela(it, ajuste) }
                if (pontos.size < 4) return@Canvas

                val caminho = Path().apply {
                    moveTo(pontos[0].x, pontos[0].y)
                    for (i in 1 until pontos.size) lineTo(pontos[i].x, pontos[i].y)
                    close()
                }
                drawPath(caminho, Realce.copy(alpha = 0.16f))
                for (i in pontos.indices) {
                    drawLine(Realce, pontos[i], pontos[(i + 1) % pontos.size], strokeWidth = 3f)
                }
                // Alca generosa: dedo em tela de tablet nao acerta um ponto de
                // 4 px, e canto errado aqui vira margem cortada no contrato.
                pontos.forEach { p ->
                    drawCircle(Color.White, radius = 22f, center = p)
                    drawCircle(Realce, radius = 15f, center = p)
                }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.End,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BotaoTexto("Pronto", onPronto)
        }
    }
}

/**
 * Cor primeiro, e como padrao, porque num contrato assinado a caneta azul
 * precisa continuar azul: preto-e-branco pode transformar traco claro em nada,
 * e a assinatura e a unica coisa que o documento existe pra provar.
 */
private val FILTROS = listOf(
    DocumentCv.Filtro.COR to "Cor",
    DocumentCv.Filtro.CINZA to "Cinza",
    DocumentCv.Filtro.PRETO_BRANCO to "P&B",
    DocumentCv.Filtro.ORIGINAL to "Original",
)

// --- Geometria --------------------------------------------------------------

/** Escala e deslocamento do bitmap dentro da area, no mesmo encaixe do Fit. */
internal data class Ajuste(val escala: Float, val dx: Float, val dy: Float)

internal fun calcularAjuste(larguraArea: Int, alturaArea: Int, larguraBmp: Int, alturaBmp: Int): Ajuste {
    if (larguraBmp <= 0 || alturaBmp <= 0 || larguraArea <= 0 || alturaArea <= 0) {
        return Ajuste(1f, 0f, 0f)
    }
    val escala = min(
        larguraArea.toFloat() / larguraBmp,
        alturaArea.toFloat() / alturaBmp,
    )
    return Ajuste(
        escala = escala,
        dx = (larguraArea - larguraBmp * escala) / 2f,
        dy = (alturaArea - alturaBmp * escala) / 2f,
    )
}

internal fun paraTela(ponto: PointF, ajuste: Ajuste): Offset =
    Offset(ponto.x * ajuste.escala + ajuste.dx, ponto.y * ajuste.escala + ajuste.dy)

internal fun paraBitmap(ponto: Offset, ajuste: Ajuste, larguraBmp: Int, alturaBmp: Int): PointF {
    val x = (ponto.x - ajuste.dx) / ajuste.escala
    val y = (ponto.y - ajuste.dy) / ajuste.escala
    // Preso dentro da foto: canto arrastado pra fora viraria coordenada
    // negativa no warp e faixa preta na borda do PDF.
    return PointF(
        max(0f, min(x, larguraBmp.toFloat())),
        max(0f, min(y, alturaBmp.toFloat())),
    )
}

/** Indice do canto agarrado, ou -1 se o toque caiu longe de todos. */
internal fun cantoMaisProximo(cantos: List<PointF>, toque: Offset, ajuste: Ajuste): Int {
    var melhor = -1
    var menor = Float.MAX_VALUE
    cantos.forEachIndexed { indice, canto ->
        val p = paraTela(canto, ajuste)
        val dx = p.x - toque.x
        val dy = p.y - toque.y
        val d = dx * dx + dy * dy
        if (d < menor) {
            menor = d
            melhor = indice
        }
    }
    // Toque no meio da imagem nao arrasta canto nenhum: sem isto a folha
    // inteira pularia ao primeiro encostar fora de proposito.
    return if (menor <= RAIO_DE_AGARRE * RAIO_DE_AGARRE) melhor else -1
}

// --- Peças de UI ------------------------------------------------------------

@Composable
private fun BotaoCircular(
    icone: ImageVector,
    descricao: String,
    onClique: () -> Unit,
    fundo: Color = Color.White.copy(alpha = 0.14f),
    habilitado: Boolean = true,
) {
    Box(
        Modifier
            .size(48.dp)
            .clip(CircleShape)
            .background(fundo)
            .clickable(enabled = habilitado, onClick = onClique),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icone, descricao, tint = Color.White, modifier = Modifier.size(22.dp))
    }
}

@Composable
private fun BotaoTexto(rotulo: String, onClique: () -> Unit, habilitado: Boolean = true) {
    Box(
        Modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (habilitado) Teal600 else Teal700)
            .clickable(enabled = habilitado, onClick = onClique)
            .padding(horizontal = 18.dp, vertical = 12.dp),
    ) {
        Text(
            rotulo,
            color = if (habilitado) Color.White else Color.White.copy(alpha = 0.5f),
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun BotaoContornado(rotulo: String, onClique: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(6.dp))
            .border(1.dp, Color.White.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
            .clickable(onClick = onClique)
            .padding(horizontal = 14.dp, vertical = 11.dp),
    ) {
        Text(rotulo, color = Color.White.copy(alpha = 0.9f), fontSize = 13.sp)
    }
}

@Composable
private fun Chip(rotulo: String, ativo: Boolean, onClique: () -> Unit) {
    Box(
        Modifier
            .padding(horizontal = 3.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(if (ativo) Teal600 else Color.White.copy(alpha = 0.12f))
            .clickable(onClick = onClique)
            .padding(horizontal = 12.dp, vertical = 7.dp),
    ) {
        Text(
            rotulo,
            color = if (ativo) Color.White else Color.White.copy(alpha = 0.75f),
            fontSize = 12.sp,
            fontWeight = if (ativo) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}
