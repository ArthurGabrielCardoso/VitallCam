'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Photo } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
import { Download, X, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

function isStorageUrl(value: string): boolean {
  return value.startsWith('https://') && value.includes('/storage/v1/object/')
}

function extractStoragePath(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl)
    const match = url.pathname.match(/\/storage\/v1\/object\/sign\/(patient-photos\/.+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

interface PhotoModalProps {
  photo: Photo
  photos: Photo[]
  isOpen: boolean
  onClose: () => void
}

function PhotoModal({ photo, photos, isOpen, onClose }: PhotoModalProps) {
  const [zoom, setZoom] = useState(1.44) // Zoom padrão 144%
  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentPhoto, setCurrentPhoto] = useState<Photo>(photo)
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Sempre busca image_data fresco do DB (a prop pode trazer URL assinada expirada ou nada)
  const { data: fetchedImageData, isLoading: isLoadingData } = useQuery({
    queryKey: ['photo-data', currentPhoto.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('photos')
        .select('image_data')
        .eq('id', currentPhoto.id)
        .single()
      if (error) throw error
      return (data as any)?.image_data ?? null
    },
    staleTime: Infinity,
    gcTime: 1000 * 60 * 10,
  })

  const rawSrc = fetchedImageData || currentPhoto.image_data || null

  const { data: activeSrc, isLoading: isResolvingUrl } = useQuery({
    queryKey: ['photo-signed-url', currentPhoto.id, rawSrc?.slice(0, 80)],
    queryFn: async (): Promise<string> => {
      if (!rawSrc) return ''
      if (rawSrc.startsWith('data:')) return rawSrc
      const path = extractStoragePath(rawSrc)
      if (!path) return rawSrc
      const { data, error } = await (supabase as any).storage
        .from('patient-photos')
        .createSignedUrl(path.replace('patient-photos/', ''), 60 * 60)
      if (error) {
        // Renovação falhou → usa o que tiver
        return rawSrc
      }
      return data.signedUrl
    },
    enabled: !!rawSrc,
    staleTime: 1000 * 55 * 60,
    gcTime: 1000 * 60 * 60,
    initialData: rawSrc && !isStorageUrl(rawSrc) ? rawSrc : undefined,
  })

  const imageSrc = activeSrc || rawSrc || ''
  const isLoadingImage = isLoadingData || (!!rawSrc && isResolvingUrl && !activeSrc)

  // Pré-carrega vizinhos para navegação fluida
  useEffect(() => {
    const idx = photos.findIndex(p => p.id === currentPhoto.id)
    const neighbors = [photos[idx - 1], photos[idx + 1]].filter(Boolean) as Photo[]
    neighbors.forEach(p => {
      if (p.image_data || queryClient.getQueryData(['photo-data', p.id])) return
      queryClient.prefetchQuery({
        queryKey: ['photo-data', p.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from('photos')
            .select('image_data')
            .eq('id', p.id)
            .single()
          if (error) throw error
          return (data as any)?.image_data ?? null
        },
        staleTime: Infinity,
      })
    })
  }, [currentPhoto.id, photos, queryClient])

  // Atualiza a foto atual quando a prop photo muda
  useEffect(() => {
    setCurrentPhoto(photo)
    setZoom(1.44)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }, [photo])

  // Encontra o índice da foto atual
  const currentIndex = photos.findIndex(p => p.id === currentPhoto.id)
  const canGoPrevious = currentIndex > 0
  const canGoNext = currentIndex < photos.length - 1

  const handleDownload = async () => {
    try {
      const link = document.createElement('a')
      link.href = imageSrc
      link.download = `foto_${new Date(currentPhoto.created_at).toISOString().split('T')[0]}_${currentPhoto.id.slice(0, 8)}.jpg`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast({
        title: "Download realizado",
        description: "Foto salva com sucesso"
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao fazer download da foto"
      })
    }
  }

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.5, 5))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.5, 0.5))
    if (zoom <= 1) {
      setPosition({ x: 0, y: 0 })
    }
  }

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  const handleReset = () => {
    setZoom(1.44)
    setRotation(0)
    setPosition({ x: 0, y: 0 })
  }

  const handlePreviousPhoto = () => {
    if (canGoPrevious) {
      setCurrentPhoto(photos[currentIndex - 1])
    }
  }

  const handleNextPhoto = () => {
    if (canGoNext) {
      setCurrentPhoto(photos[currentIndex + 1])
    }
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  // Navegação por teclado
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          handlePreviousPhoto()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNextPhoto()
          break
        case 'Escape':
          e.preventDefault()
          if (isFullscreen) {
            setIsFullscreen(false)
          } else {
            onClose()
          }
          break
        case 'f':
        case 'F':
          e.preventDefault()
          toggleFullscreen()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [isOpen, canGoPrevious, canGoNext, isFullscreen, onClose])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.deltaY < 0) {
      handleZoomIn()
    } else {
      handleZoomOut()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${isFullscreen ? 'max-w-none w-screen h-screen' : 'max-w-6xl w-[95vw] h-[95vh]'} p-0 overflow-hidden bg-white transition-all duration-300`}>
        <DialogHeader className={`${isFullscreen ? 'hidden' : 'p-4 pb-2 border-b bg-white'}`}>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-semibold text-black">
                Foto - {new Date(currentPhoto.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </DialogTitle>
              <DialogDescription className="text-black text-sm">
                Foto {currentIndex + 1} de {photos.length} - Visualizar e gerenciar foto do paciente
              </DialogDescription>
            </div>

            <div className="flex items-center space-x-2">
              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handlePreviousPhoto}
                disabled={!canGoPrevious}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleNextPhoto}
                disabled={!canGoNext}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>

              <span className="text-sm px-2 py-1 bg-muted rounded text-black">
                {Math.round(zoom * 100)}%
              </span>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 5}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleRotate}
              >
                <RotateCw className="w-4 h-4" />
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleReset}
              >
                Reset
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={handleDownload}
              >
                <Download className="w-4 h-4 mr-1" />
                Download
              </Button>

              <Button
                className="bg-primary hover:bg-primary/90 text-white"
                size="sm"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div
          className="flex-1 overflow-hidden bg-black relative flex items-center justify-center"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
          <div
            className="relative transition-transform duration-200 ease-out"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: 'center center'
            }}
          >
            {imageSrc && !isLoadingImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={currentPhoto.id}
                src={imageSrc}
                alt="Foto ampliada"
                className="max-w-[80vw] max-h-[80vh] object-contain select-none"
                draggable={false}
                onError={() => {
                  // Se URL renovada falhou, força refetch do image_data do DB
                  queryClient.invalidateQueries({ queryKey: ['photo-data', currentPhoto.id] })
                  queryClient.invalidateQueries({ queryKey: ['photo-signed-url', currentPhoto.id] })
                }}
              />
            ) : (
              <div className="w-[800px] h-[600px] max-w-full max-h-full flex items-center justify-center text-white/60 text-sm">
                Carregando...
              </div>
            )}
          </div>

          {/* Navegação invisível em modo tela cheia */}
          {isFullscreen && (
            <>
              {canGoPrevious && (
                <Button
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  size="lg"
                  onClick={handlePreviousPhoto}
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}
              
              {canGoNext && (
                <Button
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                  size="lg"
                  onClick={handleNextPhoto}
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              )}

              <Button
                className="absolute top-4 right-4 bg-black/50 hover:bg-black/70 text-white"
                size="sm"
                onClick={toggleFullscreen}
              >
                <Minimize className="w-4 h-4" />
              </Button>
            </>
          )}

          {/* Informações de controle */}
          <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm space-y-1">
            <div>Arraste para mover • Scroll para zoom</div>
            <div>← → para navegar • F para tela cheia • ESC para sair</div>
          </div>

          {/* Contador de fotos */}
          <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1 rounded text-sm">
            {currentIndex + 1} / {photos.length}
          </div>
        </div>

        <div className={`${isFullscreen ? 'hidden' : 'p-4 bg-white border-t'}`}>
          <div className="flex items-center justify-between text-sm text-black">
            <div>
              ID: {currentPhoto.id.slice(0, 8)}...
            </div>
            <div>
              Criado em: {new Date(currentPhoto.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default PhotoModal