'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Photo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { X, ZoomIn, ZoomOut, Pencil, Eraser, Save, RotateCcw, Move } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface PhotoEditorProps {
  isOpen: boolean
  onClose: () => void
  photo: Photo
  onSaveEdit: (editedImageData: string) => void
}

// Cores favoritas simplificadas
const FAVORITE_COLORS = [
  '#1db9b3', // primary - turquesa
  '#c89d68', // secondary - dourado
  '#ef4444', // vermelho
]

export default function PhotoEditor({ isOpen, onClose, photo, onSaveEdit }: PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingMode, setDrawingMode] = useState<'pen' | 'eraser' | 'move'>('pen')
  const [brushSize, setBrushSize] = useState(3)
  const [brushColor, setBrushColor] = useState('#1db9b3') // primary color default
  const [zoom, setZoom] = useState(1)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [hasChanges, setHasChanges] = useState(false)
  const [lastPoint, setLastPoint] = useState<{ x: number, y: number } | null>(null)
  const { toast } = useToast()

  // Inicializar canvas quando a imagem carrega
  useEffect(() => {
    if (!isOpen || !photo) return

    const image = new Image()
    image.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Definir tamanho do canvas baseado na imagem
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight

      // Desenhar a imagem original
      ctx.drawImage(image, 0, 0)

      // Reset zoom e pan
      setZoom(1)
      setPanOffset({ x: 0, y: 0 })
      setHasChanges(false)
    }

    image.src = photo.image_data
  }, [isOpen, photo])

  // Função para obter posição do mouse/touch relativa ao canvas
  const getEventPos = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }

    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
    const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY

    // Posição relativa ao canvas visível
    const x = clientX - rect.left
    const y = clientY - rect.top

    // Converter para coordenadas do canvas real considerando a escala
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height

    return {
      x: x * scaleX,
      y: y * scaleY
    }
  }, [])

  // Iniciar desenho ou movimento
  const startInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    const pos = getEventPos(e)
    
    if (drawingMode === 'move') {
      setIsDragging(true)
      const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY
      setDragStart({ x: clientX - panOffset.x, y: clientY - panOffset.y })
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    setIsDrawing(true)
    setLastPoint(pos)
    
    if (drawingMode === 'pen') {
      ctx.globalCompositeOperation = 'source-over'
      ctx.strokeStyle = brushColor
    } else if (drawingMode === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
    }
    
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [getEventPos, drawingMode, brushColor, brushSize, panOffset])

  // Desenhar ou mover
  const continueInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()

    if (drawingMode === 'move' && isDragging) {
      const clientX = 'touches' in e ? e.touches[0]?.clientX || 0 : e.clientX
      const clientY = 'touches' in e ? e.touches[0]?.clientY || 0 : e.clientY
      setPanOffset({
        x: clientX - dragStart.x,
        y: clientY - dragStart.y
      })
      return
    }

    if (!isDrawing || !lastPoint) return

    const pos = getEventPos(e)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return

    // Desenhar linha suave entre pontos
    ctx.beginPath()
    ctx.moveTo(lastPoint.x, lastPoint.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    
    setLastPoint(pos)
    setHasChanges(true)
  }, [isDrawing, isDragging, drawingMode, lastPoint, getEventPos, dragStart])

  // Parar desenho ou movimento
  const stopInteraction = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault()
    
    if (drawingMode === 'move') {
      setIsDragging(false)
      return
    }

    if (isDrawing) {
      setIsDrawing(false)
      setLastPoint(null)
    }
  }, [isDrawing, drawingMode])

  // Event listeners
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMouseDown = (e: MouseEvent) => startInteraction(e)
    const handleMouseMove = (e: MouseEvent) => continueInteraction(e)
    const handleMouseUp = (e: MouseEvent) => stopInteraction(e)

    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', handleMouseUp)

    // Touch events
    const handleTouchStart = (e: TouchEvent) => startInteraction(e)
    const handleTouchMove = (e: TouchEvent) => continueInteraction(e)
    const handleTouchEnd = (e: TouchEvent) => stopInteraction(e)

    canvas.addEventListener('touchstart', handleTouchStart)
    canvas.addEventListener('touchmove', handleTouchMove)
    canvas.addEventListener('touchend', handleTouchEnd)

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseUp)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [startInteraction, continueInteraction, stopInteraction])

  // Controles de zoom
  const zoomIn = () => {
    setZoom(prev => Math.min(prev * 1.2, 5))
  }

  const zoomOut = () => {
    setZoom(prev => Math.max(prev / 1.2, 0.1))
  }

  // Salvar alterações
  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const editedImageData = canvas.toDataURL('image/jpeg', 0.9)
    onSaveEdit(editedImageData)
    
    toast({
      title: "Sucesso!",
      description: "Foto editada salva com sucesso"
    })
    
    onClose()
  }

  // Reset canvas
  const handleReset = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0)
      setHasChanges(false)
    }
    image.src = photo.image_data
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black z-50 flex">
      {/* Área do canvas - tela cheia */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-800 relative flex items-center justify-center"
      >
        <canvas
          ref={canvasRef}
          className={`max-w-full max-h-full ${
            drawingMode === 'pen' ? 'cursor-crosshair' : 
            drawingMode === 'eraser' ? 'cursor-crosshair' : 
            'cursor-move'
          }`}
          style={{
            transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
            transformOrigin: 'center center'
          }}
        />
      </div>

      {/* Toolbar vertical minimalista - lado direito */}
      <div className="absolute top-4 right-4 flex flex-col gap-3 z-10">
        {/* Fechar */}
        <Button
          onClick={onClose}
          className="bg-destructive hover:bg-destructive/90 text-white w-12 h-12 p-0 rounded-full shadow-lg"
          title="Fechar editor"
        >
          <X className="w-5 h-5" />
        </Button>

        {/* Salvar */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className="bg-primary hover:bg-primary/90 text-white disabled:bg-gray-500 w-12 h-12 p-0 rounded-full shadow-lg"
          title="Salvar alterações"
        >
          <Save className="w-5 h-5" />
        </Button>

        {/* Reset */}
        <Button
          onClick={handleReset}
          className="bg-secondary hover:bg-secondary/90 text-white w-12 h-12 p-0 rounded-full shadow-lg"
          title="Desfazer alterações"
        >
          <RotateCcw className="w-5 h-5" />
        </Button>

        {/* Separador */}
        <div className="w-8 h-0.5 bg-white/30 mx-auto"></div>

        {/* Lápis */}
        <Button
          onClick={() => setDrawingMode('pen')}
          className={`w-12 h-12 p-0 rounded-full shadow-lg ${
            drawingMode === 'pen' 
              ? 'bg-secondary text-white' 
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
          title="Lápis"
        >
          <Pencil className="w-5 h-5" />
        </Button>

        {/* Borracha */}
        <Button
          onClick={() => setDrawingMode('eraser')}
          className={`w-12 h-12 p-0 rounded-full shadow-lg ${
            drawingMode === 'eraser' 
              ? 'bg-primary text-white' 
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
          title="Borracha"
        >
          <Eraser className="w-5 h-5" />
        </Button>

        {/* Mover */}
        <Button
          onClick={() => setDrawingMode('move')}
          className={`w-12 h-12 p-0 rounded-full shadow-lg ${
            drawingMode === 'move' 
              ? 'bg-primary text-white' 
              : 'bg-white/20 text-white hover:bg-white/30'
          }`}
          title="Mover"
        >
          <Move className="w-5 h-5" />
        </Button>

        {/* Cores - apenas quando no modo lápis */}
        {drawingMode === 'pen' && (
          <>
            <div className="w-8 h-0.5 bg-white/30 mx-auto"></div>
            
            {FAVORITE_COLORS.map((color, index) => (
              <button
                key={index}
                onClick={() => setBrushColor(color)}
                className={`w-12 h-12 rounded-full border-2 shadow-lg ${
                  brushColor === color ? 'border-white border-4' : 'border-white/50'
                }`}
                style={{ backgroundColor: color }}
                title={`Cor: ${color}`}
              />
            ))}
          </>
        )}

        {/* Controles de tamanho - quando lápis ou borracha */}
        {(drawingMode === 'pen' || drawingMode === 'eraser') && (
          <>
            <div className="w-8 h-0.5 bg-white/30 mx-auto"></div>
            
            {/* Tamanho do brush */}
            <div className="bg-white/20 rounded-full p-3 shadow-lg">
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-6 h-20 accent-primary transform -rotate-90"
              />
            </div>
            
            {/* Indicador de tamanho */}
            <div className="bg-white/20 rounded-full w-12 h-12 flex items-center justify-center text-white text-xs font-bold shadow-lg">
              {brushSize}
            </div>
          </>
        )}

        {/* Controles de zoom */}
        <div className="w-8 h-0.5 bg-white/30 mx-auto"></div>
        
        <Button
          onClick={zoomIn}
          className="bg-white/20 hover:bg-white/30 text-white w-12 h-12 p-0 rounded-full shadow-lg"
          title="Aumentar zoom"
        >
          <ZoomIn className="w-5 h-5" />
        </Button>
        
        <div className="bg-white/20 rounded-full w-12 h-12 flex items-center justify-center text-white text-xs font-bold shadow-lg">
          {Math.round(zoom * 100)}%
        </div>
        
        <Button
          onClick={zoomOut}
          className="bg-white/20 hover:bg-white/30 text-white w-12 h-12 p-0 rounded-full shadow-lg"
          title="Diminuir zoom"
        >
          <ZoomOut className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}