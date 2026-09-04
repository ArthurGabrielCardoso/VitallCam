package com.vitallcam

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

/**
 * Impressao de etiqueta na Niimbot, direto do app — sem o Bluetooth do
 * navegador e sem escolher a impressora a cada vez.
 *
 * A Web Bluetooth do Chrome obriga um clique e um seletor de aparelhos a cada
 * sessao, por seguranca: pagina nenhuma pode falar com um aparelho que o
 * usuario nao escolheu naquele momento. Isso e correto para a web e pessimo
 * para a bancada da CME, onde a Jessica embala vinte pacotes e quer apertar
 * "imprimir 15" e pronto. Dentro do APK a regra nao existe: o MAC da impressora
 * fica salvo, a conexao GATT fica de pe entre as impressoes e o segundo lote do
 * dia sai sem nenhuma caixa de dialogo.
 *
 * O desenho da etiqueta continua sendo feito na web (canvas + QR, em 203 dpi) e
 * chega aqui pronto, ja empacotado em 1 bit por ponto. Este arquivo so cuida do
 * radio: achar a impressora, manter a conexao e falar o protocolo.
 *
 * O protocolo e o mapeado pela comunidade (niimprint, NiimBlue) — a Niimbot nao
 * publica SDK. Pacote: 55 55 <tipo> <tamanho> <dados> <xor> AA AA.
 *
 * O comando de tamanho da pagina (0x13) muda de formato entre as familias, e e
 * ai que a etiqueta sai em branco quando erra: a impressora aceita o trabalho,
 * anda o papel e descarta as linhas. Sao tres formatos conhecidos (VARIANTE_*),
 * escolhidos na tela — a D110_M usa o de 4 bytes, com a largura junto.
 */
@SuppressLint("MissingPermission")
class EtiquetaNiimbot(private val context: Context) {

    private var gatt: BluetoothGatt? = null
    private var canal: BluetoothGattCharacteristic? = null
    private var mtu = 23

    /**
     * Trilha do ultimo trabalho, em uma linha por passo.
     *
     * Impressora nao tem tela e o tablet fica na clinica: sem isto, "no app nao
     * imprime" e tudo o que da para saber. Uma linha por passo diz exatamente
     * onde parou — achar a impressora, conectar, listar servicos, escrever.
     */
    private val trilha = StringBuilder()

    /**
     * Pedido de parada vindo da tela.
     *
     * Volatil porque quem pede e a thread da interface e quem obedece e a thread
     * da impressao — sem isso o laco poderia nunca enxergar a mudanca.
     */
    @Volatile private var cancelado = false

    /** Interrompe o lote em andamento; o que ja foi para a impressora sai. */
    fun cancelar() { cancelado = true }

    private fun anotar(passo: String) {
        if (trilha.length < 4000) trilha.append(passo).append('\n')
    }

    /** O que aconteceu no ultimo trabalho, para o app mandar ao diagnostico. */
    fun diagnostico(): String = trilha.toString()

    /** Eventos de conexao/escrita, na ordem em que o Android os entrega. */
    private data class Evento(val tipo: String, val ok: Boolean)
    private val eventos = ArrayBlockingQueue<Evento>(64)

    private data class Resposta(val tipo: Int, val dados: ByteArray)
    private val respostas = ArrayBlockingQueue<Resposta>(32)
    private val recebidos = ArrayList<Byte>()

    private val retorno = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(g: BluetoothGatt, status: Int, novoEstado: Int) {
            if (novoEstado == BluetoothProfile.STATE_CONNECTED) {
                eventos.offer(Evento("conectado", status == BluetoothGatt.GATT_SUCCESS))
            } else {
                canal = null
                eventos.offer(Evento("desconectado", false))
            }
        }

        override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
            eventos.offer(Evento("servicos", status == BluetoothGatt.GATT_SUCCESS))
        }

        override fun onMtuChanged(g: BluetoothGatt, novoMtu: Int, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) mtu = novoMtu
            eventos.offer(Evento("mtu", status == BluetoothGatt.GATT_SUCCESS))
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, status: Int) {
            eventos.offer(Evento("descritor", status == BluetoothGatt.GATT_SUCCESS))
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
            eventos.offer(Evento("escrito", status == BluetoothGatt.GATT_SUCCESS))
        }

        // A assinatura com `value` so existe da API 33 pra cima; sem sobrescrever
        // a nova, o Android chama esta em todas as versoes.
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            receber(c.value ?: return)
        }
    }

    // ------------------------------------------------------------ permissoes ---

    /** Permissoes que ainda faltam; vazio = pode imprimir. */
    fun permissoesFaltando(): Array<String> {
        val necessarias = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            listOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
        } else {
            // Ate o Android 11 varrer BLE exige localizacao — regra do sistema,
            // nao nossa: sem ela o scanner devolve lista vazia e nada explica.
            listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }
        return necessarias
            .filter { ContextCompat.checkSelfPermission(context, it) != PackageManager.PERMISSION_GRANTED }
            .toTypedArray()
    }

    // -------------------------------------------------------------- impressora ---

    private fun prefs() = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Nome da impressora lembrada, ou "" enquanto nenhuma foi encontrada. */
    fun nomeLembrado(): String = prefs().getString(CHAVE_NOME, "") ?: ""

    /** Esquece a impressora salva — troca de aparelho na clinica. */
    fun esquecer() {
        desconectar()
        prefs().edit().remove(CHAVE_MAC).remove(CHAVE_NOME).apply()
    }

    private fun adaptador() =
        (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    /**
     * Acha a impressora, na ordem que custa menos tempo: a que ja usamos, e so
     * entao varre o ar.
     *
     * Tinha um passo no meio que tentava o aparelho pareado no Android antes de
     * varrer. Vai fora: a mesma Niimbot mostrou dois enderecos BLE diferentes
     * nos testes — um so responde a pareamento classico, o outro e quem aceita
     * connectGatt de verdade — e o pareado do Android nao e garantia de ser
     * esse segundo. Insistir nele so gastava os 15s de timeout antes de cair na
     * varredura, que e quem sempre achou o certo.
     */
    private fun encontrar(): BluetoothDevice? {
        val adapter = adaptador() ?: return null
        val prefs = prefs()

        prefs.getString(CHAVE_MAC, null)?.let { mac ->
            runCatching { adapter.getRemoteDevice(mac) }.getOrNull()?.let { return it }
        }

        val scanner = adapter.bluetoothLeScanner ?: return null
        val achados = ArrayBlockingQueue<BluetoothDevice>(1)
        val varredura = object : ScanCallback() {
            override fun onScanResult(tipo: Int, resultado: ScanResult) {
                val nome = resultado.device?.name ?: resultado.scanRecord?.deviceName
                // Nem toda Niimbot anuncia o nome: parte delas so aparece com o
                // nome depois de conectada. Quando o anuncio traz o servico
                // serial, isso ja identifica a impressora.
                val anunciaServico = resultado.scanRecord?.serviceUuids
                    ?.any { it.uuid == SERVICO } == true
                if (ehNiimbot(nome) || anunciaServico) achados.offer(resultado.device)
            }
        }
        val ajustes = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()
        scanner.startScan(null, ajustes, varredura)
        anotar("varrendo o ar")
        val achada = runCatching { achados.poll(SEGUNDOS_VARREDURA, TimeUnit.SECONDS) }.getOrNull()
        runCatching { scanner.stopScan(varredura) }
        achada?.let { lembrar(it) }
        return achada
    }

    /** Uma impressora vista no ar, do jeito que a tela mostra. */
    data class Encontrada(val nome: String, val mac: String, val provavel: Boolean)

    /**
     * Varre e devolve tudo o que apareceu, com as prováveis Niimbot na frente.
     *
     * Devolver também o que não parece impressora é de propósito: o nome do
     * anúncio varia por lote e por firmware, e esconder um aparelho porque o
     * nome não bate com a nossa lista é como a busca automática falha sem
     * explicação. Quem está com a impressora na mão sabe qual é a dela.
     *
     * Bloqueia pelo tempo da varredura — chame de uma thread de fundo.
     */
    fun procurar(segundos: Long = SEGUNDOS_VARREDURA): List<Encontrada> {
        val adapter = adaptador() ?: return emptyList()
        // Chave pelo NOME, não pelo endereço: muita Niimbot expõe um endereço
        // para o pareamento clássico e outro, diferente, para o BLE — o mesmo
        // aparelho físico aparecia duas vezes na lista, com o clássico nunca
        // conectando (connectGatt precisa do endereço BLE). A varredura roda
        // DEPOIS e pisa na entrada pareada com o mesmo nome, então quando os
        // dois existem fica valendo o endereço que de fato conecta.
        val achados = LinkedHashMap<String, Encontrada>()

        adapter.bondedDevices.orEmpty().forEach { pareada ->
            val nome = pareada.name
            if (!nome.isNullOrBlank()) achados[nome.uppercase()] = Encontrada(nome, pareada.address, ehNiimbot(nome))
        }

        val scanner = adapter.bluetoothLeScanner
        if (scanner != null) {
            val varredura = object : ScanCallback() {
                override fun onScanResult(tipo: Int, resultado: ScanResult) {
                    val device = resultado.device ?: return
                    val nome = device.name ?: resultado.scanRecord?.deviceName ?: return
                    val anunciaServico = resultado.scanRecord?.serviceUuids?.any { it.uuid == SERVICO } == true
                    achados[nome.uppercase()] = Encontrada(nome, device.address, ehNiimbot(nome) || anunciaServico)
                }
            }
            val ajustes = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
            scanner.startScan(null, ajustes, varredura)
            runCatching { Thread.sleep(segundos * 1000) }
            runCatching { scanner.stopScan(varredura) }
        }

        return achados.values.sortedByDescending { it.provavel }
    }

    /**
     * Abre a conexao sem imprimir nada.
     *
     * A tela chama isto ao abrir, para que o trabalho da Jessica nunca seja o
     * primeiro contato com a impressora — que e justamente o que sai em branco.
     * Quando ela aperta imprimir, o canal ja esta quente ha algum tempo.
     */
    fun aquecer(): String {
        if (permissoesFaltando().isNotEmpty()) return "Falta a permissao de Bluetooth."
        return conectar()
    }

    /** Fixa a impressora escolhida na tela; a próxima impressão vai direto nela. */
    fun escolher(mac: String, nome: String) {
        desconectar()
        prefs().edit().putString(CHAVE_MAC, mac).putString(CHAVE_NOME, nome).apply()
    }

    /**
     * Fixa a impressora e testa a conexão na hora.
     *
     * `escolher` sozinho só grava o MAC — a tela dizia "conectada" sem saber
     * se aquele aparelho de fato aceita conexão, e o erro só aparecia na hora
     * de imprimir. Aqui a escolha já vem com a resposta de verdade.
     */
    fun escolherEConectar(mac: String, nome: String): String {
        escolher(mac, nome)
        if (permissoesFaltando().isNotEmpty()) return "Falta a permissao de Bluetooth."
        return conectar()
    }

    private fun ehNiimbot(nome: String?): Boolean {
        val n = nome?.uppercase() ?: return false
        return PREFIXOS.any { n.startsWith(it) }
    }

    private fun lembrar(device: BluetoothDevice) {
        prefs().edit()
            .putString(CHAVE_MAC, device.address)
            .putString(CHAVE_NOME, device.name ?: "Niimbot")
            .apply()
    }

    // ----------------------------------------------------------------- conexao ---

    /** Espera o proximo evento do tipo pedido, ignorando o que vier antes. */
    private fun esperar(tipo: String, ms: Long): Boolean {
        val limite = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < limite) {
            val evento = runCatching {
                eventos.poll(limite - System.currentTimeMillis(), TimeUnit.MILLISECONDS)
            }.getOrNull() ?: return false
            if (evento.tipo == tipo) return evento.ok
            if (evento.tipo == "desconectado") return false
        }
        return false
    }

    /**
     * O que impede a busca antes mesmo de comecar.
     *
     * Sem isto tudo desemboca em "nao achei a impressora", que manda a pessoa
     * procurar defeito na Niimbot quando o problema esta no tablet — e o caso
     * mais comum e justamente esse: ate o Android 11, o sistema exige a
     * localizacao LIGADA para devolver qualquer resultado de varredura BLE.
     * Ninguem adivinha isso olhando para uma impressora acesa.
     */
    fun impedimento(): String {
        val adapter = adaptador() ?: return "Este aparelho nao tem Bluetooth."
        if (!adapter.isEnabled) return "O Bluetooth do tablet esta desligado. Ligue e tente de novo."

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            val local = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            val ligada = local != null && (
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) local.isLocationEnabled
                else runCatching { local.isProviderEnabled(LocationManager.NETWORK_PROVIDER) }.getOrDefault(false) ||
                    runCatching { local.isProviderEnabled(LocationManager.GPS_PROVIDER) }.getOrDefault(false)
            )
            if (!ligada) {
                return "Ligue a Localizacao do tablet: nesta versao do Android ela e obrigatoria para achar a impressora por Bluetooth."
            }
        }
        return ""
    }

    private fun conectar(): String {
        if (canal != null && gatt != null) return ""

        val impedimento = impedimento()
        if (impedimento.isNotEmpty()) {
            anotar("impedimento: $impedimento")
            return impedimento
        }

        val device = encontrar()
            ?: return "Nao achei a impressora. Ligue a Niimbot, deixe perto do tablet e confira se ela nao esta conectada no app da Niimbot."

        eventos.clear()
        anotar("achou ${device.name ?: "sem nome"} ${device.address}")
        val g = device.connectGatt(context, false, retorno, BluetoothDevice.TRANSPORT_LE)
            ?: return "Nao consegui abrir a conexao com a impressora."
        gatt = g

        if (!esperar("conectado", 15_000)) {
            anotar("nao conectou em 15s")
            // MAC salvo de uma impressora que nao esta mais ali: esquecer aqui
            // faz a proxima tentativa varrer em vez de insistir no aparelho errado.
            desconectar()
            prefs().edit().remove(CHAVE_MAC).apply()
            return "A impressora nao respondeu. Confira se ela esta ligada."
        }

        // Sem isto o Android conversa no intervalo folgado de ~50ms: 400 linhas
        // viram mais de meio minuto de barra de progresso. Em prioridade alta o
        // intervalo cai para ~11ms e a etiqueta sai em poucos segundos.
        runCatching { g.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH) }

        // MTU maior = menos fatias por linha impressa; se o firmware recusar,
        // seguimos nos 23 bytes padrao, so mais devagar.
        g.requestMtu(247)
        esperar("mtu", 3_000)
        anotar("conectado, mtu=$mtu")

        if (!g.discoverServices() || !esperar("servicos", 15_000)) {
            anotar("nao listou servicos")
            desconectar()
            return "A impressora conectou mas nao listou os servicos."
        }

        val caracteristica = g.getService(SERVICO)?.getCharacteristic(CARACTERISTICA)
            ?: procurarCanalSerial(g)
            ?: run {
                anotar("servicos sem canal: " + g.services.orEmpty().joinToString { it.uuid.toString() })
                desconectar()
                return "Este modelo nao expos o canal de impressao esperado."
            }

        g.setCharacteristicNotification(caracteristica, true)
        caracteristica.getDescriptor(CCCD)?.let { descritor ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeDescriptor(descritor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                run {
                    descritor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    g.writeDescriptor(descritor)
                }
            }
            esperar("descritor", 3_000)
        }

        canal = caracteristica
        anotar("canal ${caracteristica.uuid} props=${caracteristica.properties}")

        // Aperto de mao antes do primeiro trabalho.
        //
        // A trilha mostrou que o trabalho que ABRE a conexao sai em branco e o
        // seguinte sai certo. Nao e o desenho: e a impressora, que ainda nao
        // terminou de acordar quando o desenho chega — o papel anda, os comandos
        // de abertura passam e as linhas se perdem.
        //
        // A batida resolve os dois lados de uma vez: acorda a impressora e so
        // volta quando ela responde, o que tambem prova que as notificacoes
        // estao chegando. Esperar resposta e melhor do que esperar um tempo fixo,
        // porque tempo fixo ou sobra ou falta, e aqui faltou.
        var respondeu = false
        for (tentativa in 1..4) {
            if (comando(BATIDA, byteArrayOf(1), null) == null) {
                // Sem resposta esperada: qualquer pacote que volte serve de sinal
                // de vida, entao damos um tempo curto e olhamos a fila.
                Thread.sleep(250)
            }
            if (respostas.isNotEmpty()) { respondeu = true; break }
            Thread.sleep(250)
            if (respostas.isNotEmpty()) { respondeu = true; break }
        }
        respostas.clear()
        anotar(if (respondeu) "impressora respondeu a batida" else "batida sem resposta — seguindo assim mesmo")

        return ""
    }

    /** Qualquer caracteristica que escreva e notifique serve de porta serial. */
    private fun procurarCanalSerial(g: BluetoothGatt): BluetoothGattCharacteristic? {
        for (servico in g.services.orEmpty()) {
            for (c in servico.characteristics.orEmpty()) {
                val escreve = c.properties and
                    (BluetoothGattCharacteristic.PROPERTY_WRITE or
                        BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
                val notifica = c.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0
                if (escreve && notifica) return c
            }
        }
        return null
    }

    fun desconectar() {
        canal = null
        runCatching { gatt?.close() }
        gatt = null
        eventos.clear()
        respostas.clear()
        recebidos.clear()
    }

    // ---------------------------------------------------------------- protocolo ---

    private fun pacote(tipo: Int, dados: ByteArray): ByteArray {
        var xor = tipo xor dados.size
        for (b in dados) xor = xor xor (b.toInt() and 0xFF)
        val saida = ByteArray(dados.size + 7)
        saida[0] = 0x55
        saida[1] = 0x55
        saida[2] = tipo.toByte()
        saida[3] = dados.size.toByte()
        System.arraycopy(dados, 0, saida, 4, dados.size)
        saida[dados.size + 4] = xor.toByte()
        saida[dados.size + 5] = 0xAA.toByte()
        saida[dados.size + 6] = 0xAA.toByte()
        return saida
    }

    /** Junta os fragmentos das notificacoes ate fechar um pacote inteiro. */
    private fun receber(bytes: ByteArray) {
        for (b in bytes) recebidos.add(b)
        while (recebidos.size >= 7) {
            var inicio = -1
            for (i in 0 until recebidos.size - 1) {
                if (recebidos[i] == 0x55.toByte() && recebidos[i + 1] == 0x55.toByte()) { inicio = i; break }
            }
            if (inicio < 0) { recebidos.clear(); return }
            if (inicio > 0) repeat(inicio) { recebidos.removeAt(0) }

            val tamanho = recebidos[3].toInt() and 0xFF
            val total = tamanho + 7
            if (recebidos.size < total) return
            val dados = ByteArray(tamanho) { recebidos[4 + it] }
            val tipo = recebidos[2].toInt() and 0xFF
            repeat(total) { recebidos.removeAt(0) }
            respostas.offer(Resposta(tipo, dados))
        }
    }

    /**
     * Escreve no canal serial.
     *
     * Com confirmacao sempre que o canal aceitar. "Sem resposta" e mais rapido
     * no papel, mas nao tem controle de fluxo nenhum: a impressora descarta o
     * pacote em silencio quando o buffer dela enche ou quando o link ainda esta
     * ajustando parametros — que e exatamente o estado logo depois de conectar.
     * Era isso que fazia a PRIMEIRA etiqueta de cada conexao sair em branco e a
     * segunda sair certa.
     *
     * O custo e baixo porque as linhas ja vao em lote: com MTU de 244 uma
     * etiqueta inteira sao umas quarenta escritas, nao oitocentas.
     */
    private fun escrever(pacote: ByteArray): Boolean {
        val c = canal ?: return false
        val g = gatt ?: return false
        val comResposta = c.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0
        val tipo = if (comResposta) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
        else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE

        val passo = (mtu - 3).coerceIn(20, 512)
        var i = 0
        while (i < pacote.size) {
            val fatia = pacote.copyOfRange(i, minOf(i + passo, pacote.size))
            val enviou = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                g.writeCharacteristic(c, fatia, tipo) == BluetoothStatusCodes.SUCCESS
            } else {
                @Suppress("DEPRECATION")
                run {
                    c.writeType = tipo
                    c.value = fatia
                    g.writeCharacteristic(c)
                }
            }
            // Uma escrita por vez: o Android descarta a segunda se a primeira
            // ainda nao voltou, e a etiqueta sairia com linhas faltando.
            if (!enviou || !esperar("escrito", 5_000)) return false
            i += passo
        }
        return true
    }

    /** Manda um comando e diz apenas se o pacote saiu — sem esperar resposta. */
    /**
     * Espera a impressora chegar em `alvo` etiquetas.
     *
     * Prefere a resposta dela ao relogio; quando ela nao responde ao pedido de
     * status — e esta nao responde — cai no tempo estimado pelo tamanho do
     * desenho, que e melhor do que um numero fixo chutado.
     */
    private fun esperarEtiquetas(alvo: Int, msPorEtiqueta: Long) {
        val limite = System.currentTimeMillis() + 2_000 + alvo * msPorEtiqueta * 2
        var mudo = false
        while (System.currentTimeMillis() < limite) {
            val status = comando(STATUS, byteArrayOf(1), STATUS + 0x10, 400)
            if (status == null || status.dados.size < 2) { mudo = true; break }
            val feitas = ((status.dados[0].toInt() and 0xFF) shl 8) or (status.dados[1].toInt() and 0xFF)
            if (feitas >= alvo) { anotar("impressora confirmou $feitas"); return }
            Thread.sleep(200)
        }
        Thread.sleep(msPorEtiqueta)
        if (mudo) anotar("status mudo — esperou pela etiqueta $alvo")
        else anotar("status nao chegou a $alvo")
    }

    private fun escreveu(tipo: Int, dados: ByteArray): Boolean {
        respostas.clear()
        return escrever(pacote(tipo, dados))
    }

    private fun comando(tipo: Int, dados: ByteArray, respostaEsperada: Int?, ms: Long = 700): Resposta? {
        respostas.clear()
        if (!escrever(pacote(tipo, dados))) return null
        if (respostaEsperada == null) return null
        val limite = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < limite) {
            val r = runCatching {
                respostas.poll(limite - System.currentTimeMillis(), TimeUnit.MILLISECONDS)
            }.getOrNull() ?: return null
            if (r.tipo == respostaEsperada) return r
        }
        return null
    }

    /**
     * Imprime as linhas ja empacotadas (1 bit por ponto, bit mais significativo
     * a esquerda). Bloqueia — chame de uma thread de fundo.
     *
     * Devolve "" quando deu certo, ou a mensagem que a tela mostra.
     */
    fun imprimir(
        linhas: List<ByteArray>,
        largura: Int,
        copias: Int,
        densidade: Int,
        @Suppress("UNUSED_PARAMETER") repetirPagina: Boolean,
        variante: Int,
        paginasDistintas: Int,
        progresso: (Int) -> Unit,
    ): String {
        trilha.setLength(0)
        cancelado = false
        anotar(
            "v$VERSAO imprimir linhas=${linhas.size} largura=$largura copias=$copias" +
                " paginas=$paginasDistintas variante=$variante",
        )
        if (linhas.isEmpty()) return "Etiqueta vazia."
        if (permissoesFaltando().isNotEmpty()) {
            anotar("permissoes faltando: " + permissoesFaltando().joinToString())
            return "Falta a permissao de Bluetooth."
        }

        // A conexao fica de pe entre as impressoes justamente para o segundo
        // lote sair no toque — mas a impressora encerra a sessao por conta
        // propria depois de um tempo parada, e o Android leva um tempo ate
        // perceber. E por isso que a segunda etiqueta do dia "nao saia nada":
        // mandavamos o trabalho por um cano que ja nao existia. Uma tentativa
        // com conexao nova resolve, e custa os dois segundos de reconectar.
        val primeira =
            enviarTrabalho(linhas, largura, copias, densidade, repetirPagina, variante, paginasDistintas, progresso)
        if (primeira.isEmpty() || !reconectavel(primeira)) return primeira

        anotar("primeira tentativa falhou ($primeira) — reconectando")
        desconectar()
        val segunda =
            enviarTrabalho(linhas, largura, copias, densidade, repetirPagina, variante, paginasDistintas, progresso)
        anotar(if (segunda.isEmpty()) "ok na segunda" else "falhou de novo: $segunda")
        return segunda
    }

    /**
     * Erros que valem uma segunda tentativa com a conexao refeita — os de
     * ambiente (Bluetooth desligado, permissao, localizacao) nao valem: repetir
     * so troca a espera por outra igual.
     */
    private fun reconectavel(erro: String): Boolean =
        erro != "interrompido" && erro.startsWith("A conexao caiu") || erro.startsWith("A impressora nao respondeu") ||
            erro.startsWith("A impressora conectou")

    private fun enviarTrabalho(
        linhas: List<ByteArray>,
        largura: Int,
        copias: Int,
        densidade: Int,
        repetirPagina: Boolean,
        variante: Int,
        paginasDistintas: Int,
        progresso: (Int) -> Unit,
    ): String {
        val erro = conectar()
        if (erro.isNotEmpty()) return erro

        // Resto de resposta de um trabalho anterior faria a proxima espera
        // casar com o pacote errado e o envio andar fora de ordem.
        eventos.clear()
        respostas.clear()
        recebidos.clear()

        // Uma pagina por etiqueta, sempre.
        //
        // O contador de copias (0x15) existe no protocolo e a D110 simplesmente
        // ignora: pedimos tres e saiu uma. Mandar o desenho uma vez por etiqueta
        // e determinista e funciona em qualquer modelo — e, com as linhas em
        // lote, o envio some perto do tempo que a impressora leva para imprimir.
        //
        // Desde que cada pacote ganhou codigo proprio as etiquetas do lote sao
        // desenhos DIFERENTES: chegam emendadas num payload so e `paginas` diz
        // em quantas fatiar. Um payload de um desenho so continua repetindo o
        // mesmo `copias` vezes, como sempre foi.
        val fatias = paginasDistintas.coerceAtLeast(1)
        val distintas = fatias > 1
        if (distintas && (linhas.size % fatias != 0 || linhas.size / fatias == 0)) {
            // Payload que nao fecha com o numero de paginas so poderia sair
            // como desenho picado — e picado ele gasta o rolo inteiro antes de
            // alguem perceber. Melhor nao imprimir nada.
            anotar("paginas=$fatias nao divide ${linhas.size} linhas")
            return "etiqueta-invalida"
        }
        val altura = if (distintas) linhas.size / fatias else linhas.size
        val paginas = if (distintas) fatias else copias
        // 8 pontos por milimetro na cabeca termica, e a D110 anda perto de
        // 20 mm/s: o proprio desenho diz quanto tempo cada etiqueta leva.
        val msPorEtiqueta = ((altura / 8.0) * 50).toLong().coerceIn(800, 6_000)
        val totalLinhas = altura * paginas
        var enviadas = 0

        // O primeiro comando e o teste do cano: se nem ele passa, o trabalho
        // inteiro sairia no vazio — melhor falhar aqui e deixar a tentativa com
        // conexao nova acontecer.
        if (!escreveu(TIPO_ETIQUETA, byteArrayOf(1))) {
            desconectar()
            return "A conexao caiu antes de comecar. Tente de novo."
        }
        comando(DENSIDADE, byteArrayOf(densidade.coerceIn(1, 5).toByte()), DENSIDADE + 1)

        if (variante == VARIANTE_D110M_V4) {
            // A D110_M com firmware V4 espera o INICIAR_IMPRESSAO com 9 bytes —
            // total de paginas, cor e velocidade — nao so o "1" das familias
            // mais antigas. Mandar o formato errado e aceito sem erro, mas
            // deixa a impressora com o estado interno torto: e a partir dai
            // que sobra etiqueta em branco antes da de verdade.
            comando(
                INICIAR_IMPRESSAO,
                byteArrayOf(
                    (paginas shr 8).toByte(), paginas.toByte(),
                    0, 0, 0, 0, // reservado
                    0, // cor da pagina (padrao)
                    0, // velocidade (0 = qualidade)
                    0, // flag, proposito desconhecido
                ),
                INICIAR_IMPRESSAO + 1,
            )
        } else {
            comando(INICIAR_IMPRESSAO, byteArrayOf(1), INICIAR_IMPRESSAO + 1)
            // A Niimbot descarta o primeiro pacote depois do INICIAR_IMPRESSAO —
            // documentado pela comunidade que fez engenharia reversa do
            // protocolo (wiki niim.blue). Nesta familia o descartavel vem
            // aqui; na D110M_V4 ele vem depois do DIMENSAO (ver abaixo).
            comando(STATUS, byteArrayOf(1), null)
        }

        for (pagina in 0 until paginas) {
            // A D110M_V4 nao usa INICIAR_PAGINA — documentado como omitido
            // nesta familia. Mandar mesmo assim nao quebra, mas nao e o que
            // o app oficial faz.
            if (variante != VARIANTE_D110M_V4) comando(INICIAR_PAGINA, byteArrayOf(1), INICIAR_PAGINA + 1)
            // O tamanho da pagina e o comando que decide se a etiqueta sai
            // escrita ou em branco: a familia D11/D110 le so as linhas, as
            // outras esperam mais campos e descartam o desenho se receberem
            // menos (ou mais) do que esperam.
            val tamanhoPagina = when (variante) {
                VARIANTE_B21 -> byteArrayOf(
                    (altura shr 8).toByte(), altura.toByte(),
                    (largura shr 8).toByte(), largura.toByte(),
                )
                VARIANTE_B1 -> byteArrayOf(
                    (altura shr 8).toByte(), altura.toByte(),
                    (largura shr 8).toByte(), largura.toByte(),
                    0, 1,
                )
                VARIANTE_D110M_V4 -> byteArrayOf(
                    (altura shr 8).toByte(), altura.toByte(),
                    (largura shr 8).toByte(), largura.toByte(),
                    0, 1, // copias
                    0, 0, // altura de corte — 0 deixa a impressora decidir
                    0, // tipo de corte
                    0, // reservado
                    0, // mandar tudo de uma vez
                    0, 0, // altura da parte
                )
                else -> byteArrayOf((altura shr 8).toByte(), altura.toByte())
            }
            comando(DIMENSAO, tamanhoPagina, DIMENSAO + 1)
            if (variante == VARIANTE_D110M_V4) {
                // Aqui, nao depois do INICIAR_IMPRESSAO, e onde a D110M_V4
                // espera o descartavel — ver comentario acima.
                comando(STATUS, byteArrayOf(1), null)
            } else if (variante != VARIANTE_B1) {
                // Uma copia por pagina: quem conta as etiquetas e o laco, nao
                // a impressora. Nao existe na D110M_V4 — a copia ja vai no
                // DIMENSAO.
                comando(QUANTIDADE, byteArrayOf(0, 1), QUANTIDADE + 1)
            }

            // As linhas vao em lote: o canal e um fluxo de bytes, entao varios
            // pacotes numa escrita so chegam iguais e custam uma ida e volta em
            // vez de uma por linha. Uma etiqueta de 400 linhas cai de centenas
            // de idas e voltas para algumas dezenas.
            val lote = java.io.ByteArrayOutputStream()
            val limiteLote = ((mtu - 3).coerceIn(20, 512)) * 4

            val inicio = if (distintas) pagina * altura else 0
            for (y in 0 until altura) {
                val linha = linhas[inicio + y]
                // Cabecalho: numero da linha, tres contadores de pontos pretos
                // (a impressora aceita zeros) e quantas linhas repetem o desenho.
                val corpo = ByteArray(6 + linha.size)
                corpo[0] = (y shr 8).toByte()
                corpo[1] = y.toByte()
                corpo[5] = 1
                System.arraycopy(linha, 0, corpo, 6, linha.size)
                lote.write(pacote(IMPRIMIR_LINHA, corpo))

                if (lote.size() >= limiteLote) {
                    if (!escrever(lote.toByteArray())) {
                        anotar("caiu na linha $y")
                        desconectar()
                        return "A conexao caiu no meio da impressao. Tente de novo."
                    }
                    lote.reset()
                }

                // Parada pedida no meio do desenho: manda o que sobrou no lote e
                // encerra o trabalho direito. Sem o fim de impressao a Niimbot
                // ficaria esperando o resto do desenho que nao vem mais.
                if (cancelado) {
                    if (lote.size() > 0) escrever(lote.toByteArray())
                    comando(FIM_PAGINA, byteArrayOf(1), FIM_PAGINA + 1)
                    comando(FIM_IMPRESSAO, byteArrayOf(1), FIM_IMPRESSAO + 1)
                    comando(BATIDA, byteArrayOf(1), null) // absorve o pacote que a Niimbot descarta apos o FIM_IMPRESSAO
                    anotar("interrompido na etiqueta ${pagina + 1}, linha $y")
                    return "interrompido"
                }
                enviadas++
                if (enviadas % 32 == 0) progresso(enviadas * 100 / totalLinhas)
            }
            if (lote.size() > 0 && !escrever(lote.toByteArray())) {
                anotar("caiu no fim das linhas")
                desconectar()
                return "A conexao caiu no meio da impressao. Tente de novo."
            }

            comando(FIM_PAGINA, byteArrayOf(1), FIM_PAGINA + 1)

            // Espera a etiqueta sair antes de mandar a proxima.
            //
            // Mandar as tres de uma vez e mais rapido no papel e perde etiqueta
            // na pratica: a impressora tem buffer pequeno e imprime devagar
            // (uns 20 mm por segundo), entao a ultima chegava enquanto ela ainda
            // estava na anterior. Pedimos tres e sairam duas.
            esperarEtiquetas(pagina + 1, msPorEtiqueta)

            if (cancelado) {
                comando(FIM_IMPRESSAO, byteArrayOf(1), FIM_IMPRESSAO + 1)
                comando(BATIDA, byteArrayOf(1), null) // absorve o pacote que a Niimbot descarta apos o FIM_IMPRESSAO
                anotar("interrompido depois da etiqueta ${pagina + 1}")
                return "interrompido"
            }
        }
        progresso(100)

        // O papel ainda anda quando a ultima linha chega: encerrar agora corta a
        // etiqueta pela metade.
        esperarEtiquetas(paginas, msPorEtiqueta)

        comando(FIM_IMPRESSAO, byteArrayOf(1), FIM_IMPRESSAO + 1)
        // Mesmo descarte do primeiro pacote, agora depois do FIM_IMPRESSAO: sem
        // isto o proximo trabalho desta mesma conexao e quem perde o primeiro
        // comando — e vira a etiqueta em branco de novo.
        comando(BATIDA, byteArrayOf(1), null)
        return ""
    }

    companion object {
        @Volatile private var instancia: EtiquetaNiimbot? = null

        /**
         * A mesma instância em qualquer lugar que perguntar.
         *
         * A conexão BLE (gatt/canal) vive dentro do objeto; presa ao
         * applicationContext, sobrevive a Activity ser destruída e recriada.
         */
        fun obter(context: Context): EtiquetaNiimbot =
            instancia ?: synchronized(this) {
                instancia ?: EtiquetaNiimbot(context.applicationContext).also { instancia = it }
            }

        private const val PREFS = "vitallcam.etiqueta"
        private const val CHAVE_MAC = "impressora_mac"
        private const val CHAVE_NOME = "impressora_nome"
        private const val SEGUNDOS_VARREDURA = 12L

        /** Servico serial das Niimbot D11/D110/B1 mapeado pela comunidade. */
        private val SERVICO: UUID = UUID.fromString("e7810a71-73ae-499d-8c15-faa9aef0c3f2")
        private val CARACTERISTICA: UUID = UUID.fromString("bef8d6c9-9c21-4c9e-b632-bd58c1009f9f")
        private val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private val PREFIXOS = listOf("D110", "D11", "D101", "B1", "B21", "B18", "NIIMBOT")

        private const val IMPRIMIR_LINHA = 0x85
        private const val INICIAR_IMPRESSAO = 0x01
        private const val INICIAR_PAGINA = 0x03
        private const val DIMENSAO = 0x13
        private const val QUANTIDADE = 0x15
        private const val DENSIDADE = 0x21
        private const val TIPO_ETIQUETA = 0x23
        private const val FIM_PAGINA = 0xE3
        private const val FIM_IMPRESSAO = 0xF3
        private const val STATUS = 0xA3
        /** "Voce esta ai?" — desperta a impressora e prova que o canal responde. */
        private const val BATIDA = 0xDC

        /** Marca da build, para saber no log qual versao gerou a trilha. */
        private const val VERSAO = 16

        /** Familia D11/D110/D101: tamanho da pagina em 2 bytes (so as linhas). */
        const val VARIANTE_D11 = 1
        /** Familia B21/B3: 4 bytes (linhas e largura). */
        const val VARIANTE_B21 = 2
        /** Familia B1: 6 bytes (linhas, largura e copias). */
        const val VARIANTE_B1 = 3
        /**
         * D110_M com firmware V4 (a que sai de fabrica depois da atualizacao
         * pelo app oficial). INICIAR_IMPRESSAO de 9 bytes, DIMENSAO de 13,
         * sem INICIAR_PAGINA — protocolo bem diferente das familias antigas,
         * documentado em printers.niim.blue/interfacing/print-tasks/.
         */
        const val VARIANTE_D110M_V4 = 4
    }
}
