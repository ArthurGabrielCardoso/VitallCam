'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Photo, NewPhoto } from '@/lib/types'

// Realtime: escuta inserções/atualizações via Postgres Changes (WAL) — funciona entre dispositivos sem broadcast manual
export const usePhotosBroadcast = (patientId: string | null) => {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!patientId) return

    const channel = supabase
      .channel(`photos-realtime:${patientId}`)
      // Mantém broadcast legado para compatibilidade
      .on('broadcast', { event: 'photos-changed' }, () => {
        queryClient.invalidateQueries({ queryKey: ['photos', patientId] })
        queryClient.invalidateQueries({ queryKey: ['unfoldered-photos', patientId] })
        queryClient.invalidateQueries({ queryKey: ['folder-photos'] })
        queryClient.invalidateQueries({ queryKey: ['folders', patientId] })
      })
      // Postgres Changes: foto nova → aparece na hora sem precisar de broadcast manual
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos', filter: `patient_id=eq.${patientId}` }, (payload) => {
        const photo = payload.new as Photo
        queryClient.setQueryData(['photos', patientId], (old: Photo[] = []) => {
          if (old.some(p => p.id === photo.id)) return old
          return [{ id: photo.id, patient_id: photo.patient_id, folder_id: photo.folder_id, created_at: photo.created_at }, ...old]
        })
        if (photo.folder_id) {
          queryClient.setQueryData(['folder-photos', photo.folder_id], (old: Photo[] = []) => {
            if (old.some(p => p.id === photo.id)) return old
            return [{ id: photo.id, patient_id: photo.patient_id, folder_id: photo.folder_id, created_at: photo.created_at }, ...old]
          })
        } else {
          queryClient.setQueryData(['unfoldered-photos', patientId], (old: Photo[] = []) => {
            if (old.some(p => p.id === photo.id)) return old
            return [{ id: photo.id, patient_id: photo.patient_id, folder_id: photo.folder_id, created_at: photo.created_at }, ...old]
          })
        }
      })
      // Foto atualizada (ex: enhancement concluiu) → atualiza cache de image_data
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'photos', filter: `patient_id=eq.${patientId}` }, (payload) => {
        const photo = payload.new as Photo
        if (photo.image_data) {
          queryClient.setQueryData(['photo-data', photo.id], photo.image_data)
        }
      })
      // Nova pasta criada → atualiza lista de pastas
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'folders', filter: `patient_id=eq.${patientId}` }, () => {
        queryClient.invalidateQueries({ queryKey: ['folders', patientId] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [patientId, queryClient])
}

// Carrega image_data de um lote de fotos em batches de 8 — evita N+1 para álbuns com fotos antigas (base64)
export const useBatchPhotoLoader = (photoIds: string[]) => {
  const queryClient = useQueryClient()
  const loadedRef = useRef(new Set<string>())

  const key = photoIds.join(',')

  useEffect(() => {
    if (!key) return

    const toLoad = photoIds.filter(id =>
      !loadedRef.current.has(id) && !queryClient.getQueryData(['photo-data', id])
    )
    if (toLoad.length === 0) return

    toLoad.forEach(id => loadedRef.current.add(id))

    let cancelled = false
    const load = async () => {
      for (let i = 0; i < toLoad.length; i += 8) {
        if (cancelled) return
        const batch = toLoad.slice(i, i + 8)
        const { data } = await supabase.from('photos').select('id, image_data').in('id', batch)
        if (cancelled || !data) continue
        data.forEach(row => {
          if (row.image_data) queryClient.setQueryData(['photo-data', row.id], row.image_data)
        })
      }
    }
    load()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, queryClient])
}

export const usePhotos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['photos', patientId],
    queryFn: async (): Promise<Photo[]> => {
      if (!patientId) throw new Error('Patient ID is required')

      // Sem image_data: resposta leve, fotos carregam individualmente sob demanda
      const { data, error } = await supabase
        .from('photos')
        .select('id, patient_id, folder_id, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data || []) as Photo[]
    },
    enabled: !!patientId,
  })
}

export const useUnfolderedPhotos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['unfoldered-photos', patientId],
    queryFn: async (): Promise<Photo[]> => {
      if (!patientId) throw new Error('Patient ID is required')

      const { data, error } = await supabase
        .from('photos')
        .select('id, patient_id, folder_id, created_at')
        .eq('patient_id', patientId)
        .is('folder_id', null)

      if (error) throw error
      return (data || []) as Photo[]
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
