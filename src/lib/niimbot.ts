/**
 * Impressão direta na Niimbot pelo navegador (Web Bluetooth).
 *
 * A Niimbot não é impressora de sistema: não tem driver, não aparece no diálogo
 * de impressão. Ela expõe um serviço BLE que funciona como porta serial, e o
 * protocolo é o que a comunidade mapeou por engenharia reversa (niimprint,
 * NiimBlue) — não há SDK público. Por isso duas decisões aqui:
 *
 *   1. Os comandos de preparo (tipo de etiqueta, densidade, dimensão) toleram
 *      silêncio. Cada modelo responde a um subconjunto diferente, e travar a
 *      impressão porque a D110 não confirmou um comando que ela ignora é pior
 *      do que seguir em frente — o papel saindo é a confirmação que importa.
 *   2. Uma página por etiqueta. O protocolo tem um contador de cópias (0x15) e
 *      a D110 ignora — pedimos três e saiu uma. Com as linhas em lote, mandar o
 *      desenho uma vez por etiqueta custa pouco perto do tempo que a impressora
 *      leva imprimindo, e funciona em qualquer modelo.
 *
 * O comando de tamanho da página (0x13) muda de formato entre as famílias, e é
 * aí que a etiqueta sai em branco quando erra: a impressora aceita o trabalho,
 * anda o papel e descarta as linhas. Daí `VarianteProtocolo` — a D110 usa o
 * formato de 2 bytes.
 *
 * Requer contexto seguro (https ou localhost) e navegador Chromium — Web
 * Bluetooth não existe no Safari nem no Firefox. `bluetoothDisponivel()` é o
 * que a tela usa para decidir se mostra o botão ou o caminho alternativo.
 */

import type { BitmapImpressao } from './etiqueta-esterilizacao'

/** Serviço serial das Niimbot D11/D110/B1 mapeado pela comunidade. */
const SERVICO_NIIMBOT = 'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
const CARACTERISTICA_NIIMBOT = 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'
/** Alguns lotes expõem o UART genérico da Nordic em vez do serviço acima. */
const SERVICO_UART = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'

const PREFIXOS_CONHECIDOS = ['D110', 'D11', 'D101', 'B1', 'B21', 'B18', 'Niimbot', 'NIIMBOT']

const COMANDO = {
  IMPRIMIR_LINHA: 0x85,
  INICIAR_IMPRESSAO: 0x01,
  INICIAR_PAGINA: 0x03,
  DIMENSAO: 0x13,
  QUANTIDADE: 0x15,
  DENSIDADE: 0x21,
  TIPO_ETIQUETA: 0x23,
  FIM_PAGINA: 0xe3,
  FIM_IMPRESSAO: 0xf3,
  STATUS: 0xa3,
} as const

/**
 * Formato do comando de tamanho da página, por família de impressora.
 * `d11` (2 bytes, só as linhas) é o da D110; as outras esperam mais campos.
 */
export type VarianteProtocolo = 'd11' | 'b21' | 'b1'

export interface OpcoesImpressao {
  /** Quantas etiquetas iguais — uma por pacote de grau cirúrgico. */
  copias?: number
  /** 1 a 5 na D110; 3 é o padrão de fábrica e o que menos borra. */
  densidade?: number
  /** 1 = rolo com espaçamento entre etiquetas (o comum). */
  tipoEtiqueta?: number
  /** Família da impressora; erra isto e a etiqueta sai em branco. */
  variante?: VarianteProtocolo
  /** Chamado a cada linha enviada, para a barra de progresso. */
  aoProgredir?: (enviadas: number, total: number) => void
}

/** Web Bluetooth só existe em Chromium e em contexto seguro. */
export function bluetoothDisponivel(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth
}

function montarPacote(tipo: number, dados: number[] | Uint8Array): Uint8Array {
  const corpo = dados instanceof Uint8Array ? dados : Uint8Array.from(dados)
  let verificacao = tipo ^ corpo.length
  // Laço por índice, não for...of: o alvo do projeto é a WebView do Android
  // 7.1.2, onde iterar um Uint8Array depende de polyfill.
  for (let i = 0; i < corpo.length; i++) verificacao ^= corpo[i]

  const pacote = new Uint8Array(corpo.length + 7)
  pacote[0] = 0x55
  pacote[1] = 0x55
  pacote[2] = tipo
  pacote[3] = corpo.length
  pacote.set(corpo, 4)
  pacote[corpo.length + 4] = verificacao
  pacote[corpo.length + 5] = 0xaa
  pacote[corpo.length + 6] = 0xaa
  return pacote
}

interface Resposta {
  tipo: number
  dados: Uint8Array
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class Niimbot {
  private constructor(
    private readonly dispositivo: any,
    private readonly caracteristica: any,
    private readonly semResposta: boolean,
  ) {}

  private buffer: number[] = []
  private ouvintes: ((resposta: Resposta) => void)[] = []

  get nome(): string {
    return this.dispositivo?.name || 'Niimbot'
  }

  get conectado(): boolean {
    return !!this.dispositivo?.gatt?.connected
  }

  /**
   * Abre o seletor de dispositivos do navegador e conecta.
   * `mostrarTodos` é a saída para rolos vendidos com outro nome de anúncio:
   * o filtro por prefixo esconde a impressora e a tela fica sem explicação.
   */
  static async conectar(mostrarTodos = false): Promise<Niimbot> {
    if (!bluetoothDisponivel()) {
      throw new Error('Este navegador não tem Web Bluetooth. Use o Chrome ou o Edge, em https.')
    }

    const opcionais = [SERVICO_NIIMBOT, SERVICO_UART]
    const dispositivo = await (navigator as any).bluetooth.requestDevice(
      mostrarTodos
        ? { acceptAllDevices: true, optionalServices: opcionais }
        : { filters: PREFIXOS_CONHECIDOS.map((namePrefix) => ({ namePrefix })), optionalServices: opcionais },
    )

    const servidor = await dispositivo.gatt.connect()
    const servicos = await servidor.getPrimaryServices()

    // O serviço conhecido vem primeiro; se o firmware expuser outro, vale
    // qualquer característica que escreva e notifique — é a porta serial.
    let escolhida: any = null
    for (const servico of [...servicos].sort((a: any, b: any) => (a.uuid === SERVICO_NIIMBOT ? -1 : b.uuid === SERVICO_NIIMBOT ? 1 : 0))) {
      const caracteristicas = await servico.getCharacteristics()
      const preferida = caracteristicas.find((c: any) => c.uuid === CARACTERISTICA_NIIMBOT)
      const candidata = preferida
        || caracteristicas.find((c: any) => (c.properties.write || c.properties.writeWithoutResponse) && c.properties.notify)
      if (candidata) {
        escolhida = candidata
        break
      }
    }

    if (!escolhida) {
      dispositivo.gatt.disconnect()
      throw new Error('A impressora conectou, mas não expôs o canal de impressão esperado.')
    }

    // Sem confirmação sempre que o firmware aceitar: cada confirmação custa um
    // intervalo de conexão inteiro, e uma etiqueta são centenas de escritas.
    const impressora = new Niimbot(dispositivo, escolhida, !!escolhida.properties.writeWithoutResponse)
    if (escolhida.properties.notify) {
      await escolhida.startNotifications()
      escolhida.addEventListener('characteristicvaluechanged', (evento: any) => {
        impressora.receber(new Uint8Array(evento.target.value.buffer))
      })
    }
    return impressora
  }

  desconectar() {
    try {
      this.dispositivo?.gatt?.disconnect()
    } catch {
      // Desconectar já desconectado não é problema de ninguém.
    }
  }

  /** Junta os fragmentos das notificações até fechar um pacote completo. */
  private receber(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) this.buffer.push(bytes[i])

    while (this.buffer.length >= 7) {
      const inicio = this.buffer.findIndex((b, i) => b === 0x55 && this.buffer[i + 1] === 0x55)
      if (inicio < 0) {
        this.buffer = []
        return
      }
      if (inicio > 0) this.buffer.splice(0, inicio)

      const tamanho = this.buffer[3]
      const total = tamanho + 7
      if (this.buffer.length < total) return

      const dados = Uint8Array.from(this.buffer.slice(4, 4 + tamanho))
      const resposta = { tipo: this.buffer[2], dados }
      this.buffer.splice(0, total)
      for (const ouvinte of this.ouvintes) ouvinte(resposta)
    }
  }

  /**
   * Escreve no canal serial, em fatias de 20 bytes.
   *
   * Vinte é o que cabe num pacote BLE sem MTU negociado, e a Web Bluetooth não
   * diz qual MTU a conexão conseguiu. Escrever mais que isso "sem resposta" não
   * dá erro: o sistema corta o resto em silêncio, e a etiqueta sai em branco ou
   * não sai. Tentei 500 bytes por fatia e foi exatamente o que aconteceu.
   *
   * A velocidade não vem do tamanho da fatia e sim de não esperar confirmação:
   * cada confirmação custa um intervalo de conexão inteiro, e uma etiqueta são
   * centenas de escritas. Sem confirmação o navegador enfileira e despacha
   * várias por intervalo.
   */
  private async escrever(dados: Uint8Array) {
    const passo = 20
    for (let i = 0; i < dados.length; i += passo) {
      const fatia = dados.slice(i, i + passo)
      if (this.semResposta) await this.caracteristica.writeValueWithoutResponse(fatia)
      else await this.caracteristica.writeValueWithResponse(fatia)
    }
  }

  /** Envia e espera a confirmação; `null` quando o modelo não responde. */
  private async enviar(
    tipo: number,
    dados: number[] | Uint8Array,
    respostaEsperada?: number,
    timeout = 700,
  ): Promise<Resposta | null> {
    if (respostaEsperada === undefined) {
      await this.escrever(montarPacote(tipo, dados))
      return null
    }

    return new Promise<Resposta | null>((resolve, reject) => {
      const ouvinte = (resposta: Resposta) => {
        if (resposta.tipo !== respostaEsperada) return
        limpar()
        resolve(resposta)
      }
      const cronometro = setTimeout(() => {
        limpar()
        resolve(null)
      }, timeout)
      const limpar = () => {
        clearTimeout(cronometro)
        this.ouvintes = this.ouvintes.filter((o) => o !== ouvinte)
      }
      this.ouvintes.push(ouvinte)
      this.escrever(montarPacote(tipo, dados)).catch((erro) => {
        limpar()
        reject(erro)
      })
    })
  }

  /**
   * Espera a impressora chegar em `alvo` etiquetas.
   *
   * Prefere a resposta dela ao relógio; quando ela não responde ao pedido de
   * status — e esta não responde — cai no tempo estimado pelo tamanho do
   * desenho, que é melhor do que um número fixo chutado.
   */
  private async esperarEtiquetas(alvo: number, msPorEtiqueta: number): Promise<void> {
    const limite = Date.now() + 2000 + alvo * msPorEtiqueta * 2
    while (Date.now() < limite) {
      const feitas = await this.paginasImpressas()
      if (feitas === null) break
      if (feitas >= alvo) return
      await espera(200)
    }
    await espera(msPorEtiqueta)
  }

  /** Página impressa segundo a impressora — é como sabemos que o lote acabou. */
  private async paginasImpressas(): Promise<number | null> {
    const resposta = await this.enviar(COMANDO.STATUS, [0x01], COMANDO.STATUS + 0x10, 500)
    if (!resposta || resposta.dados.length < 2) return null
    return (resposta.dados[0] << 8) | resposta.dados[1]
  }

  /**
   * Imprime o bitmap. Uma chamada = um ciclo de esterilização, com quantas
   * etiquetas iguais a Jéssica pedir.
   */
  async imprimir(bitmap: BitmapImpressao, opcoes: OpcoesImpressao = {}): Promise<void> {
    const copias = Math.max(1, Math.floor(opcoes.copias ?? 1))
    const densidade = Math.min(5, Math.max(1, Math.floor(opcoes.densidade ?? 3)))
    // Uma página por etiqueta, sempre: o contador de cópias do protocolo existe
    // mas a D110 ignora — pedimos três e saiu uma. Mandar o desenho uma vez por
    // etiqueta é determinista e funciona em qualquer modelo.
    const paginas = copias
    // 8 pontos por milímetro na cabeça térmica, e a D110 anda perto de 20 mm/s:
    // o próprio desenho diz quanto tempo cada etiqueta leva.
    const msPorEtiqueta = Math.min(6000, Math.max(800, Math.round((bitmap.altura / 8) * 50)))
    const totalLinhas = bitmap.linhas.length * paginas
    let enviadas = 0

    await this.enviar(COMANDO.TIPO_ETIQUETA, [opcoes.tipoEtiqueta ?? 1], COMANDO.TIPO_ETIQUETA + 1)
    await this.enviar(COMANDO.DENSIDADE, [densidade], COMANDO.DENSIDADE + 1)
    await this.enviar(COMANDO.INICIAR_IMPRESSAO, [0x01], COMANDO.INICIAR_IMPRESSAO + 1)

    for (let pagina = 0; pagina < paginas; pagina++) {
      await this.enviar(COMANDO.INICIAR_PAGINA, [0x01], COMANDO.INICIAR_PAGINA + 1)

      const linhas = [(bitmap.altura >> 8) & 0xff, bitmap.altura & 0xff]
      const colunas = [(bitmap.largura >> 8) & 0xff, bitmap.largura & 0xff]
      const umaCopia = [0, 1]
      const variante = opcoes.variante ?? 'd11'
      const tamanhoPagina =
        variante === 'b21' ? [...linhas, ...colunas]
        : variante === 'b1' ? [...linhas, ...colunas, ...umaCopia]
        : linhas
      await this.enviar(COMANDO.DIMENSAO, tamanhoPagina, COMANDO.DIMENSAO + 1)

      // Uma cópia por página: quem conta as etiquetas é o laço, não a impressora.
      if (variante !== 'b1') await this.enviar(COMANDO.QUANTIDADE, [0, 1], COMANDO.QUANTIDADE + 1)

      // As linhas vão em lote: o canal é um fluxo de bytes, então juntar
      // pacotes antes de escrever poupa chamadas — as fatias de 20 bytes saem
      // cheias em vez de terminar cada linha com uma fatia pela metade.
      let lote: number[] = []
      const despejar = async () => {
        if (lote.length === 0) return
        await this.escrever(Uint8Array.from(lote))
        lote = []
      }

      for (let y = 0; y < bitmap.linhas.length; y++) {
        const linha = bitmap.linhas[y]
        // Cabeçalho: número da linha, três contadores de pontos pretos (a
        // impressora aceita zeros) e quantas linhas repetem este desenho.
        const corpo = new Uint8Array(6 + linha.length)
        corpo[0] = (y >> 8) & 0xff
        corpo[1] = y & 0xff
        corpo[5] = 1
        corpo.set(linha, 6)

        const pacote = montarPacote(COMANDO.IMPRIMIR_LINHA, corpo)
        for (let i = 0; i < pacote.length; i++) lote.push(pacote[i])
        if (lote.length >= 480) await despejar()

        enviadas++
        if (enviadas % 32 === 0) opcoes.aoProgredir?.(enviadas, totalLinhas)
      }
      await despejar()

      await this.enviar(COMANDO.FIM_PAGINA, [0x01], COMANDO.FIM_PAGINA + 1)

      // Espera a etiqueta sair antes de mandar a próxima: a impressora tem
      // buffer pequeno e imprime devagar, então mandar tudo de uma vez perde
      // etiqueta — pedimos três e saíram duas.
      await this.esperarEtiquetas(pagina + 1, msPorEtiqueta)
    }
    opcoes.aoProgredir?.(totalLinhas, totalLinhas)

    // O papel ainda está andando quando a última linha chega: encerrar agora
    // corta a etiqueta pela metade.
    await this.esperarEtiquetas(copias, msPorEtiqueta)

    await this.enviar(COMANDO.FIM_IMPRESSAO, [0x01], COMANDO.FIM_IMPRESSAO + 1)
  }
}
