package com.vitallcam

import android.graphics.Bitmap
import android.graphics.PointF
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfDouble
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Visao computacional do scanner de documentos.
 *
 * Achar os quatro cantos da folha, endireitar a perspectiva e aplicar o filtro
 * escolhido. O resto da tela so orquestra isso.
 *
 * A tecnica de correcao de iluminacao e a mesma do MakeACopy (Apache 2.0):
 * dividir a imagem pela propria versao muito borrada, que e o mapa de
 * iluminacao da foto. Implementacao propria, mas a licenca deles permitiria
 * ate copia direta.
 */
object DocumentCv {

    /** Filtro aplicado depois de endireitar. */
    enum class Filtro {
        /** Sem tratamento — util quando o documento tem carimbo ou marca colorida. */
        ORIGINAL,

        /**
         * Padrao. Clareia o papel mantendo a cor da tinta: a assinatura em caneta
         * azul continua azul, que num contrato e o detalhe que interessa provar.
         */
        COR,

        /** Cinza com fundo emparelhado — bom pra fotocopia e fax. */
        CINZA,

        /** Preto e branco de documento. Menor arquivo, texto mais duro. */
        PRETO_BRANCO,
    }

    /** Detecta na imagem reduzida a este lado maior: 12MP no Canny e desperdicio. */
    private const val LADO_DETECCAO = 900.0

    /**
     * Fracao do lado menor usada como nucleo do borrao que estima a iluminacao.
     * 0.08 e o valor que o MakeACopy usa e que se comporta bem em folha A4
     * fotografada de perto.
     */
    private const val FRACAO_NUCLEO = 0.08

    @Volatile
    private var iniciado = false

    /** `false` quando o OpenCV nao carrega; a tela entao avisa em vez de travar. */
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
        // papel na mesa ao lado, ou o contorno de um azulejo.
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
     * Endireita o recorte definido pelos quatro cantos e aplica o filtro.
     * Devolve um bitmap novo; o de entrada continua intacto.
     */
    fun endireitar(bitmap: Bitmap, cantos: List<PointF>, filtro: Filtro): Bitmap {
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

        val resultado = aplicarFiltro(endireitado, filtro)
        val saida = Bitmap.createBitmap(resultado.width(), resultado.height(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(resultado, saida)
        return saida
    }

    /** Aplica o filtro numa imagem RGBA ja endireitada. Sempre devolve RGBA. */
    private fun aplicarFiltro(fonte: Mat, filtro: Filtro): Mat = when (filtro) {
        Filtro.ORIGINAL -> fonte
        Filtro.COR -> magicaEmCor(fonte)
        Filtro.CINZA -> paraRgba(contrasteLeve(fundoEmparelhado(paraCinza(fonte))))
        Filtro.PRETO_BRANCO -> paraRgba(binarizar(fundoEmparelhado(paraCinza(fonte))))
    }

    // --- Filtros ------------------------------------------------------------

    /**
     * Clareia o papel sem tirar a cor da tinta.
     *
     * Trabalha em Lab e corrige so o canal L (luminosidade): a crominancia fica
     * intacta, entao o papel vai a branco e a caneta azul continua azul. E o que
     * um contrato assinado pede — preto e branco pode transformar traco claro em
     * nada, e a assinatura e justamente o que o documento precisa provar.
     */
    private fun magicaEmCor(fonte: Mat): Mat {
        val rgb = Mat()
        Imgproc.cvtColor(fonte, rgb, Imgproc.COLOR_RGBA2RGB)

        val lab = Mat()
        Imgproc.cvtColor(rgb, lab, Imgproc.COLOR_RGB2Lab)

        val canais = ArrayList<Mat>()
        Core.split(lab, canais)
        if (canais.size < 3) return fonte

        val lCorrigido = fundoEmparelhado(canais[0])
        // Um empurrao leve depois de emparelhar o fundo: firma a tinta sem
        // estourar o papel pra branco puro e comer o traco fino.
        contrasteLeve(lCorrigido).copyTo(canais[0])

        Core.merge(canais, lab)

        val rgbFinal = Mat()
        Imgproc.cvtColor(lab, rgbFinal, Imgproc.COLOR_Lab2RGB)
        val rgba = Mat()
        Imgproc.cvtColor(rgbFinal, rgba, Imgproc.COLOR_RGB2RGBA)
        return rgba
    }

    /**
     * Preto e branco de documento.
     *
     * Limiar adaptativo, nao global: com o fundo ja emparelhado, o limiar local
     * segura o texto claro sem transformar a textura do papel em sujeira preta.
     * O CLAHE so entra quando o contraste esta realmente baixo — aplicado sempre,
     * ele amplifica o grao do papel e o limiar transforma isso em pontinhos.
     */
    private fun binarizar(cinza: Mat): Mat {
        val trabalho = Mat()
        cinza.copyTo(trabalho)

        if (contrasteBaixo(trabalho)) {
            val clahe = Imgproc.createCLAHE(1.5, Size(8.0, 8.0))
            clahe.apply(trabalho, trabalho)
        }

        // Suavizacao minima contra ruido sal-e-pimenta. Mais que isto apaga
        // traco fino antes do limiar.
        Imgproc.GaussianBlur(trabalho, trabalho, Size(3.0, 3.0), 0.0)

        // Janela grande enxerga contexto suficiente pra decidir o limiar; janela
        // pequena persegue o grao do papel.
        var janela = max(51, (min(trabalho.width(), trabalho.height()) / 30) or 1)
        if (janela % 2 == 0) janela++

        val saida = Mat()
        Imgproc.adaptiveThreshold(
            trabalho, saida, 255.0,
            Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C, Imgproc.THRESH_BINARY,
            janela, 12.0,
        )
        return saida
    }

    // --- Peças de processamento ---------------------------------------------

    private fun paraCinza(fonte: Mat): Mat {
        val cinza = Mat()
        Imgproc.cvtColor(fonte, cinza, Imgproc.COLOR_RGBA2GRAY)
        return cinza
    }

    private fun paraRgba(cinza: Mat): Mat {
        val rgba = Mat()
        Imgproc.cvtColor(cinza, rgba, Imgproc.COLOR_GRAY2RGBA)
        return rgba
    }

    /**
     * Empareja a iluminacao dividindo a imagem pela propria versao muito
     * borrada — o borrao e, na pratica, o mapa de luz da foto. Papel sob luz de
     * teto sai com um lado escuro; isto corrige sem tocar no que esta escrito.
     *
     * A divisao acontece em ponto flutuante de proposito: feita em inteiro de 8
     * bits, cada pixel trunca antes de multiplicar por 255 e o resultado sai
     * chapado e lavado.
     */
    private fun fundoEmparelhado(cinza: Mat): Mat {
        var k = max(51, (min(cinza.width(), cinza.height()) * FRACAO_NUCLEO).toInt())
        if (k % 2 == 0) k++

        val fundo = Mat()
        Imgproc.GaussianBlur(cinza, fundo, Size(k.toDouble(), k.toDouble()), 0.0)

        val origemF = Mat()
        val fundoF = Mat()
        cinza.convertTo(origemF, CvType.CV_32F)
        fundo.convertTo(fundoF, CvType.CV_32F)
        // Piso em 1: pixel de fundo preto puro viraria divisao por zero.
        Core.max(fundoF, Scalar(1.0), fundoF)

        val normalizado = Mat()
        Core.divide(origemF, fundoF, normalizado)
        Core.multiply(normalizado, Scalar(255.0), normalizado)

        val saida = Mat()
        normalizado.convertTo(saida, CvType.CV_8U)
        return saida
    }

    /** Firma a tinta sem estourar o papel. */
    private fun contrasteLeve(cinza: Mat): Mat {
        val saida = Mat()
        cinza.convertTo(saida, CvType.CV_8U, 1.15, -12.0)
        return saida
    }

    /**
     * Desvio padrao baixo = imagem sem contraste. So nesse caso o CLAHE ajuda;
     * fora dele, atrapalha.
     */
    private fun contrasteBaixo(cinza: Mat): Boolean {
        val media = MatOfDouble()
        val desvio = MatOfDouble()
        Core.meanStdDev(cinza, media, desvio)
        val valores = desvio.toArray()
        return valores.isNotEmpty() && valores[0] < 40.0
    }

    // --- Geometria ----------------------------------------------------------

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
