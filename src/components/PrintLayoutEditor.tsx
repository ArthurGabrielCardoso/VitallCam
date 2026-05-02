'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Photo, Patient } from '@/lib/types'
import {
  X, Printer, Plus, Bold, Italic, List, ListOrdered,
  Heading2, Sparkles, Trash2, Underline as UnderlineIcon,
  AlignLeft, AlignCenter, ArrowUp, ArrowDown, FileText, ImagePlus,
  Check, ArrowLeft, Folder, ChevronLeft, ChevronRight, Pencil,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { usePhotos, useUnfolderedPhotos } from '@/hooks/usePhotos'
import { useFolders, useFolderPhotos } from '@/hooks/useFolders'
import LazyImage from '@/components/LazyImage'

interface PrintLayoutEditorProps {
  patient: Patient
  patientId: string
  initialFolderId: string | null
  initialPhotos: Photo[]
  onClose: () => void
}

type PhotosPage = { id: string; type: 'photos'; slots: (string | null)[] }
type TextPage = { id: string; type: 'text'; html: string }
type Page = PhotosPage | TextPage

const PHOTOS_PER_PAGE = 8
const DEFAULT_CLINIC_NAME = 'VITALL ODONTOLOGIA'
const DEFAULT_CLINIC_PHONE = '11 93455-0921'

function uid(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildInitialPages(initialPhotos: Photo[]): Page[] {
  const pages: Page[] = []
  if (initialPhotos.length === 0) {
    pages.push({ id: uid('p'), type: 'photos', slots: Array(PHOTOS_PER_PAGE).fill(null) })
  } else {
    for (let i = 0; i < initialPhotos.length; i += PHOTOS_PER_PAGE) {
      const slice = initialPhotos.slice(i, i + PHOTOS_PER_PAGE).map(p => p.id)
      const slots: (string | null)[] = Array(PHOTOS_PER_PAGE).fill(null)
      slice.forEach((id, k) => { slots[k] = id })
      pages.push({ id: uid('p'), type: 'photos', slots })
    }
  }
  pages.push({
    id: uid('t'),
    type: 'text',
    html: `<h2>Laudo</h2><p><br></p>`,
  })
  return pages
}

const LAUDO_PLACEHOLDER = 'Descreva aqui o laudo do paciente, observações clínicas e condutas indicadas.'

function isTextEditorEmpty(html: string): boolean {
  const cleaned = html
    .replace(/<h2[^>]*>\s*Laudo\s*<\/h2>/i, '')
    .replace(/<p[^>]*>\s*<\/p>/gi, '')
    .replace(/<p[^>]*>\s*<br\s*\/?>\s*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/g, '')
    .trim()
  return cleaned === ''
}

export default function PrintLayoutEditor({
  patient,
  patientId,
  initialFolderId,
  initialPhotos,
  onClose,
}: PrintLayoutEditorProps) {
  const { data: allPhotos = [] } = usePhotos(patientId)
  const { toast } = useToast()
  const [pages, setPages] = useState<Page[]>(() => buildInitialPages(initialPhotos))
  const [selectedSlot, setSelectedSlot] = useState<{ pageId: string; slotIndex: number } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null)
  const editorRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastSelectionRef = useRef<{ id: string; range: Range } | null>(null)

  const [clinicName, setClinicName] = useState(DEFAULT_CLINIC_NAME)
  const [clinicPhone, setClinicPhone] = useState(DEFAULT_CLINIC_PHONE)
  const [captions, setCaptions] = useState<Record<string, string>>({})

  const [animState, setAnimState] = useState<'enter' | 'open' | 'close'>('enter')
  const [reportTitle, setReportTitle] = useState(`Compor relatório — ${patient.name}`)
  const [editingTitle, setEditingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [editingTitle])
  const [asideWidthPct, setAsideWidthPct] = useState(40)
  const draggingRef = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      const pct = (e.clientX / window.innerWidth) * 100
      setAsideWidthPct(Math.max(22, Math.min(70, pct)))
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDrag = () => {
    draggingRef.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
  }

  useEffect(() => {
    const r = requestAnimationFrame(() => setAnimState('open'))
    return () => cancelAnimationFrame(r)
  }, [])

  const requestClose = () => {
    setAnimState('close')
    setTimeout(onClose, 260)
  }

  const today = useMemo(() => new Date().toLocaleDateString('pt-BR'), [])

  // Lookup of all known photos
  const photosById = useMemo(() => {
    const map = new Map<string, Photo>()
    allPhotos.forEach(p => map.set(p.id, p))
    initialPhotos.forEach(p => map.set(p.id, p))
    return map
  }, [allPhotos, initialPhotos])

  // Sequential numbering: photo position across all photo pages
  const photoPositionById = useMemo(() => {
    const map = new Map<string, number>()
    let counter = 0
    pages.forEach(pg => {
      if (pg.type === 'photos') {
        pg.slots.forEach(id => {
          if (id) {
            counter += 1
            map.set(id, counter)
          }
        })
      }
    })
    return map
  }, [pages])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const setSlot = (pageId: string, slotIndex: number, photoId: string | null) => {
    setPages(prev => prev.map(pg => {
      if (pg.type !== 'photos' || pg.id !== pageId) return pg
      const slots = [...pg.slots]
      slots[slotIndex] = photoId
      return { ...pg, slots }
    }))
  }

  const handleClickPoolPhoto = (photo: Photo) => {
    if (selectedSlot) {
      // Replace selected slot. If photo was already placed elsewhere, clear that slot first (move).
      setPages(prev => {
        return prev.map(pg => {
          if (pg.type !== 'photos') return pg
          const slots = pg.slots.map((id, i) => {
            if (pg.id === selectedSlot.pageId && i === selectedSlot.slotIndex) return photo.id
            if (id === photo.id) return null
            return id
          })
          return { ...pg, slots }
        })
      })
      setSelectedSlot(null)
      return
    }
    // No slot selected: just add to next empty slot. If already placed, ignore (don't remove).
    if (photoPositionById.has(photo.id)) return
    // Find first empty slot, else create a new photos page after the last photos page
    let placed = false
    setPages(prev => {
      const next = prev.map(pg => {
        if (placed || pg.type !== 'photos') return pg
        const idx = pg.slots.findIndex(s => s === null)
        if (idx === -1) return pg
        const slots = [...pg.slots]
        slots[idx] = photo.id
        placed = true
        return { ...pg, slots }
      })
      if (placed) return next
      // No empty slot: insert a new photos page after the last photos page (or at end)
      const newPage: PhotosPage = {
        id: uid('p'),
        type: 'photos',
        slots: [photo.id, ...Array(PHOTOS_PER_PAGE - 1).fill(null)],
      }
      let lastPhotoIdx = -1
      next.forEach((pg, i) => { if (pg.type === 'photos') lastPhotoIdx = i })
      const insertAt = lastPhotoIdx === -1 ? next.length : lastPhotoIdx + 1
      const out = [...next]
      out.splice(insertAt, 0, newPage)
      return out
    })
  }

  const handleClickSlot = (pageId: string, slotIndex: number) => {
    if (selectedSlot && selectedSlot.pageId === pageId && selectedSlot.slotIndex === slotIndex) {
      setSelectedSlot(null)
      return
    }
    setSelectedSlot({ pageId, slotIndex })
  }

  const clearSlot = (pageId: string, slotIndex: number) => {
    setSlot(pageId, slotIndex, null)
    if (selectedSlot?.pageId === pageId && selectedSlot.slotIndex === slotIndex) {
      setSelectedSlot(null)
    }
  }

  const movePage = (pageId: string, dir: -1 | 1) => {
    setPages(prev => {
      const idx = prev.findIndex(p => p.id === pageId)
      if (idx < 0) return prev
      const target = idx + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  const removePage = (pageId: string) => {
    setPages(prev => prev.filter(p => p.id !== pageId))
    if (selectedSlot?.pageId === pageId) setSelectedSlot(null)
  }

  const addTextPage = () => {
    const id = uid('t')
    setPages(prev => [...prev, { id, type: 'text', html: '<p><br></p>' }])
    setTimeout(() => {
      const el = editorRefs.current[id]
      if (el) { el.focus(); setActiveEditorId(id) }
      // scroll to bottom of doc
      const scroller = document.getElementById('ple-doc-scroll')
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    }, 60)
  }

  const addPhotosPage = () => {
    setPages(prev => [...prev, {
      id: uid('p'),
      type: 'photos',
      slots: Array(PHOTOS_PER_PAGE).fill(null),
    }])
    setTimeout(() => {
      const scroller = document.getElementById('ple-doc-scroll')
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
    }, 60)
  }

  const captureSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !activeEditorId) return
    const range = sel.getRangeAt(0)
    const editor = editorRefs.current[activeEditorId]
    if (!editor || !editor.contains(range.commonAncestorContainer)) return
    lastSelectionRef.current = { id: activeEditorId, range: range.cloneRange() }
  }

  const restoreSelection = () => {
    const saved = lastSelectionRef.current
    if (!saved) return
    const editor = editorRefs.current[saved.id]
    if (!editor) return
    editor.focus()
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(saved.range)
  }

  const exec = (cmd: string, value?: string) => {
    restoreSelection()
    document.execCommand(cmd, false, value)
    if (activeEditorId) {
      const el = editorRefs.current[activeEditorId]
      if (el) {
        setPages(prev => prev.map(p =>
          p.type === 'text' && p.id === activeEditorId ? { ...p, html: el.innerHTML } : p
        ))
      }
    }
  }

  const aiImproveSelection = async () => {
    const saved = lastSelectionRef.current
    const text = saved?.range.toString().trim()
    if (!saved || !text) {
      toast({ variant: 'destructive', title: 'Selecione um trecho do texto primeiro' })
      return
    }
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
    if (!apiKey) {
      toast({ variant: 'destructive', title: 'IA indisponível', description: 'Configure NEXT_PUBLIC_GEMINI_API_KEY' })
      return
    }
    setAiLoading(true)
    try {
      const { GoogleGenAI } = await import('@google/genai')
      const ai = new GoogleGenAI({ apiKey })
      const prompt = `Você é um assistente para laudos odontológicos. Melhore o trecho a seguir mantendo o sentido, corrigindo gramática e deixando o texto profissional, claro e conciso. Não invente informações. Responda APENAS com o texto melhorado, sem aspas nem comentários.\n\nTrecho:\n${text}`
      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: [{ text: prompt }],
      })
      const improved = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
      if (!improved) throw new Error('Resposta vazia da IA')
      restoreSelection()
      document.execCommand('insertText', false, improved)
      const el = editorRefs.current[saved.id]
      if (el) {
        setPages(prev => prev.map(p =>
          p.type === 'text' && p.id === saved.id ? { ...p, html: el.innerHTML } : p
        ))
      }
      toast({ title: 'Texto melhorado pela IA' })
    } catch (e) {
      console.error(e)
      toast({ variant: 'destructive', title: 'Erro na IA', description: 'Tente novamente' })
    } finally {
      setAiLoading(false)
    }
  }

  const handlePrint = () => {
    const hasPhoto = pages.some(p => p.type === 'photos' && p.slots.some(s => s))
    const hasText = pages.some(p => p.type === 'text' && p.html.replace(/<[^>]*>/g, '').trim().length > 0)
    if (!hasPhoto && !hasText) {
      toast({ variant: 'destructive', title: 'Documento vazio' })
      return
    }
    setSelectedSlot(null)
    const previousTitle = document.title
    document.title = reportTitle.trim() || previousTitle
    window.print()
    setTimeout(() => { document.title = previousTitle }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col print:bg-white print:static" id="ple-root" data-anim={animState}>
      {/* Topbar */}
      <div className="h-14 bg-teal-800 border-b border-teal-900/40 shadow-[0_4px_12px_rgba(0,0,0,0.25)] flex items-center px-4 gap-3 shrink-0 print:hidden ple-topbar">
        <button
          onClick={requestClose}
          className="h-9 w-9 rounded hover:bg-teal-700 transition-colors flex items-center justify-center text-white"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileText className="w-4 h-4 text-teal-200 shrink-0" />
          {editingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.currentTarget.blur()
                }
              }}
              className="flex-1 min-w-0 max-w-md h-8 px-2 rounded bg-teal-700/60 border border-teal-300 text-sm font-semibold text-white placeholder:text-teal-300 focus:outline-none focus:bg-teal-700"
            />
          ) : (
            <>
              <span className="text-sm font-semibold text-white truncate">
                {reportTitle}
              </span>
              <button
                onClick={() => setEditingTitle(true)}
                className="h-7 w-7 rounded hover:bg-teal-700 transition-colors flex items-center justify-center text-teal-200 hover:text-white shrink-0"
                title="Renomear relatório"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedSlot && (
            <span className="text-xs px-2.5 py-1 rounded bg-teal-700/70 text-teal-50 border border-teal-500/50">
              Slot selecionado — clique uma foto à esquerda
            </span>
          )}
          <button
            onClick={handlePrint}
            className="h-9 px-4 rounded bg-gradient-to-br from-dourado-500 to-dourado-400 hover:from-dourado-600 hover:to-dourado-500 text-white text-sm font-semibold shadow-md shadow-dourado-500/20 transition-all flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex min-h-0 print:block">
        {/* Left: album/photo navigation */}
        <LeftAlbumPanel
          patientId={patientId}
          allPhotos={allPhotos}
          initialFolderId={initialFolderId}
          photoPositionById={photoPositionById}
          selectedSlot={selectedSlot}
          onPhotoClick={handleClickPoolPhoto}
          width={asideWidthPct}
        />
        {/* Divider (resize handle) */}
        <div
          className="ple-divider print:hidden"
          onMouseDown={startDrag}
          title="Arraste para redimensionar"
        >
          <div className="ple-divider-grip" />
        </div>

        {/* Right: document */}
        <main className="flex-1 min-w-0 flex flex-col print:block ple-main">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 shrink-0 overflow-x-auto print:hidden">
            <ToolbarBtn onClick={() => exec('bold')} title="Negrito"><Bold className="w-4 h-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => exec('italic')} title="Itálico"><Italic className="w-4 h-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => exec('underline')} title="Sublinhado"><UnderlineIcon className="w-4 h-4" /></ToolbarBtn>
            <Divider />
            <ToolbarBtn onClick={() => exec('formatBlock', 'H2')} title="Título"><Heading2 className="w-4 h-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => exec('insertUnorderedList')} title="Tópicos"><List className="w-4 h-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => exec('insertOrderedList')} title="Numerada"><ListOrdered className="w-4 h-4" /></ToolbarBtn>
            <Divider />
            <ToolbarBtn onClick={() => exec('justifyLeft')} title="Alinhar à esquerda"><AlignLeft className="w-4 h-4" /></ToolbarBtn>
            <ToolbarBtn onClick={() => exec('justifyCenter')} title="Centralizar"><AlignCenter className="w-4 h-4" /></ToolbarBtn>
            <Divider />
            <button
              onMouseDown={(e) => { e.preventDefault(); captureSelection() }}
              onClick={aiImproveSelection}
              disabled={aiLoading}
              className="h-8 px-2.5 rounded border border-teal-200 bg-teal-50 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50 transition-colors flex items-center gap-1"
              title="Melhorar texto selecionado com IA"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? 'animate-pulse' : ''}`} />
              {aiLoading ? 'Melhorando...' : 'Melhorar com IA'}
            </button>
            <div className="ml-auto text-[11px] text-gray-500 px-2">
              {pages.length} {pages.length === 1 ? 'página' : 'páginas'}
            </div>
          </div>

          {/* Document */}
          <div className="flex-1 overflow-y-auto bg-gray-100 print:bg-white print:overflow-visible" id="ple-doc-scroll">
            <div className="mx-auto py-8 print:py-0 flex flex-col items-center gap-6 print:gap-0" id="print-document">
              {pages.map((pg, idx) => (
                <div key={pg.id} className="ple-page-wrap">
                  {/* Side controls (hidden on print) */}
                  <div className="ple-side-controls print:hidden">
                    <span className="ple-page-number">Pág. {idx + 1}</span>
                    <button
                      onClick={() => movePage(pg.id, -1)}
                      disabled={idx === 0}
                      className="ple-side-btn"
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => movePage(pg.id, 1)}
                      disabled={idx === pages.length - 1}
                      className="ple-side-btn"
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    {pages.length > 1 && (
                      <button
                        onClick={() => removePage(pg.id)}
                        className="ple-side-btn ple-side-btn-danger"
                        title="Remover página"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {pg.type === 'photos' ? (
                    <PhotosPageView
                      page={pg}
                      isFirst={idx === 0}
                      patientName={patient.name}
                      today={today}
                      clinicName={clinicName}
                      clinicPhone={clinicPhone}
                      onClinicNameChange={setClinicName}
                      onClinicPhoneChange={setClinicPhone}
                      photosById={photosById}
                      photoPositionById={photoPositionById}
                      selectedSlot={selectedSlot}
                      onSlotClick={(slotIdx) => handleClickSlot(pg.id, slotIdx)}
                      onSlotClear={(slotIdx) => clearSlot(pg.id, slotIdx)}
                      captions={captions}
                      onCaptionChange={(photoId, value) =>
                        setCaptions(prev => ({ ...prev, [photoId]: value }))
                      }
                    />
                  ) : (
                    <TextPageView
                      page={pg}
                      editorRef={(el) => { editorRefs.current[pg.id] = el }}
                      onFocus={() => setActiveEditorId(pg.id)}
                      onMouseUp={captureSelection}
                      onKeyUp={captureSelection}
                      onBlur={(html) => {
                        captureSelection()
                        setPages(prev => prev.map(p =>
                          p.type === 'text' && p.id === pg.id ? { ...p, html } : p
                        ))
                      }}
                    />
                  )}
                </div>
              ))}

              {/* Add page button — sempre abaixo da última página */}
              <div className="flex items-center gap-2 pb-8 print:hidden">
                <button
                  onClick={addPhotosPage}
                  className="h-10 px-4 rounded border border-dashed border-gray-300 bg-white text-sm font-medium text-gray-600 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors flex items-center gap-1.5"
                >
                  <ImagePlus className="w-4 h-4" />
                  Página de fotos
                </button>
                <button
                  onClick={addTextPage}
                  className="h-10 px-4 rounded border border-dashed border-gray-300 bg-white text-sm font-medium text-gray-600 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors flex items-center gap-1.5"
                >
                  <FileText className="w-4 h-4" />
                  Página de texto
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      <PrintStyles />
    </div>
  )
}

interface PhotosPageViewProps {
  page: PhotosPage
  isFirst: boolean
  patientName: string
  today: string
  clinicName: string
  clinicPhone: string
  onClinicNameChange: (s: string) => void
  onClinicPhoneChange: (s: string) => void
  photosById: Map<string, Photo>
  photoPositionById: Map<string, number>
  selectedSlot: { pageId: string; slotIndex: number } | null
  onSlotClick: (slotIndex: number) => void
  onSlotClear: (slotIndex: number) => void
  captions: Record<string, string>
  onCaptionChange: (photoId: string, value: string) => void
}

function PhotosPageView({
  page, isFirst, patientName, today, clinicName, clinicPhone,
  onClinicNameChange, onClinicPhoneChange,
  photosById, photoPositionById, selectedSlot, onSlotClick, onSlotClear,
  captions, onCaptionChange,
}: PhotosPageViewProps) {
  return (
    <div className="ple-page">
      <div className="ple-frame">
        {isFirst && (
          <div className="ple-header">
            <div className="ple-header-logo">
              <img src="/assets/images/logo.png" alt="" />
            </div>
            <div className="ple-header-info">
              <div className="ple-header-row ple-header-row-clinic">
                <span
                  contentEditable
                  suppressContentEditableWarning
                  className="ple-clinic-name"
                  onBlur={(e) => onClinicNameChange(e.currentTarget.textContent || '')}
                >{clinicName}</span>
                <span
                  contentEditable
                  suppressContentEditableWarning
                  className="ple-header-phone"
                  onBlur={(e) => onClinicPhoneChange(e.currentTarget.textContent || '')}
                >{clinicPhone}</span>
              </div>
              <div className="ple-header-divider" />
              <div className="ple-header-row ple-header-row-split">
                <div>
                  <span className="ple-header-label">PACIENTE:</span>
                  <span className="ple-header-value">{patientName}</span>
                </div>
                <div>
                  <span className="ple-header-label">DATA:</span>
                  <span className="ple-header-value">{today}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="ple-section-title">RELATÓRIO DE IMAGENS</div>
        <div className="ple-photos-grid">
          {page.slots.map((photoId, slotIdx) => {
            const photo = photoId ? photosById.get(photoId) : null
            const pos = photoId ? photoPositionById.get(photoId) : undefined
            const isSelected = selectedSlot?.pageId === page.id && selectedSlot.slotIndex === slotIdx
            const captionValue = photoId ? (captions[photoId] ?? '') : ''
            return (
              <div key={slotIdx} className="ple-photo-cell">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onSlotClick(slotIdx)
                  }}
                  className={`ple-photo-slot ${photo ? 'ple-photo-filled' : 'ple-photo-empty'} ${isSelected ? 'ple-photo-selected' : ''} print:!cursor-default`}
                  type="button"
                >
                  {photo ? (
                    <>
                      <img src={photo.image_data} alt={`Foto ${pos ?? ''}`} />
                      {pos !== undefined && (
                        <span className="ple-photo-badge print:!hidden">{pos}</span>
                      )}
                      {isSelected && (
                        <span className="ple-photo-clear print:!hidden" onClick={(e) => { e.stopPropagation(); onSlotClear(slotIdx) }}>
                          <X className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {isSelected && (
                        <span className="ple-photo-selected-badge print:!hidden">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="ple-photo-empty-label print:!opacity-0">
                      {isSelected ? 'Escolha uma foto à esquerda' : 'Vazio'}
                    </span>
                  )}
                </button>
                {photo ? (
                  <input
                    type="text"
                    value={captionValue}
                    onChange={(e) => onCaptionChange(photo.id, e.target.value)}
                    placeholder="Digite aqui..."
                    className={`ple-photo-caption ${captionValue ? 'ple-photo-caption-filled' : ''}`}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="ple-photo-caption ple-photo-caption-spacer print:!opacity-0" />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface TextPageViewProps {
  page: TextPage
  editorRef: (el: HTMLDivElement | null) => void
  onFocus: () => void
  onMouseUp: () => void
  onKeyUp: () => void
  onBlur: (html: string) => void
}

function TextPageView({ page, editorRef, onFocus, onMouseUp, onKeyUp, onBlur }: TextPageViewProps) {
  const initialHtmlRef = useRef(page.html)
  const localRef = useRef<HTMLDivElement | null>(null)
  const initializedRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(() => isTextEditorEmpty(initialHtmlRef.current))

  useEffect(() => {
    if (!initializedRef.current && localRef.current) {
      localRef.current.innerHTML = initialHtmlRef.current
      initializedRef.current = true
      setIsEmpty(isTextEditorEmpty(localRef.current.innerHTML))
    }
  }, [])

  const refCallback = (el: HTMLDivElement | null) => {
    localRef.current = el
    editorRef(el)
  }

  return (
    <div className="ple-page">
      <div className="ple-frame ple-frame-text">
        <div className="ple-text-wrap">
          <div
            ref={refCallback}
            className="ple-editor"
            contentEditable
            suppressContentEditableWarning
            onFocus={onFocus}
            onMouseUp={onMouseUp}
            onKeyUp={onKeyUp}
            onInput={(e) => setIsEmpty(isTextEditorEmpty(e.currentTarget.innerHTML))}
            onBlur={(e) => {
              setIsEmpty(isTextEditorEmpty(e.currentTarget.innerHTML))
              onBlur(e.currentTarget.innerHTML)
            }}
          />
          {isEmpty && (
            <div className="ple-editor-placeholder print:hidden">
              {LAUDO_PLACEHOLDER}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface LeftAlbumPanelProps {
  patientId: string
  allPhotos: Photo[]
  initialFolderId: string | null
  photoPositionById: Map<string, number>
  selectedSlot: { pageId: string; slotIndex: number } | null
  onPhotoClick: (photo: Photo) => void
  width: number
}

function LeftAlbumPanel({
  patientId, allPhotos, initialFolderId, photoPositionById, selectedSlot, onPhotoClick, width,
}: LeftAlbumPanelProps) {
  const [currentFolder, setCurrentFolder] = useState<string | null>(initialFolderId)
  const { data: folders = [], isLoading: foldersLoading } = useFolders(patientId)
  const { data: folderPhotos = [] } = useFolderPhotos(currentFolder)
  const { data: unfolderedPhotos = [] } = useUnfolderedPhotos(patientId)
  const foldersScrollRef = useRef<HTMLDivElement>(null)
  const photosScrollRef = useRef<HTMLDivElement>(null)

  const photos = currentFolder ? folderPhotos : unfolderedPhotos
  const sortedPhotos = useMemo(() => {
    return [...photos].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [photos])

  const currentFolderName = folders.find(f => f.id === currentFolder)?.name

  const scroll = (ref: React.RefObject<HTMLDivElement>, dir: 'left' | 'right') => {
    if (!ref.current) return
    const amount = ref.current.clientWidth * 0.8
    ref.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <aside
      className="shrink-0 bg-white border-r border-gray-200 flex flex-col print:hidden ple-aside"
      style={{ width: `${width}%` }}
    >
      <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-3">
        {currentFolder ? (
          <>
            <button
              onClick={() => setCurrentFolder(null)}
              className="flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-800 hover:underline transition-colors"
              title="Voltar para álbuns"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <span className="text-sm font-semibold text-gray-800 truncate">
              {currentFolderName ?? 'Pasta'}
            </span>
          </>
        ) : (
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Galeria do paciente</div>
            <div className="text-sm font-semibold text-gray-800">Álbuns e fotos avulsas</div>
          </div>
        )}
        <div className="ml-auto text-[11px] px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap">
          {photoPositionById.size} no documento
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Carrossel: Pastas (apenas no nível raiz) */}
        {!currentFolder && (foldersLoading || folders.length > 0) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Pastas {folders.length > 0 && `(${folders.length})`}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scroll(foldersScrollRef, 'left')}
                  className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scroll(foldersScrollRef, 'right')}
                  className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div
              ref={foldersScrollRef}
              className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] scroll-smooth"
            >
              {foldersLoading && Array.from({ length: 4 }).map((_, i) => (
                <div key={`fs-${i}`} className="w-40 h-48 rounded bg-gray-100 animate-pulse shrink-0" />
              ))}
              {!foldersLoading && folders.map((folder) => {
                const fPhotos = allPhotos.filter(p => p.folder_id === folder.id)
                const cover = fPhotos[0]
                return (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolder(folder.id)}
                    className="w-40 h-48 shrink-0 rounded overflow-hidden cursor-pointer transition-all relative group bg-gradient-to-br from-teal-700 to-teal-900 border border-gray-200 shadow-sm hover:shadow-lg hover:border-teal-500"
                  >
                    {cover ? (
                      <LazyImage
                        src={cover.image_data}
                        alt={folder.name}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Folder className="w-14 h-14 text-white/40" strokeWidth={1.5} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/10 pointer-events-none" />
                    <div className="absolute top-2 right-2 h-6 pl-1.5 pr-2 rounded bg-white/95 backdrop-blur-sm flex items-center gap-1 shadow-sm">
                      <Folder className="w-3 h-3 text-teal-700" />
                      <span className="text-[10px] font-bold text-teal-800 leading-none">{fPhotos.length}</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-3">
                      <p className="text-sm font-semibold text-white truncate drop-shadow-md">{folder.name}</p>
                      <p className="text-[10px] text-white/70 mt-0.5">
                        {fPhotos.length} {fPhotos.length === 1 ? 'foto' : 'fotos'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Carrossel: Fotos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {currentFolder ? 'Fotos da pasta' : 'Fotos avulsas'}
              {sortedPhotos.length > 0 && ` (${sortedPhotos.length})`}
            </h3>
            {!currentFolder && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scroll(photosScrollRef, 'left')}
                  className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => scroll(photosScrollRef, 'right')}
                  className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {sortedPhotos.length === 0 ? (
            <div className="text-sm text-gray-500 py-8 text-center border border-dashed border-gray-200 rounded">
              {currentFolder ? 'Nenhuma foto nessa pasta.' : 'Nenhuma foto avulsa.'}
            </div>
          ) : (
            <div
              ref={photosScrollRef}
              className={currentFolder
                ? "grid gap-3 pb-2 grid-cols-[repeat(auto-fit,minmax(130px,1fr))]"
                : "flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] scroll-smooth"
              }
            >
              {sortedPhotos.map((photo, index) => {
                const pos = photoPositionById.get(photo.id)
                const isPlaced = pos !== undefined
                return (
                  <div
                    key={photo.id}
                    onClick={() => onPhotoClick(photo)}
                    className={`${currentFolder ? 'w-full aspect-square' : 'w-40 h-40 shrink-0'} bg-white border rounded shadow-sm overflow-hidden cursor-pointer transition-all relative group ${
                      isPlaced
                        ? 'border-teal-600 ring-2 ring-teal-500 ring-offset-1'
                        : selectedSlot
                          ? 'border-dourado-300 hover:border-dourado-500 hover:shadow-md'
                          : 'border-gray-200 hover:border-teal-500 hover:shadow-md'
                    }`}
                  >
                    <LazyImage
                      src={photo.image_data}
                      alt={`Foto ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {isPlaced && (
                      <span className="absolute top-2 left-2 h-7 min-w-7 px-1.5 rounded bg-teal-600 text-white text-xs font-bold flex items-center justify-center shadow-md">
                        {pos}
                      </span>
                    )}
                    {!isPlaced && (
                      <span className="absolute top-2 right-2 h-7 w-7 rounded bg-white/95 backdrop-blur-sm text-teal-700 flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function ToolbarBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="h-8 w-8 rounded border border-transparent text-gray-600 hover:text-teal-700 hover:bg-teal-50 hover:border-teal-200 transition-colors flex items-center justify-center"
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="h-6 w-px bg-gray-200 mx-1" />
}

function PrintStyles() {
  return (
    <style jsx global>{`
      /* Open / close animation */
      #ple-root {
        transition: background-color 0.25s ease;
      }
      #ple-root[data-anim="enter"],
      #ple-root[data-anim="close"] {
        background-color: rgba(243, 244, 246, 0);
      }
      #ple-root[data-anim="open"] {
        background-color: rgb(243, 244, 246);
      }
      .ple-topbar, .ple-aside, .ple-main {
        transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease;
        will-change: transform, opacity;
      }
      #ple-root[data-anim="enter"] .ple-topbar,
      #ple-root[data-anim="close"] .ple-topbar {
        transform: translateY(-110%);
        opacity: 0;
      }
      #ple-root[data-anim="enter"] .ple-aside,
      #ple-root[data-anim="close"] .ple-aside {
        transform: translateX(-105%);
        opacity: 0;
      }
      #ple-root[data-anim="enter"] .ple-main,
      #ple-root[data-anim="close"] .ple-main {
        transform: translateX(105%);
        opacity: 0;
      }
      #ple-root[data-anim="open"] .ple-topbar,
      #ple-root[data-anim="open"] .ple-aside,
      #ple-root[data-anim="open"] .ple-main {
        transform: none;
        opacity: 1;
      }
      @media (prefers-reduced-motion: reduce) {
        .ple-topbar, .ple-aside, .ple-main { transition: none !important; }
        #ple-root { transition: none !important; }
      }

      .ple-divider {
        flex: 0 0 6px;
        position: relative;
        background: #f3f4f6;
        cursor: col-resize;
        transition: background 0.15s;
        z-index: 10;
      }
      .ple-divider:hover, .ple-divider:active {
        background: #ccfbf1;
      }
      .ple-divider-grip {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 4px;
        height: 44px;
        border-radius: 4px;
        background: #d1d5db;
        transition: background 0.15s, height 0.15s;
      }
      .ple-divider:hover .ple-divider-grip {
        background: #14b8a6;
        height: 60px;
      }

      .ple-page-wrap {
        position: relative;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .ple-side-controls {
        position: absolute;
        right: calc(100% + 8px);
        top: 12px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: center;
      }
      .ple-page-number {
        font-size: 10px;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
        white-space: nowrap;
      }
      .ple-side-btn {
        width: 28px;
        height: 28px;
        border-radius: 6px;
        background: #fff;
        border: 1px solid #e5e7eb;
        color: #6b7280;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s;
      }
      .ple-side-btn:hover:not(:disabled) {
        color: #0f766e;
        border-color: #2dd4bf;
        background: #f0fdfa;
      }
      .ple-side-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .ple-side-btn-danger:hover:not(:disabled) {
        color: #dc2626;
        border-color: #fca5a5;
        background: #fef2f2;
      }

      .ple-page {
        width: 210mm;
        min-height: 297mm;
        background: #fff;
        box-shadow: 0 2px 12px rgba(0,0,0,0.08);
        border-radius: 4px;
        padding: 10mm;
        box-sizing: border-box;
        color: #1f2937;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      }
      .ple-frame {
        border: 2px solid #cca97e;
        border-radius: 8px;
        padding: 6mm 7mm;
        min-height: calc(297mm - 20mm);
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
      }
      .ple-frame-text { padding: 12mm 14mm; }

      .ple-header {
        display: flex;
        align-items: center;
        gap: 6mm;
        padding: 3mm 4mm;
        border-bottom: 1px solid #e7d5b8;
        margin-bottom: 3mm;
      }
      .ple-header-logo {
        width: 18mm;
        height: 18mm;
        flex: 0 0 18mm;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .ple-header-logo img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .ple-header-info { flex: 1; min-width: 0; font-size: 10pt; line-height: 1.4; }
      .ple-header-row { display: flex; gap: 6px; align-items: baseline; padding: 0.5mm 0; }
      .ple-header-row-clinic {
        align-items: center;
        justify-content: space-between;
        gap: 6mm;
      }
      .ple-header-row-split { justify-content: space-between; gap: 8mm; }
      .ple-header-row-split > div { display: flex; gap: 6px; align-items: baseline; }
      .ple-header-label {
        font-size: 9pt;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #6b7280;
        white-space: nowrap;
      }
      .ple-header-value {
        font-size: 10.5pt;
        font-weight: 600;
        color: #1f2937;
        outline: none;
      }
      .ple-header-phone {
        font-size: 10.5pt;
        font-weight: 600;
        color: #4b5563;
        outline: none;
        white-space: nowrap;
      }
      .ple-clinic-name {
        color: #0f766e;
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.5px;
        outline: none;
      }
      .ple-header-divider { height: 1px; background: #f3ebe0; margin: 1mm 0; }

      .ple-section-title {
        text-align: center;
        font-weight: 700;
        font-size: 11pt;
        letter-spacing: 1.5px;
        padding: 2mm 0;
        margin-bottom: 4mm;
        color: #115e59;
        border-top: 1px solid #f3ebe0;
        border-bottom: 1px solid #f3ebe0;
      }

      .ple-photos-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-auto-rows: 1fr;
        gap: 3mm;
      }
      .ple-photo-cell {
        display: flex;
        flex-direction: column;
        gap: 1.5mm;
        min-height: 0;
      }
      .ple-photo-caption {
        width: 100%;
        height: 6mm;
        padding: 0 2mm;
        border: 1px solid #f3ebe0;
        border-radius: 4px;
        background: #fff;
        font-size: 9.5pt;
        font-family: inherit;
        color: #d1d5db;
        text-align: center;
        outline: none;
        transition: border-color 0.15s, color 0.1s;
      }
      .ple-photo-caption::placeholder { color: #d1d5db; font-style: italic; text-align: center; }
      .ple-photo-caption:focus { border-color: #cca97e; }
      .ple-photo-caption-filled { color: #1f2937; font-weight: 500; }
      .ple-photo-caption-spacer {
        background: transparent;
        border-color: transparent;
        pointer-events: none;
      }
      .ple-photo-slot {
        position: relative;
        border: 2px solid #e7d5b8;
        border-radius: 6px;
        overflow: hidden;
        background: #fafaf7;
        flex: 1;
        min-height: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        cursor: pointer;
        transition: border-color 0.15s, transform 0.1s;
      }
      .ple-photo-slot:hover { border-color: #cca97e; }
      .ple-photo-filled { background: #fff; }
      .ple-photo-empty {
        border-style: dashed;
        background: #fafaf7;
      }
      .ple-photo-selected {
        border-color: #14b8a6 !important;
        box-shadow: 0 0 0 3px rgba(20,184,166,0.25);
      }
      .ple-photo-empty-label {
        font-size: 10pt;
        color: #9ca3af;
        font-style: italic;
        padding: 0 4mm;
        text-align: center;
      }
      .ple-photo-slot img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .ple-photo-badge {
        position: absolute;
        top: 4px;
        left: 4px;
        height: 22px;
        min-width: 22px;
        padding: 0 6px;
        border-radius: 4px;
        background: #0f766e;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      }
      .ple-photo-clear {
        position: absolute;
        top: 4px;
        right: 4px;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        background: rgba(220,38,38,0.95);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .ple-photo-selected-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        background: #14b8a6;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .ple-text-wrap {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .ple-editor-placeholder {
        position: absolute;
        top: 12mm;
        left: 0;
        right: 0;
        font-size: 11pt;
        font-style: italic;
        color: #d1d5db;
        pointer-events: none;
        line-height: 1.6;
      }
      .ple-editor {
        outline: none;
        flex: 1;
        font-size: 11pt;
        line-height: 1.6;
        color: #1f2937;
      }
      .ple-editor h2 { font-size: 14pt; font-weight: 700; margin: 0 0 4mm; color: #115e59; letter-spacing: 0.5px; }
      .ple-editor ul, .ple-editor ol { margin: 3mm 0 3mm 8mm; }
      .ple-editor li { margin: 1mm 0; }
      .ple-editor p { margin: 0 0 3mm 0; }

      @media print {
        @page { size: A4; margin: 8mm; }
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        .ple-photo-caption {
          border: none !important;
          background: transparent !important;
          color: #1f2937 !important;
          height: auto !important;
          padding: 1mm 2mm !important;
          text-align: center !important;
        }
        .ple-photo-caption::placeholder { color: transparent !important; }
        .ple-photo-caption-spacer { display: none !important; }
        .ple-editor-placeholder { display: none !important; }
        body * { visibility: hidden !important; }
        #ple-root, #ple-root * { visibility: visible !important; }
        #ple-root {
          position: absolute !important;
          inset: 0 !important;
          background: #fff !important;
        }
        #ple-doc-scroll { overflow: visible !important; height: auto !important; padding: 0 !important; }
        #print-document { padding: 0 !important; gap: 0 !important; }
        .ple-page-wrap { display: block !important; gap: 0 !important; }
        .ple-side-controls { display: none !important; }
        .ple-page {
          box-shadow: none !important;
          border-radius: 0 !important;
          page-break-after: always;
          margin: 0 !important;
          width: 100% !important;
          height: calc(297mm - 16mm) !important;
          min-height: calc(297mm - 16mm) !important;
          max-height: calc(297mm - 16mm) !important;
          padding: 0 !important;
          overflow: hidden !important;
          break-inside: avoid;
        }
        .ple-page:last-child { page-break-after: auto; }
        .ple-frame {
          min-height: 100% !important;
          height: 100% !important;
          padding: 4mm 6mm !important;
        }
        .ple-frame-text { padding: 8mm 10mm !important; }
        .ple-text-wrap { display: block !important; }
        .ple-editor { display: block !important; min-height: 0 !important; }
      }
    `}</style>
  )
}
