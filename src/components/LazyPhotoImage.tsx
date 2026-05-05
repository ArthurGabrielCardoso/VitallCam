'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Photo } from '@/lib/types'

interface LazyPhotoImageProps {
  photo: Photo
  className?: string
  onImageReady?: (src: string) => void
}

// Extrai o path do Storage a partir de uma signed URL do Supabase
function extractStoragePath(signedUrl: string): string | null {
  try {
    const url = new URL(signedUrl)
    // Formato: /storage/v1/object/sign/patient-photos/patient_id/file.jpg
    const match = url.pathname.match(/\/storage\/v1\/object\/sign\/(patient-photos\/.+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function isStorageUrl(value: string): boolean {
  return value.startsWith('https://') && value.includes('/storage/v1/object/')
}

function isBase64(value: string): boolean {
  return value.startsWith('data:')
}

export default function LazyPhotoImage({ photo, className = '', onImageReady }: LazyPhotoImageProps) {
  const queryClient = useQueryClient()
  const containerRef = useRef<HTMLDivElement>(null)

  // Já tem dado se veio direto na prop OU se o batch-loader já populou o cache
  const hasCached = !!photo.image_data || !!queryClient.getQueryData(['photo-data', photo.id])
  const [isVisible, setIsVisible] = useState(hasCached)

  useEffect(() => {
    if (hasCached) return
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect() } },
      { rootMargin: '100px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.id])

  // Busca image_data quando visível e ainda não carregado (fallback individual se batch-loader não rodou)
  const { data: fetchedData } = useQuery({
    queryKey: ['photo-data', photo.id],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('photos')
        .select('image_data')
        .eq('id', photo.id)
        .single()
      if (error) throw error
      return (data as any)?.image_data ?? null
    },
    enabled: isVisible && !photo.image_data,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 10,
  })

  const rawSrc = photo.image_data || fetchedData || null

  // Se for URL assinada do Storage, gera nova URL quando necessário
  const { data: activeSrc } = useQuery({
    queryKey: ['photo-signed-url', photo.id, rawSrc?.slice(0, 60)],
    queryFn: async (): Promise<string> => {
      if (!rawSrc) return ''
      if (isBase64(rawSrc)) return rawSrc // base64 não expira

      const path = extractStoragePath(rawSrc)
      if (!path) return rawSrc // URL externa, usa direto

      // Renova a URL assinada por mais 1h
      const { data, error } = await (supabase as any).storage
        .from('patient-photos')
        .createSignedUrl(path.replace('patient-photos/', ''), 60 * 60)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!rawSrc,
    staleTime: 1000 * 55 * 60, // considera válida por 55 min (5 min antes de expirar)
    gcTime: 1000 * 60 * 60,
    initialData: rawSrc && !isStorageUrl(rawSrc) ? rawSrc : undefined,
  })

  const src = activeSrc || rawSrc

  useEffect(() => {
    if (src) onImageReady?.(src)
  }, [src, onImageReady])

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={`w-full h-full transition-opacity duration-300 ${className}`}
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-gray-200" />
      )}
    </div>
  )
}
