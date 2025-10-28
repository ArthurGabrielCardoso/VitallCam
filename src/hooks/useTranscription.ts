import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Transcription, NewTranscription, NewTranscriptionSegment } from '@/lib/types'
import { useToast } from '@/hooks/use-toast'
import { postProcessDentalTranscription } from '@/lib/gemini-transcription'

interface UseTranscriptionProps {
  patientId: string
}

interface TranscriptionSegment {
  text: string
  start: number
  end: number
  confidence?: number
  speaker?: string
}

export function useTranscription({ patientId }: UseTranscriptionProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [transcriptionId, setTranscriptionId] = useState<string | null>(null)
  const [currentText, setCurrentText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const startTimeRef = useRef<Date | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const sequenceNumberRef = useRef(0)

  const { toast } = useToast()

  // Atualizar duração da gravação
  useEffect(() => {
    if (isRecording && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const duration = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
          setRecordingDuration(duration)
        }
      }, 1000)
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [isRecording, isPaused])

  // Criar nova transcrição no banco
  const createTranscription = useCallback(async (): Promise<string | null> => {
    try {
      const now = new Date().toISOString()

      const { data, error } = await supabase
        .from('transcriptions')
        .insert({
          patient_id: patientId,
          text: '',
          started_at: now,
          status: 'active'
        } as NewTranscription)
        .select()
        .single()

      if (error) throw error

      return data.id
    } catch (error) {
      console.error('Error creating transcription:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao criar transcrição'
      })
      return null
    }
  }, [patientId, toast])

  // Salvar segmento de transcrição
  const saveTranscriptionSegment = useCallback(async (
    transcriptionId: string,
    segment: TranscriptionSegment,
    sequenceNumber: number
  ) => {
    try {
      await supabase
        .from('transcription_segments')
        .insert({
          transcription_id: transcriptionId,
          text: segment.text,
          timestamp_start: segment.start,
          timestamp_end: segment.end,
          confidence: segment.confidence,
          speaker: segment.speaker,
          sequence_number: sequenceNumber
        } as NewTranscriptionSegment)

    } catch (error) {
      console.error('Error saving segment:', error)
    }
  }, [])

  // Atualizar texto da transcrição
  const updateTranscriptionText = useCallback(async (
    transcriptionId: string,
    newText: string
  ) => {
    try {
      await supabase
        .from('transcriptions')
        .update({
          text: newText,
          updated_at: new Date().toISOString()
        })
        .eq('id', transcriptionId)

    } catch (error) {
      console.error('Error updating transcription:', error)
    }
  }, [])

  // Processar áudio COMPLETO (chamado apenas ao parar gravação)
  const processCompleteAudio = useCallback(async (audioBlob: Blob, currentTranscriptionId: string) => {
    try {
      console.log('[Transcrição] Iniciando processamento de áudio COMPLETO...', { tamanho: audioBlob.size })
      setIsProcessing(true)

      // Criar FormData para enviar o áudio
      const formData = new FormData()
      formData.append('audio', audioBlob, 'audio.webm')
      formData.append('language', 'pt')

      // Chamar API de transcrição
      console.log('[Transcrição] Enviando ÁUDIO COMPLETO para API Modal...')
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      })

      console.log('[Transcrição] Resposta recebida:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Transcrição] Erro da API:', errorText)
        throw new Error(`Transcription API failed: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      console.log('[Transcrição] Resultado WhisperX:', result)

      if (result.success && result.text) {
        const rawText = result.text.trim()

        // PASSO 1: Salvar transcrição bruta
        setCurrentText(rawText)
        console.log('[Transcrição] Texto bruto salvo. Iniciando pós-processamento com Gemini...')

        // PASSO 2: Pós-processamento com Gemini
        toast({
          title: 'Aprimorando transcrição...',
          description: 'Gemini AI está corrigindo e formatando o texto',
        })

        try {
          const postProcessed = await postProcessDentalTranscription(
            rawText,
            result.segments
          )

          console.log('[Transcrição] Pós-processamento Gemini concluído')
          console.log('[Transcrição] Melhorias aplicadas:', postProcessed.improvements)

          // Usar texto corrigido/formatado
          const finalText = postProcessed.formatted_text
          setCurrentText(finalText)

          // PASSO 3: Salvar segmentos
          if (result.segments && Array.isArray(result.segments)) {
            for (const segment of result.segments) {
              await saveTranscriptionSegment(
                currentTranscriptionId,
                segment,
                sequenceNumberRef.current++
              )
            }
          }

          // PASSO 4: Atualizar transcrição completa no banco com texto melhorado
          await updateTranscriptionText(currentTranscriptionId, finalText)

          console.log('[Transcrição] ✅ Transcrição completa + pós-processamento salvo!')

          // Notificar usuário com detalhes
          toast({
            title: 'Transcrição concluída!',
            description: `${finalText.split(' ').length} palavras | ${postProcessed.improvements.length} melhorias aplicadas`,
          })

        } catch (geminiError) {
          console.error('[Transcrição] Erro no pós-processamento Gemini:', geminiError)

          // Fallback: usar texto bruto se Gemini falhar
          if (result.segments && Array.isArray(result.segments)) {
            for (const segment of result.segments) {
              await saveTranscriptionSegment(
                currentTranscriptionId,
                segment,
                sequenceNumberRef.current++
              )
            }
          }

          await updateTranscriptionText(currentTranscriptionId, rawText)

          toast({
            title: 'Transcrição concluída!',
            description: `${rawText.split(' ').length} palavras (sem pós-processamento)`,
          })
        }
      }

    } catch (error) {
      console.error('[Transcrição] ERRO ao processar áudio:', error)
      toast({
        variant: 'destructive',
        title: 'Erro na transcrição',
        description: error instanceof Error ? error.message : 'Falha ao processar áudio'
      })
    } finally {
      console.log('[Transcrição] Finalizando processamento')
      setIsProcessing(false)
    }
  }, [saveTranscriptionSegment, updateTranscriptionText, toast])

  // Iniciar gravação
  const startRecording = useCallback(async () => {
    try {
      console.log('[Transcrição] Solicitando acesso ao microfone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      console.log('[Transcrição] Microfone autorizado')

      // Criar transcrição no banco
      const newTranscriptionId = await createTranscription()
      if (!newTranscriptionId) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      setTranscriptionId(newTranscriptionId)
      setCurrentText('')
      sequenceNumberRef.current = 0

      // Configurar MediaRecorder com bitrate otimizado
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 64000,  // 64kbps = melhor qualidade
      })

      audioChunksRef.current = []
      mediaRecorderRef.current = mediaRecorder

      // NOVA ESTRATÉGIA: Acumular TODOS os chunks durante a gravação
      // Processar apenas quando clicar em "Parar" (máxima precisão + contexto completo)
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log('[Transcrição] Chunk capturado:', event.data.size, 'bytes')
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('[Transcrição] Gravação parada. Processando áudio completo...')
        stream.getTracks().forEach(track => track.stop())

        // Processar ÁUDIO COMPLETO após parar gravação
        if (audioChunksRef.current.length > 0) {
          const completeAudioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          console.log('[Transcrição] Áudio completo:', completeAudioBlob.size, 'bytes')
          await processCompleteAudio(completeAudioBlob, newTranscriptionId)
        }
      }

      // Iniciar gravação
      mediaRecorder.start()
      startTimeRef.current = new Date()
      setIsRecording(true)
      setRecordingDuration(0)

      toast({
        title: 'Gravação iniciada',
        description: 'Clique em "Parar" para processar a transcrição'
      })

    } catch (error) {
      console.error('Error starting recording:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao acessar microfone'
      })
    }
  }, [createTranscription, processCompleteAudio, toast])

  // Pausar gravação
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause()
      setIsPaused(true)

      toast({
        title: 'Gravação pausada',
        description: 'Clique novamente para retomar'
      })
    }
  }, [toast])

  // Retomar gravação
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume()
      setIsPaused(false)

      toast({
        title: 'Gravação retomada',
        description: 'Transcrição continuando'
      })
    }
  }, [toast])

  // Parar gravação
  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && transcriptionId) {
      console.log('[Transcrição] Parando gravação...')

      // Parar MediaRecorder (isso dispara onstop que processa o áudio)
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      setIsPaused(false)

      // Calcular duração
      const endTime = new Date().toISOString()
      const duration = startTimeRef.current
        ? Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
        : 0

      // Atualizar status da transcrição no banco
      await supabase
        .from('transcriptions')
        .update({
          status: 'completed',
          ended_at: endTime,
          duration_seconds: duration
        })
        .eq('id', transcriptionId)

      toast({
        title: 'Processando transcrição...',
        description: `Aguarde enquanto processamos ${duration}s de áudio`
      })

      // Reset state após um tempo
      setTimeout(() => {
        setRecordingDuration(0)
      }, 2000)
    }
  }, [transcriptionId, toast])

  // Toggle gravação (iniciar/parar)
  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }, [isRecording, startRecording, stopRecording])

  return {
    isRecording,
    isPaused,
    transcriptionId,
    currentText,
    isProcessing,
    recordingDuration,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    toggleRecording
  }
}
