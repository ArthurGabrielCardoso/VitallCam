/**
 * Monta o PDF da via assinada a partir do que a multifuncional entregou.
 *
 * A via assinada é sempre UM arquivo. Contrato guardado como três JPGs soltos é
 * como se perde a página 3 — e num termo de consentimento a página que some é
 * sempre a que interessava.
 *
 * O scanner da clínica normalmente já sai em PDF de várias páginas, e esse caso
 * sobe direto, sem reprocessar. Quando ele sai em imagem por página, as imagens
 * viram páginas A4 de um PDF só, na ordem em que foram escolhidas.
 */

import { jsPDF } from 'jspdf'

/** A4 retrato, em mm — a mesma folha em que o contrato foi impresso. */
const A4_LARGURA = 210
const A4_ALTURA = 297

/**
 * Teto da aresta maior, em pixels. Um scan de 300dpi chega a ~2480×3508 e, em
 * PNG, passa de 10 MB por página. Reencodar em JPEG nesse tamanho mantém a
 * assinatura perfeitamente legível e deixa o arquivo na casa das centenas de KB
 * — o que importa quando o PDF vai por WhatsApp.
 */
const LADO_MAXIMO = 2400
const QUALIDADE_JPEG = 0.9

export interface ViaAssinadaMontada {
  blob: Blob
  /**
   * Nulo quando o PDF veio pronto do scanner: dá pra tentar adivinhar contando
   * `/Type /Page` no arquivo, mas isso erra em PDF comprimido — e num documento
   * cujo propósito é denunciar página faltando, um número errado é pior que
   * número nenhum. Só é preenchido quando as páginas foram montadas aqui.
   */
  paginas: number | null
}

function ehPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function ehImagem(file: File): boolean {
  return file.type.startsWith('image/')
}

/** Carrega a imagem já reencodada em JPEG e reduzida ao teto acima. */
async function normalizar(file: File): Promise<{ dataUrl: string; largura: number; altura: number }> {
  const bitmapUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`Não foi possível ler "${file.name}".`))
      el.src = bitmapUrl
    })

    const escala = Math.min(1, LADO_MAXIMO / Math.max(img.naturalWidth, img.naturalHeight))
    const largura = Math.round(img.naturalWidth * escala)
    const altura = Math.round(img.naturalHeight * escala)

    const canvas = document.createElement('canvas')
    canvas.width = largura
    canvas.height = altura
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Não foi possível processar a imagem.')
    // Papel escaneado tem fundo branco; sem isso um PNG com transparência
    // viraria preto no JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, largura, altura)
    ctx.drawImage(img, 0, 0, largura, altura)

    return { dataUrl: canvas.toDataURL('image/jpeg', QUALIDADE_JPEG), largura, altura }
  } finally {
    URL.revokeObjectURL(bitmapUrl)
  }
}

/**
 * Devolve o PDF pronto pra subir. Lança com mensagem legível quando a seleção
 * não dá pra transformar num documento só — que é o único caso em que insistir
 * seria pior do que avisar.
 */
export async function montarPdfDaVia(files: File[]): Promise<ViaAssinadaMontada> {
  if (files.length === 0) throw new Error('Nenhum arquivo selecionado.')

  const pdfs = files.filter(ehPdf)
  const imagens = files.filter(ehImagem)

  if (pdfs.length + imagens.length < files.length) {
    throw new Error('Selecione apenas PDF ou imagens do contrato escaneado.')
  }

  if (pdfs.length > 0 && imagens.length > 0) {
    throw new Error('Misture não: ou o PDF do scanner, ou as páginas em imagem.')
  }

  if (pdfs.length > 1) {
    throw new Error(
      'Selecione um PDF só. Se o scanner gerou um arquivo por página, escaneie o contrato inteiro de uma vez ou envie as páginas como imagem.',
    )
  }

  // Caminho comum: a multifuncional entregou o contrato inteiro em PDF.
  if (pdfs.length === 1) {
    return { blob: pdfs[0], paginas: null }
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  for (let i = 0; i < imagens.length; i++) {
    const { dataUrl, largura, altura } = await normalizar(imagens[i])
    if (i > 0) doc.addPage()

    // Encaixa a página inteira na folha sem distorcer, centralizada. A margem
    // que sobra é preferível a cortar a borda — é onde costuma estar a rubrica.
    const escala = Math.min(A4_LARGURA / largura, A4_ALTURA / altura)
    const w = largura * escala
    const h = altura * escala
    doc.addImage(dataUrl, 'JPEG', (A4_LARGURA - w) / 2, (A4_ALTURA - h) / 2, w, h)
  }

  return { blob: doc.output('blob'), paginas: imagens.length }
}
