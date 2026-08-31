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
 *   2. A quantidade vai num comando só (0x15). Reenviar o bitmap 20 vezes por
 *      BLE levaria minutos; `repetirPagina` fica como saída caso o modelo em
 *      cima da bancada ignore o contador.
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

export interface OpcoesImpressao {
  /** Quantas etiquetas iguais — uma por pacote de grau cirúrgico. */
  copias?: number
  /** 1 a 5 na D110; 3 é o padrão de fábrica e o que menos borra. */
  densidade?: number
  /** 1 = rolo com espaçamento entre etiquetas (o comum). */
  tipoEtiqueta?: number
  /** Reenvia o desenho a cada cópia, para modelos que ignoram o contador. */
  repetirPagina?: boolean
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
  for (const byte of corpo) verificacao ^= byte

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

    const impressora = new Niimbot(dispositivo, escolhida, !escolhida.properties.write)
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
    for (const byte of bytes) this.buffer.push(byte)

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

  private async escrever(pacote: Uint8Array) {
    // MTU padrão do BLE são 20 bytes de carga; o firmware remonta o fluxo.
    const passo = 20
    for (let i = 0; i < pacote.length; i += passo) {
      const fatia = pacote.slice(i, i + passo)
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
    const paginas = opcoes.repetirPagina ? copias : 1
    const totalLinhas = bitmap.linhas.length * paginas
    let enviadas = 0

    await this.enviar(COMANDO.TIPO_ETIQUETA, [opcoes.tipoEtiqueta ?? 1], COMANDO.TIPO_ETIQUETA + 1)
    await this.enviar(COMANDO.DENSIDADE, [densidade], COMANDO.DENSIDADE + 1)
    await this.enviar(COMANDO.INICIAR_IMPRESSAO, [0x01], COMANDO.INICIAR_IMPRESSAO + 1)

    for (let pagina = 0; pagina < paginas; pagina++) {
      await this.enviar(COMANDO.INICIAR_PAGINA, [0x01], COMANDO.INICIAR_PAGINA + 1)
      await this.enviar(
        COMANDO.DIMENSAO,
        [(bitmap.altura >> 8) & 0xff, bitmap.altura & 0xff, (bitmap.largura >> 8) & 0xff, bitmap.largura & 0xff],
        COMANDO.DIMENSAO + 1,
      )
      if (!opcoes.repetirPagina) {
        await this.enviar(COMANDO.QUANTIDADE, [(copias >> 8) & 0xff, copias & 0xff], COMANDO.QUANTIDADE + 1)
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
        await this.escrever(montarPacote(COMANDO.IMPRIMIR_LINHA, corpo))
        enviadas++
        if (enviadas % 16 === 0) opcoes.aoProgredir?.(enviadas, totalLinhas)
      }

      await this.enviar(COMANDO.FIM_PAGINA, [0x01], COMANDO.FIM_PAGINA + 1)
    }
    opcoes.aoProgredir?.(totalLinhas, totalLinhas)

    // O papel ainda está andando quando a última linha chega: encerrar agora
    // corta a etiqueta pela metade. Espera a impressora dizer que terminou —
    // e, se ela não disser nada, dá o tempo de um ciclo por etiqueta.
    const limite = Date.now() + 3000 + copias * 2000
    let confirmou = false
    while (Date.now() < limite) {
      const paginasFeitas = await this.paginasImpressas()
      if (paginasFeitas === null) break
      if (paginasFeitas >= copias) {
        confirmou = true
        break
      }
      await espera(200)
    }
    if (!confirmou) await espera(500 + copias * 300)

    await this.enviar(COMANDO.FIM_IMPRESSAO, [0x01], COMANDO.FIM_IMPRESSAO + 1)
  }
}
