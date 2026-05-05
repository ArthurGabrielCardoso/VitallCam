'use client'

import { useState, useEffect, useCallback } from 'react'
import { Photo } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import PhotoModal from './PhotoModal'
import { Trash2, Eye, MoreHorizontal, ArrowUpDown } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import LazyPhotoImage from '@/components/LazyPhotoImage'

interface PhotoGalleryProps {
  photos: Photo[]
  onPhotoDelete: (photoId: string) => void
}

const PHOTOS_PER_PAGE = 5

export default function PhotoGallery({ photos, onPhotoDelete }: PhotoGalleryProps) {
  const [visibleCount, setVisibleCount] = useState(PHOTOS_PER_PAGE)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [hoveredPhoto, setHoveredPhoto] = useState<string | null>(null)
  const [isReversed, setIsReversed] = useState(true) // Última foto primeiro por padrão
  const { toast } = useToast()

  // Ordena as fotos baseado no estado isReversed
  const sortedPhotos = isReversed 
    ? [...photos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    : [...photos].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  const visiblePhotos = sortedPhotos.slice(0, visibleCount)
  const hasMore = photos.length > visibleCount

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + PHOTOS_PER_PAGE, photos.length))
  }, [photos.length])

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000) {
        if (hasMore) {
          loadMore()
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [hasMore, loadMore])

  const deletePhoto = async (photoId: string) => {
    setIsDeleting(photoId)

    try {
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId)

      if (error) throw error

      onPhotoDelete(photoId)

      toast({
        title: "Sucesso",
        description: "Foto excluída com sucesso"
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao excluir foto"
      })
    } finally {
      setIsDeleting(null)
    }
  }

  const openPhotoModal = (photo: Photo) => {
    setSelectedPhoto(photo)
  }

  const closePhotoModal = () => {
    setSelectedPhoto(null)
  }

  const toggleOrder = () => {
    setIsReversed(!isReversed)
    setVisibleCount(PHOTOS_PER_PAGE) // Reset para primeira página
    toast({
      title: "Ordem alterada",
      description: isReversed ? "Fotos ordenadas da mais antiga para mais recente" : "Fotos ordenadas da mais recente para mais antiga"
    })
  }

  if (photos.length === 0) {
    return (
      <Card className="p-8 bg-white">
        <div className="flex flex-col items-center justify-center text-center space-y-4">
          <Eye className="w-12 h-12 text-primary" />
          <div>
            <h3 className="font-medium text-black mb-1">
              Nenhuma foto capturada
            </h3>
            <p className="text-sm text-black">
              Use a câmera para capturar a primeira foto deste paciente
            </p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Botão para alternar ordem */}
      <div className="flex justify-end">
        <Button
          onClick={toggleOrder}
          variant="outline"
          size="sm"
          className="bg-white hover:bg-gray-50 text-black border-gray-300"
        >
          <ArrowUpDown className="w-4 h-4 mr-2" />
          {isReversed ? "Mais recente primeiro" : "Mais antiga primeiro"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visiblePhotos.map((photo) => (
          <div
            key={photo.id}
            className="relative group"
            onMouseEnter={() => setHoveredPhoto(photo.id)}
            onMouseLeave={() => setHoveredPhoto(null)}
          >
            <Card className="overflow-hidden cursor-pointer transition-transform hover:scale-105">
              <div
                className="relative aspect-[4/3] bg-muted"
                onClick={() => openPhotoModal(photo)}
              >
                <LazyPhotoImage
                  photo={photo}
                  className="object-cover"
                  onImageReady={(src) => {
                    // Garante que o modal terá image_data quando aberto
                    if (!photo.image_data) photo.image_data = src
                  }}
                />

                {hoveredPhoto === photo.id && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center space-x-2 transition-opacity">
                    <Button
                      size="sm"
                      className="bg-primary hover:bg-primary/90 text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        openPhotoModal(photo)
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isDeleting === photo.id}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                          <AlertDialogDescription>
                            Tem certeza que deseja excluir esta foto? Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deletePhoto(photo.id)}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              <div className="p-3">
                <p className="text-xs text-black">
                  {new Date(photo.created_at).toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
            </Card>

            {isDeleting === photo.id && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                <div className="flex items-center space-x-2 text-sm">
                  <div className="w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin"></div>
                  <span>Excluindo...</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={loadMore}
            className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-white"
          >
            <MoreHorizontal className="w-4 h-4 mr-2" />
            Carregar mais fotos ({photos.length - visibleCount} restantes)
          </Button>
        </div>
      )}

      {visibleCount >= photos.length && photos.length > PHOTOS_PER_PAGE && (
        <div className="flex justify-center pt-4">
          <p className="text-sm text-black">
            Todas as {photos.length} fotos foram carregadas
          </p>
        </div>
      )}

      {selectedPhoto && (
        <PhotoModal
          photo={selectedPhoto}
          photos={sortedPhotos}
          isOpen={!!selectedPhoto}
          onClose={closePhotoModal}
        />
      )}
    </div>
  )
}