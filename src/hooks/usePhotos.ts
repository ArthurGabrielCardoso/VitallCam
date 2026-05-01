'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Photo, NewPhoto } from '@/lib/types'

// Broadcast: escuta mudanças de fotos via pub/sub leve (não usa WAL do Postgres)
export const usePhotosBroadcast = (patientId: string | null) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!patientId) return

    const channel = supabase
      .channel(`photos-broadcast:${patientId}`)
      .on('broadcast', { event: 'photos-changed' }, () => {
        queryClient.invalidateQueries({ queryKey: ['photos', patientId] })
        queryClient.invalidateQueries({ queryKey: ['unfoldered-photos', patientId] })
        queryClient.invalidateQueries({ queryKey: ['folder-photos'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [patientId, queryClient])
}

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

const broadcastPhotosChanged = async (patientId: string) => {
  await supabase.channel(`photos-broadcast:${patientId}`).send({
    type: 'broadcast',
    event: 'photos-changed',
    payload: {},
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
      // Atualiza cache local imediatamente (mesmo dispositivo)
      queryClient.setQueryData(['photos', newPhoto.patient_id], (old: Photo[] = []) => {
        return [newPhoto, ...old]
      })
      queryClient.setQueryData(['unfoldered-photos', newPhoto.patient_id], (old: Photo[] = []) => {
        return [newPhoto, ...old]
      })
      // Broadcast para outros dispositivos conectados
      broadcastPhotosChanged(newPhoto.patient_id)
    },
  })
}

export const useDeletePhoto = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ photoId, patientId }: { photoId: string, patientId: string }): Promise<{ photoId: string, patientId: string }> => {
      const { error } = await supabase
        .from('photos')
        .delete()
        .eq('id', photoId)

      if (error) throw error
      return { photoId, patientId }
    },
    onSuccess: ({ photoId, patientId }) => {
      queryClient.setQueriesData({ queryKey: ['photos'] }, (old: Photo[] | undefined) =>
        old ? old.filter(p => p.id !== photoId) : old)
      queryClient.setQueriesData({ queryKey: ['unfoldered-photos'] }, (old: Photo[] | undefined) =>
        old ? old.filter(p => p.id !== photoId) : old)
      queryClient.setQueriesData({ queryKey: ['folder-photos'] }, (old: Photo[] | undefined) =>
        old ? old.filter(p => p.id !== photoId) : old)
      broadcastPhotosChanged(patientId)
    },
  })
}

export const useMovePhotosToFolder = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ photoIds, folderId, patientId }: { photoIds: string[], folderId: string | null, patientId: string }): Promise<string> => {
      const { error } = await supabase
        .from('photos')
        .update({ folder_id: folderId })
        .in('id', photoIds)

      if (error) throw error
      return patientId
    },
    onSuccess: (patientId) => {
      queryClient.invalidateQueries({ queryKey: ['photos'] })
      queryClient.invalidateQueries({ queryKey: ['unfoldered-photos'] })
      queryClient.invalidateQueries({ queryKey: ['folder-photos'] })
      broadcastPhotosChanged(patientId)
    },
  })
}
