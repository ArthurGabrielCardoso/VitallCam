'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PADRAO_CLINICA, PROFISSIONAIS } from '@/lib/contracts/clinica'
import SeletorDentes from '@/components/SeletorDentes'
import { createPortal } from 'react-dom'
import {
  X, Printer, PanelLeftOpen, PanelLeftClose, FileSignature, Eraser, Check,
  Bold, Italic, Underline as UnderlineIcon, AlignLeft, AlignCenter, AlignJustify, RotateCcw,
  List, ListOrdered, Image as ImageIcon, ImageOff, FilePlus, Trash2, ArrowUp, ArrowDown, ChevronDown, Heading, Search,
} from 'lucide-react'
import {
  ContractBlock, ContractField, ContractInline, ContractTemplate, contractFullTitle,
} from '@/lib/contracts'
import { useToast } from '@/hooks/use-toast'

type Values = Record<string, string>

interface ContractEditorProps {
  template: ContractTemplate
  patientName?: string
  /** Chave de rascunho — normalmente o id do paciente */
  scope?: string
  /** Valores de um contrato já emitido, para reabrir igual ao que foi assinado. */
  valoresIniciais?: Record<string, string>
  /** Chamado ao imprimir — é quando a clínica considera o contrato feito. */
  onEmitir?: (valores: Record<string, string>) => void
  onClose: () => void
}

const CLINIC_STORAGE_KEY = 'vitall:contract-clinic'
const draftKey = (templateId: string, scope: string) => `vitall:contract:${scope}:${templateId}`

// Geometria da folha — espelha exatamente o CSS do fim do arquivo, porque a
// paginação é calculada em JS a partir destes valores.
const MM = 96 / 25.4
const PAGE_PAD_MM = 7
const FRAME_PAD_Y_MM = 7
const FRAME_PAD_X_MM = 9
const FRAME_BORDER_PX = 3
const BOTTOM_SAFE_MM = 6 // respiro acima da barra inferior

const CONTENT_W_MM = 210 - 2 * PAGE_PAD_MM - 2 * FRAME_PAD_X_MM
const BOX_H_PX =
  297 * MM
  - 2 * PAGE_PAD_MM * MM
  - 2 * FRAME_BORDER_PX
  - 2 * FRAME_PAD_Y_MM * MM
  - BOTTOM_SAFE_MM * MM

/** Altura mínima sobrando para valer a pena quebrar um parágrafo no meio. */
const MIN_SPLIT_PX = 11 * MM

const FIELD_WIDTH_MM: Record<NonNullable<ContractField['width']>, string> = {
  xs: '13mm', sm: '25mm', md: '38mm', lg: '60mm', xl: '82mm', full: '90mm',
}

function readJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}

// ---------------------------------------------------------------------------
// Template -> nós de conteúdo
// ---------------------------------------------------------------------------

type SplitMode = 'text' | 'item' | 'none'

interface BlockNode {
  tag: string
  cls: string
  inner: string
  split: SplitMode
  /** Quebra de página forçada — usada pelo botão "nova página". */
  brk?: boolean
}

const PAGE_BREAK_NODE: BlockNode = { tag: 'div', cls: '', inner: '', split: 'none', brk: true }
const EMPTY_P_NODE: BlockNode = { tag: 'p', cls: 'ctr-p', inner: '<br>', split: 'text' }

/** Pedaço de um bloco que coube numa página. */
interface Fragment {
  src: number
  tag: string
  cls: string
  inner: string
}

function inlineToHtml(parts: ContractInline[], fields: ContractField[]): string {
  return parts.map(part => {
    if (typeof part === 'string') return escapeHtml(part)
    if ('b' in part) return `<strong>${escapeHtml(part.b)}</strong>`
    const field = fields.find(fl => fl.id === part.f)
    const width = FIELD_WIDTH_MM[field?.width ?? 'md']
    const label = field ? escapeHtml(field.label) : ''
    return `<span class="ctr-field" data-f="${escapeHtml(part.f)}" data-w="${width}" title="${label}" contenteditable="false"></span>`
  }).join('')
}

function blockToNode(block: ContractBlock, fields: ContractField[]): BlockNode {
  const inline = (parts: ContractInline[]) => inlineToHtml(parts, fields)
  switch (block.t) {
    case 'p': {
      const cls = ['ctr-p']
      if (block.bold) cls.push('ctr-p-bold')
      if (block.italic) cls.push('ctr-p-italic')
      if (block.align === 'center') cls.push('ctr-p-center')
      return { tag: 'p', cls: cls.join(' '), inner: inline(block.c), split: 'text' }
    }
    case 'h':
      return { tag: 'h2', cls: 'ctr-h', inner: escapeHtml(block.c), split: 'none' }
    case 'ul':
      return {
        tag: 'ul', cls: 'ctr-list', split: 'item',
        inner: block.items.map(i => `<li>${inline(i)}</li>`).join(''),
      }
    case 'ol':
      return {
        tag: 'ol', cls: 'ctr-list ctr-list-ordered', split: 'item',
        // `value` explícito para a numeração continuar correta se a lista
        // for cortada no meio e o resto cair na página seguinte.
        inner: block.items.map((i, k) => `<li value="${k + 1}">${inline(i)}</li>`).join(''),
      }
    case 'sp':
      return { tag: 'div', cls: 'ctr-spacer', inner: '', split: 'none' }
    case 'date':
      return {
        tag: 'p', cls: 'ctr-date', split: 'none',
        inner: inline([{ f: 'localData' }, ', ', { f: 'dia' }, ' de ', { f: 'mes' }, ' de ', { f: 'ano' }, '.']),
      }
    case 'sign':
      return {
        tag: 'div', cls: 'ctr-signs', split: 'none',
        inner: block.labels.map(l =>
          `<div class="ctr-sign"><div class="ctr-sign-line"></div><div class="ctr-sign-label">${escapeHtml(l)}</div></div>`
        ).join(''),
      }
    default:
      return { tag: 'div', cls: '', inner: '', split: 'none' }
  }
}

/** Preenche os spans de campo dentro de um container com os valores atuais. */
function syncFields(root: ParentNode | null, values: Values) {
  if (!root) return
  root.querySelectorAll<HTMLElement>('[data-f]').forEach(el => {
    const id = el.dataset.f!
    const value = values[id] ?? ''
    el.textContent = value || ' '
    el.classList.toggle('ctr-field-filled', Boolean(value))
    el.style.minWidth = value ? '0' : (el.dataset.w ?? '38mm')
  })
}

// ---------------------------------------------------------------------------
// Quebra de página no nível da linha
// ---------------------------------------------------------------------------

function outerHeight(el: HTMLElement): number {
  const cs = window.getComputedStyle(el)
  return el.getBoundingClientRect().height
    + parseFloat(cs.marginTop || '0')
    + parseFloat(cs.marginBottom || '0')
}

/**
 * Acha o último ponto entre palavras cujo texto ainda cabe em `maxH` e devolve
 * [parteQueCabe, resto] em HTML. É isso que faz a última linha "descer" para a
 * página seguinte em vez de empurrar o parágrafo inteiro.
 */
function splitTextBlock(el: HTMLElement, maxH: number): [string, string] | null {
  if (!el.firstChild || !el.lastChild) return null
  const top = el.getBoundingClientRect().top

  // Candidatos: depois de cada espaço, exceto dentro de um campo preenchível
  // (o campo é atômico e não pode ser partido ao meio).
  const points: Array<{ node: Text; offset: number }> = []
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const text = n as Text
    if (text.parentElement?.closest('[data-f]')) continue
    for (let k = 0; k < text.data.length; k++) {
      if (text.data[k] === ' ') points.push({ node: text, offset: k + 1 })
    }
  }
  if (points.length < 2) return null

  const range = document.createRange()
  const bottomAt = (p: { node: Text; offset: number }) => {
    range.setStart(el, 0)
    range.setEnd(p.node, p.offset)
    const rects = range.getClientRects()
    return rects.length ? rects[rects.length - 1].bottom - top : 0
  }

  let lo = 0, hi = points.length - 1, best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bottomAt(points[mid]) <= maxH) { best = mid; lo = mid + 1 } else { hi = mid - 1 }
  }
  if (best < 0) return null

  // O corte cai sempre no fim de uma linha inteira. Se a linha seguinte fosse
  // ficar sozinha (viúva) ou a que fica for a única (órfã), não vale quebrar:
  // é mais bonito descer o parágrafo todo.
  const lineBottom = bottomAt(points[best])
  const firstLineBottom = bottomAt(points[0])
  const lineH = firstLineBottom || 0
  const fullH = el.getBoundingClientRect().height
  if (lineH > 0) {
    const linesKept = Math.round(lineBottom / lineH)
    const linesLeft = Math.round((fullH - lineBottom) / lineH)
    if (linesKept < 2 || linesLeft < 2) return null
  }

  const point = points[best]
  const head = document.createRange()
  head.setStart(el, 0)
  head.setEnd(point.node, point.offset)
  const tail = document.createRange()
  tail.setStart(point.node, point.offset)
  tail.setEndAfter(el.lastChild)

  const boxA = document.createElement('div')
  boxA.appendChild(head.cloneContents())
  const boxB = document.createElement('div')
  boxB.appendChild(tail.cloneContents())

  const a = boxA.innerHTML
  const b = boxB.innerHTML
  if (!boxA.textContent?.trim() || !boxB.textContent?.trim()) return null
  return [a, b]
}

/** Quebra listas entre itens (nunca no meio de um item). */
function splitListBlock(el: HTMLElement, maxH: number): [string, string] | null {
  const items = Array.from(el.children) as HTMLElement[]
  if (items.length < 2) return null
  const top = el.getBoundingClientRect().top
  let cut = -1
  for (let i = 0; i < items.length; i++) {
    if (items[i].getBoundingClientRect().bottom - top <= maxH) cut = i
    else break
  }
  if (cut < 0 || cut >= items.length - 1) return null
  return [
    items.slice(0, cut + 1).map(x => x.outerHTML).join(''),
    items.slice(cut + 1).map(x => x.outerHTML).join(''),
  ]
}

// ---------------------------------------------------------------------------

export default function ContractEditor({
  template, patientName, scope = 'geral', valoresIniciais, onEmitir, onClose,
}: ContractEditorProps) {
  const { toast } = useToast()
  const [portalReady, setPortalReady] = useState(false)
  const [asideOpen, setAsideOpen] = useState(true)
  const [isDesktop, setIsDesktop] = useState(true)
  const [animState, setAnimState] = useState<'enter' | 'open' | 'close'>('enter')
  const [savedFlash, setSavedFlash] = useState(false)
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({})

  // Fluxo contínuo: as quebras do template são ignoradas, quem manda é a medição.
  const blocks = useMemo(() => template.pages.flatMap(pg => pg.blocks), [template])
  const templateNodes = useMemo(
    () => blocks.map(bl => blockToNode(bl, template.fields)),
    [blocks, template.fields],
  )

  /** Páginas em branco adicionadas à mão pelo usuário. */
  const [extraNodes, setExtraNodes] = useState<BlockNode[]>([])
  const baseNodes = useMemo(() => [...templateNodes, ...extraNodes], [templateNodes, extraNodes])

  /** Ordem dos blocos (muda ao subir/descer página) e blocos apagados. */
  const [order, setOrder] = useState<number[]>(() => templateNodes.map((_, i) => i))
  const [hidden, setHidden] = useState<Set<number>>(() => new Set())

  // Blocos novos entram no fim da ordem sem bagunçar o que já existe.
  useEffect(() => {
    setOrder(prev => {
      const known = new Set(prev)
      const added = baseNodes.map((_, i) => i).filter(i => !known.has(i))
      return added.length > 0 ? [...prev, ...added] : prev
    })
  }, [baseNodes])

  /** Campos que realmente aparecem no texto — se não houver, o painel some. */
  const usedFieldIds = useMemo(() => {
    const ids = new Set<string>()
    templateNodes.forEach(nd => {
      const re = /data-f="([^"]+)"/g
      let m: RegExpExecArray | null
      while ((m = re.exec(nd.inner))) ids.add(m[1])
    })
    return ids
  }, [templateNodes])
  const hasFields = usedFieldIds.size > 0

  // Aparência ajustável pela barra de ferramentas
  const [showLogo, setShowLogo] = useState(true)
  /** Repetir logo+título em todas as folhas (como no PDF) ou só na primeira. */
  const [headerOnAll, setHeaderOnAll] = useState(true)
  const [baseSize, setBaseSize] = useState(10.5)
  const [headText, setHeadText] = useState({ eyebrow: template.eyebrow, title: contractFullTitle(template) })

  /** Texto editado à mão (negrito, itálico, reescrita), por índice de bloco. */
  const editsRef = useRef<Record<number, string>>({})
  /** Blocos que trocaram de tipo (parágrafo <-> lista), por índice. */
  const nodeOverridesRef = useRef<Record<number, Partial<BlockNode>>>({})
  const [revision, setRevision] = useState(0)
  const [listIdx, setListIdx] = useState(-1)

  const [values, setValues] = useState<Values>(() => {
    const today = new Date()
    const base: Values = {
      dia: String(today.getDate()).padStart(2, '0'),
      mes: today.toLocaleDateString('pt-BR', { month: 'long' }),
      ano: String(today.getFullYear()),
    }
    // PADRAO_CLINICA vem antes do que está salvo: se a pessoa editou o endereço
    // uma vez, a escolha dela continua valendo.
    const clinic = readJson<Values>(CLINIC_STORAGE_KEY) ?? {}
    const draft = readJson<Values>(draftKey(template.id, scope)) ?? {}
    // valoresIniciais (contrato já emitido) vence tudo: reabrir tem que mostrar
    // exatamente o que foi assinado, não o rascunho que ficou depois.
    const merged: Values = { ...base, ...PADRAO_CLINICA, ...clinic, ...draft, ...(valoresIniciais ?? {}) }
    const patientField = template.fields.find(fl => fl.fromPatient === 'name')
    if (patientField && patientName && !merged[patientField.id]) {
      merged[patientField.id] = patientName
    }
    return merged
  })

  const [pages, setPages] = useState<Fragment[][]>(() => [
    baseNodes.map((nd, i) => ({ src: i, tag: nd.tag, cls: nd.cls, inner: nd.inner })),
  ])

  useEffect(() => {
    setPortalReady(true)
    const mq = window.matchMedia('(min-width: 768px)')
    const apply = () => setIsDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const r = requestAnimationFrame(() => setAnimState('open'))
    return () => cancelAnimationFrame(r)
  }, [])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Escala responsiva do papel
  useEffect(() => {
    if (!portalReady) return
    const el = document.getElementById('ctr-doc-scroll')
    if (!el) return
    const PAGE_PX = 210 * MM
    const apply = () => {
      const cw = el.clientWidth - 32
      el.style.setProperty('--ctr-page-scale', String(Math.min(1, Math.max(0.35, cw / PAGE_PX))))
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [portalReady, asideOpen])

  // --- Paginação -----------------------------------------------------------
  const repaginate = useCallback(() => {
    const host = document.getElementById('ctr-measure-host')
    if (!host) return

    const head = document.querySelector<HTMLElement>('#ctr-document .ctr-head')
    const headerH = head ? outerHeight(head) : 30 * MM
    // Sem cabeçalho repetido, as folhas seguintes ganham a altura dele de volta.
    const availFor = (pageIdx: number) =>
      BOX_H_PX - (pageIdx === 0 || headerOnAll ? headerH : 0)
    if (availFor(0) <= 40) return

    type QueueItem = BlockNode & { src: number }
    const queue: QueueItem[] = order
      .filter(i => baseNodes[i] && !hidden.has(i))
      .map(i => ({
        ...baseNodes[i],
        ...(nodeOverridesRef.current[i] ?? {}),
        src: i,
        inner: editsRef.current[i] ?? baseNodes[i].inner,
      }))

    const next: Fragment[][] = []
    let page: Fragment[] = []
    let used = 0
    let guard = 0

    while (queue.length > 0 && guard++ < 500) {
      const item = queue.shift()!

      if (item.brk) {
        next.push(page)
        page = []
        used = 0
        continue
      }

      host.innerHTML = `<${item.tag} class="${item.cls}">${item.inner}</${item.tag}>`
      const el = host.firstElementChild as HTMLElement | null
      if (!el) continue
      syncFields(el, values)

      const h = outerHeight(el)
      const remaining = availFor(next.length) - used

      // A linha da data não fica órfã: se as assinaturas não couberem junto,
      // as duas descem para a próxima folha.
      const after = queue[0]
      let companionH = 0
      if (item.cls.includes('ctr-date') && after && !after.brk && after.cls.includes('ctr-signs')) {
        host.innerHTML = `<${after.tag} class="${after.cls}">${after.inner}</${after.tag}>`
        const companion = host.firstElementChild as HTMLElement | null
        if (companion) {
          syncFields(companion, values)
          companionH = outerHeight(companion)
        }
      }

      if (h + companionH <= remaining) {
        page.push({ src: item.src, tag: item.tag, cls: item.cls, inner: item.inner })
        used += h
        continue
      }

      const parts = remaining >= MIN_SPLIT_PX
        ? (item.split === 'text' ? splitTextBlock(el, remaining)
          : item.split === 'item' ? splitListBlock(el, remaining)
            : null)
        : null

      if (parts) {
        page.push({ src: item.src, tag: item.tag, cls: item.cls, inner: parts[0] })
        next.push(page)
        page = []
        used = 0
        queue.unshift({ ...item, inner: parts[1] })
      } else if (page.length === 0) {
        // Não cabe nem numa folha vazia: fica sozinho e transborda (raro).
        page.push({ src: item.src, tag: item.tag, cls: item.cls, inner: item.inner })
        next.push(page)
        page = []
        used = 0
      } else {
        next.push(page)
        page = []
        used = 0
        queue.unshift(item)
      }
    }
    if (page.length > 0) next.push(page)
    host.innerHTML = ''

    setPages(prev => {
      const same =
        prev.length === next.length &&
        prev.every((pg, i) =>
          pg.length === next[i].length &&
          pg.every((fr, k) => fr.src === next[i][k].src && fr.inner === next[i][k].inner))
      return same ? prev : next
    })
  }, [baseNodes, values, order, hidden, headerOnAll])

  // baseSize/showLogo/headText mudam a altura útil da folha, então re-paginam.
  useEffect(() => {
    if (!portalReady) return
    const raf = requestAnimationFrame(repaginate)
    return () => cancelAnimationFrame(raf)
  }, [portalReady, repaginate, revision, baseSize, showLogo, headText])

  // Mantém os campos sempre com o valor atual
  useEffect(() => {
    syncFields(document.getElementById('ctr-document'), values)
  }, [values, pages, revision, portalReady])

  // Rascunho + dados da clínica
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(draftKey(template.id, scope), JSON.stringify(values))
        const clinic: Values = readJson<Values>(CLINIC_STORAGE_KEY) ?? {}
        template.fields.filter(fl => fl.clinic).forEach(fl => {
          if (values[fl.id]) clinic[fl.id] = values[fl.id]
        })
        window.localStorage.setItem(CLINIC_STORAGE_KEY, JSON.stringify(clinic))
      } catch {
        /* storage indisponível — rascunho é conveniência, não bloqueia o uso */
      }
    }, 400)
    return () => clearTimeout(t)
  }, [values, template, scope])

  const requestClose = () => {
    setAnimState('close')
    setTimeout(onClose, 260)
  }

  const setValue = (id: string, v: string) => setValues(prev => ({ ...prev, [id]: v }))

  const focusField = (id: string) => {
    if (!isDesktop) setAsideOpen(true)
    setTimeout(() => {
      const el = inputRefs.current[id]
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        el.focus()
      }
    }, isDesktop ? 0 : 250)
  }

  const clearAll = () => {
    const keep = new Set(template.fields.filter(fl => fl.clinic).map(fl => fl.id))
    setValues(prev => {
      const next: Values = {}
      Object.keys(prev).forEach(k => { if (keep.has(k)) next[k] = prev[k] })
      return next
    })
    toast({ title: 'Campos limpos', description: 'Os dados da clínica foram mantidos.' })
  }

  const resetText = () => {
    editsRef.current = {}
    nodeOverridesRef.current = {}
    setListIdx(-1)
    setHidden(new Set())
    setOrder(baseNodes.map((_, i) => i))
    setRevision(r => r + 1)
    toast({
      title: 'Documento restaurado',
      description: 'Texto original de volta, incluindo páginas apagadas.',
    })
  }

  /** Apaga só o que está nesta folha; o que sobra do bloco continua nas outras. */
  const removePage = (pi: number) => {
    const frags = pages[pi] ?? []
    const srcs = Array.from(new Set(frags.map(f => f.src)))
    const nextHidden = new Set(hidden)

    srcs.forEach(src => {
      const kept = pages
        .flatMap((pg, idx) => (idx === pi ? [] : pg.filter(f => f.src === src)))
        .map(f => f.inner)
        .join('')
      const el = document.createElement('div')
      el.innerHTML = kept
      if ((el.textContent ?? '').trim() === '') nextHidden.add(src)
      else editsRef.current[src] = kept
    })

    // Some também com a quebra forçada que abria esta folha, senão sobra vazia.
    const first = order.findIndex(i => srcs.includes(i))
    for (let k = first - 1; k >= 0; k--) {
      const idx = order[k]
      if (nextHidden.has(idx)) continue
      if (baseNodes[idx]?.brk) nextHidden.add(idx)
      break
    }

    setHidden(nextHidden)
    setRevision(r => r + 1)
    toast({ title: `Página ${pi + 1} apagada`, description: 'Use "restaurar" para trazer de volta.' })
  }

  const movePage = (pi: number, dir: -1 | 1) => {
    const target = pages[pi + dir]
    if (!target) return
    const moving = Array.from(new Set((pages[pi] ?? []).map(f => f.src)))
    const anchorSrcs = Array.from(new Set(target.map(f => f.src)))
    setOrder(prev => {
      const rest = prev.filter(i => !moving.includes(i))
      const positions = anchorSrcs.map(s => rest.indexOf(s)).filter(k => k >= 0)
      if (positions.length === 0) return prev
      const at = dir === -1 ? Math.min(...positions) : Math.max(...positions) + 1
      const out = [...rest]
      out.splice(at, 0, ...moving)
      return out
    })
    setRevision(r => r + 1)
  }

  /** Recompõe o bloco de origem juntando todos os pedaços dele que estão na tela. */
  const captureEdit = (src: number) => {
    const frs = Array.from(document.querySelectorAll<HTMLElement>(`#ctr-document [data-src="${src}"]`))
    if (frs.length === 0) return
    editsRef.current[src] = frs.map(f => f.innerHTML).join('')
  }

  const inputTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleFragmentInput = (src: number) => {
    captureEdit(src)
    if (inputTimer.current) clearTimeout(inputTimer.current)
    inputTimer.current = setTimeout(() => {
      const caret = captureCaret()
      repaginate()
      if (caret) requestAnimationFrame(() => restoreCaret(caret))
    }, 450)
  }

  const exec = (cmd: string) => {
    document.execCommand(cmd, false)
    const frag = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-src]')
    if (frag?.dataset.src) handleFragmentInput(Number(frag.dataset.src))
  }

  /**
   * Aplica um tamanho em pt. Com texto selecionado muda só a seleção; sem
   * seleção muda o documento inteiro.
   */
  const applyFontSize = (pt: number) => {
    const size = Math.min(48, Math.max(5, pt))
    const sel = window.getSelection()
    const inDoc = sel?.anchorNode?.parentElement?.closest('#ctr-document [data-src]')
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !inDoc) {
      setBaseSize(size)
      return
    }

    // execCommand só aceita 1..7: marcamos com size=7 e trocamos pelo pt real.
    document.execCommand('fontSize', false, '7')
    const doc = document.getElementById('ctr-document')
    doc?.querySelectorAll<HTMLElement>('font[size="7"]').forEach(node => {
      const span = document.createElement('span')
      span.style.fontSize = `${size}pt`
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
    })

    const frag = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-src]')
    if (frag?.dataset.src) handleFragmentInput(Number(frag.dataset.src))
  }

  /** Um só botão para alinhamento: cada clique passa para o próximo modo. */
  const ALIGNS = [
    { cmd: 'justifyFull', icon: AlignJustify, label: 'Justificado' },
    { cmd: 'justifyLeft', icon: AlignLeft, label: 'Esquerda' },
    { cmd: 'justifyCenter', icon: AlignCenter, label: 'Centralizado' },
  ] as const
  const [alignIdx, setAlignIdx] = useState(0)
  const cycleAlign = () => {
    const next = (alignIdx + 1) % ALIGNS.length
    setAlignIdx(next)
    exec(ALIGNS[next].cmd)
  }

  /**
   * Lista: marcadores -> numerada -> parágrafo. Não dá para usar
   * `insertUnorderedList` aqui porque o elemento editável é o próprio <p> e
   * um <ul> dentro de <p> é HTML inválido — o navegador ignora. Então a
   * conversão é feita na mão, trocando a tag do bloco.
   */
  const cycleList = () => {
    const frag = (document.activeElement as HTMLElement | null)
      ?.closest<HTMLElement>('#ctr-document [data-src]')
    if (!frag?.dataset.src) {
      toast({ title: 'Clique no texto primeiro', description: 'A lista é aplicada ao parágrafo onde está o cursor.' })
      return
    }

    const src = Number(frag.dataset.src)
    const tag = frag.tagName.toLowerCase()
    captureEdit(src)
    const html = editsRef.current[src] ?? ''
    const box = document.createElement('div')

    if (tag === 'ul') {
      // marcadores -> numerada
      box.innerHTML = html
      editsRef.current[src] = Array.from(box.children)
        .map((li, k) => `<li value="${k + 1}">${li.innerHTML}</li>`).join('')
      nodeOverridesRef.current[src] = { tag: 'ol', cls: 'ctr-list ctr-list-ordered', split: 'item' }
      setListIdx(1)
    } else if (tag === 'ol') {
      // numerada -> parágrafo (cada item vira uma linha)
      box.innerHTML = html
      editsRef.current[src] = Array.from(box.children).map(li => li.innerHTML).join('<br>')
      nodeOverridesRef.current[src] = { tag: 'p', cls: 'ctr-p', split: 'text' }
      setListIdx(-1)
    } else {
      // parágrafo -> marcadores (quebras de linha viram itens)
      const items = html.split(/<br\s*\/?>/i).map(s => s.trim()).filter(Boolean)
      editsRef.current[src] = (items.length ? items : ['']).map(s => `<li>${s}</li>`).join('')
      nodeOverridesRef.current[src] = { tag: 'ul', cls: 'ctr-list', split: 'item' }
      setListIdx(0)
    }
    setRevision(r => r + 1)
  }

  const addPage = () => {
    setExtraNodes(prev => [...prev, PAGE_BREAK_NODE, { ...EMPTY_P_NODE }])
    setTimeout(() => {
      const wraps = document.querySelectorAll('.ctr-page-wrap')
      wraps[wraps.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 120)
  }

  const handleDocClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-f]')
    if (target?.dataset.f) focusField(target.dataset.f)
  }

  const handlePrint = () => {
    const previousTitle = document.title
    const patient = values[template.fields.find(fl => fl.fromPatient === 'name')?.id ?? ''] || ''
    document.title = `${contractFullTitle(template)}${patient ? ` — ${patient}` : ''}`.replace(/[<>&]/g, '')

    // Registra antes de abrir o diálogo: se a pessoa cancelar a impressão o
    // contrato fica na lista mesmo assim, o que é preferível ao contrário —
    // documento assinado que não aparece no histórico é o erro que dói.
    onEmitir?.(values)

    setTimeout(() => {
      window.print()
      setTimeout(() => { document.title = previousTitle }, 100)
    }, 50)
  }

  const grouped = useMemo(() => ({
    clinic: template.fields.filter(fl => fl.clinic),
    rest: template.fields.filter(fl => !fl.clinic),
  }), [template])

  if (!portalReady) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-gray-100 flex flex-col print:bg-white print:static"
      id="ctr-root"
      data-anim={animState}
      data-desktop={isDesktop}
      style={{ ['--ctr-base' as string]: `${baseSize}pt` } as React.CSSProperties}
    >
      {/* Topbar */}
      <div className="h-14 bg-teal-800 border-b border-teal-900/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] flex items-center px-2 sm:px-3 gap-1.5 shrink-0 print:hidden ctr-topbar relative z-30">
        <button
          onClick={requestClose}
          className="h-9 w-9 rounded hover:bg-teal-700 transition-colors flex items-center justify-center text-white shrink-0"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <FileSignature className="w-4 h-4 text-teal-200 shrink-0" />
          <span className="text-xs sm:text-sm font-semibold text-white truncate max-w-[16ch] sm:max-w-none">
            {contractFullTitle(template)}
          </span>
        </div>

        {/* Ferramentas centralizadas */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-0.5 bg-teal-900/30 rounded px-1.5 py-1">
          <FmtBtn onClick={() => exec('bold')} title="Negrito"><Bold className="w-4 h-4" /></FmtBtn>
          <FmtBtn onClick={() => exec('italic')} title="Itálico"><Italic className="w-4 h-4" /></FmtBtn>
          <FmtBtn onClick={() => exec('underline')} title="Sublinhado"><UnderlineIcon className="w-4 h-4" /></FmtBtn>
          <span className="w-px h-5 bg-teal-600/60 mx-1" />
          <FmtBtn onClick={cycleAlign} title={`Alinhamento: ${ALIGNS[alignIdx].label} (clique para trocar)`}>
            {(() => { const I = ALIGNS[alignIdx].icon; return <I className="w-4 h-4" /> })()}
          </FmtBtn>
          <FmtBtn
            onClick={cycleList}
            active={listIdx >= 0}
            title={
              listIdx < 0 ? 'Transformar em lista com marcadores'
                : listIdx === 0 ? 'Lista com marcadores — clique para numerada'
                  : 'Lista numerada — clique para voltar a parágrafo'
            }
          >
            {listIdx === 1 ? <ListOrdered className="w-4 h-4" /> : <List className="w-4 h-4" />}
          </FmtBtn>
          <span className="w-px h-5 bg-teal-600/60 mx-1" />
          <FontSizeControl value={baseSize} onApply={applyFontSize} />
          <span className="w-px h-5 bg-teal-600/60 mx-1" />
          <FmtBtn
            onClick={() => setShowLogo(v => !v)}
            title={showLogo ? 'Ocultar logo' : 'Mostrar logo'}
            active={showLogo}
          >
            {showLogo ? <ImageIcon className="w-4 h-4" /> : <ImageOff className="w-4 h-4" />}
          </FmtBtn>
          <FmtBtn
            onClick={() => setHeaderOnAll(v => !v)}
            active={headerOnAll}
            title={headerOnAll
              ? 'Cabeçalho em todas as páginas (como no PDF) — clique para deixar só na primeira'
              : 'Cabeçalho só na primeira página — clique para repetir em todas'}
          >
            <Heading className="w-4 h-4" />
          </FmtBtn>
          <FmtBtn onClick={resetText} title="Restaurar documento original"><RotateCcw className="w-4 h-4" /></FmtBtn>
        </div>

        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            onClick={clearAll}
            className="h-9 px-2 sm:px-3 rounded border border-teal-600 text-teal-100 hover:bg-teal-700 text-xs font-medium transition-colors flex items-center gap-1.5"
            title="Limpar os campos preenchidos"
          >
            <Eraser className="w-4 h-4" />
            <span className="hidden lg:inline">Limpar</span>
          </button>
          <button
            onClick={handlePrint}
            className="h-9 px-3 sm:px-4 rounded bg-gradient-to-br from-dourado-500 to-dourado-400 hover:from-dourado-600 hover:to-dourado-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-dourado-500/20 transition-all flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 flex min-h-0 print:block relative">
        {hasFields && asideOpen && !isDesktop && (
          <div className="absolute inset-0 bg-black/40 z-30 print:hidden" onClick={() => setAsideOpen(false)} />
        )}
        {hasFields && !asideOpen && (
          <button
            onClick={() => setAsideOpen(true)}
            className="absolute top-3 left-3 z-30 h-10 w-10 rounded bg-white border border-gray-200 shadow-md text-gray-700 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors flex items-center justify-center print:hidden"
            title="Abrir campos"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}

        {hasFields && <aside
          className={`shrink-0 bg-white border-r border-gray-200 flex flex-col print:hidden ctr-aside ${
            isDesktop
              ? (asideOpen ? 'w-[360px] lg:w-[400px]' : 'hidden')
              : `absolute top-0 left-0 bottom-0 z-40 w-[92vw] max-w-[440px] shadow-2xl transition-transform duration-300 ${asideOpen ? 'translate-x-0' : '-translate-x-full'}`
          }`}
        >
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Preenchimento</div>
              <div className="text-sm font-semibold text-gray-800 truncate">Dados do documento</div>
            </div>
            <button
              onClick={() => setAsideOpen(false)}
              className="ml-auto h-9 w-9 rounded border border-gray-200 bg-white text-gray-600 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors flex items-center justify-center shrink-0"
              title="Fechar painel"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
            <ClinicorpFill
              nomeInicial={values.paciente || patientName || ''}
              onFill={dados => {
                // Cadastro incompleto é a regra no Clinicorp, então só sobrescreve
                // o que veio preenchido — o resto fica como o usuário digitou.
                const mapa: Array<[string, string | null]> = [
                  ['paciente', dados.nome],
                  ['cpf', dados.cpf],
                  ['rg', dados.rg],
                  ['endereco', dados.endereco],
                  ['cidade', dados.cidade],
                  ['cep', dados.cep],
                ]
                const vindos = mapa.filter(([, v]) => v)
                setValues(prev => ({
                  ...prev,
                  ...Object.fromEntries(vindos as Array<[string, string]>),
                }))

                const faltando = mapa.filter(([, v]) => !v).map(([k]) => LABEL_CURTO[k] ?? k)
                toast({
                  title: `${vindos.length} ${vindos.length === 1 ? 'campo preenchido' : 'campos preenchidos'}`,
                  description: faltando.length
                    ? `Em branco no cadastro do Clinicorp: ${faltando.join(', ')}.`
                    : 'Todo o cadastro veio do Clinicorp.',
                })
              }}
            />
            <FieldGroup title="Documento" fields={grouped.rest} values={values} onChange={setValue} inputRefs={inputRefs} />
            <FieldGroup
              title="Dados da clínica"
              hint="Salvos neste dispositivo e reaproveitados nos próximos documentos."
              fields={grouped.clinic}
              values={values}
              onChange={setValue}
              inputRefs={inputRefs}
            />
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Dica: o texto do documento também pode ser editado direto na folha — clique nele e use
              os botões de negrito e itálico na barra superior.
            </p>
            <button
              onClick={() => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1600) }}
              className={`w-full h-10 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                savedFlash ? 'bg-green-600 text-white' : 'bg-teal-700 text-white hover:bg-teal-800'
              }`}
            >
              {savedFlash ? <><Check className="w-4 h-4" /> Rascunho salvo</> : 'Salvar rascunho'}
            </button>
          </div>
        </aside>}

        {/* Documento */}
        <main className="flex-1 min-w-0 flex flex-col print:block ctr-main">
          <div className="flex-1 overflow-y-auto bg-gray-100 print:bg-white print:overflow-visible" id="ctr-doc-scroll">
            <div
              className="mx-auto py-8 print:py-0 flex flex-col items-center gap-6 print:gap-0"
              id="ctr-document"
              onClick={handleDocClick}
            >
              {pages.map((frags, pi) => (
                <div key={pi} className="ctr-page-wrap">
                  <div className="ctr-top-label print:hidden">
                    <span>Página {pi + 1} de {pages.length}</span>
                    <span className="ctr-page-tools">
                      <PageBtn onClick={() => movePage(pi, -1)} disabled={pi === 0} title="Subir página">
                        <ArrowUp className="w-3.5 h-3.5" />
                      </PageBtn>
                      <PageBtn onClick={() => movePage(pi, 1)} disabled={pi === pages.length - 1} title="Descer página">
                        <ArrowDown className="w-3.5 h-3.5" />
                      </PageBtn>
                      <PageBtn onClick={() => removePage(pi)} title="Apagar esta página" danger>
                        <Trash2 className="w-3.5 h-3.5" />
                      </PageBtn>
                      <PageBtn onClick={addPage} title="Adicionar página em branco no fim">
                        <FilePlus className="w-3.5 h-3.5" />
                      </PageBtn>
                    </span>
                  </div>
                  <div className="ctr-page-shell">
                    <div className="ctr-page">
                      <div className="ctr-frame">
                        {(pi === 0 || headerOnAll) && <header className="ctr-head">
                          {showLogo && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src="/assets/images/logo-doc.png" alt="" className="ctr-logo" />
                          )}
                          <EditableText
                            as="div"
                            className="ctr-eyebrow"
                            value={headText.eyebrow}
                            onCommit={v => setHeadText(h => ({ ...h, eyebrow: v }))}
                          />
                          <EditableText
                            as="h1"
                            className="ctr-title"
                            value={headText.title}
                            onCommit={v => setHeadText(h => ({ ...h, title: v }))}
                          />
                        </header>}
                        <div className="ctr-body">
                          {frags.map((fr, k) => (
                            <EditableFragment
                              key={`${pi}-${k}-${revision}`}
                              fragment={fr}
                              onInput={handleFragmentInput}
                            />
                          ))}
                        </div>
                        <span className="ctr-footbar" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Área invisível usada só para medir e cortar os blocos */}
      <div id="ctr-measure-host" aria-hidden="true" />

      <ContractStyles />
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Caret: preserva a posição do cursor quando a paginação recalcula
// ---------------------------------------------------------------------------

function captureCaret(): { src: number; offset: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !sel.anchorNode) return null
  const host = sel.anchorNode.nodeType === 1
    ? (sel.anchorNode as Element)
    : sel.anchorNode.parentElement
  const frag = host?.closest<HTMLElement>('[data-src]')
  if (!frag?.dataset.src) return null

  const src = Number(frag.dataset.src)
  const r = document.createRange()
  r.selectNodeContents(frag)
  r.setEnd(sel.anchorNode, sel.anchorOffset)
  let offset = r.toString().length

  for (const f of Array.from(document.querySelectorAll<HTMLElement>(`#ctr-document [data-src="${src}"]`))) {
    if (f === frag) break
    offset += (f.textContent ?? '').length
  }
  return { src, offset }
}

function restoreCaret(pos: { src: number; offset: number }) {
  const frs = Array.from(document.querySelectorAll<HTMLElement>(`#ctr-document [data-src="${pos.src}"]`))
  let remaining = pos.offset
  for (const frag of frs) {
    const len = (frag.textContent ?? '').length
    if (remaining <= len) {
      const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT)
      let node: Node | null
      let acc = 0
      while ((node = walker.nextNode())) {
        const l = (node as Text).data.length
        if (acc + l >= remaining) {
          const sel = window.getSelection()
          const r = document.createRange()
          r.setStart(node, Math.max(0, remaining - acc))
          r.collapse(true)
          sel?.removeAllRanges()
          sel?.addRange(r)
          frag.focus()
          return
        }
        acc += l
      }
      frag.focus()
      return
    }
    remaining -= len
  }
}

// ---------------------------------------------------------------------------

/**
 * Pedaço editável de um bloco. O HTML só é reescrito quando realmente muda —
 * assim digitar não perde o cursor, mas uma re-quebra de página atualiza o DOM.
 */
function EditableFragment({
  fragment, onInput,
}: {
  fragment: Fragment
  onInput: (src: number) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const Tag = fragment.tag as any

  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== fragment.inner) el.innerHTML = fragment.inner
  }, [fragment.inner])

  return (
    <Tag
      ref={ref}
      className={fragment.cls}
      data-src={fragment.src}
      contentEditable
      suppressContentEditableWarning
      onInput={() => onInput(fragment.src)}
      onBlur={() => onInput(fragment.src)}
    />
  )
}

function FmtBtn({
  onClick, title, children, active,
}: { onClick: () => void; title: string; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      className={`h-8 w-8 rounded transition-colors flex items-center justify-center ${
        active ? 'bg-teal-600 text-white' : 'text-teal-100 hover:bg-teal-700 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}

const LABEL_CURTO: Record<string, string> = {
  paciente: 'nome', cpf: 'CPF', rg: 'RG',
  endereco: 'endereço', cidade: 'cidade', cep: 'CEP',
}

interface PacienteResumo { id: number; nome: string; telefone: string | null; ativo: boolean }
interface PacienteDetalhe {
  nome: string
  cpf: string | null
  rg: string | null
  endereco: string | null
  cidade: string | null
  cep: string | null
}

/**
 * Traz a ficha do paciente do Clinicorp (nome, CPF, RG, endereço, cidade, CEP).
 *
 * Quando o documento já é de um paciente conhecido, tenta o match sozinho ao
 * abrir — mesma política da conciliação bancária, e só preenche se for
 * inequívoco. A busca manual continua ali pro resto dos casos.
 */
function ClinicorpFill({
  nomeInicial, onFill,
}: {
  nomeInicial: string
  onFill: (dados: PacienteDetalhe) => void
}) {
  const [termo, setTermo] = useState(nomeInicial)
  const [buscando, setBuscando] = useState(false)
  const [demorando, setDemorando] = useState(false)
  const [resultados, setResultados] = useState<PacienteResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [auto, setAuto] = useState<'idle' | 'tentando' | 'ok' | 'falhou'>('idle')
  const jaTentou = useRef(false)

  useEffect(() => { setTermo(nomeInicial) }, [nomeInicial])

  // Match automático ao abrir. Roda uma vez só: se o usuário corrigir algo à
  // mão, uma segunda tentativa sobrescreveria o que ele acabou de digitar.
  useEffect(() => {
    const nome = nomeInicial.trim()
    if (jaTentou.current || nome.length < 3) return
    jaTentou.current = true

    let cancelado = false
    setAuto('tentando')
    ;(async () => {
      try {
        const r = await fetch(`/api/clinicorp/paciente?auto=${encodeURIComponent(nome)}`)
        const body = await r.json()
        if (cancelado) return
        if (r.ok && body.paciente) {
          onFill(body.paciente)
          setAuto('ok')
        } else {
          // Ambíguo: já deixa os candidatos na tela pra escolher com um clique.
          if (Array.isArray(body.candidatos) && body.candidatos.length) {
            setResultados(body.candidatos)
          }
          setAuto('falhou')
        }
      } catch {
        if (!cancelado) setAuto('falhou')
      }
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeInicial])

  // A primeira consulta depois de um tempo parado paga o 2FA do Clinicorp
  // (código por e-mail, ~1 min). Sem aviso a tela parece travada.
  useEffect(() => {
    if (!buscando) { setDemorando(false); return }
    const t = setTimeout(() => setDemorando(true), 4000)
    return () => clearTimeout(t)
  }, [buscando])

  const buscar = async () => {
    const nome = termo.trim()
    if (nome.length < 2) { setErro('Digite ao menos 2 letras do nome.'); return }
    setBuscando(true); setErro(null); setResultados(null)
    try {
      const r = await fetch(`/api/clinicorp/paciente?nome=${encodeURIComponent(nome)}`)
      const body = await r.json()
      if (!r.ok) { setErro(body?.detalhe || body?.error || 'Não foi possível consultar.'); return }
      const lista: PacienteResumo[] = body.pacientes ?? []
      if (lista.length === 0) setErro('Nenhum paciente com esse nome no Clinicorp.')
      setResultados(lista)
    } catch {
      setErro('Falha de conexão com o Clinicorp.')
    } finally {
      setBuscando(false)
    }
  }

  const escolher = async (p: PacienteResumo) => {
    setBuscando(true); setErro(null)
    try {
      const r = await fetch(`/api/clinicorp/paciente?id=${p.id}`)
      const body = await r.json()
      if (!r.ok) { setErro(body?.detalhe || body?.error || 'Não foi possível carregar o cadastro.'); return }
      const d = body.paciente ?? {}
      onFill({
        nome: d.nome || p.nome,
        cpf: d.cpf ?? null,
        rg: d.rg ?? null,
        endereco: d.endereco ?? null,
        cidade: d.cidade ?? null,
        cep: d.cep ?? null,
      })
      setResultados(null)
    } catch {
      setErro('Falha ao carregar o cadastro.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="rounded border border-teal-200 bg-teal-50/60 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Search className="w-3.5 h-3.5 text-teal-700" />
        <span className="text-xs font-semibold text-teal-900">Puxar do Clinicorp</span>
        {auto === 'tentando' && (
          <span className="ml-auto text-[10px] text-teal-700/80">procurando...</span>
        )}
        {auto === 'ok' && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-green-700">
            <Check className="w-3 h-3" /> preenchido automaticamente
          </span>
        )}
      </div>

      {auto === 'ok' && (
        <p className="mb-2 text-[10px] text-teal-800/70 leading-snug">
          O nome bateu com um único paciente. Confira os dados — dá para editar
          qualquer campo à mão.
        </p>
      )}

      {auto === 'falhou' && resultados && resultados.length > 0 && (
        <p className="mb-2 text-[11px] text-amber-700 leading-snug">
          Mais de um paciente com nome parecido. Escolha qual é:
        </p>
      )}
      <div className="flex gap-1.5">
        <input
          value={termo}
          onChange={e => setTermo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
          placeholder="Nome do paciente"
          className="flex-1 min-w-0 h-9 px-2.5 rounded border border-teal-200 bg-white text-sm text-gray-800 focus:outline-none focus:border-teal-500"
        />
        <button
          onClick={buscar}
          disabled={buscando}
          className="h-9 px-3 rounded bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 transition-colors shrink-0"
        >
          {buscando ? '...' : 'Buscar'}
        </button>
      </div>

      {erro && <p className="mt-2 text-[11px] text-red-600">{erro}</p>}

      {demorando && !erro && (
        <p className="mt-2 text-[11px] text-teal-800">
          Consultando... a primeira busca depois de um tempo parado leva cerca de 1 minuto,
          porque o Clinicorp pede o código de acesso por e-mail. As seguintes são instantâneas.
        </p>
      )}

      {resultados && resultados.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-52 overflow-y-auto">
          {resultados.map(p => (
            <li key={p.id}>
              <button
                onClick={() => escolher(p)}
                className="w-full text-left px-2.5 py-1.5 rounded border border-teal-200 bg-white hover:border-teal-500 hover:bg-teal-50 transition-colors"
              >
                <span className="block text-xs font-medium text-gray-800 truncate">{p.nome}</span>
                <span className="block text-[10px] text-gray-500">
                  {p.telefone || 'sem telefone'}{p.ativo ? '' : ' · inativo'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-teal-800/70 leading-snug">
        Traz nome, CPF, RG, endereço, cidade e CEP — o que estiver preenchido no
        cadastro do Clinicorp.
      </p>
    </div>
  )
}

function PageBtn({
  onClick, title, children, disabled, danger,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`h-7 w-7 rounded border bg-white flex items-center justify-center transition-colors ${
        disabled
          ? 'border-gray-200 text-gray-300 cursor-not-allowed'
          : danger
            ? 'border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50'
            : 'border-gray-200 text-gray-500 hover:text-teal-700 hover:border-teal-400 hover:bg-teal-50'
      }`}
    >
      {children}
    </button>
  )
}

const FONT_SIZES = [7, 8, 9, 9.5, 10, 10.5, 11, 12, 14, 16, 18, 24]

/** Tamanho da fonte: digita o valor ou escolhe na lista (dropdown próprio). */
function FontSizeControl({ value, onApply }: { value: number; onApply: (pt: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const commit = (raw: string | number) => {
    const pt = typeof raw === 'number' ? raw : parseFloat(raw.replace(',', '.'))
    if (!Number.isNaN(pt)) onApply(pt)
    else setDraft(String(value))
  }

  return (
    <span ref={wrapRef} className="relative">
      <span
        className="flex items-center h-8 rounded border border-teal-600/60 bg-teal-950/40 overflow-hidden focus-within:border-dourado-400 transition-colors"
        title="Tamanho da fonte em pt — com texto selecionado muda só a seleção"
      >
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={e => commit(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(draft) } }}
          className="w-9 h-full bg-transparent text-center text-xs font-medium text-white tabular-nums focus:outline-none"
        />
        <span className="text-[9px] text-teal-300/80 pr-0.5 select-none">pt</span>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setOpen(o => !o)}
          title="Escolher tamanho"
          className="h-full px-1 text-teal-200 hover:text-white hover:bg-teal-700/60 transition-colors"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </span>

      {open && (
        <span className="absolute top-full left-0 mt-1.5 z-50 flex flex-col py-1 rounded border border-teal-600/50 bg-teal-900 shadow-xl shadow-black/40 min-w-[76px] max-h-64 overflow-y-auto">
          {FONT_SIZES.map(s => (
            <button
              key={s}
              onMouseDown={e => e.preventDefault()}
              onClick={() => { commit(s); setOpen(false) }}
              className={`px-3 py-1.5 text-left text-xs tabular-nums transition-colors ${
                s === value
                  ? 'bg-dourado-500/90 text-white font-semibold'
                  : 'text-teal-100 hover:bg-teal-700 hover:text-white'
              }`}
            >
              {s} pt
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

/**
 * Texto editável do cabeçalho. Só grava no blur — assim as outras páginas
 * recebem o novo título sem roubar o cursor enquanto se digita.
 */
function EditableText({
  as: Tag, className, value, onCommit,
}: {
  as: 'div' | 'h1'
  className: string
  value: string
  onCommit: (v: string) => void
}) {
  const ref = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && el.textContent !== value) el.textContent = value
  }, [value])

  return (
    <Tag
      ref={ref as any}
      className={className}
      contentEditable
      suppressContentEditableWarning
      onBlur={(e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.textContent ?? '')}
    />
  )
}

function FieldGroup({
  title, hint, fields, values, onChange, inputRefs,
}: {
  title: string
  hint?: string
  fields: ContractField[]
  values: Values
  onChange: (id: string, v: string) => void
  inputRefs: React.MutableRefObject<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>
}) {
  if (fields.length === 0) return null
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{title}</h3>
      {hint && <p className="text-[11px] text-gray-400 mb-3">{hint}</p>}
      <div className="space-y-3">
        {fields.map(field => {
          // Profissional: escolher da lista preenche o CRO junto. Digitar o CRO
          // à mão num termo de consentimento é onde o erro passa despercebido.
          if (field.id === 'profissional') {
            return (
              <label key={field.id} className="block">
                <span className="block text-xs font-medium text-gray-600 mb-1">{field.label}</span>
                <select
                  value={PROFISSIONAIS.some(pr => pr.nome === values[field.id]) ? values[field.id] : ''}
                  onChange={e => {
                    const escolhido = PROFISSIONAIS.find(pr => pr.nome === e.target.value)
                    onChange(field.id, e.target.value)
                    if (escolhido) onChange('cro', escolhido.cro)
                  }}
                  className="w-full h-10 px-3 rounded border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
                >
                  <option value="">Selecione o profissional...</option>
                  {PROFISSIONAIS.map(pr => (
                    <option key={pr.cro} value={pr.nome}>{pr.nome} — CRO {pr.cro}</option>
                  ))}
                </select>
              </label>
            )
          }

          return (
          <label key={field.id} className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{field.label}</span>
            {field.multiline ? (
              <textarea
                ref={el => { inputRefs.current[field.id] = el }}
                value={values[field.id] ?? ''}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                rows={2}
                className="w-full px-3 py-2 rounded border border-gray-200 text-sm text-gray-800 resize-y focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
              />
            ) : (
              <input
                ref={el => { inputRefs.current[field.id] = el }}
                type="text"
                value={values[field.id] ?? ''}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full h-10 px-3 rounded border border-gray-200 text-sm text-gray-800 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
              />
            )}
            {field.id === 'dentes' && (
              <div className="mt-2">
                <SeletorDentes
                  valor={values[field.id] ?? ''}
                  onChange={v => onChange(field.id, v)}
                />
              </div>
            )}
          </label>
          )
        })}
      </div>
    </div>
  )
}

function ContractStyles() {
  return (
    <style jsx global>{`
      #ctr-root {
        --ctr-teal: #17545c;
        --ctr-base: 10.5pt;
        transition: background-color 0.25s ease;
      }
      #ctr-root[data-anim="enter"], #ctr-root[data-anim="close"] { background-color: rgba(243,244,246,0); }
      #ctr-root[data-anim="open"] { background-color: rgb(243,244,246); }
      .ctr-topbar, .ctr-aside, .ctr-main {
        transition: transform 0.32s cubic-bezier(0.16,1,0.3,1), opacity 0.32s ease;
        will-change: transform, opacity;
      }
      #ctr-root[data-anim="enter"] .ctr-topbar,
      #ctr-root[data-anim="close"] .ctr-topbar { transform: translateY(-110%); opacity: 0; }
      #ctr-root[data-desktop="true"][data-anim="enter"] .ctr-aside,
      #ctr-root[data-desktop="true"][data-anim="close"] .ctr-aside { transform: translateX(-105%); opacity: 0; }
      #ctr-root[data-anim="enter"] .ctr-main,
      #ctr-root[data-anim="close"] .ctr-main { transform: translateX(105%); opacity: 0; }
      #ctr-root[data-anim="open"] .ctr-topbar,
      #ctr-root[data-desktop="true"][data-anim="open"] .ctr-aside,
      #ctr-root[data-anim="open"] .ctr-main { transform: none; opacity: 1; }
      @media (prefers-reduced-motion: reduce) {
        .ctr-topbar, .ctr-aside, .ctr-main, #ctr-root { transition: none !important; }
      }

      /* Medidor: mesma largura útil da folha, fora da tela */
      #ctr-measure-host {
        position: fixed;
        top: 0;
        left: -9999px;
        width: ${CONTENT_W_MM}mm;
        visibility: hidden;
        pointer-events: none;
        font-family: Georgia, "Times New Roman", serif;
        color: #1f2937;
      }

      .ctr-page-wrap {
        display: flex;
        flex-direction: column;
        gap: 8px;
        width: calc(210mm * var(--ctr-page-scale, 1));
        max-width: 100%;
      }
      .ctr-top-label {
        font-size: 11px;
        font-weight: 700;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        padding-left: 4px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .ctr-page-tools { display: flex; align-items: center; gap: 4px; }
      .ctr-page-shell {
        width: calc(210mm * var(--ctr-page-scale, 1));
        height: calc(297mm * var(--ctr-page-scale, 1));
        position: relative;
      }
      .ctr-page-shell .ctr-page {
        position: absolute;
        top: 0;
        left: 0;
        transform-origin: top left;
        transform: scale(var(--ctr-page-scale, 1));
      }

      .ctr-page {
        width: 210mm;
        height: 297mm;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        padding: ${PAGE_PAD_MM}mm;
        box-sizing: border-box;
        color: #1f2937;
        font-family: Georgia, "Times New Roman", serif;
      }

      .ctr-frame {
        position: relative;
        border: ${FRAME_BORDER_PX}px solid var(--ctr-teal);
        height: 100%;
        padding: ${FRAME_PAD_Y_MM}mm ${FRAME_PAD_X_MM}mm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .ctr-footbar {
        position: absolute;
        bottom: -${FRAME_BORDER_PX}px;
        left: 18%;
        right: 18%;
        height: 5mm;
        background: var(--ctr-teal);
      }

      .ctr-head { text-align: center; margin-bottom: 9mm; }
      .ctr-logo {
        height: 17mm;
        width: auto;
        max-width: 80mm;
        object-fit: contain;
        margin: 0 auto 9mm;
        display: block;
      }
      .ctr-eyebrow {
        font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
        font-size: 11pt;
        font-weight: 400;
        letter-spacing: 2.2px;
        color: #2b2b2b;
      }
      .ctr-title {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 14pt;
        font-weight: 700;
        letter-spacing: 0.4px;
        margin: 2mm 0 0;
        color: #111827;
      }

      .ctr-body { flex: 1; min-height: 0; overflow: hidden; }

      .ctr-p, .ctr-list, .ctr-date {
        font-size: var(--ctr-base);
        line-height: 1.45;
      }
      .ctr-p {
        text-align: justify;
        margin: 0 0 3.2mm;
        outline: none;
      }
      .ctr-p-bold { font-weight: 700; }
      .ctr-p-italic { font-style: italic; }
      .ctr-p-center { text-align: center; }
      .ctr-h {
        font-family: Georgia, "Times New Roman", serif;
        font-size: calc(var(--ctr-base) + 1pt);
        font-weight: 700;
        color: var(--ctr-teal);
        margin: 2mm 0;
        outline: none;
      }
      .ctr-list {
        text-align: justify;
        margin: 0 0 3.2mm;
        padding-left: 7mm;
        list-style: disc;
        outline: none;
      }
      .ctr-list-ordered { list-style: decimal; }
      .ctr-list li { margin-bottom: 1.6mm; }
      .ctr-spacer { height: 3mm; }

      [contenteditable]:focus { outline: none; }
      #ctr-document [contenteditable]:focus-within { background: rgba(20,184,166,0.05); }

      .ctr-field {
        display: inline-block;
        border-bottom: 1px solid #9ca3af;
        line-height: 1.15;
        padding: 0 1mm;
        cursor: pointer;
        vertical-align: baseline;
        white-space: pre-wrap;
        transition: background-color 0.15s, border-color 0.15s;
      }
      .ctr-field:hover { background: #ccfbf1; border-color: var(--ctr-teal); }
      .ctr-field-filled {
        font-weight: 700;
        color: #111827;
        border-bottom-color: transparent;
      }

      .ctr-date {
        text-align: center;
        margin: 8mm 0 0;
        outline: none;
      }
      .ctr-signs {
        margin-top: 12mm;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12mm 14mm;
        outline: none;
      }
      .ctr-sign { text-align: center; }
      .ctr-sign-line { border-top: 1px solid #111827; margin-bottom: 2mm; }
      .ctr-sign-label {
        font-family: ui-sans-serif, system-ui, sans-serif;
        font-size: 9.5pt;
        letter-spacing: 1.6px;
        color: #111827;
      }

      @media print {
        @page { size: A4; margin: 0; }
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body > *:not(#ctr-root) { display: none !important; }
        #ctr-root {
          position: static !important;
          inset: auto !important;
          background: #fff !important;
          display: block !important;
          height: auto !important;
          width: auto !important;
        }
        .ctr-topbar, .ctr-aside, .ctr-top-label, #ctr-measure-host { display: none !important; }
        .ctr-main { display: block !important; }
        #ctr-doc-scroll {
          --ctr-page-scale: 1 !important;
          overflow: visible !important;
          height: auto !important;
          padding: 0 !important;
          background: #fff !important;
        }
        #ctr-document { padding: 0 !important; gap: 0 !important; display: block !important; }
        /* Alturas ficam "auto" e só a folha tem altura fixa — um pouco menor que
           297mm para nenhum arredondamento gerar folha em branco extra. */
        .ctr-page-wrap {
          display: block !important;
          width: 210mm !important;
          max-width: none !important;
          height: auto !important;
          gap: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          break-inside: avoid !important;
          page-break-inside: avoid !important;
        }
        .ctr-page-wrap + .ctr-page-wrap {
          break-before: page !important;
          page-break-before: always !important;
        }
        .ctr-page-shell {
          width: 210mm !important;
          height: auto !important;
          position: static !important;
        }
        .ctr-page-shell .ctr-page { position: static !important; transform: none !important; }
        .ctr-page {
          box-shadow: none !important;
          margin: 0 !important;
          width: 210mm !important;
          height: 296.4mm !important;
          overflow: hidden !important;
        }
        #ctr-document [contenteditable]:focus-within { background: transparent !important; }
        .ctr-field:hover { background: transparent !important; }
      }
    `}</style>
  )
}
