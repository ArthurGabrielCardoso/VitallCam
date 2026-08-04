'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { deleteMediaFromR2, extractR2Key } from '@/lib/r2-client'

export interface VideoRow {
  id: string
  patient_id: string
  folder_id: string | null
  video_data: string | null
  storage_path: string | null
  video_url: string | null
  duration: number
  size_bytes: number | null
  mime_type: string | null
  created_at: string
}

export const getVideoSrc = (v: VideoRow): string =>
  v.video_url || v.video_data || ''

export const useFolderVideos = (folderId: string | null) => {
  return useQuery({
    queryKey: ['folder-videos', folderId],
    queryFn: async (): Promise<VideoRow[]> => {
      if (!folderId) return []
      const { data, error } = await (supabase as any)
        .from('videos')
        .select('*')
        .eq('folder_id', folderId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as VideoRow[]
    },
    enabled: !!folderId,
  })
}

export const useUnfolderedVideos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['unfoldered-videos', patientId],
    queryFn: async (): Promise<VideoRow[]> => {
      if (!patientId) return []
      const { data, error } = await (supabase as any)
        .from('videos')
        .select('*')
        .eq('patient_id', patientId)
        .is('folder_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []) as VideoRow[]
    },
    enabled: !!patientId,
  })
}

export const useDeleteVideo = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (video: VideoRow) => {
      const { data, error } = await (supabase as any)
        .from('videos')
        .delete()
        .eq('id', video.id)
        .select('id')
        .single()

      if (error) throw error
      if (!data?.id) throw new Error('Vídeo não encontrado ou sem permissão para excluir')

      // Vídeos longos ficam no Storage; a linha já foi removida, então uma falha
      // de limpeza não impede que o vídeo desapareça corretamente da interface.
      if (video.storage_path) {
        if (extractR2Key(video.storage_path) || extractR2Key(video.video_url)) {
          deleteMediaFromR2(video.storage_path || video.video_url)
            .catch(cleanupError => console.error('Erro ao limpar arquivo R2 do vídeo:', cleanupError))
        } else {
          const { error: storageError } = await (supabase as any).storage
            .from('patient-videos')
            .remove([video.storage_path])
          if (storageError) console.error('Erro ao limpar arquivo do vídeo:', storageError)
        }
      }

      return video
    },
    onSuccess: (video) => {
      queryClient.invalidateQueries({ queryKey: ['unfoldered-videos', video.patient_id] })
      if (video.folder_id) {
        queryClient.invalidateQueries({ queryKey: ['folder-videos', video.folder_id] })
      }
    },
  })
}
