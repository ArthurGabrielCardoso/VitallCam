'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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
