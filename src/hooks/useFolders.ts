'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Folder } from '@/lib/types'

export const useFolders = (patientId: string | null) => {
  return useQuery({
    queryKey: ['folders', patientId],
    queryFn: async (): Promise<Folder[]> => {
      if (!patientId) throw new Error('Patient ID is required')

      const { data, error } = await supabase
        .from('folders')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!patientId,
  })
}

export const useCreateFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, patient_id }: { name: string, patient_id: string }): Promise<Folder> => {
      // Verificar se a pasta já existe
      const { data: existingFolders, error: checkError } = await supabase
        .from('folders')
        .select('*')
        .eq('name', name)
        .eq('patient_id', patient_id)

      if (checkError) {
        throw checkError
      }

      // Se a pasta já existe, retornar a primeira encontrada
      if (existingFolders && existingFolders.length > 0) {
        return existingFolders[0]
      }

      // Criar nova pasta
      const { data, error } = await supabase
        .from('folders')
        .insert({ name, patient_id })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (newFolder) => {
      // Atualizar cache de pastas
      queryClient.setQueryData(['folders', newFolder.patient_id], (old: Folder[] = []) => {
        return [newFolder, ...old]
      })
    },
  })
}

export const useFolderPhotos = (folderId: string | null) => {
  return useQuery({
    queryKey: ['folder-photos', folderId],
    queryFn: async () => {
      if (!folderId) return []
      
      // Buscar sem ordem definida - a ordenação será feita no frontend
      // Sem image_data: resposta leve, imagens carregam individualmente
      const { data, error } = await supabase
        .from('photos')
        .select('id, patient_id, folder_id, created_at')
        .eq('folder_id', folderId)

      if (error) throw error
      return (data || []) as import('@/lib/types').Photo[]
    },
    enabled: !!folderId,
  })
}

export const useDeleteFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (folderId: string): Promise<void> => {
      // Primeiro mover todas as fotos para fora da pasta (folder_id = null)
      await supabase
        .from('photos')
        .update({ folder_id: null })
        .eq('folder_id', folderId)

      // Então deletar a pasta
      const { error } = await supabase
        .from('folders')
        .delete()
        .eq('id', folderId)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidar todos os caches
      queryClient.invalidateQueries({ queryKey: ['folders'] })
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['unfoldered-photos'] })
      queryClient.invalidateQueries({ queryKey: ['folder-photos'] })
    },
  })
}

export const useUpdateFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string, name: string }): Promise<Folder> => {
      const { data, error } = await supabase
        .from('folders')
        .update({ name })
        .eq('id', folderId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (updatedFolder) => {
      // Atualizar cache de pastas
      queryClient.setQueryData(['folders', updatedFolder.patient_id], (old: Folder[] = []) => {
        return old.map(folder => 
          folder.id === updatedFolder.id ? updatedFolder : folder
        )
      })
    },
  })
}