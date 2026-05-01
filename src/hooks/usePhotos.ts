'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Photo, NewPhoto } from '@/lib/types'

export const usePhotos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['photos', patientId],
    queryFn: async (): Promise<Photo[]> => {
      if (!patientId) throw new Error('Patient ID is required')

      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
    enabled: !!patientId,
  })
}

// Hook para buscar fotos que NÃO estão em pastas (fotos avulsas)
export const useUnfolderedPhotos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['unfoldered-photos', patientId],
    queryFn: async (): Promise<Photo[]> => {
      if (!patientId) throw new Error('Patient ID is required')
      
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('patient_id', patientId)
        .is('folder_id', null)

      if (error) throw error
      return data || []
    },
    enabled: !!patientId,
  })
}

export const useAddPhoto = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (newPhoto: NewPhoto): Promise<Photo> => {
      const { data, error } = await supabase
        .from('photos')
        .insert(newPhoto)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (newPhoto) => {
      // Atualizar cache imediatamente
      queryClient.setQueryData(['photos', newPhoto.patient_id], (old: Photo[] = []) => {
        return [newPhoto, ...old]
      })
    },
  })
}

export const useDeletePhoto = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (photoId: string): Promise<void> => {
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId)

      if (error) throw error
    },
    onSuccess: (_, photoId) => {
      // Atualizar cache diretamente sem invalidar (evita reload)
      queryClient.setQueriesData({ queryKey: ['photos'] }, (oldData: Photo[] | undefined) => {
        if (!oldData) return oldData
        return oldData.filter(photo => photo.id !== photoId)
      })

      queryClient.setQueriesData({ queryKey: ['unfoldered-photos'] }, (oldData: Photo[] | undefined) => {
        if (!oldData) return oldData
        return oldData.filter(photo => photo.id !== photoId)
      })

      queryClient.setQueriesData({ queryKey: ['folder-photos'] }, (oldData: Photo[] | undefined) => {
        if (!oldData) return oldData
        return oldData.filter(photo => photo.id !== photoId)
      })
    },
  })
}

export const useMovePhotosToFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ photoIds, folderId }: { photoIds: string[], folderId: string | null }): Promise<void> => {
      const { error } = await supabase
        .from('photos')
        .update({ folder_id: folderId })
        .in('id', photoIds)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidar todos os caches relacionados a fotos
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['unfoldered-photos'] })
      queryClient.invalidateQueries({ queryKey: ['folder-photos'] })
    },
  })
}