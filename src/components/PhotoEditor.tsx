'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Photo } from '@/lib/types'
import { X, ZoomIn, ZoomOut, Pencil, Eraser, Save, RotateCcw, Move, Undo2, Redo2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PhotoEditorProps {
  isOpen: boolean
  onClose: () => void
  photo: Photo
  onSaveEdit: (editedImageData: string) => void
}

const FAVORITE_COLORS = [
  '#0d9488', // teal-600 (primary)
  '#BE9672', // dourado-500 (secondary)
  '#ef4444', // red-500
  '#facc15', // yellow-400
  '#1e293b', // slate-800
]

type DrawingMode = 'pen' | 'eraser' | 'move'

export default function PhotoEditor({ isOpen, onClose, photo, onSaveEdit }: PhotoEditorProps) {
  const baseCanvasRef = useRef<HTMLCanvasElement>(null)   // foto original (read-only)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null) // traços do usuário
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingMode, setDrawingMode] = useState<DrawingMode>('pen')
  const [brushSize, setBrushSize] = useState(4)
  const [brushColor, setBrushColor] = useState(FAVORITE_COLORS[0])
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hasChanges, setHasChanges] = useState(false)
  const [lastPoint, setLastPoint] = useState<{ x: number, y: number } | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const historyIndexRef = useRef(-1)
  const [historyVersion, setHistoryVersion] = useState(0)
  const { toast } = useToast()

  const pushHistory = useCallback(() => {
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!overlay || !ctx) return
    const snap = ctx.getImageData(0, 0, overlay.width, overlay.height)
    // descarta forward history quando começa novo branch
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push(snap)
    if (historyRef.current.length > 30) historyRef.current.shift()
    historyIndexRef.current = historyRef.current.length - 1
    setHistoryVersion(v => v + 1)
  }, [])

  const restoreHistory = useCallback((index: number) => {
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    const snap = historyRef.current[index]
    if (!overlay || !ctx || !snap) return
    ctx.putImageData(snap, 0, 0)
    historyIndexRef.current = index
    setHistoryVersion(v => v + 1)
    setHasChanges(index > 0)
  }, [])

  // Inicializa os dois canvases quando a foto carrega
  useEffect(() => {
    if (!isOpen || !photo?.image_data) return

    const image = new Image()
    image.onload = () => {
      const base = baseCanvasRef.current
      const overlay = overlayCanvasRef.current
      if (!base || !overlay) return

      base.width = image.naturalWidth
      base.height = image.naturalHeight
      overlay.width = image.naturalWidth
      overlay.height = image.naturalHeight

      const baseCtx = base.getContext('2d')
      const overlayCtx = overlay.getContext('2d')
      if (!baseCtx || !overlayCtx) return

      baseCtx.drawImage(image, 0, 0)
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height)

      // snapshot inicial vazio
      historyRef.current = [overlayCtx.getImageData(0, 0, overlay.width, overlay.height)]
      historyIndexRef.current = 0
      setHistoryVersion(v => v + 1)

      setZoom(1)
      setPanOffset({ x: 0, y: 0 })
      setHasChanges(false)
    }
    image.src = photo.image_data
  }, [isOpen, photo])

  const getEventPos = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY
    const x = clientX - rect.left
    const y = clientY - rect.top
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: x * scaleX, y: y * scaleY }
  }, [])

  const startInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    if (drawingMode === 'move') {
      setIsDragging(true)
      const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY
      setDragStart({ x: clientX - panOffset.x, y: clientY - panOffset.y })
      return
    }

    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!overlay || !ctx) return

    const pos = getEventPos(e)
    setIsDrawing(true)
    setLastPoint(pos)

    if (drawingMode === 'pen') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = brushColor
    } else if (drawingMode === 'eraser') {
      // 'destination-out' no overlay apaga só o que foi desenhado, sem afetar a foto base
      ctx.globalCompositeOperation = 'destination-out'
    }
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // desenha um ponto inicial (single tap também marca)
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = drawingMode === 'pen' ? brushColor : 'rgba(0,0,0,1)'
    if (drawingMode === 'eraser') {
      ctx.fill()
    } else {
      ctx.fill()
    }
  }, [getEventPos, drawingMode, brushColor, brushSize, panOffset])

  const continueInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    if (drawingMode === 'move' && isDragging) {
      const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY
      setPanOffset({ x: clientX - dragStart.x, y: clientY - dragStart.y })
      return
    }
    if (!isDrawing || !lastPoint) return
    const pos = getEventPos(e)
    const ctx = overlayCanvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.beginPath()
    ctx.moveTo(lastPoint.x, lastPoint.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setLastPoint(pos)
    setHasChanges(true)
  }, [isDrawing, isDragging, drawingMode, lastPoint, getEventPos, dragStart])

  const stopInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    if (drawingMode === 'move') {
      setIsDragging(false)
      return
    }
    if (isDrawing) {
      setIsDrawing(false)
      setLastPoint(null)
      pushHistory()
    }
  }, [isDrawing, drawingMode, pushHistory])

  // Eventos no overlay (recebe input)
  useEffect(() => {
    const canvas = overlayCanvasRef.current
    if (!canvas) return
    const md = (e: MouseEvent) => startInteraction(e)
    const mm = (e: MouseEvent) => continueInteraction(e)
    const mu = (e: MouseEvent) => stopInteraction(e)
    const ts = (e: TouchEvent) => startInteraction(e)
    const tm = (e: TouchEvent) => continueInteraction(e)
    const te = (e: TouchEvent) => stopInteraction(e)
    canvas.addEventListener('mousedown', md)
    canvas.addEventListener('mousemove', mm)
    canvas.addEventListener('mouseup', mu)
    canvas.addEventListener('mouseleave', mu)
    canvas.addEventListener('touchstart', ts, { passive: false })
    canvas.addEventListener('touchmove', tm, { passive: false })
    canvas.addEventListener('touchend', te)
    return () => {
      canvas.removeEventListener('mousedown', md)
      canvas.removeEventListener('mousemove', mm)
      canvas.removeEventListener('mouseup', mu)
      canvas.removeEventListener('mouseleave', mu)
      canvas.removeEventListener('touchstart', ts)
      canvas.removeEventListener('touchmove', tm)
      canvas.removeEventListener('touchend', te)
    }
  }, [startInteraction, continueInteraction, stopInteraction])

  const zoomIn = () => setZoom(prev => Math.min(prev * 1.2, 5))
  const zoomOut = () => setZoom(prev => Math.max(prev / 1.2, 0.2))
  const resetView = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }) }

  const undo = () => {
    if (historyIndexRef.current > 0) restoreHistory(historyIndexRef.current - 1)
  }
  const redo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) restoreHistory(historyIndexRef.current + 1)
  }
  const canUndo = historyIndexRef.current > 0
  const canRedo = historyIndexRef.current < historyRef.current.length - 1
  // Re-render chamado quando historyVersion muda
  void historyVersion

  const handleSave = () => {
    const base = baseCanvasRef.current
    const overlay = overlayCanvasRef.current
    if (!base || !overlay) return

    // Compõe foto + traços num canvas final
    const out = document.createElement('canvas')
    out.width = base.width
    out.height = base.height
    const outCtx = out.getContext('2d')
    if (!outCtx) return
    outCtx.drawImage(base, 0, 0)
    outCtx.drawImage(overlay, 0, 0)

    const editedImageData = out.toDataURL('image/jpeg', 0.92)
    onSaveEdit(editedImageData)
    toast({ title: 'Sucesso!', description: 'Foto editada salva' })
    onClose()
  }

  const handleClearAll = () => {
    const overlay = overlayCanvasRef.current
    const ctx = overlay?.getContext('2d')
    if (!overlay || !ctx) return
    ctx.clearRect(0, 0, overlay.width, overlay.height)
    pushHistory()
    setHasChanges(false)
  }

  // Atalhos: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo() }
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const cursorClass = drawingMode === 'move' ? 'cursor-move' : 'cursor-crosshair'

  return (
    <div className="fixed inset-0 bg-neutral-950 z-50 flex flex-col">
      {/* Toolbar superior — design system: rounded (4px), neutral-800, dividers */}
      <div className="shrink-0 px-4 py-3 bg-neutral-900/60 backdrop-blur-xl border-b border-white/10 flex items-center gap-3 flex-wrap shadow-2xl">
        {/* Grupo: ferramentas */}
        <div className="flex items-center gap-1 p-1 rounded bg-neutral-900/40 backdrop-blur-xl border border-white/10">
          <button
            onClick={() => setDrawingMode('pen')}
            className={`h-9 w-9 rounded flex items-center justify-center transition-colors ${
              drawingMode === 'pen' ? 'bg-teal-600 text-white' : 'bg-transparent text-neutral-300 hover:bg-neutral-700'
            }`}
            title="Lápis"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDrawingMode('eraser')}
            className={`h-9 w-9 rounded flex items-center justify-center transition-colors ${
              drawingMode === 'eraser' ? 'bg-teal-600 text-white' : 'bg-transparent text-neutral-300 hover:bg-neutral-700'
            }`}
            title="Borracha (apaga só os traços)"
          >
            <Eraser className="w-4 h-4" />
          </button>
          <button
            onClick={() => setDrawingMode('move')}
            className={`h-9 w-9 rounded flex items-center justify-center transition-colors ${
              drawingMode === 'move' ? 'bg-teal-600 text-white' : 'bg-transparent text-neutral-300 hover:bg-neutral-700'
            }`}
            title="Mover"
          >
            <Move className="w-4 h-4" />
          </button>
        </div>

        {/* Grupo: cores (só no lápis) */}
        {drawingMode === 'pen' && (
          <div className="flex items-center gap-1 p-1 rounded bg-neutral-900/40 backdrop-blur-xl border border-white/10">
            {FAVORITE_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setBrushColor(c)}
                className={`h-7 w-7 rounded border-2 transition-transform ${
                  brushColor === c ? 'border-white scale-110' : 'border-neutral-600 hover:border-neutral-400'
                }`}
                style={{ backgroundColor: c }}
                title={`Cor ${c}`}
              />
            ))}
            <input
              type="color"
              value={brushColor}
              onChange={e => setBrushColor(e.target.value)}
              className="h-7 w-7 rounded border-2 border-neutral-600 hover:border-neutral-400 cursor-pointer bg-transparent"
              title="Cor personalizada"
            />
          </div>
        )}

        {/* Grupo: tamanho do pincel */}
        {(drawingMode === 'pen' || drawingMode === 'eraser') && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-neutral-900/40 backdrop-blur-xl border border-white/10">
            <span className="text-xs text-neutral-400 font-medium">Tamanho</span>
            <input
              type="range"
              min={1}
              max={40}
              value={brushSize}
              onChange={e => setBrushSize(Number(e.target.value))}
              className="w-32 accent-teal-500"
            />
            <span className="text-xs text-white font-medium tabular-nums w-6 text-right">{brushSize}</span>
            {/* Preview do pincel */}
            <div className="w-9 h-9 rounded border border-neutral-700 bg-neutral-950 flex items-center justify-center">
              <div
                className="rounded-full"
                style={{
                  width: Math.min(brushSize, 28),
                  height: Math.min(brushSize, 28),
                  backgroundColor: drawingMode === 'pen' ? brushColor : '#ffffff',
                  border: drawingMode === 'eraser' ? '1px dashed #525252' : 'none',
                }}
              />
            </div>
          </div>
        )}

        {/* Grupo: undo/redo/limpar */}
        <div className="flex items-center gap-1 p-1 rounded bg-neutral-900/40 backdrop-blur-xl border border-white/10">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="h-9 w-9 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Desfazer (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="h-9 w-9 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Refazer (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleClearAll}
            disabled={!hasChanges}
            className="h-9 px-3 rounded flex items-center gap-1.5 text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-medium"
            title="Limpar todos os traços"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>

        {/* Grupo: zoom */}
        <div className="flex items-center gap-1 p-1 rounded bg-neutral-900/40 backdrop-blur-xl border border-white/10">
          <button
            onClick={zoomOut}
            disabled={zoom <= 0.2}
            className="h-9 w-9 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title="Diminuir zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            className="h-9 px-3 rounded text-xs text-white tabular-nums font-medium hover:bg-neutral-700 transition-colors"
            title="Resetar zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={zoomIn}
            disabled={zoom >= 5}
            className="h-9 w-9 rounded flex items-center justify-center text-neutral-300 hover:bg-neutral-700 disabled:opacity-30 transition-colors"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Spacer empurra ações pra direita */}
        <div className="flex-1" />

        {/* Grupo: ações principais (salvar/fechar) */}
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
            title="Fechar (ESC)"
          >
            <X className="w-4 h-4" />
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            className="h-9 px-4 rounded bg-teal-600 hover:bg-teal-500 disabled:bg-neutral-700 disabled:text-neutral-500 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Salvar"
          >
            <Save className="w-4 h-4" />
            Salvar
          </button>
        </div>
      </div>

      {/* Área do canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-neutral-900 relative flex items-center justify-center"
      >
        <div
          className="relative"
          style={{
            transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: 'center center',
          }}
        >
          {/* Canvas base (foto, read-only) */}
          <canvas
            ref={baseCanvasRef}
            className="block max-w-[calc(100vw-32px)] max-h-[calc(100vh-120px)] pointer-events-none"
          />
          {/* Canvas overlay (traços do usuário) — recebe input */}
          <canvas
            ref={overlayCanvasRef}
            className={`absolute inset-0 w-full h-full ${cursorClass}`}
          />
        </div>
      </div>
    </div>
  )
}
