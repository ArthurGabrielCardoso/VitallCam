'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Photo } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { usePatient, useUpdatePatient, useDeletePatient } from '@/hooks/usePatients'
import { usePhotos, usePhotosBroadcast, useDeletePhoto, useUnfolderedPhotos, useMovePhotosToFolder } from '@/hooks/usePhotos'
import { useFolders, useCreateFolder, useFolderPhotos, useDeleteFolder, useUpdateFolder } from '@/hooks/useFolders'
import CameraCapture from '@/components/CameraCapture'
import CameraTransition from '@/components/CameraTransition'
import ImageUpload from '@/components/ImageUpload'
import CreateFolderModal from '@/components/CreateFolderModal'
import EditFolderModal from '@/components/EditFolderModal'
import PhotoComparison from '@/components/PhotoComparison'
import PhotoEditor from '@/components/PhotoEditor'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, User, Camera, FolderPlus, Folder, X, GitCompare, Printer, Edit, ZoomIn, ZoomOut, Pencil, Maximize, ArrowUpDown, Upload, Sparkles, FileText, Calendar, Clock, Trash2, Check, NotebookPen, Download } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import PhotoGridSkeleton from '@/components/PhotoGridSkeleton'
import FolderCardSkeleton from '@/components/FolderCardSkeleton'
import LazyImage from '@/components/LazyImage'
import BeforeAfterSlider from '@/components/BeforeAfterSlider'
import AIProcessingLoader from '@/components/AIProcessingLoader'
import { transformSmileWithGemini } from '@/lib/gemini-smile'
import TranscriptionButton from '@/components/TranscriptionButton'
import TranscriptionViewer from '@/components/TranscriptionViewer'
import TranscriptionDocument from '@/components/TranscriptionDocument'
import AnamneseDocument from '@/components/AnamneseDocument'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Transcription, Anamnese } from '@/lib/types'

export default function PatientPage() {
  const params = useParams()
  const router = useRouter()
  const patientId = params.id as string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  
  // Broadcast: escuta mudanças de fotos em tempo real (leve, sem WAL)
  usePhotosBroadcast(patientId)

  // React Query hooks
  const { data: patient, isLoading: patientLoading, error: patientError } = usePatient(patientId)
  const { data: photos = [], isLoading: photosLoading, error: photosError, refetch: refetchPhotos } = usePhotos(patientId)
  const { data: folders = [], isLoading: foldersLoading, refetch: refetchFolders } = useFolders(patientId)
  const { data: unfolderedPhotos = [], refetch: refetchUnfolderedPhotos } = useUnfolderedPhotos(patientId)
  const deletePhotoMutation = useDeletePhoto()
  const createFolderMutation = useCreateFolder()
  const deleteFolderMutation = useDeleteFolder()
  const updateFolderMutation = useUpdateFolder()
  const movePhotosToFolderMutation = useMovePhotosToFolder()
  const updatePatientMutation = useUpdatePatient()
  const deletePatientMutation = useDeletePatient()
  
  // States locais
  const [showCamera, setShowCamera] = useState(false)
  const [showCreateFolder, setShowCreateFolder] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null)
  const [currentFolder, setCurrentFolder] = useState<string | null>(null)
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([])
  const [showMoveToFolderModal, setShowMoveToFolderModal] = useState(false)
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonPhoto, setComparisonPhoto] = useState<Photo | null>(null)
  const [showEditFolder, setShowEditFolder] = useState(false)
  const [editingFolder, setEditingFolder] = useState<{ id: string, name: string } | null>(null)
  const [showPhotoEditor, setShowPhotoEditor] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState<Photo | null>(null)
  const [photoZoom, setPhotoZoom] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [isProcessingAI, setIsProcessingAI] = useState(false)
  const [aiEnhancedImage, setAiEnhancedImage] = useState<string | null>(null)
  const [showAIComparison, setShowAIComparison] = useState(false)
  const [showTranscriptions, setShowTranscriptions] = useState(false)
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)
  const [anamneses, setAnamneses] = useState<Anamnese[]>([])
  const [selectedAnamnese, setSelectedAnamnese] = useState<Anamnese | null>(null)
  const [activeTab, setActiveTab] = useState('photos')
  const [isEditingName, setIsEditingName] = useState(false)
  const [editingName, setEditingName] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [confirmDeletePhotoId, setConfirmDeletePhotoId] = useState<string | null>(null)
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false)
  const [isDeletingSelected, setIsDeletingSelected] = useState(false)
  const [notes, setNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const { toast } = useToast()

  // Hook para fotos da pasta atual
  const { data: folderPhotos = [] } = useFolderPhotos(currentFolder)

  // Função para ordenar fotos por tempo de criação (mais preciso e confiável)
  const sortPhotos = (photos: Photo[]) => {
    return [...photos].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return sortOrder === 'newest' ? dateB - dateA : dateA - dateB
    })
  }

  // Aplicar ordenação às fotos
  const sortedFolderPhotos = sortPhotos(folderPhotos)
  const sortedUnfolderedPhotos = sortPhotos(unfolderedPhotos)

  const isLoading = patientLoading || photosLoading || foldersLoading
  const photoCount = photos.length

  // Reset zoom e posição quando mudar de foto
  useEffect(() => {
    if (selectedPhoto) {
      setPhotoZoom(1)
      setPanPosition({ x: 0, y: 0 })
    }
  }, [selectedPhoto])

  // Navegação por teclado para fotos
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedPhoto) return

      // Usar fotos do contexto atual (pasta ou fotos avulsas) ordenadas
      const currentPhotos = currentFolder ? sortedFolderPhotos : sortedUnfolderedPhotos

      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          setSelectedPhoto(null)
        }
      } else if (e.key === 'ArrowLeft') {
        // Foto anterior
        const currentIndex = currentPhotos.findIndex(p => p.id === selectedPhoto.id)
        if (currentIndex > 0) {
          setSelectedPhoto(currentPhotos[currentIndex - 1])
        }
      } else if (e.key === 'ArrowRight') {
        // Próxima foto
        const currentIndex = currentPhotos.findIndex(p => p.id === selectedPhoto.id)
        if (currentIndex < currentPhotos.length - 1) {
          setSelectedPhoto(currentPhotos[currentIndex + 1])
        }
      } else if (e.key === 'f' || e.key === 'F') {
        // Alternar fullscreen com tecla F
        setIsFullscreen(!isFullscreen)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedPhoto, currentFolder, sortedFolderPhotos, sortedUnfolderedPhotos, isFullscreen])

  // Carregar notas do localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`patient_notes_${patientId}`)
    if (saved) setNotes(saved)
  }, [patientId])

  const handleSaveNotes = () => {
    localStorage.setItem(`patient_notes_${patientId}`, notes)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
    toast({ title: 'Notas salvas!' })
  }

  const handleDeleteSelectedPhotos = async () => {
    if (selectedPhotos.length === 0) return
    setShowDeleteSelectedConfirm(true)
  }

  const confirmDeleteSelectedPhotos = async () => {
    setIsDeletingSelected(true)
    try {
      for (const photoId of selectedPhotos) {
        await deletePhotoMutation.mutateAsync({ photoId, patientId })
      }
      toast({ title: 'Sucesso!', description: `${selectedPhotos.length} foto(s) deletada(s)` })
      setSelectedPhotos([])
      setIsSelectionMode(false)
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao deletar fotos' })
    } finally {
      setIsDeletingSelected(false)
      setShowDeleteSelectedConfirm(false)
    }
  }

  const handleExportPatientPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const margin = 15
      let y = 20

      const checkPage = (need: number) => {
        if (y + need > 270) { doc.addPage(); y = 20 }
      }

      // Cabeçalho
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text(`Paciente: ${patient?.name}`, pageW / 2, y, { align: 'center' })
      y += 8
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`Exportado em ${new Date().toLocaleString('pt-BR')}`, pageW / 2, y, { align: 'center' })
      y += 8
      doc.setDrawColor(29, 185, 179)
      doc.setLineWidth(0.5)
      doc.line(margin, y, pageW - margin, y)
      y += 10

      // Notas
      const savedNotes = localStorage.getItem(`patient_notes_${patientId}`)
      if (savedNotes) {
        checkPage(20)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text('NOTAS', margin, y); y += 7
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')
        const noteLines = doc.splitTextToSize(savedNotes, pageW - margin * 2)
        doc.text(noteLines, margin, y)
        y += noteLines.length * 5 + 8
        doc.setDrawColor(200, 200, 200)
        doc.line(margin, y, pageW - margin, y); y += 8
      }

      // Fotos — grade 3×3 por página
      const allPhotos = photos
      if (allPhotos.length > 0) {
        checkPage(10)
        doc.setFontSize(13)
        doc.setFont('helvetica', 'bold')
        doc.text('FOTOS', margin, y); y += 8

        const imgSize = (pageW - margin * 2 - 8) / 3
        let col = 0
        for (const photo of allPhotos) {
          if (col === 0) checkPage(imgSize + 6)
          const x = margin + col * (imgSize + 4)
          try {
            doc.addImage(photo.image_data, 'JPEG', x, y, imgSize, imgSize)
          } catch { /* imagem inválida */ }
          col++
          if (col === 3) { col = 0; y += imgSize + 4 }
        }
        if (col > 0) y += imgSize + 4
        y += 4
      }

      doc.save(`Paciente_${patient?.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`)
      toast({ title: 'PDF exportado com sucesso!' })
    } catch (err) {
      console.error(err)
      toast({ variant: 'destructive', title: 'Erro ao exportar PDF' })
    }
  }

  const handleStartEditName = () => {
    setEditingName(patient?.name || '')
    setIsEditingName(true)
  }

  const handleSaveEditName = async () => {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === patient?.name) {
      setIsEditingName(false)
      return
    }
    try {
      await updatePatientMutation.mutateAsync({ patientId, name: trimmed })
      toast({ title: 'Nome atualizado com sucesso' })
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao atualizar nome' })
    }
    setIsEditingName(false)
  }

  const handleDeletePatient = async () => {
    try {
      await deletePatientMutation.mutateAsync(patientId)
      toast({ title: 'Paciente deletado com sucesso' })
      router.push('/patients')
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao deletar paciente' })
    }
    setShowDeleteConfirm(false)
  }

  const handlePhotoCapture = () => {
    refetchPhotos()
    refetchUnfolderedPhotos()
    refetchFolders()
    setShowCamera(false)
  }

  const handleImageUpload = () => {
    refetchPhotos()
    refetchUnfolderedPhotos()
    refetchFolders()
  }

  // Funções para drag and drop de arquivos
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Verificar se está arrastando arquivos
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFiles(true)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    // Verificar se realmente saiu da área (e não apenas mudou de elemento filho)
    if (e.currentTarget === e.target) {
      setIsDraggingFiles(false)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingFiles(false)

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Validar tipos de arquivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const imageFiles = files.filter(file => validTypes.includes(file.type))

    if (imageFiles.length === 0) {
      toast({
        variant: "destructive",
        title: "Tipos de arquivo inválidos",
        description: "Apenas arquivos JPEG, PNG e WebP são permitidos"
      })
      return
    }

    if (imageFiles.length < files.length) {
      toast({
        title: "Aviso",
        description: `${files.length - imageFiles.length} arquivo(s) ignorado(s) por tipo inválido`
      })
    }

    try {
      toast({
        title: "Processando...",
        description: `Carregando ${imageFiles.length} imagem(ns)`
      })

      let targetFolderId = currentFolder

      // Se não tiver pasta especificada, criar uma com a data atual
      if (!targetFolderId) {
        const today = new Date()
        const folderDate = today.toLocaleDateString('pt-BR')
        const folderName = `Upload ${folderDate}`

        try {
          const folder = await createFolderMutation.mutateAsync({
            name: folderName,
            patient_id: patientId
          })
          targetFolderId = folder.id
        } catch (folderError) {
          console.error('Erro ao criar pasta:', folderError)
          // Se falhar ao criar pasta, salvar sem pasta
          targetFolderId = null
        }
      }

      const uploadPromises = imageFiles.map(async (file) => {
        return new Promise<Photo>((resolve, reject) => {
          const reader = new FileReader()

          reader.onload = async (e) => {
            try {
              const imageData = e.target?.result as string

              const { data, error } = await db
                .from('photos')
                .insert({
                  patient_id: patientId,
                  image_data: imageData,
                  folder_id: targetFolderId
                })
                .select('id, patient_id, image_data, folder_id, created_at')
                .single()

              if (error) throw error

              resolve(data)
            } catch (error) {
              console.error('Erro no upload:', error)
              reject(error)
            }
          }

          reader.onerror = () => reject(new Error('Erro ao ler arquivo'))
          reader.readAsDataURL(file)
        })
      })

      await Promise.all(uploadPromises)

      // Atualizar queries
      refetchPhotos()
      refetchFolders()

      toast({
        title: "Sucesso!",
        description: `${imageFiles.length} imagem(ns) carregada(s) com sucesso`
      })

    } catch (error) {
      console.error('Erro no upload:', error)
      toast({
        variant: "destructive",
        title: "Erro no upload",
        description: "Falha ao carregar uma ou mais imagens"
      })
    }
  }

  const handlePhotoDelete = async (photoId: string) => {
    try {
      await deletePhotoMutation.mutateAsync({ photoId, patientId })
      toast({
        title: "Sucesso!",
        description: "Foto deletada com sucesso"
      })
    } catch {
      toast({
        variant: "destructive", 
        title: "Erro",
        description: "Falha ao deletar foto"
      })
    }
  }

  const handleCreateFolder = async (name: string) => {
    try {
      await createFolderMutation.mutateAsync({ name, patient_id: patientId })
      toast({
        title: "Sucesso!",
        description: "Pasta criada com sucesso"
      })
      setShowCreateFolder(false)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao criar pasta"
      })
    }
  }

  const handleFolderClick = (folderId: string) => {
    if (currentFolder === folderId) {
      // Se clicar na pasta atual, volta para a raiz
      setCurrentFolder(null)
    } else {
      // Entra na pasta
      setCurrentFolder(folderId)
    }
  }

  const handleFolderDelete = async (folderId: string) => {
    try {
      await deleteFolderMutation.mutateAsync(folderId)
      // Se estamos dentro da pasta que foi deletada, voltar para a raiz
      if (currentFolder === folderId) {
        setCurrentFolder(null)
      }
      toast({
        title: "Sucesso!",
        description: "Pasta deletada e fotos movidas para o perfil"
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao deletar pasta"
      })
    }
  }

  const handleFolderRename = (folderId: string, currentName: string) => {
    setEditingFolder({ id: folderId, name: currentName })
    setShowEditFolder(true)
  }

  const handleEditFolder = async (newName: string) => {
    if (!editingFolder) return
    
    try {
      await updateFolderMutation.mutateAsync({
        folderId: editingFolder.id,
        name: newName
      })
      
      toast({
        title: "Sucesso!",
        description: "Nome da pasta atualizado com sucesso"
      })
      
      setShowEditFolder(false)
      setEditingFolder(null)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao atualizar nome da pasta"
      })
    }
  }

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode)
    setSelectedPhotos([])
  }

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId) 
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    )
  }

  const selectAllPhotos = () => {
    const currentPhotos = currentFolder ? sortedFolderPhotos : sortedUnfolderedPhotos
    setSelectedPhotos(currentPhotos.map(photo => photo.id))
  }

  const clearSelection = () => {
    setSelectedPhotos([])
  }

  const handleMoveSelectedPhotos = () => {
    if (selectedPhotos.length === 0) return
    setShowMoveToFolderModal(true)
  }

  const handleMoveToFolder = async (photoId: string) => {
    setSelectedPhotos([photoId])
    setShowMoveToFolderModal(true)
  }

  const handleComparePhoto = (photo: Photo) => {
    setComparisonPhoto(photo)
    setSelectedPhoto(null)
    setShowComparison(true)
  }

  const handleComparisonFolderClick = () => {
    // Esta função será chamada pelo componente PhotoComparison
    // quando uma pasta for clicada
  }

  const handleComparisonBackToFolders = () => {
    // Esta função será chamada quando voltar para a lista de pastas
  }

  const handleEditPhoto = (photo: Photo) => {
    setEditingPhoto(photo)
    setSelectedPhoto(null)
    setShowPhotoEditor(true)
  }

  const handleSaveEditedPhoto = async (editedImageData: string) => {
    if (!editingPhoto) return

    try {
      // Aqui você pode implementar a lógica para salvar a foto editada
      // Por exemplo, criar uma nova foto ou atualizar a existente
      const { error } = await db
        .from('photos')
        .insert({
          patient_id: patientId,
          image_data: editedImageData,
          folder_id: editingPhoto.folder_id
        })
        .select()
        .single()

      if (error) throw error

      // Invalidar queries para atualizar a UI
      refetchPhotos()
      refetchFolders()

      toast({
        title: "Sucesso!",
        description: "Foto editada salva com sucesso"
      })

      setShowPhotoEditor(false)
      setEditingPhoto(null)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao salvar foto editada"
      })
    }
  }

  const zoomIn = () => {
    setPhotoZoom(prev => Math.min(prev * 1.2, 5))
  }

  const zoomOut = () => {
    setPhotoZoom(prev => Math.max(prev / 1.2, 0.3))
  }

  const resetZoom = () => {
    setPhotoZoom(1)
    setPanPosition({ x: 0, y: 0 })
  }

  // Funções para arrastar a imagem
  const handleMouseDown = (e: React.MouseEvent) => {
    if (photoZoom > 1) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - panPosition.x,
        y: e.clientY - panPosition.y
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && photoZoom > 1) {
      setPanPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Funções para touch (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (photoZoom > 1 && e.touches.length === 1) {
      setIsDragging(true)
      const touch = e.touches[0]
      setDragStart({
        x: touch.clientX - panPosition.x,
        y: touch.clientY - panPosition.y
      })
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && photoZoom > 1 && e.touches.length === 1) {
      const touch = e.touches[0]
      setPanPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      })
    }
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  // Função para processar foto com IA
  const handleAIEnhance = async (photo: Photo) => {
    try {
      setIsProcessingAI(true)
      setAiEnhancedImage(null)

      // Chamar API do Gemini
      const enhancedImage = await transformSmileWithGemini(photo.image_data)

      setAiEnhancedImage(enhancedImage)
      setShowAIComparison(true)

      toast({
        title: "Sucesso!",
        description: "Sorriso aprimorado pela IA"
      })
    } catch (error: any) {
      console.error('Erro ao processar com IA:', error)

      // Verificar se é erro 429 (quota exceeded)
      const errorMessage = error?.message || error?.toString() || ''
      const is429Error = errorMessage.includes('429') ||
                         errorMessage.includes('quota') ||
                         errorMessage.includes('Quota exceeded')

      if (is429Error) {
        // Mensagem amigável para erro de quota
        toast({
          variant: "destructive",
          title: "Limite de uso atingido",
          description: "A quota gratuita do Gemini foi excedida. Aguarde alguns minutos e tente novamente, ou considere fazer upgrade para o plano pago."
        })
      } else {
        // Mensagem genérica para outros erros
        toast({
          variant: "destructive",
          title: "Erro ao processar imagem",
          description: "Não foi possível aprimorar o sorriso. Tente novamente."
        })
      }
    } finally {
      setIsProcessingAI(false)
    }
  }

  // Função para salvar imagem aprimorada pela IA
  const handleSaveAIEnhanced = async () => {
    if (!aiEnhancedImage || !selectedPhoto) return

    try {
      const { error } = await db
        .from('photos')
        .insert({
          patient_id: patientId,
          image_data: aiEnhancedImage,
          folder_id: selectedPhoto.folder_id
        })
        .select()
        .single()

      if (error) throw error

      refetchPhotos()
      refetchFolders()

      toast({
        title: "Sucesso!",
        description: "Foto aprimorada salva com sucesso"
      })

      setShowAIComparison(false)
      setAiEnhancedImage(null)
    } catch (error) {
      console.error('Erro ao salvar:', error)
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Não foi possível salvar a foto aprimorada"
      })
    }
  }

  const handlePrintSelected = () => {
    if (selectedPhotos.length === 0) {
      toast({
        variant: "destructive",
        title: "Nenhuma foto selecionada",
        description: "Selecione pelo menos uma foto para imprimir"
      })
      return
    }

    // Criar uma nova janela para impressão
    const printWindow = window.open('', '_blank')
    
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível abrir a janela de impressão"
      })
      return
    }

    // Obter objetos de foto completos a partir dos IDs selecionados
    // Buscar nas fotos da pasta atual ou nas avulsas dependendo do contexto
    const currentPhotos = currentFolder ? sortedFolderPhotos : sortedUnfolderedPhotos
    const allAvailablePhotos = [...photos, ...currentPhotos]
    
    const selectedPhotoObjects = selectedPhotos.map(photoId => 
      allAvailablePhotos.find(photo => photo.id === photoId)
    ).filter(photo => photo !== undefined) as Photo[]

    console.log('Fotos selecionadas para impressão:', selectedPhotoObjects.length)
    console.log('IDs das fotos:', selectedPhotos)
    console.log('Objetos das fotos:', selectedPhotoObjects)

    if (selectedPhotoObjects.length === 0) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível encontrar as fotos selecionadas"
      })
      printWindow.close()
      return
    }

    // Organizar fotos em pares (2 por fileira) - 3 fileiras = 6 fotos por página
    const photoPairs = []
    for (let i = 0; i < selectedPhotoObjects.length; i += 2) {
      photoPairs.push(selectedPhotoObjects.slice(i, i + 2))
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Fotos - ${patient?.name}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 20px;
              background: white;
            }
            
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #1db9b3;
            }
            
            .logo {
              height: 60px;
            }
            
            .patient-info {
              text-align: right;
            }
            
            .patient-name {
              font-size: 24px;
              font-weight: bold;
              color: #1db9b3;
              margin: 0;
            }
            
            .print-date {
              color: #666;
              margin: 5px 0 0 0;
            }
            
            .photos-grid {
              margin-top: 30px;
            }
            
            .photo-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 15px;
              page-break-inside: avoid;
              width: 100%;
            }
            
            .photo-container {
              width: 48%;
              text-align: center;
              display: flex;
              flex-direction: column;
            }
            
            .photo-container:only-child {
              width: 48%;
              margin: 0 auto;
            }
            
            .photo {
              width: 100%;
              max-width: 100%;
              height: 320px;
              object-fit: cover;
              border: 2px solid #1db9b3;
              border-radius: 8px;
              display: block;
            }
            
            @media print {
              body {
                margin: 0;
                padding: 15px;
              }
              
              .photo-row {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="/assets/images/logo.png" alt="Logo" class="logo" />
            <div class="patient-info">
              <h1 class="patient-name">${patient?.name}</h1>
              <p class="print-date">${new Date().toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}</p>
            </div>
          </div>
          
          <div class="photos-grid">
            ${photoPairs.map((pair, pairIndex) => `
              <div class="photo-row">
                ${pair.map((photo, photoIndex) => `
                  <div class="photo-container">
                    <img src="${photo.image_data}" alt="Foto ${pairIndex * 2 + photoIndex + 1}" class="photo" />
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `

    printWindow.document.write(printContent)
    printWindow.document.close()
    
    // Aguardar o carregamento das imagens antes de imprimir
    printWindow.onload = () => {
      const images = printWindow.document.querySelectorAll('img')
      let loadedImages = 0
      const totalImages = images.length
      
      if (totalImages === 0) {
        setTimeout(() => {
          printWindow.print()
          printWindow.close()
        }, 1000)
        return
      }
      
      const checkAllImagesLoaded = () => {
        loadedImages++
        if (loadedImages === totalImages) {
          setTimeout(() => {
            printWindow.print()
            printWindow.close()
          }, 500)
        }
      }
      
      images.forEach((img) => {
        if (img.complete) {
          checkAllImagesLoaded()
        } else {
          img.onload = checkAllImagesLoaded
          img.onerror = checkAllImagesLoaded
        }
      })
    }

    toast({
      title: "Sucesso!",
      description: `Preparando impressão de ${selectedPhotoObjects.length} foto(s)`
    })
  }

  const handleMovePhotoToFolder = async (folderId: string | null) => {
    try {
      await movePhotosToFolderMutation.mutateAsync({
        photoIds: selectedPhotos,
        folderId: folderId,
        patientId
      })

      const folderName = folderId 
        ? folders.find(f => f.id === folderId)?.name || 'pasta'
        : 'perfil do paciente'

      toast({
        title: "Sucesso!",
        description: `${selectedPhotos.length} foto(s) movida(s) para ${folderName}`
      })

      setShowMoveToFolderModal(false)
      setSelectedPhotos([])
      setIsSelectionMode(false)
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao mover fotos"
      })
    }
  }

  // Carregar transcrições e anamneses
  useEffect(() => {
    if (patientId) {
      loadTranscriptions()
      loadAnamneses()
    }
  }, [patientId])

  const loadTranscriptions = async () => {
    try {
      const { data, error } = await db
        .from('transcriptions')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTranscriptions(data || [])
    } catch (error) {
      console.error('Error loading transcriptions:', error)
    }
  }

  const loadAnamneses = async () => {
    try {
      const { data, error } = await db
        .from('anamneses')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setAnamneses(data || [])
    } catch (error) {
      console.error('Error loading anamneses:', error)
    }
  }

  // Mostrar erros usando useEffect para evitar loop infinito
  useEffect(() => {
    if (patientError || photosError) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: "Verifique sua conexão"
      })
    }
  }, [patientError, photosError, toast])

  if (!patient && !patientLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="bg-card/95 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-12 px-8">
            <User className="w-12 h-12 text-primary mb-4" />
            <p className="text-black text-center mb-6">
              Paciente não encontrado
            </p>
            <Button
              onClick={() => router.push('/patients')}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
    <CameraTransition isDataReady={!patientLoading} />
    {patient && <div
      className="min-h-screen bg-white relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Overlay de Drag and Drop */}
      {isDraggingFiles && (
        <div className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-40 flex items-center justify-center border-4 border-dashed border-primary pointer-events-none">
          <div className="bg-white rounded-lg p-8 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <Upload className="w-16 h-16 text-primary animate-bounce" />
              <p className="text-2xl font-bold text-primary">Solte as imagens aqui</p>
              <p className="text-gray-600">Suporta JPEG, PNG e WebP</p>
            </div>
          </div>
        </div>
      )}

      {/* Identity bar — global header já provê back/busca; aqui só identidade do paciente */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
              <span className="text-white font-semibold text-sm tracking-wide">
                {patient.name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEditName()
                      if (e.key === 'Escape') setIsEditingName(false)
                    }}
                    className="text-lg font-bold text-gray-800 border-b-2 border-teal-500 outline-none bg-transparent"
                  />
                  <button onClick={handleSaveEditName} className="text-teal-600 hover:text-teal-700">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h1 className="text-lg font-bold text-gray-800 truncate">{patient.name}</h1>
                  <button
                    onClick={handleStartEditName}
                    className="text-gray-300 hover:text-teal-600 transition-colors p-1 rounded hover:bg-gray-100"
                    title="Editar nome"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-gray-100"
                    title="Deletar paciente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-0.5">
                {photoCount} {photoCount === 1 ? 'foto' : 'fotos'} · cadastro {new Date(patient.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>
          <button
            onClick={handleExportPatientPDF}
            title="Exportar tudo como PDF"
            className="h-9 px-4 rounded bg-gradient-to-r from-dourado-500 to-dourado-400 hover:from-dourado-600 hover:to-dourado-500 text-white font-semibold text-sm flex items-center gap-2 shadow-sm transition-all border-0 shrink-0"
          >
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Modal de Confirmação de Delete */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
              <h3 className="text-lg font-semibold text-black">Deletar Paciente</h3>
            </div>
            <p className="text-gray-600 mb-2">
              Tem certeza que deseja deletar <strong>{patient.name}</strong>?
            </p>
            <p className="text-sm text-red-500 mb-6">
              Isso apagará permanentemente todas as fotos, pastas, transcrições e anamneses deste paciente.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDeletePatient}
                disabled={deletePatientMutation.isPending}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
              >
                {deletePatientMutation.isPending ? 'Deletando...' : 'Deletar Tudo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Botão de Transcrição - Sempre visível e flutuante */}
      <div className="fixed bottom-6 right-6 z-40">
        <TranscriptionButton patientId={patientId} />
      </div>

      {/* Tabs para Fotos, Anamnese e Transcrições */}
      <div className="p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="border-b border-gray-200 bg-transparent p-0 h-auto mb-6 w-full justify-start gap-1">
            <TabsTrigger
              value="photos"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 rounded-none px-4 py-2.5 font-semibold text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Fotos
            </TabsTrigger>
            <TabsTrigger
              value="anamnese"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 rounded-none px-4 py-2.5 font-semibold text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Anamnese
            </TabsTrigger>
            <TabsTrigger
              value="transcriptions"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 rounded-none px-4 py-2.5 font-semibold text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Transcrições ({transcriptions.length})
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="bg-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none border-b-2 border-transparent data-[state=active]:border-teal-600 data-[state=active]:text-teal-700 rounded-none px-4 py-2.5 font-semibold text-sm text-gray-500 hover:text-gray-700 transition-colors flex items-center"
            >
              <NotebookPen className="w-4 h-4 mr-1.5" />
              Notas
            </TabsTrigger>
          </TabsList>

          {/* Tab Content: Fotos */}
          <TabsContent value="photos" className="mt-0">
        {/* Toolbar com Botões */}
        <div className="flex items-center gap-4 mb-6">
          {/* Botão da Câmera */}
          <Button
            onClick={() => setShowCamera(true)}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white p-0 shadow-md shadow-teal-500/25 border-0"
          >
            <Camera className="w-6 h-6" />
          </Button>

          {/* Botão Upload */}
          <ImageUpload
            patientId={patientId}
            onUpload={handleImageUpload}
            className="w-12 h-12 rounded-xl p-0"
            folderId={currentFolder}
          />
        </div>

        {/* Header do Grid */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-gray-800">
            {currentFolder ? (
              <span className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-dourado-500" />
                {folders.find(f => f.id === currentFolder)?.name}
              </span>
            ) : 'Fotos Avulsas'}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {isSelectionMode && (
              <>
                <Button
                  onClick={selectAllPhotos}
                  size="sm"
                  className="btn-primary !h-8 !px-3"
                >
                  Selecionar Todas
                </Button>
                <Button
                  onClick={clearSelection}
                  size="sm"
                  className="btn-outline-teal !h-8 !px-3"
                >
                  Limpar
                </Button>
                <Button
                  onClick={handleMoveSelectedPhotos}
                  size="sm"
                  disabled={selectedPhotos.length === 0}
                  className="btn-primary !h-8 !px-3 disabled:opacity-50"
                >
                  Mover ({selectedPhotos.length})
                </Button>
                <Button
                  onClick={handleDeleteSelectedPhotos}
                  size="sm"
                  disabled={selectedPhotos.length === 0}
                  className="h-8 px-3 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 border-0"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Deletar ({selectedPhotos.length})
                </Button>
                <Button
                  onClick={handlePrintSelected}
                  size="sm"
                  disabled={selectedPhotos.length === 0}
                  className="btn-accent !h-8 !px-3 disabled:opacity-50"
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Imprimir ({selectedPhotos.length})
                </Button>
              </>
            )}
            <Button
              onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
              size="sm"
              className="btn-outline-teal !h-8 !px-3"
              title={`Ordenar: ${sortOrder === 'newest' ? 'Últimas primeiro' : 'Primeiras primeiro'}`}
            >
              <ArrowUpDown className="w-4 h-4 mr-1" />
              {sortOrder === 'newest' ? 'Recentes' : 'Antigas'}
            </Button>
            <Button
              onClick={() => setShowCreateFolder(true)}
              size="sm"
              className="btn-primary !h-8 !px-3"
            >
              <FolderPlus className="w-4 h-4 mr-1" />
              Criar Pasta
            </Button>
            <Button
              onClick={toggleSelectionMode}
              size="sm"
              className={isSelectionMode
                ? "h-8 px-3 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold border-0"
                : "btn-outline-teal !h-8 !px-3"
              }
            >
              {isSelectionMode ? 'Cancelar' : 'Selecionar'}
            </Button>
            {currentFolder && (
              <Button
                onClick={() => handleFolderClick(currentFolder)}
                className="btn-outline-teal !h-8 !px-3"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4">
          {/* Loading state para fotos */}
          {photosLoading && <PhotoGridSkeleton count={10} />}

          {/* Loading state para pastas */}
          {!currentFolder && foldersLoading && (
            <>
              {Array.from({ length: 5 }).map((_, i) => (
                <FolderCardSkeleton key={`folder-skeleton-${i}`} />
              ))}
            </>
          )}

          {/* Renderizar fotos da pasta atual ou fotos avulsas ordenadas */}
          {!photosLoading && (currentFolder ? sortedFolderPhotos : sortedUnfolderedPhotos).map((photo, index) => (
            <div
              key={photo.id}
              className={`aspect-square bg-gray-100 rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group ${
                selectedPhotos.includes(photo.id) ? 'ring-4 ring-primary' : ''
              }`}
              onClick={() => {
                if (isSelectionMode) {
                  togglePhotoSelection(photo.id)
                } else {
                  setSelectedPhoto(photo)
                }
              }}
            >
              <LazyImage
                src={photo.image_data}
                alt={`Foto ${index + 1}`}
                className="w-full h-full object-cover"
              />
              <div className="p-2 bg-white">
                <p className="text-xs text-black font-medium">
                  Foto #{index + 1}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(photo.created_at).toLocaleString('pt-BR')}
                </p>
              </div>

              {/* Checkbox de seleção */}
              {isSelectionMode && (
                <div className="absolute top-2 left-2 w-5 h-5 bg-white rounded border-2 border-primary flex items-center justify-center">
                  {selectedPhotos.includes(photo.id) && (
                    <div className="w-3 h-3 bg-primary rounded"></div>
                  )}
                </div>
              )}

              {/* Botões de ação no hover */}
              {!isSelectionMode && (
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white w-8 h-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleMoveToFolder(photo.id)
                  }}
                  title="Mover para pasta"
                >
                  <Folder className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white w-8 h-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDeletePhotoId(photo.id)
                  }}
                  title="Deletar foto"
                >
                  <X className="w-4 h-4" />
                </Button>
                </div>
              )}
            </div>
          ))}

          {/* Pastas no grid (só mostrar se não estiver dentro de uma pasta) */}
          {!currentFolder && !foldersLoading && folders.map((folder) => (
            <div
              key={folder.id}
              className="aspect-square bg-orange-100 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-orange-200 transition-colors relative group"
              onClick={() => handleFolderClick(folder.id)}
            >
              <Folder className="w-12 h-12 text-primary mb-2" />
              <span className="text-sm text-black font-medium">{folder.name}</span>
              <span className="text-xs text-gray-500 mt-1">
                {photos.filter(p => p.folder_id === folder.id).length} fotos
              </span>

              {/* Botões de ação no hover */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <Button
                  size="sm"
                  className="bg-primary hover:bg-primary/90 text-white w-8 h-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFolderRename(folder.id, folder.name)
                  }}
                  title="Editar pasta"
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  className="bg-red-500 hover:bg-red-600 text-white w-8 h-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleFolderDelete(folder.id)
                  }}
                  title="Deletar pasta"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
          </TabsContent>

          {/* Tab Content: Anamnese */}
          <TabsContent value="anamnese" className="mt-0">
            {selectedAnamnese ? (
              <div>
                <Button
                  onClick={() => setSelectedAnamnese(null)}
                  variant="outline"
                  className="mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar para lista
                </Button>
                <AnamneseDocument anamnese={selectedAnamnese} />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Botão para criar nova anamnese */}
                <div className="flex justify-end mb-4">
                  <Button
                    onClick={() => router.push(`/patients/${patientId}/anamnese`)}
                    className="bg-primary hover:bg-primary/90 text-white"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Nova Anamnese
                  </Button>
                </div>

                {anamneses.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">Nenhuma anamnese encontrada</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Clique em "Nova Anamnese" para criar a primeira
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-5 gap-4">
                    {anamneses.map((anamnese, index) => (
                      <div
                        key={anamnese.id}
                        className="aspect-square bg-gradient-to-br from-green-50 to-teal-50 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:scale-105 border border-gray-200 hover:border-primary"
                        onClick={() => setSelectedAnamnese(anamnese)}
                      >
                        <div className="h-full flex flex-col p-4">
                          {/* Ícone e número */}
                          <div className="flex items-center justify-between mb-2">
                            <FileText className="w-6 h-6 text-primary" />
                            <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
                          </div>

                          {/* Nome do paciente */}
                          <div className="flex-1 mb-2">
                            <p className="text-sm font-semibold text-gray-900 mb-1">
                              {anamnese.nome}
                            </p>
                            <p className="text-xs text-gray-600 line-clamp-3">
                              {anamnese.email || anamnese.telefone || 'Ficha completa'}
                            </p>
                          </div>

                          {/* Footer com data */}
                          <div className="mt-auto space-y-1">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(anamnese.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit'
                              })}
                            </div>
                            <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                              Completa
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Tab Content: Transcrições */}
          <TabsContent value="transcriptions" className="mt-0">
            {selectedTranscription ? (
              <div>
                <Button
                  onClick={() => setSelectedTranscription(null)}
                  variant="outline"
                  className="mb-4"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Voltar para lista
                </Button>
                <TranscriptionDocument transcription={selectedTranscription} />
              </div>
            ) : (
              <div className="space-y-4">
                {transcriptions.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">Nenhuma transcrição encontrada</p>
                      <p className="text-sm text-gray-500 mt-2">
                        Use o botão flutuante no canto inferior direito para criar uma transcrição
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-5 gap-4">
                    {transcriptions.map((transcription, index) => (
                      <div
                        key={transcription.id}
                        className="aspect-square bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg overflow-hidden cursor-pointer hover:shadow-lg transition-all hover:scale-105 border border-gray-200 hover:border-primary"
                        onClick={() => setSelectedTranscription(transcription)}
                      >
                        <div className="h-full flex flex-col p-4">
                          {/* Ícone e número */}
                          <div className="flex items-center justify-between mb-2">
                            <FileText className="w-6 h-6 text-primary" />
                            <span className="text-xs font-bold text-gray-400">#{index + 1}</span>
                          </div>

                          {/* Preview do texto */}
                          <div className="flex-1 mb-2">
                            <p className="text-xs text-gray-700 line-clamp-4">
                              {transcription.text || 'Transcrição vazia'}
                            </p>
                          </div>

                          {/* Footer com data e status */}
                          <div className="mt-auto space-y-1">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(transcription.created_at).toLocaleDateString('pt-BR', {
                                day: '2-digit',
                                month: '2-digit'
                              })}
                            </div>
                            {transcription.duration_seconds && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Clock className="w-3 h-3" />
                                {Math.floor(transcription.duration_seconds / 60)}:
                                {(transcription.duration_seconds % 60).toString().padStart(2, '0')}
                              </div>
                            )}
                            <span
                              className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                                transcription.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : transcription.status === 'completed'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {transcription.status === 'active'
                                ? 'Ativa'
                                : transcription.status === 'completed'
                                ? 'Concluída'
                                : 'Erro'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Tab Content: Notas */}
          <TabsContent value="notes" className="mt-0">
            <div className="space-y-4 max-w-2xl">
              <p className="text-sm text-gray-500">Anotações rápidas sobre o paciente. Salvas localmente neste dispositivo.</p>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Escreva observações, lembretes ou informações importantes sobre este paciente..."
                className="w-full h-64 p-4 border-2 border-gray-200 rounded-xl text-gray-800 resize-none focus:outline-none focus:border-primary transition-colors text-sm"
              />
              <button
                onClick={handleSaveNotes}
                className={`px-6 py-2 rounded-lg text-white font-medium transition-colors ${notesSaved ? 'bg-green-500' : 'bg-primary hover:bg-primary/90'}`}
              >
                {notesSaved ? '✓ Salvo!' : 'Salvar Notas'}
              </button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmação: deletar foto individual */}
      {confirmDeletePhotoId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-black mb-2">Deletar Foto</h3>
            <p className="text-gray-600 mb-6">Tem certeza que deseja deletar esta foto? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDeletePhotoId(null)} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium">Cancelar</button>
              <button
                onClick={async () => {
                  await handlePhotoDelete(confirmDeletePhotoId)
                  setConfirmDeletePhotoId(null)
                }}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium"
              >Deletar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação: deletar fotos selecionadas */}
      {showDeleteSelectedConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-black mb-2">Deletar {selectedPhotos.length} Foto(s)</h3>
            <p className="text-gray-600 mb-6">Tem certeza? Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteSelectedConfirm(false)} className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium">Cancelar</button>
              <button
                onClick={confirmDeleteSelectedPhotos}
                disabled={isDeletingSelected}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium disabled:opacity-60"
              >{isDeletingSelected ? 'Deletando...' : 'Deletar Tudo'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal da Câmera */}
      {showCamera && (
        <div className="fixed inset-0 bg-white z-50">
          <div className="h-full flex flex-col">
            {/* Botão Fechar no canto superior direito */}
            <Button
              onClick={() => setShowCamera(false)}
              className="absolute top-2 right-2 sm:top-4 sm:right-4 bg-primary hover:bg-primary/90 text-white rounded-full w-8 h-8 sm:w-10 sm:h-10 p-0 z-10"
            >
              ✕
            </Button>

            {/* Content da Câmera */}
            <div className="flex-1">
              <CameraCapture
                patientId={patientId}
                onPhotoCapture={handlePhotoCapture}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar Pasta */}
      <CreateFolderModal
        isOpen={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreateFolder={handleCreateFolder}
      />

      {/* Modal de Editar Pasta */}
      <EditFolderModal
        isOpen={showEditFolder}
        onClose={() => {
          setShowEditFolder(false)
          setEditingFolder(null)
        }}
        onEditFolder={handleEditFolder}
        currentName={editingFolder?.name || ''}
        isLoading={updateFolderMutation.isPending}
      />

      {/* Modal de Foto em Tela Cheia */}
      {selectedPhoto && (() => {
        const currentPhotos = currentFolder ? sortedFolderPhotos : sortedUnfolderedPhotos
        const currentIndex = currentPhotos.findIndex(p => p.id === selectedPhoto.id)
        const hasPrevious = currentIndex > 0
        const hasNext = currentIndex < currentPhotos.length - 1

        return (
          <div className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden">
            {/* Botões no canto superior direito */}
            <div className={`absolute top-4 right-4 flex gap-2 z-10 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
              <Button
                onClick={() => handleAIEnhance(selectedPhoto)}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full w-10 h-10 p-0 shadow-lg"
                title="Aprimorar sorriso com IA"
              >
                <Sparkles className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => handleEditPhoto(selectedPhoto)}
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-full w-10 h-10 p-0"
                title="Editar foto"
              >
                <Pencil className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => handleComparePhoto(selectedPhoto)}
                className="bg-primary hover:bg-primary/90 text-white rounded-full w-10 h-10 p-0"
                title="Comparar foto"
              >
                <GitCompare className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-full w-10 h-10 p-0"
                title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              >
                <Maximize className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => setSelectedPhoto(null)}
                className="bg-destructive hover:bg-destructive/90 text-white rounded-full w-10 h-10 p-0"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Controles de Zoom */}
            <div className={`absolute top-4 left-4 flex flex-col gap-2 z-10 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
              <Button
                onClick={zoomIn}
                className="bg-gray-600/80 hover:bg-gray-700/90 text-white rounded-full w-10 h-10 p-0"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-5 h-5" />
              </Button>
              <Button
                onClick={zoomOut}
                className="bg-gray-600/80 hover:bg-gray-700/90 text-white rounded-full w-10 h-10 p-0"
                title="Diminuir zoom"
              >
                <ZoomOut className="w-5 h-5" />
              </Button>
              <Button
                onClick={resetZoom}
                className="bg-gray-600/80 hover:bg-gray-700/90 text-white px-3 py-1 text-xs"
                title="Reset zoom"
              >
                {Math.round(photoZoom * 100)}%
              </Button>
            </div>

            {/* Botão Anterior */}
            {hasPrevious && (
              <Button
                onClick={() => setSelectedPhoto(currentPhotos[currentIndex - 1])}
                className={`absolute left-4 top-1/2 transform -translate-y-1/2 bg-[#448787]/75 hover:bg-[#448787]/90 text-white rounded-full w-12 h-12 p-0 z-10 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
              >
                <ArrowLeft className="w-6 h-6" />
              </Button>
            )}

            {/* Botão Próximo */}
            {hasNext && (
              <Button
                onClick={() => setSelectedPhoto(currentPhotos[currentIndex + 1])}
                className={`absolute right-4 top-1/2 transform -translate-y-1/2 bg-[#448787]/75 hover:bg-[#448787]/90 text-white rounded-full w-12 h-12 p-0 z-10 transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
              >
                <ArrowLeft className="w-6 h-6 rotate-180" />
              </Button>
            )}

            {/* Imagem em Tela Cheia - Com zoom e pan */}
            <div className="w-full h-full flex items-center justify-center overflow-hidden">
              <img
                src={selectedPhoto.image_data}
                alt="Foto em tela cheia"
                className={`h-full w-auto object-contain transition-transform duration-200 select-none ${
                  photoZoom > 1 ? 'cursor-grab' : 'cursor-default'
                } ${isDragging ? 'cursor-grabbing' : ''}`}
                style={{
                  transform: `scale(${photoZoom}) translate(${panPosition.x / photoZoom}px, ${panPosition.y / photoZoom}px)`,
                  transformOrigin: 'center center',
                  maxWidth: '100%'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                draggable={false}
              />
            </div>

            {/* Informações da Foto */}
            <div className={`absolute bottom-4 left-4 text-white text-sm bg-black/50 px-3 py-2 rounded transition-opacity duration-300 ${isFullscreen ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
              <div>{new Date(selectedPhoto.created_at).toLocaleDateString('pt-BR')}</div>
            </div>

            {/* Indicador de instruções em fullscreen */}
            {isFullscreen && (
              <div className="absolute bottom-4 right-4 text-white text-xs bg-black/50 px-3 py-2 rounded opacity-0 hover:opacity-100 transition-opacity duration-300">
                <div>Tecla F: Alternar tela cheia</div>
                <div>ESC: Sair da tela cheia</div>
                <div>← →: Navegar fotos</div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Modal para Mover Fotos */}
      {showMoveToFolderModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-black mb-4">
              Mover {selectedPhotos.length} Foto(s)
            </h3>

            <div className="space-y-3 mb-6">
              {/* Opção para mover para o perfil (sem pasta) */}
              <Button
                onClick={() => handleMovePhotoToFolder(null)}
                className="w-full justify-start bg-accent hover:bg-accent/80 text-primary"
              >
                <User className="w-4 h-4 mr-2" />
                Perfil do Paciente (sem pasta)
              </Button>
              
              {/* Pastas existentes */}
              {folders.map((folder) => (
                <Button
                  key={folder.id}
                  onClick={() => handleMovePhotoToFolder(folder.id)}
                  className="w-full justify-start bg-muted hover:bg-muted/80 text-foreground"
                >
                  <Folder className="w-4 h-4 mr-2" />
                  {folder.name}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowMoveToFolderModal(false)
                  setSelectedPhotos([])
                }}
                className="flex-1 bg-gray-500 hover:bg-gray-600 text-white"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Comparação de Fotos */}
      {showComparison && comparisonPhoto && (
        <PhotoComparison
          isOpen={showComparison}
          onClose={() => {
            setShowComparison(false)
            setComparisonPhoto(null)
          }}
          mainPhoto={comparisonPhoto}
          allPhotos={photos}
          folders={folders}
          currentFolder={currentFolder}
          folderPhotos={folderPhotos}
          unfolderedPhotos={unfolderedPhotos}
          onFolderClick={handleComparisonFolderClick}
          onBackToFolders={handleComparisonBackToFolders}
        />
      )}

      {/* Modal de Edição de Foto */}
      {showPhotoEditor && editingPhoto && (
        <PhotoEditor
          isOpen={showPhotoEditor}
          onClose={() => {
            setShowPhotoEditor(false)
            setEditingPhoto(null)
          }}
          photo={editingPhoto}
          onSaveEdit={handleSaveEditedPhoto}
        />
      )}

      {/* Loading IA */}
      {isProcessingAI && selectedPhoto && (
        <AIProcessingLoader imageUrl={selectedPhoto.image_data} />
      )}

      {/* Modal de Comparação Before/After com IA */}
      {showAIComparison && aiEnhancedImage && selectedPhoto && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Header com botões */}
          <div className="absolute top-4 left-0 right-0 flex justify-between items-center px-6 z-10">
            <div className="flex items-center gap-3 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-full">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              <span className="text-white font-semibold">Resultado da IA</span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSaveAIEnhanced}
                className="bg-primary hover:bg-primary/90 text-white px-6"
              >
                Salvar Resultado
              </Button>
              <Button
                onClick={() => {
                  setShowAIComparison(false)
                  setAiEnhancedImage(null)
                }}
                className="bg-destructive hover:bg-destructive/90 text-white rounded-full w-10 h-10 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Before/After Slider */}
          <div className="flex-1 mt-20">
            <BeforeAfterSlider
              beforeImage={selectedPhoto.image_data}
              afterImage={aiEnhancedImage}
              altBefore="Foto original"
              altAfter="Foto aprimorada pela IA"
            />
          </div>
        </div>
      )}
    </div>}
    </>
  )
}