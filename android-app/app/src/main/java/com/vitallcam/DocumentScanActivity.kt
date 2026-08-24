package com.vitallcam

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.PointF
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.exifinterface.media.ExifInterface
import com.vitallcam.ui.theme.VitallCamTheme
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicInteger

/**
 * Scanner de documentos do VitallCam.
 *
 * Existe pra fechar o ciclo do contrato: o termo sai impresso, o paciente
 * assina de proprio punho e a recepcao devolve o papel pro prontuario sem
 * depender da multifuncional.
 *
 * O fluxo e deliberadamente em dois tempos — fotografar e depois conferir os
 * cantos — em vez de recortar sozinho no instante do disparo. Deteccao
 * automatica erra em mesa clara e com papel amassado, e num contrato assinado
 * um recorte que come a margem custa a rubrica. Aqui o automatico so propoe; a
 * pessoa confirma.
 *
 * Devolve os arquivos pelo mesmo contrato do IntraoralCaptureActivity
 * (EXTRA_IMAGE_PATHS apontando pra cacheDir/captures), entao o MainActivity
 * converte pra URL e entrega ao WebView sem nenhum caminho novo.
 */
class DocumentScanActivity : ComponentActivity() {

    /** Paginas ja confirmadas, na ordem em que vao pro PDF. */
    private val paginas = mutableStateListOf<File>()

    private var imageCapture: ImageCapture? = null
    private val sequencia = AtomicInteger(0)
    private var salvouOk = false

    /** Foto recem-tirada aguardando confirmacao dos cantos. */
    private var emAjuste by mutableStateOf<Captura?>(null)
    private var ocupado by mutableStateOf(false)

    data class Captura(val bitmap: Bitmap, val cantos: List<PointF>, val detectou: Boolean)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Carrega o OpenCV cedo: a primeira chamada leva alguns instantes e
        // pagar isso no disparo faria a captura parecer travada. Se falhar,
        // avisa agora — descobrir isso so depois de fotografar tres paginas
        // seria bem pior.
        Thread {
            if (!DocumentCv.pronto()) {
                runOnUiThread { avisar(getString(R.string.scan_sem_opencv)) }
            }
        }.start()

        setContent {
            VitallCamTheme {
                val ajuste = emAjuste
                if (ajuste == null) {
                    TelaCamera(
                        paginas = paginas,
                        ocupado = ocupado,
                        onDisparar = ::disparar,
                        onRemoverUltima = ::removerUltima,
                        onConcluir = ::concluir,
                        onCancelar = ::cancelar,
                        onCameraPronta = { imageCapture = it },
                    )
                } else {
                    TelaAjuste(
                        captura = ajuste,
                        ocupado = ocupado,
                        numeroDaPagina = paginas.size + 1,
                        onRefazer = { descartarAjuste() },
                        onConfirmar = { cantos, realcar -> confirmarPagina(ajuste, cantos, realcar) },
                    )
                }
            }
        }
    }

    // --- Captura ------------------------------------------------------------

    private fun disparar() {
        val captura = imageCapture
        if (captura == null || ocupado) return
        ocupado = true

        val temporario = File(cacheDir, "scan_tmp_${System.currentTimeMillis()}.jpg")
        captura.takePicture(
            ImageCapture.OutputFileOptions.Builder(temporario).build(),
            ContextCompat.getMainExecutor(this),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    processarCaptura(temporario)
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "falha ao capturar", exception)
                    runCatching { temporario.delete() }
                    ocupado = false
                    avisar(getString(R.string.scan_falha_captura))
                }
            },
        )
    }

    /** Decodifica, corrige a rotacao e propoe os cantos — tudo fora da UI. */
    private fun processarCaptura(arquivo: File) {
        Thread {
            val resultado = runCatching {
                val bitmap = decodificarReduzido(arquivo)
                    ?: throw IllegalStateException("nao foi possivel decodificar a captura")
                val cantos = DocumentCv.detectarCantos(bitmap)
                Captura(
                    bitmap = bitmap,
                    cantos = cantos ?: cantosDeBorda(bitmap.width, bitmap.height),
                    detectou = cantos != null,
                )
            }
            runCatching { arquivo.delete() }

            runOnUiThread {
                ocupado = false
                resultado.onSuccess { emAjuste = it }
                resultado.onFailure {
                    Log.e(TAG, "falha ao processar captura", it)
                    avisar(getString(R.string.scan_falha_captura))
                }
            }
        }.start()
    }

    private fun confirmarPagina(captura: Captura, cantos: List<PointF>, realcar: Boolean) {
        if (ocupado) return
        ocupado = true

        Thread {
            val arquivo = runCatching {
                val endireitado = DocumentCv.endireitar(captura.bitmap, cantos, realcar)
                // O endireitado nao vai pra tela nenhuma, entao reciclar aqui e
                // seguro e livra alguns MB antes da proxima pagina.
                salvarPagina(endireitado).also { endireitado.recycle() }
            }

            runOnUiThread {
                ocupado = false
                arquivo.onSuccess {
                    paginas.add(it)
                    // O bitmap da captura NAO e reciclado: a tela de ajuste
                    // ainda pode estar montada por um quadro, e desenhar bitmap
                    // reciclado derruba o app com "trying to use a recycled
                    // bitmap". Deixa o coletor levar.
                    emAjuste = null
                }
                arquivo.onFailure { erro ->
                    Log.e(TAG, "falha ao endireitar", erro)
                    avisar(getString(R.string.scan_falha_processar))
                }
            }
        }.start()
    }

    private fun descartarAjuste() {
        // Sem recycle, pelo mesmo motivo de confirmarPagina: a composicao pode
        // desenhar mais um quadro depois disso.
        emAjuste = null
    }

    private fun removerUltima() {
        val ultima = paginas.removeLastOrNull() ?: return
        runCatching { ultima.delete() }
    }

    // --- Arquivos -----------------------------------------------------------

    /**
     * Decodifica limitando o lado maior. Uma foto de 12MP em ARGB_8888 ocupa
     * ~48 MB, e o warp precisa de outra copia — em tablet modesto isso e
     * OutOfMemory na segunda pagina. LADO_MAXIMO ainda deixa um A4 acima de
     * 200 dpi, de sobra pra ler as clausulas miudas.
     */
    private fun decodificarReduzido(arquivo: File): Bitmap? {
        val medida = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(arquivo.absolutePath, medida)
        if (medida.outWidth <= 0 || medida.outHeight <= 0) return null

        var amostra = 1
        while (
            (medida.outWidth / amostra) > LADO_MAXIMO ||
            (medida.outHeight / amostra) > LADO_MAXIMO
        ) {
            amostra *= 2
        }

        val opcoes = BitmapFactory.Options().apply {
            inSampleSize = amostra
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }
        val bruto = BitmapFactory.decodeFile(arquivo.absolutePath, opcoes) ?: return null
        return aplicarRotacaoExif(bruto, arquivo)
    }

    /**
     * A camera grava a orientacao no EXIF em vez de girar os pixels. Sem isto o
     * documento chega deitado e a deteccao de cantos trabalha na imagem errada.
     */
    private fun aplicarRotacaoExif(bitmap: Bitmap, arquivo: File): Bitmap {
        val graus = runCatching {
            when (
                ExifInterface(arquivo.absolutePath)
                    .getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            ) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }.getOrDefault(0f)

        if (graus == 0f) return bitmap

        val matriz = Matrix().apply { postRotate(graus) }
        val girado = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matriz, true)
        if (girado !== bitmap) bitmap.recycle()
        return girado
    }

    private fun salvarPagina(bitmap: Bitmap): File {
        val pasta = File(cacheDir, "captures").apply { mkdirs() }
        val arquivo = File(pasta, "scan_${System.currentTimeMillis()}_${sequencia.incrementAndGet()}.jpg")
        FileOutputStream(arquivo).use { saida ->
            // 92 e o ponto em que o artefato de JPEG some do traco fino da
            // caneta sem o arquivo dobrar de tamanho.
            bitmap.compress(Bitmap.CompressFormat.JPEG, 92, saida)
        }
        return arquivo
    }

    // --- Saida --------------------------------------------------------------

    private fun concluir() {
        if (paginas.isEmpty()) {
            cancelar()
            return
        }
        val caminhos = paginas.map { it.absolutePath }.toTypedArray()
        salvouOk = true
        setResult(Activity.RESULT_OK, Intent().apply { putExtra(EXTRA_IMAGE_PATHS, caminhos) })
        finish()
    }

    private fun cancelar() {
        descartarAjuste()
        setResult(Activity.RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        // Saiu sem concluir: as paginas nao viraram nada e ficariam ocupando o
        // cache pra sempre, porque ninguem mais conhece esses nomes.
        if (!salvouOk) paginas.forEach { runCatching { it.delete() } }
        descartarAjuste()
    }

    private fun avisar(mensagem: String) {
        Toast.makeText(this, mensagem, Toast.LENGTH_LONG).show()
    }

    companion object {
        const val EXTRA_IMAGE_PATHS = "image_paths"
        const val REQUEST_CODE = 4244
        private const val TAG = "VitallCamScan"
        private const val LADO_MAXIMO = 2400

        /** Retangulo com uma folga da borda, pro usuario arrastar a partir dai. */
        fun cantosDeBorda(largura: Int, altura: Int): List<PointF> {
            val mx = largura * 0.08f
            val my = altura * 0.08f
            return listOf(
                PointF(mx, my),
                PointF(largura - mx, my),
                PointF(largura - mx, altura - my),
                PointF(mx, altura - my),
            )
        }
    }
}

/** Liga a camera traseira e devolve o ImageCapture quando estiver pronta. */
internal fun ligarCamera(
    contexto: android.content.Context,
    dono: androidx.lifecycle.LifecycleOwner,
    preview: PreviewView,
    onPronta: (ImageCapture) -> Unit,
) {
    val futuro = ProcessCameraProvider.getInstance(contexto)
    futuro.addListener({
        val provedor = runCatching { futuro.get() }.getOrNull() ?: return@addListener

        val visor = Preview.Builder().build().also { it.setSurfaceProvider(preview.surfaceProvider) }
        val captura = ImageCapture.Builder()
            // Documento pede nitidez, nao velocidade: o disparo pode demorar
            // mais um instante se em troca a letra miuda sair legivel.
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
            .build()

        runCatching {
            provedor.unbindAll()
            provedor.bindToLifecycle(dono, CameraSelector.DEFAULT_BACK_CAMERA, visor, captura)
            onPronta(captura)
        }.onFailure { Log.e("VitallCamScan", "falha ao ligar a camera", it) }
    }, ContextCompat.getMainExecutor(contexto))
}
