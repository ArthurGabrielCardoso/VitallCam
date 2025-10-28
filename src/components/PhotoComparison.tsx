'use client'

import { useState } from 'react'
import { Photo, Folder } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { X, ArrowLeft, Folder as FolderIcon, Grid2X2, Image, Maximize } from 'lucide-react'
import { useFolderPhotos } from '@/hooks/useFolders'
import LazyImage from '@/components/LazyImage'
import FolderCardSkeleton from '@/components/FolderCardSkeleton'
import { Skeleton } from '@/components/ui/skeleton'

interface PhotoComparisonProps {
  isOpen: boolean
  onClose: () => void
  mainPhoto: Photo
  allPhotos: Photo[]
  folders: Folder[]
  currentFolder: string | null
  folderPhotos: Photo[]
  unfolderedPhotos: Photo[]
  onFolderClick: (folderId: string) => void
  onBackToFolders: () => void
}

export default function PhotoComparison({
  isOpen,
  onClose,
  mainPhoto,
  allPhotos,
  folders,
  currentFolder: parentCurrentFolder,
  folderPhotos: parentFolderPhotos,
  unfolderedPhotos,
  onFolderClick,
  onBackToFolders
}: PhotoComparisonProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<Photo[]>([])
  const [comparisonMode, setComparisonMode] = useState<'single' | 'quad'>('single')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [currentView, setCurrentView] = useState<'folders' | 'loose' | 'folder'>(
    parentCurrentFolder ? 'folder' : 'folders'
  )
  const [currentFolder, setCurrentFolder] = useState<string | null>(parentCurrentFolder)
  
  // Hook para buscar fotos da pasta selecionada
  const { data: selectedFolderPhotos = [] } = useFolderPhotos(currentFolder)

  if (!isOpen) return null

  const handleFolderClick = async (folderId: string) => {
    setCurrentFolder(folderId)
    setCurrentView('folder')
    onFolderClick(folderId)
    // As fotos da pasta serão carregadas pelo hook useFolderPhotos no componente pai
  }

  const handleBackToFolders = () => {
    setCurrentView('folders')
    setCurrentFolder(null)
    onBackToFolders()
  }

  const handlePhotoClick = (photo: Photo) => {
    if (comparisonMode === 'single') {
      setSelectedPhoto(photo)
    } else {
      // Modo quad - selecionar até 4 fotos
      if (selectedPhotos.find(p => p.id === photo.id)) {
        // Remover se já está selecionado
        setSelectedPhotos(prev => prev.filter(p => p.id !== photo.id))
      } else if (selectedPhotos.length < 4) {
        // Adicionar se menos de 4
        setSelectedPhotos(prev => [...prev, photo])
      }
    }
  }

  const toggleComparisonMode = () => {
    if (comparisonMode === 'single') {
      setComparisonMode('quad')
      setSelectedPhoto(null)
      setSelectedPhotos([])
    } else {
      setComparisonMode('single')
      setSelectedPhotos([])
    }
  }

  const renderRightPanel = () => {
    if (currentView === 'folders') {
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-black">Selecionar Pasta ou Foto</h3>
            {comparisonMode === 'quad' && (
              <div className="bg-primary text-white px-3 py-1 rounded-full text-sm">
                {selectedPhotos.length}/3 selecionadas
              </div>
            )}
          </div>
          
          {/* Pastas */}
          <div className="mb-6">
            <h4 className="text-md font-medium text-black mb-3">Pastas</h4>
            <div className="grid grid-cols-2 gap-3">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => handleFolderClick(folder.id)}
                  className="cursor-pointer p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors flex flex-col items-center"
                >
                  <FolderIcon className="w-8 h-8 text-primary mb-2" />
                  <span className="text-sm text-black text-center font-medium">{folder.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Fotos Avulsas */}
          <div className="flex-1">
            <h4 className="text-md font-medium text-black mb-3">Fotos Avulsas</h4>
            <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
              {unfolderedPhotos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => handlePhotoClick(photo)}
                  className={`cursor-pointer rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all ${
                    (comparisonMode === 'single' && selectedPhoto?.id === photo.id) ||
                    (comparisonMode === 'quad' && selectedPhotos.find(p => p.id === photo.id))
                      ? 'ring-4 ring-primary' : ''
                  }`}
                >
                  <LazyImage
                    src={photo.image_data}
                    alt="Foto avulsa"
                    className="w-full aspect-square object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (currentView === 'folder') {
      const folder = folders.find(f => f.id === currentFolder)
      return (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 mb-4">
            <Button
              onClick={handleBackToFolders}
              size="sm"
              className="bg-secondary hover:bg-secondary/90 text-white"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h3 className="text-lg font-semibold text-black">{folder?.name}</h3>
          </div>
          
          <div className="grid grid-cols-3 gap-2 max-h-full overflow-y-auto">
            {selectedFolderPhotos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => handlePhotoClick(photo)}
                className={`cursor-pointer rounded-lg overflow-hidden hover:ring-2 hover:ring-primary transition-all ${
                  (comparisonMode === 'single' && selectedPhoto?.id === photo.id) ||
                  (comparisonMode === 'quad' && selectedPhotos.find(p => p.id === photo.id))
                    ? 'ring-4 ring-primary' : ''
                }`}
              >
                <LazyImage
                  src={photo.image_data}
                  alt="Foto da pasta"
                  className="w-full aspect-square object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )
    }

    return null
  }

  return (
    <div className="fixed inset-0 bg-black z-50 flex">
      {/* Botões Superior - Lado a Lado */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
        {/* Botão Fullscreen (só aparece no modo quad) */}
        {comparisonMode === 'quad' && selectedPhotos.length >= 3 && (
          <Button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="bg-secondary hover:bg-secondary/90 text-white rounded-full w-10 h-10 p-0"
            title={isFullscreen ? 'Sair do modo tela cheia' : 'Ver em tela cheia'}
          >
            <Maximize className="w-5 h-5" />
          </Button>
        )}
        
        {/* Botão Alternar Modo */}
        <Button
          onClick={toggleComparisonMode}
          className="bg-primary hover:bg-primary/90 text-white rounded-full w-10 h-10 p-0"
          title={comparisonMode === 'single' ? 'Modo 2x2' : 'Modo 1x1'}
        >
          {comparisonMode === 'single' ? <Grid2X2 className="w-5 h-5" /> : <Image className="w-5 h-5" />}
        </Button>
        
        {/* Botão Fechar */}
        <Button
          onClick={onClose}
          className="bg-destructive hover:bg-destructive/90 text-white rounded-full w-10 h-10 p-0"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Modo Fullscreen - 2x2 ocupando 100% da tela */}
      {isFullscreen && comparisonMode === 'quad' ? (
        <div className="w-full h-full bg-black">
          <div className="grid grid-cols-2 grid-rows-2 h-screen w-full">
            {/* Foto principal na posição superior esquerda */}
            <div className="bg-black flex items-center justify-center border border-gray-700">
              <img
                src={mainPhoto.image_data}
                alt="Foto principal"
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Fotos selecionadas nas demais posições */}
            {Array.from({ length: 3 }).map((_, index) => {
              const photo = selectedPhotos[index]
              return (
                <div key={index} className="bg-gray-900 flex items-center justify-center border border-gray-700">
                  {photo ? (
                    <img
                      src={photo.image_data}
                      alt={`Comparação ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-500 text-center">
                      <Grid2X2 className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">Selecione uma foto</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          {/* Lado Esquerdo - Foto Principal ou Grid 2x2 */}
          <div className="w-1/2 relative bg-black">
            {comparisonMode === 'single' ? (
              <img
                src={mainPhoto.image_data}
                alt="Foto principal"
                className="w-full h-screen object-cover"
              />
            ) : (
              // Grid 2x2 para comparação múltipla
              <div className="grid grid-cols-2 grid-rows-2 h-screen w-full">
                {/* Sempre mostrar a foto principal primeiro */}
                <div className="bg-black flex items-center justify-center border border-gray-700">
                  <img
                    src={mainPhoto.image_data}
                    alt="Foto principal"
                    className="w-full h-full object-cover"
                  />
                </div>
                
                {/* Mostrar fotos selecionadas nas demais posições */}
                {Array.from({ length: 3 }).map((_, index) => {
                  const photo = selectedPhotos[index]
                  return (
                    <div key={index} className="bg-gray-900 flex items-center justify-center border border-gray-700">
                      {photo ? (
                        <img
                          src={photo.image_data}
                          alt={`Comparação ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-gray-500 text-center">
                          <Grid2X2 className="w-8 h-8 mx-auto mb-2" />
                          <p className="text-sm">Selecione uma foto</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Lado Direito - Seleção/Comparação */}
          <div className="w-1/2 bg-white flex flex-col">
            {(comparisonMode === 'single' && selectedPhoto) ? (
              // Modo de comparação - mostra foto selecionada
              <div className="relative h-full bg-black">
                {/* Botão Voltar */}
                <Button
                  onClick={() => setSelectedPhoto(null)}
                  className="absolute top-4 right-20 bg-secondary hover:bg-secondary/90 text-white rounded-full w-10 h-10 p-0 z-10"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                
                {/* Imagem para comparar - 100% do espaço */}
                <img
                  src={selectedPhoto.image_data}
                  alt="Foto para comparar"
                  className="w-full h-screen object-cover"
                />
                
                {/* Data da foto */}
                <div className="absolute bottom-4 left-4 bg-black/50 text-white px-3 py-2 rounded text-sm">
                  {new Date(selectedPhoto.created_at).toLocaleDateString('pt-BR')}
                </div>
              </div>
            ) : (
              // Modo de seleção - mostra pastas e fotos  
              <div className="p-6 h-full">
                {renderRightPanel()}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}