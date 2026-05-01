'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Photo, CameraDevice } from '@/lib/types'
import { useCreateFolder } from '@/hooks/useFolders'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Camera, Loader2, AlertCircle, RefreshCw, Save, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'



interface CameraCaptureProps {
  patientId: string
  onPhotoCapture: (photo: Photo) => void
}

declare global {
  interface Window {
    VitallCam?: {
      isNative: () => boolean
      openIntraoralCamera: (callbackName?: string) => void
    }
    __onIntraoralCapture?: (dataUrls: string[], error: string | null) => void
  }
}

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

export default function CameraCapture({ patientId, onPhotoCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([])
  const [showCameraSelector, setShowCameraSelector] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [cameraError, setCameraError] = useState<string>('')
  const [isInitializing] = useState(false)
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([])
  const [showSaveButton, setShowSaveButton] = useState(false)
  const [zoomTriggerEnabled] = useState(true)
  const [lastCaptureTime, setLastCaptureTime] = useState(0)
  const [stableStartTime, setStableStartTime] = useState<number | null>(null)
  const [goodFocusThreshold] = useState(50)
  const [zoomLevel, setZoomLevel] = useState(1)
  const { toast } = useToast()
  const router = useRouter()
  const createFolderMutation = useCreateFolder()
  const isNativeRef = useRef(false)

  useEffect(() => {
    const native = typeof window !== 'undefined' && !!window.VitallCam?.isNative?.()
    isNativeRef.current = native
    if (native) {
      // Auto-abre a câmera intraoral USB ao entrar na tela (sem precisar de botão)
      setTimeout(() => captureFromIntraoralUsb(), 300)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const captureFromIntraoralUsb = () => {
    if (!window.VitallCam?.openIntraoralCamera) return
    window.__onIntraoralCapture = (dataUrls, error) => {
      if (error === 'cancelled' || !dataUrls || dataUrls.length === 0) {
        if (error && error !== 'cancelled') {
          toast({
            variant: 'destructive',
            title: 'Câmera intraoral',
            description: error,
          })
        }
        return
      }
      setCapturedPhotos(prev => [...dataUrls, ...prev])
      setShowSaveButton(true)
      toast({
        title: '🦷 Fotos intraorais capturadas',
        description: `${dataUrls.length} foto(s) salvando no paciente...`,
      })
      // Auto-salva no Supabase já que o usuário clicou Salvar na tela nativa
      // setTimeout dá tempo do React re-renderizar com capturedPhotos atualizado
      setTimeout(() => savePhotosRef.current(), 200)
    }
    window.VitallCam.openIntraoralCamera('window.__onIntraoralCapture')
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
    capturePhotoRef.current = capturePhoto
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

  // Atualizar showSaveButton quando capturedPhotos mudar
  useEffect(() => {
    setShowSaveButton(capturedPhotos.length > 0)
  }, [capturedPhotos])

  // Sistema inteligente removido - câmera básica e rápida

  // Notificação automática removida


  // INICIALIZAR SISTEMA DE CÂMERA SIMPLES
  const initializeCameraSystem = async () => {
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

      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      const finalImageData = canvas.toDataURL('image/jpeg', 0.95)

      setCapturedPhotos(prev => [finalImageData, ...prev])
      setShowSaveButton(true)

      // Efeito flash
      const flashOverlay = document.createElement('div')
      flashOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: white;
        z-index: 9999;
        pointer-events: none;
        animation: flash 0.3s ease-out;
      `

      const style = document.createElement('style')
      style.textContent = `
        @keyframes flash {
          0% { opacity: 0; }
          50% { opacity: 0.8; }
          100% { opacity: 0; }
        }
      `
      document.head.appendChild(style)
      document.body.appendChild(flashOverlay)

      setTimeout(() => {
        document.body.removeChild(flashOverlay)
        document.head.removeChild(style)
      }, 300)

      toast({
        title: "✅ Foto capturada",
        description: "Imagem capturada com sucesso!"
      })

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


  const savePhotos = async () => {
    if (capturedPhotos.length === 0) return

    setIsSaving(true)

    try {
      // Verificar conexão com Supabase
      console.log('Testando conexão com Supabase...')
      const { error: testError } = await supabase
        .from('photos')
        .select('id')
        .limit(1)

      if (testError) {
        console.error('Erro de conexão com Supabase:', testError)
        throw new Error(`Erro de conexão: ${testError.message}`)
      }

      console.log('Conexão com Supabase OK')

      // Criar ou verificar se a pasta existe
      const today = new Date()
      const folderDate = today.toLocaleDateString('pt-BR')
      const folderName = `Pasta ${folderDate}`

      console.log('Criando pasta:', folderName)

      const folder = await createFolderMutation.mutateAsync({
        name: folderName,
        patient_id: patientId
      })

      const folderId = folder.id
      console.log('✅ Pasta pronta! ID:', folderId)

      // Salvar fotos em sequência com delay para garantir ordem por created_at
      const savedPhotos: any[] = []
      
      // Inverter ordem para que a primeira capturada seja salva primeiro
      const photosToSave = [...capturedPhotos].reverse()
      
      for (let index = 0; index < photosToSave.length; index++) {
        const imageData = photosToSave[index]
        
        // Pequeno delay entre inserções para garantir timestamps únicos e sequenciais
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, 50)) // 50ms delay
        }

        console.log(`Salvando foto ${index + 1}/${photosToSave.length} na pasta ${folderName}`)

        // Verificar se os dados estão válidos
        if (!patientId || patientId.trim() === '') {
          throw new Error('ID do paciente inválido')
        }

        if (!imageData || imageData.trim() === '') {
          throw new Error('Dados da imagem inválidos')
        }

        // Inserir foto no Supabase
        const { data, error } = await supabase
          .from('photos')
          .insert({
            patient_id: patientId,
            image_data: imageData,
            folder_id: folderId
          })
          .select()
          .single()

        if (error) {
          console.error('❌ Erro ao salvar foto:', error)
          throw error
        }

        console.log(`✅ Foto ${index + 1} salva! ID: ${data.id}, Time: ${data.created_at}`)
        savedPhotos.push(data)
      }

      // Notificar componente pai sobre as fotos salvas
      savedPhotos.forEach(photo => onPhotoCapture(photo))

      toast({
        title: "Sucesso!",
        description: `${capturedPhotos.length} foto(s) salva(s) na pasta "${folderName}"`
      })

      // Limpar fotos capturadas
      setCapturedPhotos([])
      setShowSaveButton(false)

      // No APK (fluxo da câmera intraoral USB), volta direto pro perfil do paciente
      if (isNativeRef.current) {
        router.push(`/patients/${patientId}`)
      }

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
    setCapturedPhotos(prev => {
      const newPhotos = prev.filter((_, i) => i !== index)
      if (newPhotos.length === 0) {
        setShowSaveButton(false)
      }
      return newPhotos
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

  return (
    <div className="h-screen w-screen relative bg-black overflow-hidden">
      {/* Vídeo da Câmera Padrão - 100% da tela sem bordas */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover absolute inset-0 transition-transform duration-100"
        style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }}
        playsInline
        muted
      />

      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Canvas oculto */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Botões Flutuantes */}
      <div className="absolute top-4 left-4 flex gap-4 items-center z-10">
        {/* Botão Capturar */}
        <Button
          onClick={capturePhoto}
          disabled={!stream || isCapturing}
          className="bg-primary hover:bg-primary/90 text-white rounded-full w-14 h-14 p-0 shadow-lg"
        >
          {isCapturing ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <Camera className="w-6 h-6" />
          )}
        </Button>

        {/* Botão Salvar (se houver fotos) */}
        {showSaveButton && (
          <Button
            onClick={savePhotos}
            disabled={isSaving}
            className="bg-secondary hover:bg-secondary/90 text-white rounded-full w-14 h-14 p-0 shadow-lg"
          >
            {isSaving ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <Save className="w-6 h-6" />
            )}
          </Button>
        )}

        {/* Seletor de câmera manual */}
        {availableCameras.length > 1 && (
          <div className="relative">
            <Button
              onClick={() => setShowCameraSelector(v => !v)}
              className="bg-black/60 hover:bg-black/80 text-white rounded-full w-14 h-14 p-0 shadow-lg border border-white/30"
              title="Trocar câmera"
            >
              <RefreshCw className="w-5 h-5" />
            </Button>
            {showCameraSelector && (
              <div className="absolute top-16 left-0 bg-white rounded-xl shadow-2xl z-50 min-w-64 max-w-xs overflow-hidden">
                <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b">
                  Selecionar câmera
                </p>
                {availableCameras.map((cam) => (
                  <button
                    key={cam.deviceId}
                    onClick={() => {
                      setShowCameraSelector(false)
                      if (stream) stream.getTracks().forEach(t => t.stop())
                      setStream(null)
                      setSelectedDevice(cam.deviceId)
                    }}
                    className={`w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b last:border-0 ${
                      selectedDevice === cam.deviceId ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-800'
                    }`}
                  >
                    {cam.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

      </div>



      {/* Controle de Zoom */}
      {stream && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-full">
          <button
            onClick={() => setZoomLevel(z => Math.max(1, parseFloat((z - 0.25).toFixed(2))))}
            className="text-white text-xl font-bold w-8 h-8 flex items-center justify-center hover:text-primary"
          >−</button>
          <input
            type="range"
            min="1"
            max="4"
            step="0.1"
            value={zoomLevel}
            onChange={e => setZoomLevel(parseFloat(e.target.value))}
            className="w-32 accent-primary"
          />
          <button
            onClick={() => setZoomLevel(z => Math.min(4, parseFloat((z + 0.25).toFixed(2))))}
            className="text-white text-xl font-bold w-8 h-8 flex items-center justify-center hover:text-primary"
          >+</button>
          <span className="text-white text-sm min-w-[40px]">{zoomLevel.toFixed(1)}×</span>
        </div>
      )}

      {/* Área das Fotos Capturadas - Lado Direito */}
      {capturedPhotos.length > 0 && (
        <div className="absolute top-0 right-0 bottom-0 w-80 bg-white/95 backdrop-blur-sm p-4 shadow-xl">
          <h3 className="text-lg font-semibold text-black mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5 text-primary" />
            Fotos Capturadas ({capturedPhotos.length})
          </h3>
          <div className="flex flex-col gap-2 max-h-full overflow-y-auto">
            {capturedPhotos.map((photo, index) => (
              <div key={index} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo}
                  alt={`Capturada ${index + 1}`}
                  className="w-full aspect-square object-cover rounded-md border border-primary/20"
                />
                <button
                  onClick={() => removePhoto(index)}
                  className="absolute top-1 right-1 bg-destructive hover:bg-destructive/90 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}