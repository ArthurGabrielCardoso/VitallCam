package com.vitallcam

import android.annotation.SuppressLint
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.webkit.WebViewAssetLoader
import android.Manifest
import android.content.pm.PackageManager
import java.io.File

/**
 * MainActivity = host do WebView que carrega a app Next.js.
 *
 * Toda lógica da câmera intraoral foi movida pra IntraoralCaptureActivity
 * (Compose nativo, espelha o design web pixel-a-pixel). O bridge expõe
 * apenas o necessário pra abrir essa Activity e receber os arquivos
 * capturados de volta no callback JS.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingJsCallback: String? = null
    private var pendingFileChooser: ValueCallback<Array<Uri>>? = null

    /** Impressora de etiqueta: uma so, viva enquanto o app estiver aberto. */
    private val etiqueta by lazy { EtiquetaNiimbot(this) }
    private var impressaoPendente: (() -> Unit)? = null
    @Volatile private var imprimindo = false

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    override fun onCreate(savedInstanceState: Bundle?) {
        setTheme(androidx.appcompat.R.style.Theme_AppCompat_NoActionBar)
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        // Fundo branco — durante o recarregamento (recreate ao abrir o álbum) a
        // WebView fica branca em vez de cinza, emendando na animação do app.
        webView.setBackgroundColor(android.graphics.Color.WHITE)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            mediaPlaybackRequiresUserGesture = false
        }

        webView.addJavascriptInterface(VitallCamBridge(), "VitallCam")

        // Um WebView nao baixa arquivo por conta propria: sem DownloadListener o
        // link do APK do RustDesk (Configuracoes > Downloads) simplesmente nao
        // faz nada — sem erro, sem aviso, so um toque que parece nao registrar.
        // Entrega pro navegador do sistema, que sabe baixar e chamar o
        // instalador.
        webView.setDownloadListener { url, _, _, _, _ ->
            val aberto = runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
            }.isSuccess
            if (!aberto) {
                Toast.makeText(this, "Nenhum navegador para baixar este arquivo", Toast.LENGTH_LONG).show()
            }
        }

        // Asset loader: serve cacheDir/captures/* via
        // https://appassets.androidplatform.net/captures/<arquivo>
        // Permite o JS fazer fetch() das fotos/vídeos sem passar pelo
        // bridge (evita o limite de 1MB da Binder IPC).
        val capturesDir = File(cacheDir, "captures").apply { mkdirs() }
        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/captures/", WebViewAssetLoader.InternalStoragePathHandler(this, capturesDir))
            .build()

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.contains("vitallcam")) {
                    view.loadUrl(url)
                    return true
                }
                return false
            }

            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest,
            ): WebResourceResponse? {
                val response = assetLoader.shouldInterceptRequest(request.url) ?: return null
                // A página vem de https://vitallcam.vercel.app e o fetch vai pra
                // https://appassets.androidplatform.net/captures/* — origem
                // diferente. Sem CORS, o fetch JS é bloqueado e as capturas
                // nunca chegam no Supabase. Libera CORS pra qualquer origem.
                val headers = (response.responseHeaders ?: emptyMap()).toMutableMap()
                headers["Access-Control-Allow-Origin"] = "*"
                headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS"
                headers["Access-Control-Allow-Headers"] = "*"
                response.responseHeaders = headers
                return response
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                view.evaluateJavascript(
                    "window.__VITALLCAM_NATIVE__ = true;" +
                    "window.dispatchEvent(new Event('vitallcam:ready'));",
                    null,
                )
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val cameraGranted = ContextCompat.checkSelfPermission(
                    this@MainActivity, Manifest.permission.CAMERA,
                ) == PackageManager.PERMISSION_GRANTED

                if (cameraGranted) {
                    request.grant(request.resources)
                } else {
                    pendingPermissionRequest = request
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.CAMERA),
                        CAMERA_PERMISSION_CODE,
                    )
                }
            }

            // Um WebView nao abre seletor de arquivo por conta propria: sem
            // isto, tocar num <input type="file"> nao faz absolutamente nada —
            // sem erro, sem aviso, so um toque que parece nao registrar. Mesma
            // armadilha do DownloadListener acima. E o que faz "Anexar" a via
            // assinada do contrato (e o upload de fotos) funcionar na box.
            override fun onShowFileChooser(
                view: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: WebChromeClient.FileChooserParams?,
            ): Boolean {
                if (filePathCallback == null) return false

                // Uma escolha pendente por vez: se sobrou outra, encerra ela
                // com null. Callback largado sem resposta deixa o campo de
                // arquivo morto ate a pagina recarregar.
                pendingFileChooser?.onReceiveValue(null)
                pendingFileChooser = filePathCallback

                // createIntent() ja respeita o accept e o multiple declarados
                // no HTML — nao vale remontar isso na mao.
                val intent = fileChooserParams?.createIntent()
                if (intent == null) {
                    pendingFileChooser = null
                    filePathCallback.onReceiveValue(null)
                    return false
                }

                return try {
                    this@MainActivity.startActivityForResult(intent, FILE_CHOOSER_CODE)
                    true
                } catch (e: Exception) {
                    // Box recem-formatada pode nao ter gerenciador de arquivos.
                    pendingFileChooser = null
                    filePathCallback.onReceiveValue(null)
                    Toast.makeText(
                        this@MainActivity,
                        this@MainActivity.getString(R.string.sem_gerenciador_arquivos),
                        Toast.LENGTH_LONG,
                    ).show()
                    false
                }
            }
        }

        // Se voltamos da câmera via openAlbumUrl (recreate), abre direto a URL
        // do álbum; senão a URL inicial do app.
        val url = pendingStartUrl ?: getString(R.string.app_url)
        val veioDoAlbum = pendingStartUrl != null
        pendingStartUrl = null
        webView.loadUrl(url)
        slog("onCreate carregando ${if (veioDoAlbum) "ALBUM" else "inicial"}: $url")

        liveInstance = this
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == CAMERA_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest?.grant(pendingPermissionRequest!!.resources)
            } else {
                pendingPermissionRequest?.deny()
            }
            pendingPermissionRequest = null
        }

        if (requestCode == ETIQUETA_PERMISSION_CODE) {
            val concedidas = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            val pendente = impressaoPendente
            impressaoPendente = null
            if (concedidas && pendente != null) {
                // Concedeu: imprime sem pedir pra apertar o botao de novo — ela
                // ja apertou uma vez, a caixa de permissao foi um pedagio.
                pendente()
            } else if (!concedidas) {
                responderEtiqueta("sem-permissao")
            }
        }

        if (requestCode == SCAN_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                abrirScannerDocumento()
            } else {
                // Negou: o JS precisa saber, senao o botao fica girando.
                val callback = pendingJsCallback ?: "window.__onDocumentScan"
                pendingJsCallback = null
                webView.evaluateJavascript(
                    "if(typeof $callback==='function'){$callback([],'sem-permissao');}",
                    null,
                )
            }
        }
    }

    /**
     * O scanner so faz sentido com a camera concedida. Pedir na hora do uso —
     * e nao na abertura do app — evita a caixa de permissao aparecer pra quem
     * so veio ver a ficha do paciente.
     */
    private fun pedirCameraEAbrirScanner() {
        val concedida = ContextCompat.checkSelfPermission(
            this, Manifest.permission.CAMERA,
        ) == PackageManager.PERMISSION_GRANTED

        if (concedida) {
            abrirScannerDocumento()
        } else {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.CAMERA),
                SCAN_PERMISSION_CODE,
            )
        }
    }

    private fun abrirScannerDocumento() {
        val aberto = runCatching {
            startActivityForResult(
                Intent(this, DocumentScanActivity::class.java),
                DocumentScanActivity.REQUEST_CODE,
            )
        }.isSuccess

        if (!aberto) {
            // Avisa o JS pra ele nao ficar esperando pagina que nunca vem.
            val callback = pendingJsCallback ?: "window.__onDocumentScan"
            pendingJsCallback = null
            webView.evaluateJavascript(
                "if(typeof $callback==='function'){$callback([],'sem-camera');}",
                null,
            )
            Toast.makeText(this, getString(R.string.scan_sem_camera), Toast.LENGTH_LONG).show()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        slog("onActivityResult req=$requestCode res=$resultCode (OK=${Activity.RESULT_OK})")

        if (requestCode == FILE_CHOOSER_CODE) {
            val callback = pendingFileChooser
            pendingFileChooser = null
            // parseResult cobre os dois casos (um arquivo ou varios) e devolve
            // null no cancelamento — que precisa chegar ao WebView, senao o
            // campo de arquivo nao aceita um segundo toque.
            callback?.onReceiveValue(
                WebChromeClient.FileChooserParams.parseResult(resultCode, data)
            )
            return
        }

        if (requestCode == IntraoralCaptureActivity.REQUEST_CODE
            || requestCode == UsbCameraActivity.REQUEST_CODE
            || requestCode == DocumentScanActivity.REQUEST_CODE) {
            val callback = pendingJsCallback ?: "window.__onIntraoralCapture"
            pendingJsCallback = null

            // As tres Activities gravam em cacheDir/captures e devolvem o mesmo
            // extra, entao o caminho de volta pro WebView e um so.
            val extraKey = when (requestCode) {
                IntraoralCaptureActivity.REQUEST_CODE -> IntraoralCaptureActivity.EXTRA_IMAGE_PATHS
                DocumentScanActivity.REQUEST_CODE -> DocumentScanActivity.EXTRA_IMAGE_PATHS
                else -> UsbCameraActivity.EXTRA_IMAGE_PATHS
            }

            if (resultCode == Activity.RESULT_OK && data != null) {
                val paths = data.getStringArrayExtra(extraKey) ?: emptyArray()
                // Cada arquivo já está em cacheDir/captures/ — converte path
                // absoluto pra URL servida via WebViewAssetLoader.
                // Bridge passa só URLs curtas (não estoura Binder de 1MB).
                val capturesDirPath = File(cacheDir, "captures").absolutePath
                val urls = paths.mapNotNull { path ->
                    val f = File(path)
                    if (!f.exists()) return@mapNotNull null
                    if (path.startsWith(capturesDirPath)) {
                        val name = f.name
                        "https://appassets.androidplatform.net/captures/$name"
                    } else {
                        // Fallback (não deveria ocorrer): copia pro captures
                        val dest = File(File(cacheDir, "captures").apply { mkdirs() }, f.name)
                        runCatching { f.copyTo(dest, overwrite = true); f.delete() }
                        "https://appassets.androidplatform.net/captures/${dest.name}"
                    }
                }
                val arrayJs = urls.joinToString(",") { jsString(it) }
                val js = "if(typeof $callback==='function'){$callback([$arrayJs],null);}"
                slog("evaluateJS OK: ${urls.size} url(s) (fallback) -> $callback")
                webView.evaluateJavascript(js, null)
            } else {
                slog("evaluateJS cancelled -> $callback")
                val js = "if(typeof $callback==='function'){$callback([],'cancelled');}"
                webView.evaluateJavascript(js, null)
            }
            // Voltou da câmera nativa → devolve foco/toque pro WebView. Sem isso
            // os cliques ficavam "mortos" na TV box ao retornar da Activity.
            runCatching { webView.requestFocus() }
            webView.postDelayed({ runCatching { webView.requestFocus(); webView.requestFocusFromTouch() } }, 300)
        }
    }

    override fun onResume() {
        super.onResume()
        slog("onResume")
        // Garante WebView ativo e com foco ao retomar (ex.: voltando da câmera).
        runCatching {
            webView.onResume()
            webView.resumeTimers()
            webView.requestFocus()
        }
    }

    override fun onStop() {
        super.onStop()
        slog("onStop")
    }

    // Log silencioso (sem toast) pro /api/debug-log — diagnóstico do fluxo
    // pós-câmera. Desligado por padrão; ligar só pra investigar.
    private fun slog(msg: String) {
        android.util.Log.d("VitallCamMain", msg)
        if (!DEBUG_MAIN) return
        Thread {
            runCatching {
                val u = java.net.URL("https://vitallcam.vercel.app/api/debug-log")
                val c = u.openConnection() as java.net.HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true
                c.connectTimeout = 6000; c.readTimeout = 6000
                c.setRequestProperty("Content-Type", "text/plain; charset=utf-8")
                c.outputStream.use { it.write("MAIN ${android.text.format.DateFormat.format("HH:mm:ss", System.currentTimeMillis())} $msg".toByteArray()) }
                c.responseCode; c.disconnect()
            }
        }.start()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        if (liveInstance === this) liveInstance = null
        usbPermReceiver?.let { runCatching { unregisterReceiver(it) } }
        usbPermReceiver = null
    }

    // ---- Permissão USB pedida AQUI (tela normal, não-fullscreen). Em algumas
    // ROMs de TV box o diálogo de permissão some/é cancelado por cima da tela
    // fullscreen da câmera; pedindo na MainActivity ele costuma aparecer. Se
    // concedida, a permissão vale pro app todo e a IntraoralCaptureActivity
    // abre direto. ----
    private val actionUsbPerm = "com.vitallcam.USB_PERMISSION"
    private var usbPermReceiver: BroadcastReceiver? = null

    private fun isUvcDevice(d: UsbDevice): Boolean {
        if (d.deviceClass == 239 || d.deviceClass == 14 || d.deviceClass == 255) return true
        for (i in 0 until d.interfaceCount) {
            if (d.getInterface(i).interfaceClass == UsbConstants.USB_CLASS_VIDEO) return true
        }
        return false
    }

    private fun launchIntraoral() {
        val intent = Intent(this, IntraoralCaptureActivity::class.java)
        @Suppress("DEPRECATION")
        startActivityForResult(intent, IntraoralCaptureActivity.REQUEST_CODE)
    }

    private fun requestUsbThenLaunchIntraoral() {
        val um = getSystemService(Context.USB_SERVICE) as? UsbManager
        val cam = um?.deviceList?.values?.firstOrNull { isUvcDevice(it) }
        if (um == null || cam == null) { launchIntraoral(); return }
        if (um.hasPermission(cam)) {
            Toast.makeText(this, "USB já autorizado — abrindo câmera", Toast.LENGTH_SHORT).show()
            launchIntraoral()
            return
        }
        if (usbPermReceiver == null) {
            usbPermReceiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, i: Intent?) {
                    if (i?.action != actionUsbPerm) return
                    val granted = i.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    Toast.makeText(this@MainActivity, if (granted) "USB autorizado!" else "USB negado pelo sistema", Toast.LENGTH_LONG).show()
                    launchIntraoral()
                }
            }
            val f = IntentFilter(actionUsbPerm)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(usbPermReceiver, f, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                registerReceiver(usbPermReceiver, f)
            }
        }
        // API 30 (Android 11 do box): PendingIntent é mutável por padrão — NÃO
        // usar FLAG_IMMUTABLE (senão o extra GRANTED some). MUTABLE só >= API 31.
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        else
            PendingIntent.FLAG_UPDATE_CURRENT
        val pi = PendingIntent.getBroadcast(this, 0, Intent(actionUsbPerm).setPackage(packageName), flags)
        Toast.makeText(this, "Pedindo permissão USB…", Toast.LENGTH_SHORT).show()
        um.requestPermission(cam, pi)
    }

    /** Devolve o resultado da impressao pro JS; "" = deu certo. */
    private fun responderEtiqueta(erro: String) {
        runOnUiThread {
            val valor = if (erro.isEmpty()) "null" else jsString(erro)
            webView.evaluateJavascript(
                "if(typeof window.__onEtiquetaImpressa==='function'){window.__onEtiquetaImpressa($valor);}",
                null,
            )
        }
    }

    private fun jsString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\\\")
                '"' -> sb.append("\\\"")
                '\n' -> sb.append("\\n")
                '\r' -> sb.append("\\r")
                '\t' -> sb.append("\\t")
                else -> sb.append(c)
            }
        }
        sb.append("\"")
        return sb.toString()
    }

    inner class VitallCamBridge {
        @JavascriptInterface
        fun isNative(): Boolean = true

        @JavascriptInterface
        fun openIntraoralCamera(jsCallbackName: String?) {
            pendingJsCallback = if (jsCallbackName.isNullOrBlank())
                "window.__onIntraoralCapture" else jsCallbackName
            runOnUiThread { requestUsbThenLaunchIntraoral() }
        }

        @JavascriptInterface
        fun openIntraoralCamera() = openIntraoralCamera(null)

        /**
         * Abre o scanner de documentos (camera traseira do tablet). Devolve as
         * paginas pelo mesmo callback das capturas intraorais — a ponte ja sabe
         * converter caminho de arquivo em URL servida ao WebView.
         */
        @JavascriptInterface
        fun escanearDocumento(jsCallbackName: String?) {
            pendingJsCallback = if (jsCallbackName.isNullOrBlank())
                "window.__onDocumentScan" else jsCallbackName
            runOnUiThread { pedirCameraEAbrirScanner() }
        }

        @JavascriptInterface
        fun escanearDocumento() = escanearDocumento(null)

        /**
         * Espelha o notebook da clinica pra ver/planejar a tomografia na cadeira.
         *
         * O exame vem da Cedor em .bpt, formato fechado da BioParts que so o
         * DentalSlice abre — e o DentalSlice e .exe Win32, que esta box
         * (ARM/Android) nao roda. Entao em vez de abrir o arquivo aqui,
         * mostramos a tela de quem consegue abrir.
         *
         * Devolve "ok" | "sem-app" em vez de falhar calado: RustDesk ausente e o
         * caso comum numa box recem-formatada, e o web precisa saber a diferenca
         * pra dizer o que fazer.
         */
        @JavascriptInterface
        fun abrirDentalSlice(): String {
            val host = getString(R.string.notebook_dentalslice_host)
            // O esquema rustdesk:// ja conecta no destino. Se a versao instalada
            // nao atender, abrir o app na tela de conexao ainda poupa sair do
            // VitallCam a mao.
            val direto = Intent(Intent.ACTION_VIEW, android.net.Uri.parse("rustdesk://connection/new/$host"))
            val naTelaDeConexao = packageManager.getLaunchIntentForPackage(RUSTDESK_PACKAGE)
            for (intent in listOfNotNull(direto, naTelaDeConexao)) {
                if (runCatching { startActivity(intent) }.isSuccess) return "ok"
            }
            return "sem-app"
        }

        /**
         * Imprime a etiqueta na Niimbot pareada. O desenho vem pronto da web
         * (canvas em 203 dpi, ja em 1 bit por ponto) — aqui so o radio.
         *
         * Existe porque a Web Bluetooth exige escolher o aparelho num seletor a
         * cada sessao. Na bancada da CME isso e um clique a mais por lote; com o
         * MAC salvo e a conexao de pe, "imprimir 15" e um toque so.
         *
         * @param linhasBase64 linhas concatenadas, `bytesPorLinha` cada.
         * @param largura pontos na largura da cabeca (96 na D110).
         */
        @JavascriptInterface
        fun imprimirEtiqueta(
            linhasBase64: String,
            largura: Int,
            copias: Int,
            densidade: Int,
            repetirPagina: Boolean,
        ) {
            if (imprimindo) { responderEtiqueta("ja-imprimindo"); return }

            val bytesPorLinha = (largura + 7) / 8
            val dados = runCatching {
                android.util.Base64.decode(linhasBase64, android.util.Base64.DEFAULT)
            }.getOrNull()
            if (dados == null || bytesPorLinha <= 0 || dados.size < bytesPorLinha) {
                responderEtiqueta("etiqueta-invalida"); return
            }
            val linhas = (0 until dados.size / bytesPorLinha).map { y ->
                dados.copyOfRange(y * bytesPorLinha, (y + 1) * bytesPorLinha)
            }

            val trabalho = {
                imprimindo = true
                Thread {
                    val erro = runCatching {
                        etiqueta.imprimir(linhas, largura, copias, densidade, repetirPagina) { pct ->
                            runOnUiThread {
                                webView.evaluateJavascript(
                                    "if(typeof window.__onEtiquetaProgresso==='function'){window.__onEtiquetaProgresso($pct);}",
                                    null,
                                )
                            }
                        }
                    }.getOrElse { it.message ?: "Falha ao imprimir" }
                    imprimindo = false
                    responderEtiqueta(erro)
                }.start()
            }

            val faltando = etiqueta.permissoesFaltando()
            if (faltando.isEmpty()) {
                trabalho()
            } else {
                // Pedir na hora do uso: quem so veio ver a ficha do paciente nao
                // precisa ver caixa de Bluetooth nenhuma.
                impressaoPendente = trabalho
                runOnUiThread { ActivityCompat.requestPermissions(this@MainActivity, faltando, ETIQUETA_PERMISSION_CODE) }
            }
        }

        /** Nome da impressora lembrada, ou "" enquanto nenhuma foi encontrada. */
        @JavascriptInterface
        fun impressoraEtiqueta(): String = etiqueta.nomeLembrado()

        /** Esquece a impressora salva — trocou de aparelho na clinica. */
        @JavascriptInterface
        fun esquecerImpressoraEtiqueta() {
            Thread { etiqueta.esquecer() }.start()
        }

        // ---- Stubs no-op pra compatibilidade com versões web em cache que
        // ainda chamam estes métodos do fluxo antigo (live preview overlay).
        // Nada acontece; em breve a web simplificada não chama mais. ----

        @JavascriptInterface
        fun startIntraoralPreview(stateCallbackName: String?) {
            // Imediatamente sinaliza "ready" pra qualquer UI antiga que esteja
            // esperando esse estado, evitando travas.
            val cb = if (stateCallbackName.isNullOrBlank()) "window.__onIntraoralState" else stateCallbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(${jsString("ready")});}",
                    null,
                )
            }
        }

        @JavascriptInterface
        fun startIntraoralPreview() = startIntraoralPreview(null)

        @JavascriptInterface fun stopIntraoralPreview() {}
        @JavascriptInterface fun setIntraoralPreviewBounds(x: Float, y: Float, w: Float, h: Float) {}
        @JavascriptInterface fun setIntraoralPreviewBounds(x: Double, y: Double, w: Double, h: Double) {}
        @JavascriptInterface fun setIntraoralMirror(mirror: Boolean) {}
        @JavascriptInterface fun setIntraoralPreviewVisible(visible: Boolean) {}

        @JavascriptInterface
        fun captureIntraoralFrame(callbackName: String?) {
            val cb = if (callbackName.isNullOrBlank()) "window.__onIntraoralFrame" else callbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(null,${jsString("not-supported-use-openIntraoralCamera")});}",
                    null,
                )
            }
        }
        @JavascriptInterface fun captureIntraoralFrame() = captureIntraoralFrame(null)

        @JavascriptInterface
        fun startIntraoralRecording(callbackName: String?) {
            val cb = if (callbackName.isNullOrBlank()) "window.__onIntraoralVideo" else callbackName
            runOnUiThread {
                webView.evaluateJavascript(
                    "if(typeof $cb==='function'){$cb(null,${jsString("not-supported")});}",
                    null,
                )
            }
        }
        @JavascriptInterface fun startIntraoralRecording() = startIntraoralRecording(null)
        @JavascriptInterface fun stopIntraoralRecording() {}
        @JavascriptInterface fun isIntraoralRecording(): Boolean = false
        @JavascriptInterface fun getIntraoralCapabilities(callbackName: String?) {}
        @JavascriptInterface fun getIntraoralCapabilities() {}
        @JavascriptInterface fun setIntraoralResolution(width: Int, height: Int) {}
        @JavascriptInterface fun setIntraoralZoomPercent(percent: Int) {}

        /**
         * Abre o álbum recriando a Activity/WebView (recreate). É o jeito
         * confiável de voltar da câmera nativa: a TV box às vezes "mata" o toque
         * do WebView ao voltar de uma Activity por cima — só recriando volta
         * (mesmo efeito de fechar/reabrir o app). O web chama isso DEPOIS que os
         * uploads terminam, então não perde foto.
         */
        @JavascriptInterface
        fun openAlbumUrl(path: String) {
            slog("openAlbumUrl chamado path=$path")
            if (!path.startsWith("/")) { slog("openAlbumUrl IGNORADO (path invalido)"); return }
            runOnUiThread {
                val u = android.net.Uri.parse(getString(R.string.app_url))
                pendingStartUrl = "${u.scheme}://${u.authority}$path"
                slog("openAlbumUrl -> recreate() pra $pendingStartUrl")
                recreate()
            }
        }

        /** Deleta um arquivo capturado do cache depois de upload completo. */
        @JavascriptInterface
        fun deleteCaptureFile(filename: String) {
            if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) return
            val f = File(File(cacheDir, "captures"), filename)
            if (f.exists()) runCatching { f.delete() }
        }
    }

    companion object {
        private const val CAMERA_PERMISSION_CODE = 1001
        private const val FILE_CHOOSER_CODE = 1002
        private const val SCAN_PERMISSION_CODE = 1003
        private const val ETIQUETA_PERMISSION_CODE = 1004

        // Pacote do RustDesk (o cliente Flutter oficial). Tambem declarado em
        // <queries> no manifest, senao o Android 11+ esconde o app de nos.
        private const val RUSTDESK_PACKAGE = "com.carriez.flutter_hbb"
        // Log de diagnóstico do MainActivity pro servidor. false em produção.
        private const val DEBUG_MAIN = false

        // Referência viva pra Activity nativa da câmera entregar CADA foto direto
        // pro WebView na hora (igual capturePhoto do web): sem arquivo, sem busca.
        @Volatile private var liveInstance: MainActivity? = null

        // URL pra carregar após recreate() (abrir o álbum ao voltar da câmera).
        // Estática pra sobreviver ao recreate.
        @Volatile private var pendingStartUrl: String? = null

        /**
         * Entrega UMA foto (dataURL base64) pro web imediatamente.
         * @param capturedAt millis da captura — vira created_at no banco pra
         *   garantir a ORDEM certa mesmo com uploads em paralelo.
         * Retorna true se entregou (WebView vivo); false → cai no fallback do Salvar.
         */
        fun pushIntraoralPhoto(dataUrl: String, id: String, capturedAt: Long): Boolean {
            val act = liveInstance ?: return false
            act.runOnUiThread {
                val js = "if(typeof window.__onIntraoralPhoto==='function'){" +
                    "window.__onIntraoralPhoto(${act.jsString(dataUrl)},${act.jsString(id)},${capturedAt});}"
                runCatching { act.webView.evaluateJavascript(js, null) }
            }
            return true
        }
    }
}
