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
 * esterilização, validade do pacote, responsável e a autoclave. À esquerda vai a
 * marca da clínica — o texto legível é o que a Vigilância bate o olho, então ele
 * nunca encolhe para dar espaço à logo.
 *
 * O indicador químico tipo 1 NÃO está aqui e não tem como estar: papel térmico
 * não vira reagente. Ele vem da borda do papel grau cirúrgico ou da fita
 * zebrada — esta etiqueta cuida da rastreabilidade, o pacote cuida do indicador.
 */

/** Resolução da cabeça térmica: 203 dpi ≈ 8 pontos por milímetro. */
export const PONTOS_POR_MM = 8

export interface FormatoEtiqueta {
  /** Comprimento da etiqueta em mm (o sentido em que o papel anda). */
  comprimentoMm: number
  /** Largura útil em mm — na D110 a cabeça imprime 12 mm, mesmo em rolo de 15. */
  larguraMm: number
  /** Margem branca em pontos, para a etiqueta não sair cortada. */
  margem: number
  /**
   * Quanto do comprimento a marca pode ocupar, em porcentagem. É a régua entre
   * logo e texto: o que a marca toma, o texto devolve encolhendo a fonte — e o
   * texto é o que a Vigilância lê, então o limite fica na tela, não no código.
   */
  logoPorcento?: number
}

/**
 * Rolo padrão da clínica. A D110 aceita etiqueta de até 15 mm de largura, mas a
 * cabeça só cobre 12 mm: imprimir mais largo que isso não corta, some.
 */
export const FORMATO_PADRAO: FormatoEtiqueta = {
  comprimentoMm: 50,
  larguraMm: 12,
  margem: 6,
  logoPorcento: 34,
}

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
  /**
   * Marca da clínica, já carregada. Nulo imprime só o texto — a etiqueta vale
   * igual sem ela, então uma imagem que não carregou nunca segura a impressão.
   */
  logo?: HTMLImageElement | null
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

/**
 * Alfa a partir do qual o ponto vira tinta.
 *
 * Baixo de propósito: a marca é de traço fino e, reduzida a 10 mm, cada traço
 * cai em cima de meio ponto da cabeça térmica. Com o corte no meio da escala os
 * traços somem; com ele baixo a logo engorda um pouco, que é o erro certo numa
 * impressora de 203 dpi.
 */
const ALFA_MINIMO_LOGO = 48

/** Acima disto o ponto é claro demais para virar tinta (fundo branco da arte). */
const LUZ_MAXIMA_LOGO = 235

/**
 * Desenha a marca da clínica à esquerda e devolve a largura que ela ocupou.
 *
 * A impressora é preto no branco, sem meio-tom: em vez de deixar o limiar geral
 * decidir depois — que apagaria o dourado da marca, claro demais — a região da
 * logo já sai binarizada aqui, por opacidade.
 */
function desenharLogo(
  ctx: CanvasRenderingContext2D,
  logo: HTMLImageElement,
  alturaDisponivel: number,
  margem: number,
  larguraMaxima: number,
): number {
  const proporcao = logo.naturalWidth > 0 && logo.naturalHeight > 0
    ? logo.naturalWidth / logo.naturalHeight
    : 1

  // A marca é deitada: quem manda no tamanho é a largura que sobrou, não a
  // altura da etiqueta. Cresce até o limite pedido e para na altura útil.
  const largura = Math.max(1, Math.round(Math.min(larguraMaxima, alturaDisponivel * proporcao)))
  const altura = Math.max(1, Math.round(largura / proporcao))
  const topo = margem + Math.floor((alturaDisponivel - altura) / 2)

  ctx.drawImage(logo, margem, topo, largura, altura)

  const area = ctx.getImageData(margem, topo, largura, altura)
  for (let i = 0; i < area.data.length; i += 4) {
    const alfa = area.data[i + 3]
    const luz = (area.data[i] + area.data[i + 1] + area.data[i + 2]) / 3
    const tinta = alfa >= ALFA_MINIMO_LOGO && luz < LUZ_MAXIMA_LOGO
    area.data[i] = area.data[i + 1] = area.data[i + 2] = tinta ? 0 : 255
    area.data[i + 3] = 255
  }
  ctx.putImageData(area, margem, topo)

  return largura
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

  // A logo abre espaço à esquerda; o texto começa depois dela, com uma folga
  // maior do que a de antes — pedido de quem lê a etiqueta na bancada, para o
  // lote não nascer colado na marca.
  let x = margem
  if (dados.logo) {
    const orcamento = Math.round((comprimento * (formato.logoPorcento ?? 34)) / 100)
    x += desenharLogo(ctx, dados.logo, alturaUtil, margem, orcamento) + Math.round(PONTOS_POR_MM * 1.5)
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

  // Meio ponto de milímetro abaixo do centro: sem isso o bloco fica alto demais
  // em relação à marca, e a etiqueta parece torta mesmo estando certa.
  const respiro = Math.round(PONTOS_POR_MM * 0.5)
  const sobra = Math.max(0, alturaUtil - alturaTotal)
  let y = margem + Math.min(sobra, Math.floor(sobra / 2) + respiro)
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
