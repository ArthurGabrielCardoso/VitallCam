/**
 * Gerador de QR Code em modo byte, sem dependência externa.
 *
 * O único QR que a clínica imprime é o do lote de esterilização — uma string
 * curta como "VITALL:260831-02". Trazer uma biblioteca inteira (e mexer nos dois
 * lockfiles do repositório) por causa dela custaria mais do que as ~250 linhas
 * abaixo, que cobrem exatamente o que precisamos: modo byte, nível de correção
 * configurável e versões 1 a 10 (até 213 bytes no nível M) — folga de sobra para
 * um código de lote.
 *
 * Implementa a ISO/IEC 18004: campo de Galois GF(256) com polinômio 0x11D,
 * Reed-Solomon, intercalação de blocos, oito máscaras e escolha pela penalidade.
 */

export type NivelCorrecao = 'L' | 'M' | 'Q' | 'H'

// ---------------------------------------------------------------- GF(256) ---

const EXP = new Array<number>(512)
const LOG = new Array<number>(256)

;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]
}

/** Coeficientes do polinômio gerador, do maior grau para o menor. */
function polinomioGerador(grau: number): number[] {
  let g = [1]
  for (let i = 0; i < grau; i++) {
    const novo = new Array<number>(g.length + 1).fill(0)
    for (let j = 0; j < g.length; j++) {
      novo[j] ^= g[j]
      novo[j + 1] ^= mul(g[j], EXP[i])
    }
    g = novo
  }
  return g
}

/** Resto da divisão dos dados pelo gerador: os codewords de correção. */
function codewordsCorrecao(dados: number[], quantidade: number): number[] {
  const g = polinomioGerador(quantidade)
  const resto = new Array<number>(quantidade).fill(0)
  for (const byte of dados) {
    const fator = byte ^ resto[0]
    resto.shift()
    resto.push(0)
    if (fator !== 0) {
      for (let j = 0; j < quantidade; j++) resto[j] ^= mul(g[j + 1], fator)
    }
  }
  return resto
}

// ---------------------------------------------------------------- tabelas ---

/** Total de codewords (dados + correção) das versões 1 a 10. */
const TOTAL_CODEWORDS = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346]

/**
 * Blocos de cada versão/nível: [codewords de correção por bloco, blocos do
 * grupo 1, codewords de dados do grupo 1, blocos do grupo 2, dados do grupo 2].
 */
const BLOCOS: Record<NivelCorrecao, number[][]> = {
  L: [
    [7, 1, 19, 0, 0], [10, 1, 34, 0, 0], [15, 1, 55, 0, 0], [20, 1, 80, 0, 0],
    [26, 1, 108, 0, 0], [18, 2, 68, 0, 0], [20, 2, 78, 0, 0], [24, 2, 97, 0, 0],
    [30, 2, 116, 0, 0], [18, 2, 68, 2, 69],
  ],
  M: [
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0],
    [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39],
    [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  ],
  Q: [
    [13, 1, 13, 0, 0], [22, 1, 22, 0, 0], [18, 2, 17, 0, 0], [26, 2, 24, 0, 0],
    [18, 2, 15, 2, 16], [24, 4, 19, 0, 0], [18, 2, 14, 4, 15], [22, 4, 18, 2, 19],
    [20, 4, 16, 4, 17], [24, 6, 19, 2, 20],
  ],
  H: [
    [17, 1, 9, 0, 0], [28, 1, 16, 0, 0], [22, 2, 13, 0, 0], [16, 4, 9, 0, 0],
    [22, 2, 11, 2, 12], [28, 4, 15, 0, 0], [26, 4, 13, 1, 14], [26, 4, 14, 2, 15],
    [24, 4, 12, 4, 13], [28, 6, 15, 2, 16],
  ],
}

/** Centros dos padrões de alinhamento por versão (vazio na versão 1). */
const ALINHAMENTO = [
  [], [6, 18], [6, 22], [6, 26], [6, 30],
  [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
]

/** Bits de nível de correção dentro da informação de formato. */
const BITS_NIVEL: Record<NivelCorrecao, number> = { L: 0b01, M: 0b00, Q: 0b11, H: 0b10 }

/** Bits de sobra depois dos codewords, por versão. */
function bitsRemanescentes(versao: number): number {
  return versao === 1 ? 0 : versao <= 6 ? 7 : 0
}

function dadosDaVersao(versao: number, nivel: NivelCorrecao) {
  const [ec, blocos1, dados1, blocos2, dados2] = BLOCOS[nivel][versao - 1]
  return { ec, blocos1, dados1, blocos2, dados2, capacidade: blocos1 * dados1 + blocos2 * dados2 }
}

// --------------------------------------------------------------- bitstream ---

class Bits {
  valores: number[] = []
  push(valor: number, tamanho: number) {
    for (let i = tamanho - 1; i >= 0; i--) this.valores.push((valor >> i) & 1)
  }
  get tamanho() {
    return this.valores.length
  }
}

function textoParaBytes(texto: string): number[] {
  return Array.from(new TextEncoder().encode(texto))
}

// ------------------------------------------------------------------ BCH ---

/** Informação de formato: 5 bits de dado + 10 de BCH, mascarada por 0x5412. */
export function informacaoFormato(nivel: NivelCorrecao, mascara: number): number {
  const dado = (BITS_NIVEL[nivel] << 3) | mascara
  let resto = dado << 10
  for (let i = 14; i >= 10; i--) {
    if (resto & (1 << i)) resto ^= 0b10100110111 << (i - 10)
  }
  return ((dado << 10) | resto) ^ 0b101010000010010
}

/** Informação de versão (só a partir da versão 7): 6 bits + 12 de BCH. */
export function informacaoVersao(versao: number): number {
  let resto = versao << 12
  for (let i = 17; i >= 12; i--) {
    if (resto & (1 << i)) resto ^= 0b1111100100101 << (i - 12)
  }
  return (versao << 12) | resto
}

// --------------------------------------------------------------- matriz ---

type Matriz = { modulos: (boolean | null)[][]; reservado: boolean[][]; tamanho: number }

function novaMatriz(tamanho: number): Matriz {
  return {
    tamanho,
    modulos: Array.from({ length: tamanho }, () => new Array<boolean | null>(tamanho).fill(null)),
    reservado: Array.from({ length: tamanho }, () => new Array<boolean>(tamanho).fill(false)),
  }
}

function marcar(m: Matriz, linha: number, coluna: number, valor: boolean) {
  m.modulos[linha][coluna] = valor
  m.reservado[linha][coluna] = true
}

function desenharFinders(m: Matriz) {
  const cantos = [
    [0, 0],
    [0, m.tamanho - 7],
    [m.tamanho - 7, 0],
  ]
  for (const [topo, esquerda] of cantos) {
    for (let l = -1; l <= 7; l++) {
      for (let c = -1; c <= 7; c++) {
        const linha = topo + l
        const coluna = esquerda + c
        if (linha < 0 || coluna < 0 || linha >= m.tamanho || coluna >= m.tamanho) continue
        const dentro = l >= 0 && l <= 6 && c >= 0 && c <= 6
        const escuro =
          dentro && ((l === 0 || l === 6 || c === 0 || c === 6) || (l >= 2 && l <= 4 && c >= 2 && c <= 4))
        marcar(m, linha, coluna, escuro)
      }
    }
  }
}

function desenharTemporizadores(m: Matriz) {
  for (let i = 8; i < m.tamanho - 8; i++) {
    const escuro = i % 2 === 0
    marcar(m, 6, i, escuro)
    marcar(m, i, 6, escuro)
  }
}

function desenharAlinhamento(m: Matriz, versao: number) {
  const centros = ALINHAMENTO[versao - 1]
  for (const linha of centros) {
    for (const coluna of centros) {
      // Os cantos já são ocupados pelos finders.
      if (m.reservado[linha][coluna]) continue
      for (let l = -2; l <= 2; l++) {
        for (let c = -2; c <= 2; c++) {
          const escuro = Math.max(Math.abs(l), Math.abs(c)) !== 1
          marcar(m, linha + l, coluna + c, escuro)
        }
      }
    }
  }
}

function reservarFormato(m: Matriz, versao: number) {
  for (let i = 0; i < 9; i++) {
    if (!m.reservado[8][i]) marcar(m, 8, i, false)
    if (!m.reservado[i][8]) marcar(m, i, 8, false)
  }
  for (let i = 0; i < 8; i++) {
    if (!m.reservado[8][m.tamanho - 1 - i]) marcar(m, 8, m.tamanho - 1 - i, false)
    if (!m.reservado[m.tamanho - 1 - i][8]) marcar(m, m.tamanho - 1 - i, 8, false)
  }
  // Módulo sempre escuro.
  marcar(m, m.tamanho - 8, 8, true)

  if (versao >= 7) {
    for (let i = 0; i < 18; i++) {
      const linha = Math.floor(i / 3)
      const coluna = m.tamanho - 11 + (i % 3)
      marcar(m, linha, coluna, false)
      marcar(m, coluna, linha, false)
    }
  }
}

function escreverFormato(m: Matriz, nivel: NivelCorrecao, mascara: number) {
  const bits = informacaoFormato(nivel, mascara)
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >> i) & 1) === 1
    // Cópia junto ao finder superior esquerdo.
    if (i < 6) m.modulos[8][i] = bit
    else if (i === 6) m.modulos[8][7] = bit
    else if (i === 7) m.modulos[8][8] = bit
    else if (i === 8) m.modulos[7][8] = bit
    else m.modulos[14 - i][8] = bit
    // Cópia dividida entre os outros dois finders.
    if (i < 8) m.modulos[m.tamanho - 1 - i][8] = bit
    else m.modulos[8][m.tamanho - 15 + i] = bit
  }
}

function escreverVersao(m: Matriz, versao: number) {
  if (versao < 7) return
  const bits = informacaoVersao(versao)
  for (let i = 0; i < 18; i++) {
    const bit = ((bits >> i) & 1) === 1
    const linha = Math.floor(i / 3)
    const coluna = m.tamanho - 11 + (i % 3)
    m.modulos[linha][coluna] = bit
    m.modulos[coluna][linha] = bit
  }
}

function preencherDados(m: Matriz, bits: number[]) {
  let indice = 0
  let subindo = true
  for (let par = m.tamanho - 1; par > 0; par -= 2) {
    // A coluna 6 é o temporizador vertical: o zigue-zague pula por cima dela.
    if (par === 6) par = 5
    for (let passo = 0; passo < m.tamanho; passo++) {
      const linha = subindo ? m.tamanho - 1 - passo : passo
      for (const coluna of [par, par - 1]) {
        if (m.reservado[linha][coluna]) continue
        m.modulos[linha][coluna] = indice < bits.length ? bits[indice] === 1 : false
        indice++
      }
    }
    subindo = !subindo
  }
}

function condicaoMascara(mascara: number, linha: number, coluna: number): boolean {
  switch (mascara) {
    case 0: return (linha + coluna) % 2 === 0
    case 1: return linha % 2 === 0
    case 2: return coluna % 3 === 0
    case 3: return (linha + coluna) % 3 === 0
    case 4: return (Math.floor(linha / 2) + Math.floor(coluna / 3)) % 2 === 0
    case 5: return ((linha * coluna) % 2) + ((linha * coluna) % 3) === 0
    case 6: return (((linha * coluna) % 2) + ((linha * coluna) % 3)) % 2 === 0
    default: return (((linha + coluna) % 2) + ((linha * coluna) % 3)) % 2 === 0
  }
}

function penalidade(modulos: boolean[][]): number {
  const n = modulos.length
  let total = 0

  // Regra 1: sequências de 5 ou mais módulos iguais.
  for (let i = 0; i < n; i++) {
    for (const linhas of [true, false]) {
      let repetidos = 1
      for (let j = 1; j < n; j++) {
        const atual = linhas ? modulos[i][j] : modulos[j][i]
        const anterior = linhas ? modulos[i][j - 1] : modulos[j - 1][i]
        if (atual === anterior) {
          repetidos++
        } else {
          if (repetidos >= 5) total += 3 + (repetidos - 5)
          repetidos = 1
        }
      }
      if (repetidos >= 5) total += 3 + (repetidos - 5)
    }
  }

  // Regra 2: blocos 2x2 de mesma cor.
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const c = modulos[i][j]
      if (c === modulos[i][j + 1] && c === modulos[i + 1][j] && c === modulos[i + 1][j + 1]) total += 3
    }
  }

  // Regra 3: padrão 1:1:3:1:1 com quatro claros de um dos lados.
  const alvo1 = [true, false, true, true, true, false, true, false, false, false, false]
  const alvo2 = [false, false, false, false, true, false, true, true, true, false, true]
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      for (const linhas of [true, false]) {
        let bate1 = true
        let bate2 = true
        for (let k = 0; k < 11; k++) {
          const valor = linhas ? modulos[i][j + k] : modulos[j + k][i]
          if (valor !== alvo1[k]) bate1 = false
          if (valor !== alvo2[k]) bate2 = false
        }
        if (bate1) total += 40
        if (bate2) total += 40
      }
    }
  }

  // Regra 4: desvio da proporção de 50% de módulos escuros.
  let escuros = 0
  for (const linha of modulos) for (const modulo of linha) if (modulo) escuros++
  const proporcao = (escuros * 100) / (n * n)
  total += Math.floor(Math.abs(proporcao - 50) / 5) * 10

  return total
}

// ------------------------------------------------------------------ API ---

/**
 * Devolve a matriz de módulos (true = escuro), sem a zona silenciosa —
 * quem desenha decide a margem.
 */
export function gerarQrCode(texto: string, nivel: NivelCorrecao = 'M'): boolean[][] {
  const bytes = textoParaBytes(texto)

  let versao = 0
  for (let v = 1; v <= 10; v++) {
    const { capacidade } = dadosDaVersao(v, nivel)
    const cabecalho = 4 + (v >= 10 ? 16 : 8)
    if (bytes.length * 8 + cabecalho <= capacidade * 8) {
      versao = v
      break
    }
  }
  if (versao === 0) {
    throw new Error(`Texto longo demais para QR nível ${nivel} até a versão 10 (${bytes.length} bytes)`)
  }

  const { ec, blocos1, dados1, blocos2, dados2, capacidade } = dadosDaVersao(versao, nivel)

  // Cabeçalho (modo byte + contagem), dados, terminador e preenchimento.
  const fluxo = new Bits()
  fluxo.push(0b0100, 4)
  fluxo.push(bytes.length, versao >= 10 ? 16 : 8)
  for (const byte of bytes) fluxo.push(byte, 8)
  fluxo.push(0, Math.min(4, capacidade * 8 - fluxo.tamanho))
  while (fluxo.tamanho % 8 !== 0) fluxo.push(0, 1)

  const codewords: number[] = []
  for (let i = 0; i < fluxo.tamanho; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | fluxo.valores[i + j]
    codewords.push(byte)
  }
  const enchimento = [0xec, 0x11]
  while (codewords.length < capacidade) codewords.push(enchimento[codewords.length % 2 === 0 ? 0 : 1])

  // Blocos: os codewords de dados são fatiados e cada fatia ganha sua correção.
  const blocosDados: number[][] = []
  const blocosCorrecao: number[][] = []
  let cursor = 0
  for (const [quantidade, tamanho] of [[blocos1, dados1], [blocos2, dados2]]) {
    for (let i = 0; i < quantidade; i++) {
      const bloco = codewords.slice(cursor, cursor + tamanho)
      cursor += tamanho
      blocosDados.push(bloco)
      blocosCorrecao.push(codewordsCorrecao(bloco, ec))
    }
  }

  // Intercalação: um codeword de cada bloco por vez, dados e depois correção.
  const finais: number[] = []
  const maiorDado = Math.max(dados1, dados2)
  for (let i = 0; i < maiorDado; i++) {
    for (const bloco of blocosDados) if (i < bloco.length) finais.push(bloco[i])
  }
  for (let i = 0; i < ec; i++) {
    for (const bloco of blocosCorrecao) finais.push(bloco[i])
  }
  if (finais.length !== TOTAL_CODEWORDS[versao - 1]) {
    throw new Error('Contagem de codewords inconsistente com a tabela da versão')
  }

  const bitsFinais: number[] = []
  for (const byte of finais) for (let i = 7; i >= 0; i--) bitsFinais.push((byte >> i) & 1)
  for (let i = 0; i < bitsRemanescentes(versao); i++) bitsFinais.push(0)

  // Estrutura fixa uma vez só; as oito máscaras reaproveitam o mesmo desenho.
  const base = novaMatriz(versao * 4 + 17)
  desenharFinders(base)
  desenharAlinhamento(base, versao)
  desenharTemporizadores(base)
  reservarFormato(base, versao)
  preencherDados(base, bitsFinais)

  let melhor: boolean[][] | null = null
  let melhorPenalidade = Infinity
  for (let mascara = 0; mascara < 8; mascara++) {
    const candidata: Matriz = {
      tamanho: base.tamanho,
      reservado: base.reservado,
      modulos: base.modulos.map((linha, l) =>
        linha.map((valor, c) => (base.reservado[l][c] ? valor : valor !== condicaoMascara(mascara, l, c))),
      ),
    }
    escreverFormato(candidata, nivel, mascara)
    escreverVersao(candidata, versao)
    const modulos = candidata.modulos as boolean[][]
    const nota = penalidade(modulos)
    if (nota < melhorPenalidade) {
      melhorPenalidade = nota
      melhor = modulos
    }
  }

  return melhor as boolean[][]
}
