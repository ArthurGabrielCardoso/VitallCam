'use client'

import { useState, useEffect } from 'react'
import { X, Film, Loader2, Play, ChevronLeft, Sparkles, AlertCircle, Download, Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { VideoRow, getVideoSrc } from '@/hooks/useVideos'

interface Props {
  patientId: string
  onClose: () => void
  onSaved?: () => void
}

interface Crop {
  tooth_count: number
  image_data: string
  grouped: boolean
  time_s?: number
}

type Step = 'pick' | 'processing' | 'result'

function formatDuration(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function VideoFrameExtractor({ patientId, onClose, onSaved }: Props) {
  const { toast } = useToast()

  const [step, setStep]                   = useState<Step>('pick')
  const [videos, setVideos]               = useState<VideoRow[]>([])
  const [loadingVideos, setLoadingVideos] = useState(true)
  const [thumbnails, setThumbnails]       = useState<Record<string, string>>({})
  const [selectedVideo, setSelectedVideo] = useState<VideoRow | null>(null)

  const [toothCount, setToothCount]       = useState(0)
  const [crops, setCrops]                 = useState<Crop[]>([])
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [savingCropIdx, setSavingCropIdx] = useState<number | null>(null)
  const [savingAll, setSavingAll]         = useState(false)

  useEffect(() => {
    setLoadingVideos(true)
    ;(supabase as any)
      .from('videos')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .then(({ data, error }: any) => {
        if (!error) setVideos(data || [])
        setLoadingVideos(false)
      })
  }, [patientId])

  useEffect(() => {
    videos.forEach(v => {
      if (thumbnails[v.id]) return
      const src = getVideoSrc(v)
      if (!src) return
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.muted = true
      el.playsInline = true
      el.crossOrigin = 'anonymous'
      el.src = src
      el.onloadeddata = () => {
        try { el.currentTime = Math.min(0.5, el.duration / 2) } catch { /* noop */ }
      }
      el.onseeked = () => {
        const c = document.createElement('canvas')
        c.width = el.videoWidth || 320
        c.height = el.videoHeight || 240
        c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height)
        setThumbnails(prev => ({ ...prev, [v.id]: c.toDataURL('image/jpeg', 0.7) }))
      }
    })
  }, [videos]) // eslint-disable-line react-hooks/exhaustive-deps

  const getPublicUrl = async (video: VideoRow): Promise<string> => {
    const src = getVideoSrc(video)
    if (!src.startsWith('data:')) return src

    const mime = video.mime_type || 'video/mp4'
    const ext  = mime.includes('mp4') ? 'mp4' : 'webm'
    const blob = await (await fetch(src)).blob()
    const path = `temp/${video.id}-${Date.now()}.${ext}`

    const { error } = await (supabase as any).storage
      .from('patient-videos')
      .upload(path, blob, { contentType: mime, upsert: true })
    if (error) throw new Error(`Upload temporário falhou: ${error.message}`)

    const { data } = (supabase as any).storage.from('patient-videos').getPublicUrl(path)
    return data.publicUrl
  }

  const processVideo = async (video: VideoRow) => {
    setSelectedVideo(video)
    setStep('processing')
    setProcessingError(null)
    setCrops([])

    try {
      const publicUrl = await getPublicUrl(video)

      const res  = await fetch('/api/process-teeth', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ video_url: publicUrl, patient_id: patientId }),
      })
      const data = await res.json()

      if (!res.ok || data.error) throw new Error(data.error || 'Erro ao processar')

      setToothCount(data.tooth_count || 0)
      setCrops((data.crops || []))  // já vem invertido do backend (reverse=True)
      setStep('result')

    } catch (err: any) {
      setProcessingError(err?.message || 'Erro desconhecido')
      setStep('result')
    }
  }

  const saveCropAsPhoto = async (crop: Crop, idx: number) => {
    setSavingCropIdx(idx)
    try {
      const { error } = await (supabase as any).from('photos').insert({
        patient_id: patientId,
        image_data: crop.image_data,
        folder_id:  null,
      })
      if (error) throw error
      toast({ title: 'Foto salva!', description: `Foto ${idx + 1} salva no álbum.` })
      onSaved?.()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar foto', description: err?.message })
    } finally {
      setSavingCropIdx(null)
    }
  }

  const saveAllCrops = async () => {
    setSavingAll(true)
    try {
      const rows = crops.map(c => ({
        patient_id: patientId,
        image_data: c.image_data,
        folder_id:  null,
      }))
      const { error } = await (supabase as any).from('photos').insert(rows)
      if (error) throw error
      toast({ title: 'Fotos salvas!', description: `${crops.length} fotos no álbum.` })
      onSaved?.()
      onClose()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err?.message })
    } finally {
      setSavingAll(false)
    }
  }

  const goBack = () => {
    setStep('pick')
    setSelectedVideo(null)
    setProcessingError(null)
    setCrops([])
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex flex-col">

      <div className="flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-white/10">
        <div className="flex items-center gap-2 text-white">
          {(step === 'processing' || step === 'result') && (
            <button onClick={goBack} disabled={step === 'processing'} className="text-white/60 hover:text-white mr-1 disabled:opacity-30">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <Sparkles className="w-5 h-5 text-violet-400" />
          <span className="font-semibold">
            {step === 'pick'       && 'Selecionar vídeo do álbum'}
            {step === 'processing' && 'Processando vídeo…'}
            {step === 'result'     && (processingError ? 'Erro ao processar' : `${crops.length} foto(s) extraída(s)`)}
          </span>
        </div>
        <button onClick={onClose} disabled={step === 'processing'} className="text-white/60 hover:text-white p-1 disabled:opacity-30">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {step === 'pick' && (
          <>
            {loadingVideos && (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
              </div>
            )}
            {!loadingVideos && videos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/40">
                <Film className="w-16 h-16" />
                <p>Nenhum vídeo encontrado no álbum deste paciente</p>
              </div>
            )}
            {!loadingVideos && videos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {videos.map(v => (
                  <button
                    key={v.id}
                    onClick={() => processVideo(v)}
                    className="group relative rounded-xl overflow-hidden border-2 border-transparent hover:border-violet-400 transition-all bg-neutral-800 aspect-video flex items-center justify-center cursor-pointer"
                  >
                    {thumbnails[v.id]
                      ? <img src={thumbnails[v.id]} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      : <Film className="w-10 h-10 text-white/30" />
                    }
                    <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <Play className="w-10 h-10 text-white drop-shadow-lg" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-white text-xs flex justify-between">
                      <span>{new Date(v.created_at).toLocaleDateString('pt-BR')}</span>
                      <span>{formatDuration(v.duration)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-white">
            <Sparkles className="w-16 h-16 text-violet-400 animate-pulse" />
            <div className="text-center space-y-2">
              <p className="text-lg font-semibold">Extraindo fotos dos dentes…</p>
              <p className="text-white/50 text-sm">Detectando · Selecionando melhores frames · Recortando</p>
              <p className="text-white/30 text-xs">~25-35s em paralelo</p>
            </div>
            <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
          </div>
        )}

        {step === 'result' && (
          <>
            {processingError && (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <AlertCircle className="w-12 h-12 text-red-400" />
                <p className="text-white font-semibold">Erro ao processar</p>
                <p className="text-white/60 text-sm text-center max-w-sm">{processingError}</p>
                <Button onClick={goBack} variant="outline" className="text-white border-white/20">
                  Tentar outro vídeo
                </Button>
              </div>
            )}

            {!processingError && crops.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-white/40">
                <Camera className="w-16 h-16" />
                <p>Nenhuma foto extraída</p>
                <p className="text-xs text-center max-w-sm">Os dentes podem estar fora do quadro ou sem boa qualidade</p>
              </div>
            )}

            {!processingError && crops.length > 0 && (
              <div className="flex flex-col gap-4">
                <p className="text-white/60 text-sm">
                  {toothCount} dente(s) detectado(s) · {crops.length} foto(s) recortada(s)
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {crops.map((crop, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="relative rounded-xl overflow-hidden bg-neutral-900 border border-white/10">
                        <img
                          src={crop.image_data}
                          alt={`Foto ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1.5 left-1.5 bg-black/70 text-white/90 text-[10px] px-2 py-0.5 rounded-full">
                          {crop.tooth_count} dente{crop.tooth_count > 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <a
                          href={crop.image_data}
                          download={`foto-${i + 1}.jpg`}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 text-xs transition-colors"
                          title="Download"
                        >
                          <Download className="w-3 h-3" />
                        </a>
                        <button
                          onClick={() => saveCropAsPhoto(crop, i)}
                          disabled={savingCropIdx === i || savingAll}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs transition-colors disabled:opacity-50"
                        >
                          {savingCropIdx === i
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Camera className="w-3 h-3" />
                          }
                          Salvar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={saveAllCrops}
                    disabled={savingAll || savingCropIdx !== null}
                    className="bg-violet-600 hover:bg-violet-500 text-white gap-2"
                  >
                    {savingAll
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Camera className="w-4 h-4" />
                    }
                    Salvar todas no álbum
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
