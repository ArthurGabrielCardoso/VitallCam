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
 * nunca encolhe para dar espaço a mais nada.
 *
 * Teve QR aqui por uma versão. Numa etiqueta de 50 por 12 mm ele só cabia
 * roubando espaço do texto, e texto apertado numa etiqueta que a Vigilância lê é
 * o pior lugar para economizar. Quem procura um pacote digita o código.
 *
 * O indicador químico tipo 1 NÃO está aqui e não tem como estar: papel térmico
 * não vira reagente. Ele vem da borda do papel grau cirúrgico ou da fita
 * zebrada — esta etiqueta cuida da rastreabilidade, o pacote cuida do indicador.
 */

/**
 * Quanto a cabeça da D110 cobre, em milímetros. É a régua da régua: o teste
 * desenha um degrau por milímetro daqui, sempre, para o resultado impresso poder
 * ser contado contra um número que não muda com o ajuste.
 */
const LARGURA_CABECA_MM = 12

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
  /**
   * Quanto descer (ou subir, se negativo) TODO o desenho dentro da etiqueta, em
   * milímetros.
   *
   * Existe porque o desenho pode estar centrado e ainda assim sair alto no
   * adesivo: onde o rolo para debaixo da cabeça térmica é físico, muda com o
   * lote de etiqueta e com o jeito que o rolo foi colocado. O comprimento sai
   * certo e a largura sai fora de centro — foi assim que apareceu na bancada,
   * cortando o topo da logo e do lote com folga sobrando embaixo.
   *
   * Fica na tela e não no código porque quem enxerga o resultado é quem está com
   * a etiqueta na mão.
   */
  deslocamentoMm?: number
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
  deslocamentoMm: 0,
}

export interface DadosEtiqueta {
  /** Código do lote no formato MMDD-NN. */
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
  /**
   * Código do pacote (LOTE-NN). É o que dá identidade a cada um dos dez pacotes
   * de um mesmo ciclo — e é o que se digita para achar o pacote depois. Vazio
   * imprime só o lote.
   */
  pacote?: string | null
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

/**
 * Fonte que reduz até a linha caber na largura disponível.
 *
 * Com 3% de folga: `measureText` e o desenho final podem discordar por
 * arredondamento e por diferença de espaçamento entre letras, e numa etiqueta de
 * 50 mm essa diferença é a última letra do lote encostando na borda.
 */
function ajustarFonte(
  ctx: CanvasRenderingContext2D,
  texto: string,
  largura: number,
  tamanhoInicial: number,
  peso: string,
): number {
  const cabe = largura * 0.97
  let tamanho = tamanhoInicial
  while (tamanho > 8) {
    ctx.font = `${peso} ${tamanho}px Arial, Helvetica, sans-serif`
    if (ctx.measureText(texto).width <= cabe) break
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
  /** Desce a marca junto com o texto; `margem` continua mandando no lado. */
  descer: number,
): number {
  const proporcao = logo.naturalWidth > 0 && logo.naturalHeight > 0
    ? logo.naturalWidth / logo.naturalHeight
    : 1

  // A marca é deitada: quem manda no tamanho é a largura que sobrou, não a
  // altura da etiqueta. Cresce até o limite pedido e para na altura útil.
  const largura = Math.max(1, Math.round(Math.min(larguraMaxima, alturaDisponivel * proporcao)))
  const altura = Math.max(1, Math.round(largura / proporcao))
  const topo = margem + descer + Math.floor((alturaDisponivel - altura) / 2)

  ctx.drawImage(logo, margem, topo, largura, altura)

  // Binarizar só o pedaço que caiu dentro do canvas: com o deslocamento a marca
  // pode nascer meio para fora, e ler fora da tela devolve pixel transparente
  // que viraria uma faixa branca por cima do desenho.
  const alto = Math.max(0, topo)
  const baixo = Math.min(ctx.canvas.height, topo + altura)
  if (baixo > alto) {
    const area = ctx.getImageData(margem, alto, largura, baixo - alto)
    for (let i = 0; i < area.data.length; i += 4) {
      const alfa = area.data[i + 3]
      const luz = (area.data[i] + area.data[i + 1] + area.data[i + 2]) / 3
      const tinta = alfa >= ALFA_MINIMO_LOGO && luz < LUZ_MAXIMA_LOGO
      area.data[i] = area.data[i + 1] = area.data[i + 2] = tinta ? 0 : 255
      area.data[i + 3] = 255
    }
    ctx.putImageData(area, margem, alto)
  }

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

  // O desenho inteiro desce (ou sobe) junto — logo e texto. Preso à etiqueta
  // para o ajuste nunca empurrar o conteúdo para fora dela: passar do limite
  // trocaria um corte por outro.
  const limite = Math.floor(largura / 2)
  const desloc = Math.max(
    -limite,
    Math.min(limite, Math.round(PONTOS_POR_MM * (formato.deslocamentoMm ?? 0))),
  )

  // A logo abre espaço à esquerda; o texto começa depois dela, com uma folga
  // maior do que a de antes — pedido de quem lê a etiqueta na bancada, para o
  // lote não nascer colado na marca.
  let x = margem
  if (dados.logo) {
    const orcamento = Math.round((comprimento * (formato.logoPorcento ?? 34)) / 100)
    x += desenharLogo(ctx, dados.logo, alturaUtil, margem, orcamento, desloc) + Math.round(PONTOS_POR_MM * 1.5)
  }

  const larguraTexto = comprimento - x - margem

  // Três linhas dão conta do art. 81: lote, as duas datas e quem respondeu pelo
  // ciclo com qual equipamento. Cabe em 12 mm porque nenhuma é longa — e o que
  // passar da largura encolhe sozinho em vez de sair cortado.
  const equipamento = dados.autoclave ? `${dados.autoclave} · ` : ''
  const conteudo = dados.conteudo ? ` · ${dados.conteudo}` : ''
  const linhas = [
    // O código do pacote no lugar do lote: ele já contém o lote e acrescenta o
    // número do pacote. É exatamente o que se digita na busca — imprimir uma
    // coisa e procurar por outra seria pedir erro.
    { texto: `LOTE ${dados.pacote || dados.lote}`, tamanho: 24, peso: 'bold' },
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
  let y = margem + desloc + Math.min(sobra, Math.floor(sobra / 2) + respiro)

  // Recorte na área do texto: se a medida ainda escapar, a linha para na margem
  // em vez de sair pela borda do adesivo. Cortar é ruim; vazar é pior, porque
  // some com o caractere sem deixar sinal de que faltou alguma coisa.
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, 0, larguraTexto, largura)
  ctx.clip()
  linhas.forEach((linha, i) => {
    ctx.font = `${linha.peso} ${tamanhos[i]}px Arial, Helvetica, sans-serif`
    ctx.fillText(linha.texto, x, y)
    y += tamanhos[i] + entrelinha
  })
  ctx.restore()

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
 * Régua: uma escada de degraus de 1 mm ao longo da LARGURA da etiqueta.
 *
 * Serve para responder a pergunta que nenhuma prévia responde: onde a etiqueta
 * para debaixo da cabeça térmica. A prévia mostra o desenho centrado e a
 * impressa sai cortada em cima — a diferença não está no desenho, está em qual
 * pedaço da cabeça cai sobre o adesivo, e isso é físico.
 *
 * Cada degrau é 1 mm de largura, e o comprimento dele diz o número: o degrau 1 é
 * o mais curto, o último é o mais comprido. Basta contar quantos degraus saíram
 * inteiros e quais faltaram nas pontas — a conta de quanto descer o desenho sai
 * daí, medida em vez de chutada.
 *
 * Continua servindo para o diagnóstico antigo: se nenhum degrau sai, o problema
 * é o comando de tamanho de página (a variante do protocolo) ou o rolo, que pode
 * não ser térmico.
 */
export function bitmapDeTeste(
  formato: FormatoEtiqueta = FORMATO_PADRAO,
  rotacao: 0 | 90 | 180 | 270 = 90,
): BitmapImpressao {
  const { comprimento } = dimensoesEmPontos(formato)
  // A régua vai na cabeça inteira, não na largura ajustada: se a cabeça só
  // estiver pegando parte do adesivo, é isso que precisa aparecer.
  const largura = LARGURA_CABECA_MM * PONTOS_POR_MM
  const trocaEixos = rotacao === 90 || rotacao === 270
  const larguraFinal = trocaEixos ? largura : comprimento
  const alturaFinal = trocaEixos ? comprimento : largura

  const bytesPorLinha = Math.ceil(larguraFinal / 8)

  // O eixo da largura da etiqueta é o que a cabeça cobre de uma vez; depois do
  // giro ele é o x do bitmap quando os eixos trocam, e o y quando não trocam.
  // A escada mora nesse eixo, que é justamente onde o corte aparece.
  // SEMPRE 12 degraus de 1 mm, e não `larguraMm` degraus.
  //
  // A primeira versão desta régua tirava o número de degraus do ajuste de
  // largura — ou seja, as marcas dependiam justamente do que estava sendo
  // medido. Com a largura mal ajustada a régua saía com menos degraus e
  // "saíram 6 de 6" ficava igualzinho a "saíram 6 de 12" na etiqueta. Régua não
  // pode depender da peça: ela mede a cabeça, que cobre 12 mm na D110.
  const degraus = LARGURA_CABECA_MM
  const pontosPorDegrau = PONTOS_POR_MM
  const eixoLargura = trocaEixos ? larguraFinal : alturaFinal
  const eixoComprimento = trocaEixos ? alturaFinal : larguraFinal

  // Um vão branco de 1 ponto entre degraus, para dois degraus vizinhos não
  // virarem uma mancha só na hora de contar.
  const cheio = (aoLongo: number, naLargura: number): boolean => {
    const degrau = Math.floor(naLargura / pontosPorDegrau)
    if (degrau >= degraus) return false
    if (naLargura % pontosPorDegrau === pontosPorDegrau - 1) return false
    const comprimentoDoDegrau = Math.round((eixoComprimento * (degrau + 1)) / degraus)
    return aoLongo < comprimentoDoDegrau
  }

  const linhas: Uint8Array[] = []
  for (let y = 0; y < alturaFinal; y++) {
    const linha = new Uint8Array(bytesPorLinha)
    for (let x = 0; x < larguraFinal; x++) {
      const naLargura = trocaEixos ? x : y
      const aoLongo = trocaEixos ? y : x
      if (naLargura < eixoLargura && cheio(aoLongo, naLargura)) linha[x >> 3] |= 0x80 >> (x & 7)
    }
    linhas.push(linha)
  }

  return { largura: larguraFinal, altura: alturaFinal, linhas }
}

/** Caminho da marca da clínica dentro do app. */
const CAMINHO_LOGO = '/assets/images/logo-doc.png'

let logoCarregando: Promise<HTMLImageElement | null> | null = null

/**
 * Carrega a marca da clínica uma vez por sessão.
 *
 * Devolve uma promessa porque a impressão precisa esperar por ela: desenhar
 * antes de a imagem estar decodificada não dá erro, só sai etiqueta sem logo —
 * e etiqueta sem logo é justamente o que não pode acontecer.
 *
 * Nunca rejeita. Se a imagem não vier, a etiqueta sai sem ela: o lote, as datas
 * e o responsável é que fazem a rastreabilidade, e segurar a impressão por causa
 * de um arquivo de imagem seria o erro maior.
 */
export function carregarLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (logoCarregando) return logoCarregando

  logoCarregando = new Promise((resolve) => {
    const img = new window.Image()
    const desistir = setTimeout(() => resolve(null), 5_000)
    img.onload = () => {
      clearTimeout(desistir)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(desistir)
      // Uma falha não fica cacheada: a próxima impressão tenta de novo.
      logoCarregando = null
      resolve(null)
    }
    img.src = CAMINHO_LOGO
  })
  return logoCarregando
}

/**
 * Espera as fontes do documento ficarem prontas.
 *
 * O canvas mede o texto com a fonte que estiver valendo NA HORA. Se a medida
 * acontece antes de a fonte terminar de carregar, ela vem menor do que a
 * realidade: o ajuste escolhe um corpo grande demais e o texto sai batendo na
 * borda direita. Foi o que aconteceu na primeira etiqueta de cada sessão — a
 * segunda saía certa porque aí a fonte já estava resolvida.
 */
export function fontesProntas(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve()
  return document.fonts.ready.then(() => undefined).catch(() => undefined)
}
