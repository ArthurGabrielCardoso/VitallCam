/**
 * Por onde a etiqueta sai: pelo app nativo ou pelo Bluetooth do navegador.
 *
 * No APK a impressão é um toque só. O app guarda o MAC da Niimbot e mantém a
 * conexão de pé, então "imprimir 15" não abre seletor nenhum. Fora dele, o
 * navegador obriga a escolher o aparelho a cada sessão — é regra do Chrome, não
 * escolha nossa: nenhuma página pode falar com um aparelho que o usuário não
 * apontou naquele momento. O caminho existe para quando a tela é aberta no
 * notebook, e é o pior dos dois; dentro da clínica, o app é o caminho.
 */

import type { BitmapImpressao } from './etiqueta-esterilizacao'
import { Niimbot, VarianteProtocolo, bluetoothDisponivel } from './niimbot'

export type ModoImpressao = 'app' | 'app-antigo' | 'navegador' | 'indisponivel'

export interface OpcoesImpressaoEtiqueta {
  copias: number
  densidade: number
  /** Família da impressora; errar isto faz a etiqueta sair em branco. */
  variante: VarianteProtocolo
  aoProgredir?: (porcentagem: number) => void
}

/**
 * Pedido de parada da impressão em curso.
 *
 * Mora fora das telas porque a impressão atravessa caminhos diferentes — app
 * nativo e navegador — e quem aperta "parar" não deveria precisar saber por qual
 * deles a etiqueta está saindo.
 */
let paradaPedida = false

/** Interrompe o lote em andamento: as etiquetas já enviadas saem, o resto não. */
export function pararImpressao(): void {
  paradaPedida = true
  try {
    window.VitallCam?.cancelarImpressao?.()
  } catch {
    // APK sem o método: o laço da web ainda respeita a parada.
  }
}

export function impressaoInterrompida(): boolean {
  return paradaPedida
}

/** Mensagens que o bridge devolve em vez de texto pronto para a tela. */
/** Números que a ponte nativa entende, na ordem das famílias conhecidas. */
const VARIANTE_NATIVA: Record<VarianteProtocolo, number> = { d11: 1, b21: 2, b1: 3 }

const RECADOS: Record<string, string> = {
  'interrompido': 'Impressão interrompida. As etiquetas que já saíram continuam válidas.',
  'sem-permissao': 'O app precisa da permissão de Bluetooth. Se a caixa não aparecer mais, libere em Ajustes do Android → Apps → VitallCam → Permissões.',
  'ja-imprimindo': 'Já tem uma etiqueta saindo. Espere terminar.',
  'etiqueta-invalida': 'O desenho da etiqueta não chegou inteiro no app.',
}

export function modoImpressao(): ModoImpressao {
  if (typeof window === 'undefined') return 'indisponivel'
  if (typeof window.VitallCam?.imprimirEtiqueta === 'function') return 'app'

  // Estar dentro do app e não ter a ponte de impressão é APK velho, não falta
  // de Bluetooth. São problemas com soluções opostas — um se resolve
  // atualizando o app, o outro trocando de navegador — e mandar a pessoa
  // "abrir pelo app da clínica" quando ela JÁ está no app é um beco sem saída.
  if (window.VitallCam?.isNative?.()) return 'app-antigo'

  return bluetoothDisponivel() ? 'navegador' : 'indisponivel'
}

/** Nome da Niimbot que o app já conhece — "" enquanto nunca imprimiu. */
export function impressoraLembrada(): string {
  try {
    return window.VitallCam?.impressoraEtiqueta?.() || ''
  } catch {
    return ''
  }
}

export interface ImpressoraEncontrada {
  nome: string
  mac: string
  /** Nome ou serviço batem com uma Niimbot — vem no topo da lista. */
  provavel: boolean
}

/** O app sabe listar impressoras? (APK anterior à ponte 3 não sabe.) */
export function podeListarImpressoras(): boolean {
  return modoImpressao() === 'app' && typeof window.VitallCam?.procurarImpressoras === 'function'
}

/**
 * Procura impressoras pelo app e devolve o que apareceu.
 *
 * Existe porque a busca automática, quando não acha, é um beco sem saída: sem
 * lista, "não achei a impressora" não diz se o tablet enxergou alguma coisa.
 */
export function procurarImpressoras(): Promise<ImpressoraEncontrada[]> {
  return new Promise((resolve, reject) => {
    const ponte = window.VitallCam
    if (typeof ponte?.procurarImpressoras !== 'function') {
      reject(new Error('Este app ainda não sabe listar impressoras. Atualize o APK.'))
      return
    }

    const limpar = () => {
      clearTimeout(cronometro)
      delete window.__onImpressorasEncontradas
    }
    const cronometro = setTimeout(() => {
      limpar()
      reject(new Error('A busca não respondeu. Tente de novo.'))
    }, 40_000)

    window.__onImpressorasEncontradas = (lista, impedimento) => {
      limpar()
      if (impedimento) reject(new Error(impedimento))
      else resolve(lista || [])
    }

    try {
      ponte.procurarImpressoras()
    } catch (erro) {
      limpar()
      reject(erro instanceof Error ? erro : new Error('Falha ao chamar o app'))
    }
  })
}

/**
 * Abre a conexão com a impressora antes de a pessoa pedir a etiqueta.
 *
 * O trabalho que abre a conexão é o que sai em branco — a impressora ainda não
 * terminou de acordar quando o desenho chega. Aquecendo ao abrir a tela, o
 * trabalho dela nunca é o primeiro contato. Silencioso de propósito: se não der,
 * a impressão faz a conexão do jeito de sempre.
 */
export function aquecerImpressora(): void {
  try {
    window.VitallCam?.aquecerImpressora?.()
  } catch {
    // APK sem o método: a impressão conecta na hora, como antes.
  }
}

/** Fixa a impressora escolhida na lista; a próxima impressão vai nela. */
export function escolherImpressora(impressora: ImpressoraEncontrada): void {
  window.VitallCam?.escolherImpressora?.(impressora.mac, impressora.nome)
}

export function esquecerImpressora(): void {
  try {
    window.VitallCam?.esquecerImpressoraEtiqueta?.()
  } catch {
    // Versão do app sem esse método: nada a esquecer.
  }
}

/** Linhas concatenadas em base64, do jeito que o bridge do app espera. */
export function bitmapParaBase64(bitmap: BitmapImpressao): string {
  const bytesPorLinha = bitmap.linhas[0]?.length ?? 0
  let binario = ''
  for (const linha of bitmap.linhas) {
    // String.fromCharCode espalhado por pedaços: com 400 linhas de uma vez o
    // spread estoura a pilha de argumentos em WebView antiga.
    for (let i = 0; i < bytesPorLinha; i++) binario += String.fromCharCode(linha[i])
  }
  return btoa(binario)
}

/**
 * Imprime pelo app. Resolve quando a impressora terminou — o bridge responde
 * por `window.__onEtiquetaImpressa`, que é global e só aceita uma impressão por
 * vez (o lado nativo recusa a segunda com "ja-imprimindo").
 */
export function imprimirPeloApp(
  bitmap: BitmapImpressao,
  opcoes: OpcoesImpressaoEtiqueta,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ponte = window.VitallCam
    if (typeof ponte?.imprimirEtiqueta !== 'function') {
      reject(new Error('Este app ainda não sabe imprimir etiqueta. Atualize o APK.'))
      return
    }

    const limpar = () => {
      clearTimeout(cronometro)
      delete window.__onEtiquetaImpressa
      delete window.__onEtiquetaProgresso
    }

    // Teto generoso: 20 etiquetas em BLE levam bem menos, mas travar a tela
    // para sempre porque a impressora sumiu no meio é pior que esperar demais.
    const cronometro = setTimeout(() => {
      limpar()
      reject(new Error('A impressora não respondeu. Confira se ela está ligada.'))
    }, 180_000)

    window.__onEtiquetaProgresso = (pct: number) => opcoes.aoProgredir?.(pct)
    window.__onEtiquetaImpressa = (erro: string | null) => {
      limpar()
      if (erro) reject(new Error(RECADOS[erro] || erro))
      else resolve()
    }

    try {
      // O APK anterior não conhece a variante do protocolo e descartaria o
      // parâmetro extra em silêncio — a tela ficaria girando até o timeout.
      // A versão da ponte diz qual chamada esse aparelho entende.
      const versao = ponte.versaoEtiqueta?.() ?? 1
      const argumentos: [string, number, number, number, boolean] = [
        bitmapParaBase64(bitmap),
        bitmap.largura,
        Math.max(1, Math.floor(opcoes.copias)),
        opcoes.densidade,
        false,
      ]
      if (versao >= 2) ponte.imprimirEtiqueta(...argumentos, VARIANTE_NATIVA[opcoes.variante])
      else ponte.imprimirEtiqueta(...argumentos)
    } catch (erro) {
      limpar()
      reject(erro instanceof Error ? erro : new Error('Falha ao chamar o app'))
    }
  })
}

/**
 * Imprime pelo caminho que existir. No app, sem seletor; no navegador, com a
 * impressora já conectada ou abrindo o seletor do Chrome.
 */
/**
 * Deixa uma linha no diagnóstico também quando a impressão sai pelo navegador.
 *
 * O app registra cada trabalho desde o começo; o navegador não registrava nada,
 * e quando a Jéssica dizia "pedi três e saíram duas" pelo Chrome não havia o que
 * ler. Uma linha por impressão, sem travar nada se o registro falhar.
 */
function registrar(texto: string): void {
  try {
    void fetch('/api/debug-log', {
      method: 'POST',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      body: `NAVEGADOR ${new Date().toLocaleTimeString('pt-BR')}\n${texto}`,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Diagnóstico nunca atrapalha a impressão.
  }
}

export async function imprimirEtiqueta(
  bitmap: BitmapImpressao,
  opcoes: OpcoesImpressaoEtiqueta,
  navegador?: { impressora: Niimbot | null; aoConectar: (i: Niimbot) => void },
): Promise<void> {
  paradaPedida = false

  if (modoImpressao() === 'app') {
    await imprimirPeloApp(bitmap, opcoes)
    return
  }

  const atual = navegador?.impressora
  const conectada = atual?.conectado ? atual : await Niimbot.conectar(false)
  if (conectada !== atual) navegador?.aoConectar(conectada)
  registrar(
    `imprimir linhas=${bitmap.altura} largura=${bitmap.largura} copias=${opcoes.copias}` +
    ` variante=${opcoes.variante} conexao=${conectada === atual ? 'reaproveitada' : 'nova'}`,
  )

  await conectada.imprimir(bitmap, {
    copias: opcoes.copias,
    densidade: opcoes.densidade,
    variante: opcoes.variante,
    aoProgredir: (feitas, total) => opcoes.aoProgredir?.(Math.round((feitas / total) * 100)),
    interrompido: () => paradaPedida,
  })
}
