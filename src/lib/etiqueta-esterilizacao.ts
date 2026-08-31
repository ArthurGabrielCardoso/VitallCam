/**
 * Desenho da etiqueta de rastreabilidade da esterilização.
 *
 * A etiqueta é gerada em 203 dpi (8 pontos por milímetro, a resolução da
 * cabeça térmica da Niimbot) e desenhada num canvas na orientação de leitura —
 * deitada, texto correndo ao longo do comprimento da etiqueta. Só na hora de
 * mandar para a impressora o bitmap é girado, porque a Niimbot imprime linha a
 * linha na largura da cabeça.
 *
 * O que vai impresso segue o art. 81 da RDC 1.002/2025: lote/ciclo, data da
 * esterilização, validade do pacote, responsável e a autoclave. O QR é conveniência
 * (dá para conferir o lote sem digitar), não exigência: o texto legível é o que
 * a Vigilância bate o olho, então ele nunca some para dar espaço ao QR.
 *
 * O indicador químico tipo 1 NÃO está aqui e não tem como estar: papel térmico
 * não vira reagente. Ele vem da borda do papel grau cirúrgico ou da fita
 * zebrada — esta etiqueta cuida da rastreabilidade, o pacote cuida do indicador.
 */

import { gerarQrCode } from './qrcode'

/** Resolução da cabeça térmica: 203 dpi ≈ 8 pontos por milímetro. */
export const PONTOS_POR_MM = 8

export interface FormatoEtiqueta {
  /** Comprimento da etiqueta em mm (o sentido em que o papel anda). */
  comprimentoMm: number
  /** Largura útil em mm — na D110 a cabeça imprime 12 mm, mesmo em rolo de 15. */
  larguraMm: number
  /** Margem branca em pontos, para a etiqueta não sair cortada. */
  margem: number
}

/**
 * Rolo padrão da clínica. A D110 aceita etiqueta de até 15 mm de largura, mas a
 * cabeça só cobre 12 mm: imprimir mais largo que isso não corta, some.
 */
export const FORMATO_PADRAO: FormatoEtiqueta = { comprimentoMm: 50, larguraMm: 12, margem: 6 }

export interface DadosEtiqueta {
  /** Código do lote no formato DDMMAA-NN. */
  lote: string
  /** Data do ciclo já formatada (dd/mm/aaaa). */
  data: string
  /** Validade do pacote já formatada (dd/mm/aaaa). */
  validade: string
  responsavel: string
  autoclave?: string | null
  conteudo?: string | null
  /** Conteúdo do QR. Vazio esconde o QR e devolve todo o espaço ao texto. */
  qr?: string
}

/** Bitmap monocromático pronto para a impressora: uma linha por vez. */
export interface BitmapImpressao {
  /** Pontos na largura da cabeça (múltiplo de 8 depois do empacotamento). */
  largura: number
  /** Quantidade de linhas — é o quanto o papel anda. */
  altura: number
  /** Cada linha empacotada em bytes, bit mais significativo à esquerda, 1 = preto. */
  linhas: Uint8Array[]
}

export function dimensoesEmPontos(formato: FormatoEtiqueta) {
  return {
    comprimento: Math.round(formato.comprimentoMm * PONTOS_POR_MM),
    largura: Math.round(formato.larguraMm * PONTOS_POR_MM),
  }
}

/** Fonte que reduz até a linha caber na largura disponível. */
function ajustarFonte(
  ctx: CanvasRenderingContext2D,
  texto: string,
  largura: number,
  tamanhoInicial: number,
  peso: string,
): number {
  let tamanho = tamanhoInicial
  while (tamanho > 8) {
    ctx.font = `${peso} ${tamanho}px Arial, Helvetica, sans-serif`
    if (ctx.measureText(texto).width <= largura) break
    tamanho -= 1
  }
  return tamanho
}

/** Desenha o QR no canto esquerdo e devolve quanto de largura ele consumiu. */
function desenharQr(
  ctx: CanvasRenderingContext2D,
  conteudo: string,
  alturaDisponivel: number,
  margem: number,
): number {
  const modulos = gerarQrCode(conteudo, 'M')
  // Escala inteira: meio ponto de módulo em impressora térmica vira módulo
  // borrado, e QR borrado é QR que não lê.
  const escala = Math.max(1, Math.floor(alturaDisponivel / modulos.length))
  const lado = escala * modulos.length
  const topo = margem + Math.floor((alturaDisponivel - lado) / 2)

  ctx.fillStyle = '#000'
  for (let l = 0; l < modulos.length; l++) {
    for (let c = 0; c < modulos.length; c++) {
      if (modulos[l][c]) ctx.fillRect(margem + c * escala, topo + l * escala, escala, escala)
    }
  }
  return lado
}

/**
 * Desenha a etiqueta num canvas na orientação de leitura.
 * O canvas volta no tamanho exato em pontos da impressora — nada de escalar
 * depois, que é onde o texto pequeno vira mancha.
 */
export function desenharEtiqueta(
  canvas: HTMLCanvasElement,
  dados: DadosEtiqueta,
  formato: FormatoEtiqueta = FORMATO_PADRAO,
): HTMLCanvasElement {
  const { comprimento, largura } = dimensoesEmPontos(formato)
  canvas.width = comprimento
  canvas.height = largura

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, comprimento, largura)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'top'

  const margem = formato.margem
  const alturaUtil = largura - margem * 2

  let x = margem
  if (dados.qr) {
    x += desenharQr(ctx, dados.qr, alturaUtil, margem) + Math.round(PONTOS_POR_MM * 0.75)
  }

  const larguraTexto = comprimento - x - margem

  // Três linhas dão conta do art. 81: lote, as duas datas e quem respondeu pelo
  // ciclo com qual equipamento. Cabe em 12 mm porque nenhuma é longa — e o que
  // passar da largura encolhe sozinho em vez de sair cortado.
  const equipamento = dados.autoclave ? `${dados.autoclave} · ` : ''
  const conteudo = dados.conteudo ? ` · ${dados.conteudo}` : ''
  const linhas = [
    { texto: `LOTE ${dados.lote}`, tamanho: 24, peso: 'bold' },
    { texto: `EST ${dados.data}  ·  VAL ${dados.validade}`, tamanho: 17, peso: 'normal' },
    { texto: `${equipamento}${dados.responsavel}${conteudo}`.toUpperCase(), tamanho: 17, peso: 'normal' },
  ]

  const tamanhos = linhas.map((linha) => ajustarFonte(ctx, linha.texto, larguraTexto, linha.tamanho, linha.peso))
  const entrelinha = 2
  const alturaTotal = tamanhos.reduce((soma, t) => soma + t + entrelinha, -entrelinha)

  let y = margem + Math.max(0, Math.floor((alturaUtil - alturaTotal) / 2))
  linhas.forEach((linha, i) => {
    ctx.font = `${linha.peso} ${tamanhos[i]}px Arial, Helvetica, sans-serif`
    ctx.fillText(linha.texto, x, y)
    y += tamanhos[i] + entrelinha
  })

  return canvas
}

/**
 * Converte o canvas em bitmap 1 bit para a impressora.
 *
 * `rotacao` existe porque o lado em que o rolo entra na Niimbot depende de como
 * a etiqueta foi colada no liner — e descobrir isso é olhar a primeira etiqueta
 * sair, não ler documentação. Deixar isso configurável na tela evita ter que
 * mexer no código quando o rolo trocar de fornecedor.
 */
export function canvasParaBitmap(canvas: HTMLCanvasElement, rotacao: 0 | 90 | 180 | 270 = 90): BitmapImpressao {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D indisponível neste navegador')
  const origem = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const trocaEixos = rotacao === 90 || rotacao === 270
  const largura = trocaEixos ? canvas.height : canvas.width
  const altura = trocaEixos ? canvas.width : canvas.height

  const preto = (x: number, y: number): boolean => {
    const i = (y * canvas.width + x) * 4
    const alfa = origem.data[i + 3]
    if (alfa < 128) return false
    // Média simples basta: o desenho é preto no branco, não fotografia.
    const luz = (origem.data[i] + origem.data[i + 1] + origem.data[i + 2]) / 3
    return luz < 128
  }

  const bytesPorLinha = Math.ceil(largura / 8)
  const linhas: Uint8Array[] = []
  for (let y = 0; y < altura; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    for (let x = 0; x < largura; x++) {
      let ox: number
      let oy: number
      switch (rotacao) {
        case 90:  ox = y;                   oy = canvas.height - 1 - x; break
        case 180: ox = canvas.width - 1 - x; oy = canvas.height - 1 - y; break
        case 270: ox = canvas.width - 1 - y; oy = x;                     break
        default:  ox = x;                    oy = y;                     break
      }
      if (preto(ox, oy)) linha[x >> 3] |= 0x80 >> (x & 7)
    }
    linhas.push(linha)
  }

  return { largura, altura, linhas }
}

/**
 * Padrão de teste: duas tarjas pretas e um quadriculado, sem texto e sem QR.
 *
 * Serve para separar dois problemas que na bancada parecem o mesmo: "a etiqueta
 * saiu em branco". Se a tarja preta sai, os dados chegam à cabeça térmica e o
 * que falta é o desenho ou o tamanho; se nem a tarja sai, o problema está no
 * comando de tamanho de página (a variante do protocolo) ou no rolo, que pode
 * não ser térmico.
 */
export function bitmapDeTeste(
  formato: FormatoEtiqueta = FORMATO_PADRAO,
  rotacao: 0 | 90 | 180 | 270 = 90,
): BitmapImpressao {
  const { comprimento, largura } = dimensoesEmPontos(formato)
  const trocaEixos = rotacao === 90 || rotacao === 270
  const larguraFinal = trocaEixos ? largura : comprimento
  const alturaFinal = trocaEixos ? comprimento : largura

  const bytesPorLinha = Math.ceil(larguraFinal / 8)
  const tarja = Math.max(4, Math.round(alturaFinal * 0.12))
  const quadro = Math.max(4, Math.round(PONTOS_POR_MM))

  const linhas: Uint8Array[] = []
  for (let y = 0; y < alturaFinal; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    const naTarja = y < tarja || y >= alturaFinal - tarja
    for (let x = 0; x < larguraFinal; x++) {
      // Tarjas cheias nas pontas e xadrez no meio: o xadrez mostra se a
      // impressora está perdendo linhas, o que a tarja sozinha esconderia.
      const preto = naTarja || (Math.floor(x / quadro) + Math.floor(y / quadro)) % 2 === 0
      if (preto) linha[x >> 3] |= 0x80 >> (x & 7)
    }
    linhas.push(linha)
  }

  return { largura: larguraFinal, altura: alturaFinal, linhas }
}
