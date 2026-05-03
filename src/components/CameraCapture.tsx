'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Photo, CameraDevice } from '@/lib/types'
import { useCreateFolder } from '@/hooks/useFolders'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Camera, Loader2, AlertCircle, RefreshCw, X, FlipHorizontal2, Settings2, Video, Square, ChevronLeft, ChevronRight, Trash2, Check, Play } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'



interface CameraCaptureProps {
  patientId: string
  onPhotoCapture: (photo: Photo) => void
  onClose?: () => void
}

type CaptureMode = 'photo' | 'video'

type CapturedItem =
  | { kind: 'photo'; dataUrl: string }
  | { kind: 'video'; dataUrl: string; blob: Blob; duration: number; mimeType: string }

declare global {
  interface Window {
    VitallCam?: {
      isNative: () => boolean
      openIntraoralCamera: (callbackName?: string) => void
      startIntraoralPreview?: (stateCallbackName?: string) => void
      stopIntraoralPreview?: () => void
      setIntraoralPreviewBounds?: (x: number, y: number, w: number, h: number) => void
      captureIntraoralFrame?: (callbackName?: string) => void
      setIntraoralMirror?: (mirror: boolean) => void
      startIntraoralRecording?: (callbackName?: string) => void
      stopIntraoralRecording?: () => void
      getIntraoralCapabilities?: (callbackName?: string) => void
      setIntraoralResolution?: (width: number, height: number) => void
      setIntraoralZoomPercent?: (percent: number) => void
    }
    __onIntraoralCapture?: (dataUrls: string[], error: string | null) => void
    __onIntraoralFrame?: (dataUrl: string | null, error: string | null) => void
    __onIntraoralVideo?: (dataUrl: string | null, error: string | null) => void
    __onIntraoralState?: (state: string) => void
    __onIntraoralCapabilities?: (caps: IntraoralCapabilities) => void
  }
}

interface IntraoralCapabilities {
  device: { vid: string; pid: string; name?: string; productName?: string; manufacturer?: string } | null
  cameraOpened: boolean
  currentSize: { w: number; h: number } | null
  supportedSizes: { w: number; h: number }[]
  supportedFormats: string[]
  uvc: { zoomEnabled: boolean; zoomMin?: number; zoomMax?: number; zoomCurrent?: number } | null
}

type NativePreviewState = 'idle' | 'connecting' | 'ready' | 'lost' | 'error'

// Função para classificar câmeras (fora do componente para poder reutilizar)
const classifyCamera = (label: string) => {
  const labelLower = label.toLowerCase()
  
  // Câmera intraoral específica "Spac_2089" (prioridade máxima absoluta)
  if (labelLower.includes('spac_2089') || labelLower.includes('spac 2089') || labelLower.includes('spac')) {
    return { priority: 0, type: 'intraoral' }
  }
  
  // Câmeras intraorais específicas (prioridade máxima)
  if (labelLower.includes('skycam') || 
      labelLower.includes('intraoral') || 
      labelLower.includes('dental') ||
      labelLower.includes('dnt') ||
      labelLower.includes('rvg') ||
      labelLower.includes('sopro') ||
      labelLower.includes('acteon') ||
      labelLower.includes('dexis') ||
      labelLower.includes('gendex') ||
      labelLower.includes('carestream') ||
      labelLower.includes('kavo') ||
      labelLower.includes('schick') ||
      labelLower.includes('planmeca')) {
    return { priority: 1, type: 'intraoral' }
  }
  
  // Câmeras USB externas (podem ser intraorais)
  if (labelLower.includes('usb') && 
      !labelLower.includes('integrated') &&
      !labelLower.includes('built-in')) {
    return { priority: 2, type: 'usb-external' }
  }

  // Câmeras USB externas específicas (alta prioridade)  
  if ((labelLower.includes('usb') ||
       labelLower.includes('2.0') ||
       labelLower.includes('3.0') ||
       labelLower.includes('uvc')) && 
      !labelLower.includes('integrated') && 
      !labelLower.includes('built-in') &&
      !labelLower.includes('internal') &&
      !labelLower.includes('facetime')) {
    return { priority: 2, type: 'usb' }
  }

  // Marcas conhecidas de câmeras externas (média prioridade)
  if ((labelLower.includes('logitech') ||
       labelLower.includes('microsoft') ||
       labelLower.includes('creative') ||
       labelLower.includes('genius') ||
       labelLower.includes('trust') ||
       labelLower.includes('a4tech') ||
       labelLower.includes('razer') ||
       labelLower.includes('philips') ||
       labelLower.includes('sony') ||
       labelLower.includes('canon') ||
       labelLower.includes('nikon')) &&
      !labelLower.includes('integrated') &&
      !labelLower.includes('built-in') &&
      !labelLower.includes('internal')) {
    return { priority: 3, type: 'external' }
  }

  // Câmeras com alta resolução (podem ser externas)
  if ((labelLower.includes('1080p') ||
       labelLower.includes('720p') ||
       labelLower.includes('4k') ||
       labelLower.includes('full hd') ||
       labelLower.includes('fhd') ||
       labelLower.includes('uhd') ||
       labelLower.includes('hd')) &&
      !labelLower.includes('integrated') &&
      !labelLower.includes('built-in') &&
      !labelLower.includes('internal')) {
    return { priority: 4, type: 'hd' }
  }

  // Câmeras virtuais (prioridade muito baixa)
  if (labelLower.includes('obs') ||
      labelLower.includes('virtual') ||
      labelLower.includes('snap') ||
      labelLower.includes('xsplit') ||
      labelLower.includes('streamlabs') ||
      labelLower.includes('nvidia broadcast') ||
      labelLower.includes('manycam')) {
    return { priority: 15, type: 'virtual' }
  }

  // Câmeras integradas (baixa prioridade)
  if (labelLower.includes('integrated') ||
      labelLower.includes('built-in') ||
      labelLower.includes('internal') ||
      labelLower.includes('facetime') ||
      labelLower.includes('webcam') ||
      labelLower.includes('bison') ||
      labelLower.includes('chicony') ||
      labelLower.includes('azurewave') ||
      labelLower.includes('realtek') ||
      labelLower.includes('sunplus') ||
      // Câmeras integradas de tablets Android
      labelLower.includes('facing back') ||
      labelLower.includes('facing front') ||
      labelLower.includes('back camera') ||
      labelLower.includes('front camera') ||
      labelLower.includes('camera2') ||
      labelLower.includes('android camera') ||
      /^camera \d+$/.test(labelLower)) {
    return { priority: 10, type: 'integrated' }
  }

  // Câmeras sem identificação específica (prioridade média-baixa)
  return { priority: 5, type: 'unknown' }
}

export default function CameraCapture({ patientId, onPhotoCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLButtonElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([])
  const [showCameraSelector, setShowCameraSelector] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [cameraError, setCameraError] = useState<string>('')
  const [isInitializing] = useState(false)
  const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([])
  const [showSaveButton, setShowSaveButton] = useState(false)
  const [zoomTriggerEnabled] = useState(true)
  const [lastCaptureTime, setLastCaptureTime] = useState(0)
  const [stableStartTime, setStableStartTime] = useState<number | null>(null)
  const [goodFocusThreshold] = useState(50)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [mode, setMode] = useState<CaptureMode>('photo')
  const [isMirrored, setIsMirrored] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [flyAnim, setFlyAnim] = useState<{ src: string; from: DOMRect; to: DOMRect } | null>(null)
  const { toast } = useToast()
  const router = useRouter()
  const createFolderMutation = useCreateFolder()
  const isNativeRef = useRef(false)
  const previewSlotRef = useRef<HTMLDivElement>(null)
  const [isNative, setIsNative] = useState(false)
  const [nativePreviewState, setNativePreviewState] = useState<NativePreviewState>('idle')
  const [capabilities, setCapabilities] = useState<IntraoralCapabilities | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // Native overlay flow: WebView mostra o design web e o nativo desenha o vídeo
  // ao vivo da câmera USB intraoral (libuvccamera) sobre o stage central.
  useEffect(() => {
    const native = typeof window !== 'undefined' && !!window.VitallCam?.isNative?.()
    isNativeRef.current = native
    setIsNative(native)
    if (!native || !window.VitallCam?.startIntraoralPreview) return

    window.__onIntraoralState = (state: string) => {
      setNativePreviewState(state as NativePreviewState)
      if (state === 'lost') {
        toast({ variant: 'destructive', title: 'Câmera desconectada', description: 'Reconecte o cabo USB.' })
      } else if (state === 'error') {
        toast({ variant: 'destructive', title: 'Falha na câmera', description: 'Tentando reconectar…' })
      }
    }

    setNativePreviewState('connecting')
    window.VitallCam.startIntraoralPreview('window.__onIntraoralState')

    return () => {
      window.VitallCam?.stopIntraoralPreview?.()
      window.__onIntraoralState = undefined
      window.__onIntraoralFrame = undefined
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reporta os bounds do stage central pro nativo posicionar a SurfaceView
  useEffect(() => {
    if (!isNative) return
    const el = previewSlotRef.current
    if (!el) return

    let raf = 0
    const push = () => {
      const r = el.getBoundingClientRect()
      // Enviar em device px — o WebView Android espera dimensões físicas.
      const dpr = window.devicePixelRatio || 1
      window.VitallCam?.setIntraoralPreviewBounds?.(
        r.left * dpr,
        r.top * dpr,
        r.width * dpr,
        r.height * dpr,
      )
    }
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(push)
    }

    push()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isNative])

  // Sincroniza espelhar (vertical) com a SurfaceView nativa
  useEffect(() => {
    if (!isNative) return
    window.VitallCam?.setIntraoralMirror?.(isMirrored)
  }, [isNative, isMirrored])

  // Punch-through: body transparente no app pra SurfaceView aparecer
  // através do HTML onde for transparente.
  useEffect(() => {
    if (!isNative) return
    const prevBody = document.body.style.background
    const prevHtml = document.documentElement.style.background
    document.body.style.background = 'transparent'
    document.documentElement.style.background = 'transparent'
    return () => {
      document.body.style.background = prevBody
      document.documentElement.style.background = prevHtml
    }
  }, [isNative])

  // Capabilities são buscadas SOB DEMANDA (botão Diagnóstico ou ao abrir
  // o seletor de resolução). Auto-fetch causava conflito USB em algumas
  // câmeras intraorais — UVC control transfer enquanto o stream isócrono
  // ainda estava negociando travava o dispositivo.
  useEffect(() => {
    if (!isNative) return
    window.__onIntraoralCapabilities = (caps) => setCapabilities(caps)
  }, [isNative])

  // Quando o usuário abre o painel Ajustes (no app), busca capabilities
  // pra mostrar a lista de resoluções. Espera a câmera estar pronta.
  useEffect(() => {
    if (!isNative || !showSettings || nativePreviewState !== 'ready') return
    window.VitallCam?.getIntraoralCapabilities?.('window.__onIntraoralCapabilities')
  }, [isNative, showSettings, nativePreviewState])

  const flipDataUrlVertically = (dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        const ctx = c.getContext('2d')
        if (!ctx) return reject(new Error('canvas'))
        ctx.translate(0, c.height)
        ctx.scale(1, -1)
        ctx.drawImage(img, 0, 0)
        resolve(c.toDataURL('image/jpeg', 0.95))
      }
      img.onerror = () => reject(new Error('image-load'))
      img.src = dataUrl
    })
  }

  const captureNativeFrame = () => {
    if (!window.VitallCam?.captureIntraoralFrame) return
    setIsCapturing(true)
    window.__onIntraoralFrame = async (dataUrl, error) => {
      if (error || !dataUrl) {
        setIsCapturing(false)
        toast({
          variant: 'destructive',
          title: 'Falha ao capturar',
          description: error === 'not-ready' ? 'Câmera ainda não está pronta.' : (error || 'Tente novamente.'),
        })
        return
      }
      let finalDataUrl = dataUrl
      if (isMirrored) {
        try {
          finalDataUrl = await flipDataUrlVertically(dataUrl)
        } catch {
          // se falhar, mantém a original
        }
      }
      setIsCapturing(false)
      // Flash sutil
      if (stageRef.current) {
        const flash = document.createElement('div')
        flash.className = 'absolute inset-0 bg-white pointer-events-none z-30'
        flash.style.animation = 'cameraFlash 0.35s ease-out forwards'
        stageRef.current.appendChild(flash)
        setTimeout(() => flash.remove(), 360)
      }
      const stageRect = stageRef.current?.getBoundingClientRect()
      const thumbRect = thumbRef.current?.getBoundingClientRect()
      if (stageRect && thumbRect) {
        setFlyAnim({ src: finalDataUrl, from: stageRect, to: thumbRect })
        setTimeout(() => setFlyAnim(null), 650)
      }
      setCapturedItems(prev => [{ kind: 'photo', dataUrl: finalDataUrl }, ...prev])
      setShowSaveButton(true)
    }
    window.VitallCam.captureIntraoralFrame('window.__onIntraoralFrame')
  }

  useEffect(() => {
    initializeCameraSystem()
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
      // Cleanup focus system removed
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Detectar câmera OTG conectada depois que a página carregou
  useEffect(() => {
    const handleDeviceChange = async () => {
      console.log('📡 Dispositivo conectado/desconectado! Re-detectando câmeras...')
      // Parar stream atual antes de re-inicializar
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
        setStream(null)
        setSelectedDevice('')
      }
      await initializeCamera()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [stream]) // eslint-disable-line react-hooks/exhaustive-deps

  const capturePhotoRef = useRef<() => void>(() => {})
  const savePhotosRef = useRef<() => Promise<void> | void>(() => {})

  // Manter refs sempre atualizadas com a versão mais recente
  useEffect(() => {
    capturePhotoRef.current = isNativeRef.current ? captureNativeFrame : capturePhoto
    savePhotosRef.current = savePhotos
  })

  // Botão do meio do mouse tira foto (compatível com Android via pointerdown + auxclick)
  useEffect(() => {
    const handleMiddleButton = (e: PointerEvent | MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        capturePhotoRef.current()
      }
    }

    // pointerdown cobre mouse OTG no Android; mousedown cobre desktop
    document.addEventListener('pointerdown', handleMiddleButton as EventListener)
    document.addEventListener('mousedown', handleMiddleButton as EventListener)
    // auxclick é disparado após pointerup no botão do meio em alguns navegadores
    document.addEventListener('auxclick', handleMiddleButton as EventListener)

    return () => {
      document.removeEventListener('pointerdown', handleMiddleButton as EventListener)
      document.removeEventListener('mousedown', handleMiddleButton as EventListener)
      document.removeEventListener('auxclick', handleMiddleButton as EventListener)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedDevice && !stream) {
      startCamera(selectedDevice).catch(error => {
        console.error('❌ Falha ao inicializar câmera selecionada:', error)
        
        // Se a câmera selecionada falhou, tentar fallback
        toast({
          variant: "destructive",
          title: "⚠️ Câmera Falhou",
          description: "Tentando fallback para outra câmera...",
          duration: 3000
        })
        
        // Resetar para tentar fallback
        setCameraError('Erro ao inicializar câmera selecionada - tentando fallback...')
        
        // Tentar reinicializar o sistema de câmeras após um tempo
        setTimeout(() => {
          initializeCamera()
        }, 2000)
      })
    }
  }, [selectedDevice]) // eslint-disable-line react-hooks/exhaustive-deps

  // Atualizar showSaveButton quando capturedItems mudar
  useEffect(() => {
    setShowSaveButton(capturedItems.length > 0)
  }, [capturedItems])

  // Sistema inteligente removido - câmera básica e rápida

  // Notificação automática removida


  // INICIALIZAR SISTEMA DE CÂMERA SIMPLES
  const initializeCameraSystem = async () => {
    if (isNativeRef.current) {
      // No app, o preview vem do nativo via overlay; getUserMedia não é usado.
      return
    }
    console.log('🚀 Inicializando câmera simples...')
    await initializeCamera()
  }





  const initializeCamera = async () => {
    try {
      let videoDevices: MediaDeviceInfo[] = []
      let attempts = 0
      const maxAttempts = 5

      console.log('🔄 Iniciando detecção de câmeras...')

      while (attempts < maxAttempts) {
        attempts++
        console.log(`📡 Tentativa ${attempts}/${maxAttempts} de detecção`)

        try {
          // Obter permissão e PARAR o stream imediatamente para não bloquear a câmera OTG
          const permStream = await navigator.mediaDevices.getUserMedia({ video: true })
          permStream.getTracks().forEach(track => track.stop())

          // Pequeno delay para o Android liberar a câmera antes de enumerar
          await new Promise(resolve => setTimeout(resolve, attempts === 1 ? 300 : 600))

          const deviceList = await navigator.mediaDevices.enumerateDevices()
          const currentVideoDevices = deviceList.filter(device => device.kind === 'videoinput')

          console.log(`📹 Encontradas ${currentVideoDevices.length} câmeras na tentativa ${attempts}`)

          if (currentVideoDevices.length > videoDevices.length) {
            videoDevices = currentVideoDevices
            console.log('✅ Mais câmeras detectadas, continuando...')
          }

          const hasUsbCamera = currentVideoDevices.some(device => {
            const label = device.label.toLowerCase()
            return label.includes('usb') ||
                   label.includes('spac') ||
                   label.includes('intraoral') ||
                   label.includes('dental') ||
                   label.includes('uvc') ||
                   label.includes('2.0') ||
                   label.includes('3.0')
          })

          if (hasUsbCamera) {
            console.log('🎯 Câmera USB detectada pelo label!')
            videoDevices = currentVideoDevices
            break
          }

          // Se há mais de 2 câmeras, as extras provavelmente são OTG/USB
          if (currentVideoDevices.length > 2) {
            console.log('🎯 Mais de 2 câmeras detectadas - provável câmera OTG!')
            videoDevices = currentVideoDevices
            break
          }

          if (attempts === maxAttempts) {
            videoDevices = currentVideoDevices
          }

        } catch (error) {
          console.warn(`⚠️ Erro na tentativa ${attempts}:`, error)
          if (attempts === maxAttempts) {
            throw error
          }
        }
      }

      const cameraDevices: CameraDevice[] = videoDevices.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${device.deviceId.slice(0, 8)}`,
        kind: device.kind
      }))

      setAvailableCameras(cameraDevices)
      console.log('🔍 Câmeras encontradas:')
      cameraDevices.forEach((device, index) => {
        console.log(`${index + 1}. ID: ${device.deviceId}`)
        console.log(`   Label: "${device.label}"`)
        console.log(`   Kind: ${device.kind}`)
      })

      // Classificar todas as câmeras pelo label
      let classifiedDevices = cameraDevices.map(device => ({
        ...device,
        classification: classifyCamera(device.label)
      }))

      // No Android, câmeras OTG podem ter labels genéricas sem indicar USB.
      // Usar facingMode: câmeras integradas suportam facing back/front, USB não.
      // Testar apenas câmeras classificadas como "unknown" para confirmar se são USB.
      const unknownToProbe = classifiedDevices.filter(d =>
        d.classification.type === 'unknown' || d.classification.type === 'integrated'
      )

      if (unknownToProbe.length > 0) {
        console.log('🔬 Verificando facingMode para identificar câmeras OTG...')
        const probeResults = await Promise.all(
          unknownToProbe.map(async (device) => {
            try {
              const s = await Promise.race([
                navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: device.deviceId } } }),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
              ])
              const track = s.getVideoTracks()[0]
              const caps = (track as any).getCapabilities?.()
              const hasFacingMode = caps?.facingMode && caps.facingMode.length > 0
              s.getTracks().forEach(t => t.stop())
              console.log(`   "${device.label}" → facingMode: ${hasFacingMode ? caps.facingMode.join('/') : 'nenhum (provável OTG)'}`)
              return { deviceId: device.deviceId, hasFacingMode: !!hasFacingMode }
            } catch {
              return { deviceId: device.deviceId, hasFacingMode: null }
            }
          })
        )

        classifiedDevices = classifiedDevices.map(device => {
          const probe = probeResults.find(p => p.deviceId === device.deviceId)
          if (!probe) return device
          if (probe.hasFacingMode === false) {
            // Sem facingMode = câmera USB/OTG - prioridade máxima
            return { ...device, classification: { priority: 1, type: 'usb-external' as const } }
          }
          if (probe.hasFacingMode === true && device.classification.type !== 'integrated') {
            // Com facingMode = câmera integrada
            return { ...device, classification: { priority: 10, type: 'integrated' as const } }
          }
          return device
        })
      }

      console.log('📊 Classificação final das câmeras:')
      classifiedDevices.forEach((device, index) => {
        console.log(`${index + 1}. "${device.label}" → tipo: ${device.classification.type}, prioridade: ${device.classification.priority}`)
      })

      // Ordenar por prioridade (menor número = maior prioridade)
      const sortedDevices = classifiedDevices.sort((a, b) =>
        a.classification.priority - b.classification.priority
      )

      // Implementar fallback: tentar câmera intraoral primeiro, depois webcam
      await tryInitializeCameraWithFallback(sortedDevices)

    } catch (err: unknown) {
      const error = err as { name?: string }
      if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
        setCameraError('PERMISSAO_NEGADA')
      } else {
        setCameraError('Erro ao acessar câmeras. Verifique as permissões.')
      }
    }
  }

  // NOVA FUNÇÃO: Sistema de fallback inteligente
  const tryInitializeCameraWithFallback = async (sortedDevices: any[]) => {
    if (sortedDevices.length === 0) {
      // Log detalhado para debug
      console.error('❌ NENHUMA CÂMERA DETECTADA!')
      console.log('🔍 Dispositivos totais disponíveis:')
      const allDevices = await navigator.mediaDevices.enumerateDevices()

      let debugInfo = '📱 DISPOSITIVOS DETECTADOS:\n\n'
      allDevices.forEach((device, index) => {
        const info = `${index + 1}. ${device.kind}: ${device.label || 'Sem nome'}\n   ID: ${device.deviceId.slice(0,20)}...\n\n`
        console.log(`   - ${device.kind}: ${device.label || 'Sem label'} (ID: ${device.deviceId.slice(0,8)})`)
        debugInfo += info
      })

      if (allDevices.length === 0) {
        debugInfo = '❌ NENHUM DISPOSITIVO DETECTADO\n\nVerifique se:\n- A câmera está conectada\n- Você deu permissão de câmera\n- A câmera é compatível com Android'
      }

      setCameraError(debugInfo)
      return
    }

    // Separar câmeras intraorais, integradas e virtuais
    const intraoralCameras = sortedDevices.filter(device =>
      device.classification.type === 'intraoral' ||
      device.classification.type === 'usb-external' ||
      device.classification.type === 'usb' ||
      device.classification.type === 'external'
    )

    const integratedCameras = sortedDevices.filter(device =>
      device.classification.type === 'integrated'
    )

    const virtualCameras = sortedDevices.filter(device =>
      device.classification.type === 'virtual'
    )

    // NOVO: Câmeras desconhecidas/genéricas (pode ser a intraoral em Android)
    const unknownCameras = sortedDevices.filter(device =>
      device.classification.type === 'unknown' ||
      device.classification.type === 'hd'
    )

    console.log('🎯 Sistema de Fallback:')
    console.log(`   Câmeras intraorais/USB: ${intraoralCameras.length}`)
    console.log(`   Câmeras desconhecidas: ${unknownCameras.length}`)
    console.log(`   Câmeras integradas: ${integratedCameras.length}`)
    console.log(`   Câmeras virtuais: ${virtualCameras.length}`)

    // ETAPA 1: Tentar câmeras intraorais primeiro
    for (const device of intraoralCameras) {
      console.log(`🦷 Tentando câmera intraoral: "${device.label}"`)

      const success = await tryStartSpecificCamera(device)
      if (success) {
        console.log(`✅ Câmera intraoral inicializada com sucesso: "${device.label}"`)
        toast({
          title: "🦷 Câmera Intraoral Detectada",
          description: `Câmera "${device.label}" conectada e pronta para uso`
        })
        return
      } else {
        console.log(`❌ Falha ao inicializar câmera intraoral: "${device.label}"`)
      }
    }

    // ETAPA 1.5: Tentar câmeras desconhecidas (pode ser intraoral no Android)
    console.log('🔍 Tentando câmeras desconhecidas/genéricas (pode ser intraoral)...')

    for (const device of unknownCameras) {
      console.log(`📷 Tentando câmera desconhecida: "${device.label}"`)

      const success = await tryStartSpecificCamera(device)
      if (success) {
        console.log(`✅ Câmera inicializada: "${device.label}"`)
        toast({
          title: "📷 Câmera Detectada",
          description: `Usando câmera "${device.label}"`
        })
        return
      } else {
        console.log(`❌ Falha ao inicializar: "${device.label}"`)
      }
    }

    // ETAPA 2: Fallback para câmera integrada se intraoral falhou
    console.log('⚠️ Nenhuma câmera intraoral funcionou, tentando fallback para webcam...')
    
    for (const device of integratedCameras) {
      console.log(`📹 Tentando webcam fallback: "${device.label}"`)
      
      const success = await tryStartSpecificCamera(device)
      if (success) {
        console.log(`✅ Webcam fallback inicializada: "${device.label}"`)
        toast({
          title: "📹 Usando Webcam",
          description: `Câmera intraoral não encontrada. Usando "${device.label}" como fallback`,
          duration: 5000
        })
        return
      } else {
        console.log(`❌ Falha no fallback webcam: "${device.label}"`)
      }
    }

    // ETAPA 3: Último recurso - câmeras virtuais
    if (virtualCameras.length > 0) {
      console.log('⚠️ Tentando último recurso: câmeras virtuais...')
      
      for (const device of virtualCameras) {
        console.log(`🎭 Tentando câmera virtual: "${device.label}"`)
        
        const success = await tryStartSpecificCamera(device)
        if (success) {
          console.log(`✅ Câmera virtual inicializada: "${device.label}"`)
          toast({
            title: "⚠️ Usando Câmera Virtual",
            description: `Nenhuma câmera real encontrada. Usando "${device.label}" como último recurso`,
            duration: 7000
          })
          return
        } else {
          console.log(`❌ Falha na câmera virtual: "${device.label}"`)
        }
      }
    }

    // ETAPA 4: Se nada funcionou, erro
    console.log('❌ Nenhuma câmera pôde ser inicializada')
    setCameraError('Erro ao inicializar câmera selecionada - nenhuma câmera disponível funcionando')
  }

  // NOVA FUNÇÃO: Tentar inicializar uma câmera específica
  const tryStartSpecificCamera = async (device: any): Promise<boolean> => {
    console.log(`🔧 Testando câmera: "${device.label}" (ID: ${device.deviceId.slice(0, 8)}...)`)

    // Lista de resoluções para tentar (da maior para a menor)
    const resolutionsToTry = [
      { width: 1920, height: 1080, name: '1080p' },
      { width: 1280, height: 720, name: '720p' },
      { width: 640, height: 480, name: '480p' },
      { width: 320, height: 240, name: '240p' }
    ]

    // Tentar cada resolução
    for (const resolution of resolutionsToTry) {
      try {
        console.log(`📐 Tentando resolução ${resolution.name} (${resolution.width}x${resolution.height})...`)

        const testConstraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: device.deviceId },
            width: { ideal: resolution.width },
            height: { ideal: resolution.height }
          }
        }

        console.log(`⏳ Iniciando getUserMedia (timeout 5s)...`)
        const testStream = await Promise.race([
          navigator.mediaDevices.getUserMedia(testConstraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout de 5 segundos')), 5000)
          )
        ])

        // Se chegou até aqui, a câmera funciona!
        console.log(`✅ SUCESSO com resolução ${resolution.name}!`)
        console.log(`   Stream ativo: ${testStream.active}`)
        console.log(`   Tracks: ${testStream.getTracks().length}`)

        if (testStream.getVideoTracks().length > 0) {
          const track = testStream.getVideoTracks()[0]
          const settings = track.getSettings()
          console.log(`   Resolução real: ${settings.width}x${settings.height}`)
          console.log(`   FPS: ${settings.frameRate}`)
        }

        // Parar o stream de teste
        testStream.getTracks().forEach(track => track.stop())
        console.log(`🛑 Stream de teste parado`)

        // Agora configurar a câmera definitivamente
        console.log(`✅ Definindo câmera como selecionada: ${device.deviceId}`)
        setSelectedDevice(device.deviceId)

        return true

      } catch (error: any) {
        console.warn(`⚠️ Falhou com ${resolution.name}:`, error.message)
        // Continuar tentando próxima resolução
      }
    }

    // Se chegou aqui, nenhuma resolução funcionou
    console.error(`❌ NENHUMA RESOLUÇÃO FUNCIONOU para "${device.label}"`)
    return false
  }




  // Captura automática removida - só captura manual

  // Foco automático removido



  const startCamera = async (deviceId: string) => {
    try {
      setCameraError('')

      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }

      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      }

      const newStream = await navigator.mediaDevices.getUserMedia(constraints)

      if (videoRef.current) {
        videoRef.current.srcObject = newStream
        await videoRef.current.play()
      }

      setStream(newStream)
      
    } catch (error) {
      console.error('❌ Erro ao inicializar câmera:', error)
      throw error
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || !stream) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Câmera não está pronta"
      })
      return
    }

    setIsCapturing(true)

    try {
      const video = videoRef.current
      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      if (!context) throw new Error('Erro ao obter contexto do canvas')

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight

      if (isMirrored) {
        // Espelhar vertical: o que está em cima vai pra baixo.
        context.save()
        context.translate(0, canvas.height)
        context.scale(1, -1)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        context.restore()
      } else {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
      }

      const finalImageData = canvas.toDataURL('image/jpeg', 0.95)

      // Flash sutil
      if (stageRef.current) {
        const flash = document.createElement('div')
        flash.className = 'absolute inset-0 bg-white pointer-events-none z-30'
        flash.style.animation = 'cameraFlash 0.35s ease-out forwards'
        stageRef.current.appendChild(flash)
        setTimeout(() => flash.remove(), 360)
      }

      // Animação: imagem voa do centro para o thumbnail no canto inferior esquerdo
      const stageRect = stageRef.current?.getBoundingClientRect()
      const thumbRect = thumbRef.current?.getBoundingClientRect()
      if (stageRect && thumbRect) {
        setFlyAnim({ src: finalImageData, from: stageRect, to: thumbRect })
        setTimeout(() => setFlyAnim(null), 650)
      }

      setCapturedItems(prev => [{ kind: 'photo', dataUrl: finalImageData }, ...prev])
      setShowSaveButton(true)

    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao capturar foto"
      })
    } finally {
      setIsCapturing(false)
    }
  }


  const startRecording = () => {
    if (isNativeRef.current) {
      if (!window.VitallCam?.startIntraoralRecording) return
      window.__onIntraoralVideo = async (dataUrl, error) => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current)
          recordingTimerRef.current = null
        }
        setIsRecording(false)
        if (error || !dataUrl) {
          toast({
            variant: 'destructive',
            title: 'Erro ao gravar',
            description: error === 'not-ready' ? 'Câmera ainda não está pronta.' : (error || 'Tente novamente.'),
          })
          setRecordingTime(0)
          return
        }
        try {
          const res = await fetch(dataUrl)
          const blob = await res.blob()
          const duration = recordingTime
          const poster = await generateVideoPoster(blob)
          const item: CapturedItem = { kind: 'video', dataUrl: poster, blob, duration, mimeType: 'video/mp4' }
          setCapturedItems(prev => [item, ...prev])
          setShowSaveButton(true)
          const stageRect = stageRef.current?.getBoundingClientRect()
          const thumbRect = thumbRef.current?.getBoundingClientRect()
          if (stageRect && thumbRect) {
            setFlyAnim({ src: poster, from: stageRect, to: thumbRect })
            setTimeout(() => setFlyAnim(null), 650)
          }
          toast({ title: 'Vídeo capturado', description: `${formatTime(duration)} · ${(blob.size / 1024 / 1024).toFixed(1)}MB` })
        } catch (err: any) {
          toast({ variant: 'destructive', title: 'Erro ao processar vídeo', description: err?.message || 'Tente novamente.' })
        } finally {
          setRecordingTime(0)
        }
      }
      window.VitallCam.startIntraoralRecording('window.__onIntraoralVideo')
      setIsRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
      return
    }
    if (!stream) return
    try {
      const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        .find(m => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) || ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recordedChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
      recorder.onstop = handleRecordingStop
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setRecordingTime(0)
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000)
    } catch (err) {
      console.error('Erro ao iniciar gravação:', err)
      toast({ variant: 'destructive', title: 'Gravação indisponível', description: 'Este dispositivo não suporta MediaRecorder.' })
    }
  }

  const stopRecording = () => {
    if (isNativeRef.current) {
      // O callback __onIntraoralVideo zera isRecording e o timer.
      window.VitallCam?.stopIntraoralRecording?.()
      return
    }
    mediaRecorderRef.current?.stop()
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
    setIsRecording(false)
  }

  const handleRecordingStop = async () => {
    const mimeType = recordedChunksRef.current[0]?.type || 'video/webm'
    const blob = new Blob(recordedChunksRef.current, { type: mimeType })
    const duration = recordingTime

    try {
      // Gera poster (primeiro frame visível) usando um <video> off-DOM
      const poster = await generateVideoPoster(blob)

      const item: CapturedItem = { kind: 'video', dataUrl: poster, blob, duration, mimeType }
      setCapturedItems(prev => [item, ...prev])
      setShowSaveButton(true)

      // Animação: poster voa do centro para o thumbnail
      const stageRect = stageRef.current?.getBoundingClientRect()
      const thumbRect = thumbRef.current?.getBoundingClientRect()
      if (stageRect && thumbRect) {
        setFlyAnim({ src: poster, from: stageRect, to: thumbRect })
        setTimeout(() => setFlyAnim(null), 650)
      }

      toast({ title: 'Vídeo capturado', description: `${formatTime(duration)} · ${(blob.size / 1024 / 1024).toFixed(1)}MB` })
    } catch (err: any) {
      console.error(err)
      toast({ variant: 'destructive', title: 'Erro ao processar vídeo', description: err?.message || 'Tente novamente.' })
    } finally {
      setRecordingTime(0)
    }
  }

  const generateVideoPoster = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob)
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = url
      video.onloadeddata = () => {
        try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2) } catch { /* noop */ }
      }
      video.onseeked = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth || 640
        canvas.height = video.videoHeight || 480
        const ctx = canvas.getContext('2d')
        if (!ctx) { URL.revokeObjectURL(url); return reject(new Error('canvas context')) }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('video load failed')) }
    })
  }

  const uploadVideoItem = async (item: Extract<CapturedItem, { kind: 'video' }>, folderId: string) => {
    const useStorage = item.duration > 10
    const baseRow = {
      patient_id: patientId,
      folder_id: folderId,
      duration: item.duration,
      size_bytes: item.blob.size,
      mime_type: item.mimeType,
    }
    let row: any
    if (useStorage) {
      const ext = item.mimeType.includes('mp4') ? 'mp4' : 'webm'
      const storagePath = `${patientId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await (supabase as any).storage
        .from('patient-videos')
        .upload(storagePath, item.blob, { contentType: item.mimeType, upsert: false })
      if (upErr) throw upErr
      const { data: pub } = (supabase as any).storage.from('patient-videos').getPublicUrl(storagePath)
      row = { ...baseRow, storage_path: storagePath, video_url: pub?.publicUrl ?? null }
    } else {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = () => reject(r.error)
        r.readAsDataURL(item.blob)
      })
      row = { ...baseRow, video_data: dataUrl }
    }
    const { data, error } = await (supabase as any).from('videos').insert(row).select().single()
    if (error) throw error
    return data
  }

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  const handleMainAction = () => {
    if (mode === 'photo') return capturePhoto()
    if (isRecording) return stopRecording()
    return startRecording()
  }

  const handleClose = () => {
    if (isRecording) stopRecording()
    if (stream) stream.getTracks().forEach(t => t.stop())
    onClose?.()
  }

  const savePhotos = async () => {
    if (capturedItems.length === 0) return

    setIsSaving(true)

    try {
      const folderName = `Pasta ${new Date().toLocaleDateString('pt-BR')}`
      const folder = await createFolderMutation.mutateAsync({ name: folderName, patient_id: patientId })
      const folderId = folder.id

      const itemsToSave = [...capturedItems].reverse()
      const saved: any[] = []
      let photoCount = 0
      let videoCount = 0

      for (let index = 0; index < itemsToSave.length; index++) {
        const item = itemsToSave[index]
        if (index > 0) await new Promise(r => setTimeout(r, 50))

        if (item.kind === 'photo') {
          const { data, error } = await (supabase as any)
            .from('photos')
            .insert({ patient_id: patientId, image_data: item.dataUrl, folder_id: folderId })
            .select()
            .single()
          if (error) throw error
          saved.push(data)
          photoCount++
        } else {
          const data = await uploadVideoItem(item, folderId)
          saved.push(data)
          videoCount++
        }
      }

      saved.forEach(row => onPhotoCapture(row))

      const parts = [
        photoCount > 0 ? `${photoCount} foto(s)` : null,
        videoCount > 0 ? `${videoCount} vídeo(s)` : null,
      ].filter(Boolean).join(' + ')
      toast({ title: 'Sucesso!', description: `${parts} salvos em "${folderName}"` })

      setCapturedItems([])
      setShowSaveButton(false)

    } catch (error) {
      console.error('Erro completo ao salvar fotos:', error)
      toast({
        variant: "destructive",
        title: "Erro ao Salvar",
        description: "Falha ao salvar fotos. Verifique sua conexão."
      })
    } finally {
      setIsSaving(false)
    }
  }

  const removePhoto = (index: number) => {
    setCapturedItems(prev => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) setShowSaveButton(false)
      return next
    })
  }


  if (isInitializing) {
    return (
      <Card className="p-6 bg-white">
        <div className="flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-black">Inicializando câmera...</p>
        </div>
      </Card>
    )
  }

  if (cameraError) {
    const isPermissionDenied = cameraError === 'PERMISSAO_NEGADA'
    return (
      <Card className="p-8 bg-white">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <AlertCircle className="w-12 h-12 text-destructive" />
          {isPermissionDenied ? (
            <>
              <p className="text-lg font-semibold text-gray-800">Permissão de câmera negada</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left text-sm text-amber-900 space-y-2 max-w-sm">
                <p className="font-semibold">Para liberar a câmera:</p>
                <p>1. Toque no ícone de cadeado 🔒 na barra de endereço</p>
                <p>2. Toque em <strong>Permissões</strong></p>
                <p>3. Ative <strong>Câmera</strong></p>
                <p>4. Recarregue a página</p>
              </div>
            </>
          ) : (
            <pre className="text-black text-left text-sm whitespace-pre-wrap max-w-2xl bg-gray-100 p-4 rounded border border-gray-300">
              {cameraError}
            </pre>
          )}
          <Button onClick={() => window.location.reload()} className="bg-primary hover:bg-primary/90 text-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Tentar Novamente
          </Button>
        </div>
      </Card>
    )
  }

  const lastItem = capturedItems[0]

  return (
    <div className={`fixed inset-0 z-[60] grid grid-cols-[clamp(140px,15vw,220px)_1fr_clamp(140px,15vw,220px)] items-stretch py-6 sm:py-8 ${isNative ? 'bg-transparent' : 'bg-neutral-950'}`}>
      {/* COLUNA ESQUERDA — fechar + salvar (topo) e thumbnail (rodapé) */}
      <aside className={`flex flex-col items-center justify-between py-2 px-3 ${isNative ? 'bg-neutral-950' : ''}`}>
        {/* Topo: Fechar + Salvar */}
        <div className="flex flex-col items-center gap-7">
          <button
            onClick={handleClose}
            aria-label="Fechar câmera"
            className="flex flex-col items-center gap-1.5 text-white/85 hover:text-white transition-colors group"
          >
            <X className="w-7 h-7 group-hover:scale-110 transition-transform" strokeWidth={2.2} />
            <span className="text-[11px] font-medium tracking-wide">Fechar</span>
          </button>

          {showSaveButton && (
            <button
              onClick={savePhotos}
              disabled={isSaving}
              className="flex flex-col items-center gap-1.5 text-teal-400 hover:text-teal-300 transition-colors group disabled:opacity-60"
            >
              {isSaving ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : (
                <Check className="w-7 h-7 group-hover:scale-110 transition-transform" strokeWidth={2.2} />
              )}
              <span className="text-[11px] font-medium tracking-wide">Salvar ({capturedItems.length})</span>
            </button>
          )}
        </div>

        {/* Inferior: Thumbnail */}
        <button
          ref={thumbRef}
          onClick={() => { if (capturedItems.length) { setGalleryIndex(0); setShowGallery(true) } }}
          aria-label="Ver capturas"
          className={`relative w-full max-w-[160px] aspect-square rounded overflow-hidden ring-2 transition-all ${lastItem ? 'ring-white/80 hover:ring-teal-400' : 'ring-white/15 bg-white/5'}`}
          style={lastItem ? { animation: 'thumbBounce 0.5s cubic-bezier(0.16,1,0.3,1)' } : undefined}
          key={lastItem ? lastItem.dataUrl : 'empty'}
        >
          {lastItem ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lastItem.dataUrl} alt="" className="w-full h-full object-cover" />
              {lastItem.kind === 'video' && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <span className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <Play className="w-4 h-4 text-teal-700 fill-current ml-0.5" />
                  </span>
                </span>
              )}
            </>
          ) : (
            <span className="flex items-center justify-center w-full h-full">
              <Camera className="w-6 h-6 text-white/40" />
            </span>
          )}
        </button>
      </aside>

      {/* CENTRO — Stage da câmera */}
      <div className="flex items-center justify-center px-2">
        <div
          ref={stageRef}
          className={`relative w-full h-full max-w-[1400px] rounded overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5 ${isNative ? 'bg-transparent' : 'bg-black'}`}
        >
          {!isNative && (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-150"
              style={{ transform: `scale(${zoomLevel}) ${isMirrored ? 'scaleY(-1)' : ''}`, transformOrigin: 'center center' }}
              playsInline
              muted
            />
          )}

          {isNative && (
            <div ref={previewSlotRef} className="absolute inset-0 w-full h-full" />
          )}

          {!isNative && !stream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm text-white/70">Iniciando câmera…</p>
            </div>
          )}

          {isNative && nativePreviewState !== 'ready' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 text-white pointer-events-none z-10">
              <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
              <p className="text-sm text-white/70">
                {nativePreviewState === 'lost' ? 'Câmera desconectada — reconecte o cabo' :
                 nativePreviewState === 'error' ? 'Falha — tentando reconectar…' :
                 'Conectando câmera intraoral…'}
              </p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />

          {/* Indicador de gravação (dentro do stage) */}
          {isRecording && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-black/55 backdrop-blur-md px-3 py-1.5 rounded-full ring-1 ring-white/10">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" style={{ animation: 'recordPulse 1s ease-in-out infinite' }} />
              <span className="text-white text-sm font-medium tabular-nums">{formatTime(recordingTime)}</span>
            </div>
          )}
        </div>
      </div>

      {/* COLUNA DIREITA — ações */}
      <aside className={`flex flex-col items-center justify-center gap-7 py-2 px-3 relative ${isNative ? 'bg-neutral-950' : ''}`}>
        {/* Odontograma */}
        <button
          onClick={() => toast({ title: 'Odontograma', description: 'Em breve nesta tela.' })}
          className="flex flex-col items-center gap-1.5 text-white/85 hover:text-white transition-colors group"
        >
          <ToothIcon className="w-7 h-7 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-medium tracking-wide">Odontograma</span>
        </button>

        {/* Toggle Foto / Vídeo — pílula teal/dourado, é o botão de captura */}
        <div className="flex flex-col items-center gap-2">
          <div className="bg-teal-700/85 backdrop-blur-md ring-1 ring-teal-300/30 rounded-full p-2 flex flex-col gap-2 shadow-[0_6px_18px_-6px_rgba(13,148,136,0.6)]">
            <button
              onClick={() => {
                setMode('photo')
                if (isRecording) stopRecording()
                if (isNative) captureNativeFrame()
                else capturePhoto()
              }}
              aria-label="Capturar foto"
              disabled={isCapturing || (isNative ? nativePreviewState !== 'ready' : !stream)}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                mode === 'photo'
                  ? 'bg-gradient-to-br from-dourado-400 to-dourado-600 text-white shadow-[0_4px_14px_-4px_rgba(168,127,92,0.9)] ring-2 ring-white/40'
                  : 'text-white/85 hover:text-white hover:bg-white/10'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/images/camera-intraoral.svg" alt="" className="w-8 h-8 object-contain brightness-0 invert" />
            </button>
            <button
              onClick={() => { setMode('video'); isRecording ? stopRecording() : startRecording() }}
              aria-label={isRecording ? 'Parar gravação' : 'Iniciar gravação'}
              disabled={isNative ? nativePreviewState !== 'ready' : !stream}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-50 ${
                mode === 'video'
                  ? 'bg-gradient-to-br from-dourado-400 to-dourado-600 text-white shadow-[0_4px_14px_-4px_rgba(168,127,92,0.9)] ring-2 ring-white/40'
                  : 'text-white/85 hover:text-white hover:bg-white/10'
              }`}
            >
              {isRecording ? <Square className="w-5 h-5 fill-current" /> : <Video className="w-6 h-6" strokeWidth={2} />}
            </button>
          </div>
          <span className="text-[11px] font-medium tracking-wide text-white/85">
            {mode === 'photo' ? 'Capturar' : isRecording ? 'Parar' : 'Gravar'}
          </span>
        </div>

        {/* Espelhar */}
        <button
          onClick={() => setIsMirrored(m => !m)}
          className={`flex flex-col items-center gap-1.5 transition-colors group ${isMirrored ? 'text-teal-400' : 'text-white/85 hover:text-white'}`}
        >
          <FlipHorizontal2 className="w-7 h-7 group-hover:scale-110 transition-transform" strokeWidth={1.8} />
          <span className="text-[11px] font-medium tracking-wide">Espelhar</span>
        </button>

        {/* Ajustes */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`flex flex-col items-center gap-1.5 transition-colors group ${showSettings ? 'text-teal-400' : 'text-white/85 hover:text-white'}`}
        >
          <Settings2 className="w-7 h-7 group-hover:scale-110 transition-transform" strokeWidth={1.8} />
          <span className="text-[11px] font-medium tracking-wide">Ajustes</span>
        </button>

        {/* Painel de Ajustes (popover ancorado à coluna direita) */}
        {showSettings && (
          <div className="absolute top-1/2 right-full -translate-y-1/2 mr-2 z-30 w-72 bg-white rounded shadow-2xl ring-1 ring-black/5 p-4 animate-fade-in">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Ajustes</h4>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Zoom</label>
            <div className="flex items-center gap-2 mt-1.5 mb-4">
              <button onClick={() => setZoomLevel(z => Math.max(1, parseFloat((z - 0.25).toFixed(2))))} className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">−</button>
              <input type="range" min="1" max="4" step="0.1" value={zoomLevel} onChange={e => setZoomLevel(parseFloat(e.target.value))} className="flex-1 accent-teal-600" />
              <button onClick={() => setZoomLevel(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))} className="w-8 h-8 rounded bg-gray-100 hover:bg-gray-200 text-gray-700">+</button>
              <span className="text-xs text-gray-600 w-8 text-right tabular-nums">{zoomLevel.toFixed(1)}×</span>
            </div>
            {availableCameras.length > 1 && (
              <>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Câmera</label>
                <div className="mt-1.5 space-y-1 max-h-44 overflow-y-auto">
                  {availableCameras.map(cam => (
                    <button
                      key={cam.deviceId}
                      onClick={() => {
                        if (stream) stream.getTracks().forEach(t => t.stop())
                        setStream(null)
                        setSelectedDevice(cam.deviceId)
                      }}
                      className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${selectedDevice === cam.deviceId ? 'bg-teal-50 text-teal-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {isNative && capabilities && capabilities.supportedSizes.length > 0 && (
              <>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-2 block">Resolução (FOV)</label>
                <div className="mt-1.5 space-y-1 max-h-44 overflow-y-auto">
                  {capabilities.supportedSizes.map(s => {
                    const isCurrent = capabilities.currentSize?.w === s.w && capabilities.currentSize?.h === s.h
                    return (
                      <button
                        key={`${s.w}x${s.h}`}
                        onClick={() => {
                          window.VitallCam?.setIntraoralResolution?.(s.w, s.h)
                          // Atualiza display após troca
                          setTimeout(() => window.VitallCam?.getIntraoralCapabilities?.('window.__onIntraoralCapabilities'), 1500)
                        }}
                        className={`w-full text-left px-3 py-2 text-xs rounded transition-colors ${isCurrent ? 'bg-teal-50 text-teal-700 font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                      >
                        {s.w} × {s.h}{isCurrent ? ' • atual' : ''}
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {isNative && (
              <>
                <button
                  onClick={() => {
                    setNativePreviewState('connecting')
                    window.VitallCam?.stopIntraoralPreview?.()
                    setTimeout(() => {
                      window.VitallCam?.startIntraoralPreview?.('window.__onIntraoralState')
                    }, 600)
                  }}
                  className="mt-3 w-full text-center px-3 py-2 text-xs rounded bg-teal-600 hover:bg-teal-700 text-white font-medium"
                >
                  🔄 Reconectar câmera
                </button>
                <button
                  onClick={() => {
                    window.VitallCam?.getIntraoralCapabilities?.('window.__onIntraoralCapabilities')
                    setShowDebug(true)
                  }}
                  className="mt-2 w-full text-center px-3 py-2 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
                >
                  🔍 Diagnóstico da câmera
                </button>
              </>
            )}
          </div>
        )}
      </aside>

      {/* Animação de voo (overlay no wrapper, usa coords do viewport) */}
      {flyAnim && (
        <FlyToThumb src={flyAnim.src} to={flyAnim.to} stage={stageRef.current!} />
      )}

      {/* Galeria de capturas (modal) */}
      {showDebug && (
        <div className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowDebug(false)}>
          <div className="relative w-full max-w-2xl max-h-[85vh] bg-white rounded overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-800">🔍 Diagnóstico da câmera intraoral</span>
              <button onClick={() => setShowDebug(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-50">
              <pre className="text-[11px] leading-relaxed text-gray-800 whitespace-pre-wrap font-mono">
{capabilities ? JSON.stringify(capabilities, null, 2) : 'Aguardando dados…'}
              </pre>
            </div>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
              <button
                onClick={() => window.VitallCam?.getIntraoralCapabilities?.('window.__onIntraoralCapabilities')}
                className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium"
              >
                Atualizar
              </button>
              <button
                onClick={async () => {
                  const text = capabilities ? JSON.stringify(capabilities, null, 2) : ''
                  try {
                    await navigator.clipboard.writeText(text)
                    toast({ title: 'Copiado!', description: 'Cole no chat e me envia.' })
                  } catch {
                    // Fallback pra WebView Android
                    const ta = document.createElement('textarea')
                    ta.value = text
                    document.body.appendChild(ta)
                    ta.select()
                    document.execCommand('copy')
                    document.body.removeChild(ta)
                    toast({ title: 'Copiado!', description: 'Cole no chat e me envia.' })
                  }
                }}
                disabled={!capabilities}
                className="px-3 py-1.5 text-xs rounded bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium"
              >
                📋 Copiar
              </button>
            </div>
          </div>
        </div>
      )}

      {showGallery && capturedItems.length > 0 && (() => {
        const current = capturedItems[galleryIndex]
        return (
          <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowGallery(false)}>
            <div className="relative w-full max-w-3xl bg-white rounded overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-800">
                  {current.kind === 'video' ? 'Vídeo' : 'Foto'} {galleryIndex + 1} de {capturedItems.length}
                </span>
                <button onClick={() => setShowGallery(false)} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="relative bg-black aspect-video flex items-center justify-center">
                {current.kind === 'video' ? (
                  <video src={URL.createObjectURL(current.blob)} controls className="max-h-full max-w-full" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={current.dataUrl} alt="" className="max-h-full max-w-full object-contain" />
                )}
                {capturedItems.length > 1 && (
                  <>
                    <button
                      onClick={() => setGalleryIndex(i => Math.max(0, i - 1))}
                      disabled={galleryIndex === 0}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md text-white flex items-center justify-center disabled:opacity-30"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setGalleryIndex(i => Math.min(capturedItems.length - 1, i + 1))}
                      disabled={galleryIndex === capturedItems.length - 1}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md text-white flex items-center justify-center disabled:opacity-30"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="px-4 py-3 flex gap-2 overflow-x-auto bg-gray-50">
                {capturedItems.map((it, i) => (
                  <button
                    key={i}
                    onClick={() => setGalleryIndex(i)}
                    className={`relative shrink-0 w-16 h-16 rounded overflow-hidden ring-2 transition-all ${i === galleryIndex ? 'ring-teal-500' : 'ring-transparent hover:ring-gray-300'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={it.dataUrl} alt="" className="w-full h-full object-cover" />
                    {it.kind === 'video' && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-4 h-4 text-white fill-current" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <button
                  onClick={() => {
                    removePhoto(galleryIndex)
                    setGalleryIndex(i => Math.max(0, Math.min(i, capturedItems.length - 2)))
                    if (capturedItems.length <= 1) setShowGallery(false)
                  }}
                  className="h-9 px-4 rounded text-red-600 hover:bg-red-50 text-sm font-medium flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Remover
                </button>
                <button
                  onClick={() => { setShowGallery(false); savePhotos() }}
                  disabled={isSaving}
                  className="h-9 px-5 rounded bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar todas
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// Ícone de dente (lucide não tem nativo) — outline simples
function ToothIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M12 5.5C9.5 3 6 3 4.5 4.5 3 6 3 8.5 4 11l1.5 4c.5 1.5 1 3.5 1.5 5 .3.9 1 1.5 1.8 1.5.9 0 1.5-.6 1.7-1.5l.7-3c.2-.8.7-1.3 1.5-1.3s1.3.5 1.5 1.3l.7 3c.2.9.8 1.5 1.7 1.5.8 0 1.5-.6 1.8-1.5.5-1.5 1-3.5 1.5-5L20 11c1-2.5 1-5-.5-6.5C18 3 14.5 3 12 5.5Z" />
    </svg>
  )
}

// Componente: anima a imagem capturada do centro do stage até o thumbnail (coords de viewport)
function FlyToThumb({ src, to, stage }: { src: string; to: DOMRect; stage: HTMLElement }) {
  const [phase, setPhase] = useState<0 | 1>(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase(1))
    return () => cancelAnimationFrame(id)
  }, [])

  const stageRect = stage.getBoundingClientRect()
  // Tamanho inicial: ~30% do stage, máx 280px, igual ao aspect-ratio do thumbnail (1:1)
  const startSize = Math.min(stageRect.width * 0.3, stageRect.height * 0.5, 280)
  const startX = stageRect.left + stageRect.width / 2 - startSize / 2
  const startY = stageRect.top + stageRect.height / 2 - startSize / 2
  const endX = to.left
  const endY = to.top
  const endScale = to.width / startSize

  const style: React.CSSProperties = phase === 0
    ? { width: startSize, height: startSize, transform: `translate(${startX}px, ${startY}px) scale(1)`, opacity: 1 }
    : { width: startSize, height: startSize, transform: `translate(${endX}px, ${endY}px) scale(${endScale})`, opacity: 0.9 }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={src}
      alt=""
      className="fixed top-0 left-0 z-[65] rounded object-cover ring-2 ring-white/80 shadow-2xl pointer-events-none"
      style={{ ...style, transition: 'transform 0.55s cubic-bezier(0.5, 0, 0.2, 1), opacity 0.55s ease, width 0.55s ease, height 0.55s ease', transformOrigin: 'top left' }}
    />
  )
}