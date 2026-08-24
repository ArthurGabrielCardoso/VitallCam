package com.vitallcam

import android.graphics.Bitmap
import android.graphics.PointF
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Visao computacional do scanner de documentos.
 *
 * Tres passos, nesta ordem: achar os quatro cantos da folha, endireitar a
 * perspectiva e tirar a sombra. O resto da tela so orquestra isso.
 *
 * Nada aqui binariza a imagem. Em contrato assinado o traco da caneta pode ser
 * claro, e um limiar preto-e-branco mal calibrado apaga assinatura — que e
 * exatamente a unica coisa que o documento precisa provar. O realce mantem
 * tons de cinza de proposito.
 */
object DocumentCv {

    /** Detecta na imagem reduzida a este lado maior: 12MP no Canny e desperdicio. */
    private const val LADO_DETECCAO = 900.0

    @Volatile
    private var iniciado = false

    /** `false` quando o OpenCV nao carrega; a tela entao cai no recorte manual. */
    fun pronto(): Boolean {
        if (iniciado) return true
        iniciado = runCatching { OpenCVLoader.initLocal() }.getOrDefault(false)
        return iniciado
    }

    /**
     * Os quatro cantos do documento, em pixels da imagem original e em ordem
     * horaria a partir do superior esquerdo. `null` quando nao ha um
     * quadrilatero convincente — a tela entao abre com os cantos perto da borda
     * pro usuario ajustar, em vez de recortar errado sozinha.
     */
    fun detectarCantos(bitmap: Bitmap): List<PointF>? {
        if (!pronto()) return null

        val original = Mat()
        Utils.bitmapToMat(bitmap, original)

        // Detectar na imagem cheia nao melhora a borda e custa memoria: reduz,
        // acha, e devolve os cantos multiplicados de volta pra escala original.
        val escala = LADO_DETECCAO / max(bitmap.width, bitmap.height).toDouble()
        val reduzida = Mat()
        if (escala < 1.0) {
            Imgproc.resize(original, reduzida, Size(bitmap.width * escala, bitmap.height * escala))
        } else {
            original.copyTo(reduzida)
        }

        val cinza = Mat()
        Imgproc.cvtColor(reduzida, cinza, Imgproc.COLOR_RGBA2GRAY)
        Imgproc.GaussianBlur(cinza, cinza, Size(5.0, 5.0), 0.0)

        // Fecha falhas na borda antes do Canny: papel branco sobre mesa clara
        // costuma ter contorno interrompido, e contorno aberto nunca vira
        // quadrilatero no approxPolyDP.
        val nucleo = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(9.0, 9.0))
        Imgproc.morphologyEx(cinza, cinza, Imgproc.MORPH_CLOSE, nucleo)

        val bordas = Mat()
        Imgproc.Canny(cinza, bordas, 60.0, 180.0)
        Imgproc.dilate(bordas, bordas, Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(3.0, 3.0)))

        val contornos = ArrayList<MatOfPoint>()
        Imgproc.findContours(bordas, contornos, Mat(), Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)

        // Menos de 18% do enquadramento nao e a folha que a pessoa mirou: e um
        // papel na mesa ao lado, ou o proprio contorno de um azulejo.
        val areaMinima = reduzida.width() * reduzida.height() * 0.18
        var melhor: List<Point>? = null
        var melhorArea = 0.0

        for (contorno in contornos) {
            val curva = MatOfPoint2f(*contorno.toArray())
            val perimetro = Imgproc.arcLength(curva, true)
            val aproximado = MatOfPoint2f()
            Imgproc.approxPolyDP(curva, aproximado, 0.02 * perimetro, true)

            val pontos = aproximado.toArray()
            if (pontos.size != 4) continue
            if (!Imgproc.isContourConvex(MatOfPoint(*pontos))) continue

            val area = Imgproc.contourArea(aproximado)
            if (area < areaMinima || area <= melhorArea) continue

            melhorArea = area
            melhor = pontos.toList()
        }

        val encontrado = melhor ?: return null
        val volta = if (escala < 1.0) 1.0 / escala else 1.0
        return ordenarCantos(
            encontrado.map { PointF((it.x * volta).toFloat(), (it.y * volta).toFloat()) },
        )
    }

    /**
     * Endireita o recorte definido pelos quatro cantos e, opcionalmente, tira a
     * sombra. Devolve um bitmap novo; o de entrada continua intacto.
     */
    fun endireitar(bitmap: Bitmap, cantos: List<PointF>, realcar: Boolean): Bitmap {
        val ordenados = ordenarCantos(cantos)
        val se = ordenados[0]
        val sd = ordenados[1]
        val id = ordenados[2]
        val ie = ordenados[3]

        // O resultado ganha o tamanho do maior lado de cada par oposto: assim
        // nenhum trecho do documento e comprimido, no maximo sobra resolucao.
        val w = max(1.0, max(distancia(se, sd), distancia(ie, id)).toDouble())
        val h = max(1.0, max(distancia(se, ie), distancia(sd, id)).toDouble())

        val origem = Mat()
        Utils.bitmapToMat(bitmap, origem)

        val de = MatOfPoint2f(
            Point(se.x.toDouble(), se.y.toDouble()),
            Point(sd.x.toDouble(), sd.y.toDouble()),
            Point(id.x.toDouble(), id.y.toDouble()),
            Point(ie.x.toDouble(), ie.y.toDouble()),
        )
        val para = MatOfPoint2f(
            Point(0.0, 0.0),
            Point(w - 1, 0.0),
            Point(w - 1, h - 1),
            Point(0.0, h - 1),
        )

        val transformacao = Imgproc.getPerspectiveTransform(de, para)
        val endireitado = Mat()
        Imgproc.warpPerspective(origem, endireitado, transformacao, Size(w, h))

        val resultado = if (realcar) realcarPapel(endireitado) else endireitado
        val saida = Bitmap.createBitmap(resultado.width(), resultado.height(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(resultado, saida)
        return saida
    }

    /**
     * Tira sombra dividindo a imagem pela propria versao muito borrada — que e,
     * na pratica, o mapa de iluminacao da foto. Papel fotografado sob luz de
     * teto sai com um lado mais escuro; isso empareja o fundo sem mexer no
     * contraste do que esta escrito.
     */
    private fun realcarPapel(fonte: Mat): Mat {
        val cinza = Mat()
        Imgproc.cvtColor(fonte, cinza, Imgproc.COLOR_RGBA2GRAY)

        // Nucleo impar e proporcional ao tamanho: um valor fixo em pixels se
        // comportaria diferente entre uma foto de 3MP e uma de 12MP.
        val lado = max(fonte.width(), fonte.height())
        val k = min(max((lado / 20) or 1, 21), 151)

        val fundo = Mat()
        Imgproc.GaussianBlur(cinza, fundo, Size(k.toDouble(), k.toDouble()), 0.0)

        val corrigido = Mat()
        Core.divide(cinza, fundo, corrigido, 255.0)

        // Empurrao leve de contraste: o suficiente pra tinta encorpar sem comer
        // o traco fino da assinatura.
        val ajustado = Mat()
        corrigido.convertTo(ajustado, CvType.CV_8UC1, 1.15, -12.0)

        val rgba = Mat()
        Imgproc.cvtColor(ajustado, rgba, Imgproc.COLOR_GRAY2RGBA)
        return rgba
    }

    /** Horario a partir do superior esquerdo: SE, SD, ID, IE. */
    fun ordenarCantos(cantos: List<PointF>): List<PointF> {
        if (cantos.size != 4) return cantos

        // A soma (x+y) e minima no canto superior esquerdo e maxima no inferior
        // direito; a diferenca (y-x) separa os outros dois.
        val porSoma = cantos.sortedBy { it.x + it.y }
        val se = porSoma.first()
        val id = porSoma.last()

        val restantes = porSoma.subList(1, 3)
        val primeiro = restantes[0]
        val segundo = restantes[1]
        val sd: PointF
        val ie: PointF
        if (primeiro.y - primeiro.x < segundo.y - segundo.x) {
            sd = primeiro
            ie = segundo
        } else {
            sd = segundo
            ie = primeiro
        }

        return listOf(se, sd, id, ie)
    }

    private fun distancia(a: PointF, b: PointF): Float {
        val dx = (a.x - b.x).toDouble()
        val dy = (a.y - b.y).toDouble()
        return sqrt(dx * dx + dy * dy).toFloat()
    }
}
