'use client'

import { useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Photo } from '@/lib/types'
import { useCreateFolder } from '@/hooks/useFolders'
import { Button } from '@/components/ui/button'
import { Upload, Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'

interface ImageUploadProps {
  patientId: string
  onUpload: (photos: Photo[]) => void
  className?: string
  folderId?: string | null
}

export default function ImageUpload({ patientId, onUpload, className = '', folderId = null }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()
  const createFolderMutation = useCreateFolder()
  const queryClient = useQueryClient()

  const handleFileSelect = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    // Validar tipos de arquivo
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const invalidFiles = Array.from(files).filter(file => !validTypes.includes(file.type))
    
    if (invalidFiles.length > 0) {
      toast({
        variant: "destructive",
        title: "Tipos de arquivo inválidos",
        description: "Apenas arquivos JPEG, PNG e WebP são permitidos"
      })
      return
    }

    try {
      toast({
        title: "Processando...",
        description: `Carregando ${files.length} imagem(ns)`
      })

      let targetFolderId = folderId

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

      const uploadPromises = Array.from(files).map(async (file) => {
        return new Promise<Photo>((resolve, reject) => {
          const reader = new FileReader()
          
          reader.onload = async (e) => {
            try {
              const imageData = e.target?.result as string
              
              console.log('Inserindo foto no Supabase...')
              console.log('Patient ID:', patientId)
              console.log('Folder ID:', targetFolderId)
              console.log('Image data length:', imageData.length)

              const { data, error } = await supabase
                .from('photos')
                .insert({
                  patient_id: patientId,
                  image_data: imageData,
                  folder_id: targetFolderId
                })
                .select('id, patient_id, image_data, folder_id, created_at')
                .single()

              if (error) {
                console.error('Erro no Supabase:', error)
                throw error
              }
              
              console.log('Foto inserida com sucesso:', data.id)
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

      const uploadedPhotos = await Promise.all(uploadPromises)
      
      console.log('Upload concluído:', uploadedPhotos.length, 'fotos')
      
      // Invalidar queries para forçar atualização da UI
      queryClient.invalidateQueries({ queryKey: ['photos', patientId] })
      queryClient.invalidateQueries({ queryKey: ['folders', patientId] })
      queryClient.invalidateQueries({ queryKey: ['unfoldered-photos', patientId] })
      if (targetFolderId) {
        queryClient.invalidateQueries({ queryKey: ['folder-photos', targetFolderId] })
      }
      
      // Chamar callback de upload
      onUpload(uploadedPhotos)
      
      toast({
        title: "Sucesso!",
        description: `${uploadedPhotos.length} imagem(ns) carregada(s) com sucesso`
      })

    } catch (error) {
      console.error('Erro no upload:', error)
      toast({
        variant: "destructive",
        title: "Erro no upload",
        description: "Falha ao carregar uma ou mais imagens"
      })
    } finally {
      // Limpar o input para permitir selecionar os mesmos arquivos novamente
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        onClick={handleFileSelect}
        className={`bg-secondary hover:bg-secondary/90 text-white ${className}`}
        disabled={createFolderMutation.isPending}
      >
        {createFolderMutation.isPending ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Upload className="w-6 h-6" />
        )}
      </Button>
    </>
  )
}