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

export type ModoImpressao = 'app' | 'navegador' | 'indisponivel'

export interface OpcoesImpressaoEtiqueta {
  copias: number
  densidade: number
  repetirPagina: boolean
  /** Família da impressora; errar isto faz a etiqueta sair em branco. */
  variante: VarianteProtocolo
  aoProgredir?: (porcentagem: number) => void
}

/** Mensagens que o bridge devolve em vez de texto pronto para a tela. */
/** Números que a ponte nativa entende, na ordem das famílias conhecidas. */
const VARIANTE_NATIVA: Record<VarianteProtocolo, number> = { d11: 1, b21: 2, b1: 3 }

const RECADOS: Record<string, string> = {
  'sem-permissao': 'O app precisa da permissão de Bluetooth para achar a impressora.',
  'ja-imprimindo': 'Já tem uma etiqueta saindo. Espere terminar.',
  'etiqueta-invalida': 'O desenho da etiqueta não chegou inteiro no app.',
}

export function modoImpressao(): ModoImpressao {
  if (typeof window === 'undefined') return 'indisponivel'
  if (typeof window.VitallCam?.imprimirEtiqueta === 'function') return 'app'
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
        opcoes.repetirPagina,
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
export async function imprimirEtiqueta(
  bitmap: BitmapImpressao,
  opcoes: OpcoesImpressaoEtiqueta,
  navegador?: { impressora: Niimbot | null; aoConectar: (i: Niimbot) => void },
): Promise<void> {
  if (modoImpressao() === 'app') {
    await imprimirPeloApp(bitmap, opcoes)
    return
  }

  const atual = navegador?.impressora
  const conectada = atual?.conectado ? atual : await Niimbot.conectar(false)
  if (conectada !== atual) navegador?.aoConectar(conectada)

  await conectada.imprimir(bitmap, {
    copias: opcoes.copias,
    densidade: opcoes.densidade,
    repetirPagina: opcoes.repetirPagina,
    variante: opcoes.variante,
    aoProgredir: (feitas, total) => opcoes.aoProgredir?.(Math.round((feitas / total) * 100)),
  })
}
