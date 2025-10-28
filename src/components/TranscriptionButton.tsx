'use client'

import { useTranscription } from '@/hooks/useTranscription'
import { Button } from '@/components/ui/button'
import { Mic, MicOff, Pause, Play, Loader2 } from 'lucide-react'
import { useState } from 'react'

interface TranscriptionButtonProps {
  patientId: string
  onTranscriptionChange?: (text: string) => void
  className?: string
}

export default function TranscriptionButton({
  patientId,
  onTranscriptionChange,
  className = ''
}: TranscriptionButtonProps) {
  const {
    isRecording,
    isPaused,
    currentText,
    isProcessing,
    recordingDuration,
    toggleRecording,
    pauseRecording,
    resumeRecording
  } = useTranscription({ patientId })

  const [showTranscription, setShowTranscription] = useState(false)

  // Notificar mudanças na transcrição
  if (onTranscriptionChange && currentText) {
    onTranscriptionChange(currentText)
  }

  // Formatar duração em MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        {/* Botão principal de gravação */}
        <Button
          onClick={toggleRecording}
          className={`
            relative overflow-hidden transition-all duration-300
            ${isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-primary hover:bg-primary/90 text-white'
            }
            ${className}
          `}
        >
          {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}

          {!isRecording && !isProcessing && <Mic className="w-4 h-4 mr-2" />}
          {isRecording && !isProcessing && (
            <>
              <MicOff className="w-4 h-4 mr-2" />
              {/* Animação de pulsação */}
              <span className="absolute inset-0 bg-red-600 animate-ping opacity-25"></span>
            </>
          )}

          <span className="relative z-10">
            {isRecording ? 'Parar Transcrição' : 'Iniciar Transcrição'}
          </span>
        </Button>

        {/* Botão de pausar/retomar (apenas quando gravando) */}
        {isRecording && (
          <Button
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="bg-orange-500 hover:bg-orange-600 text-white"
            size="sm"
          >
            {isPaused ? (
              <>
                <Play className="w-4 h-4 mr-1" />
                Retomar
              </>
            ) : (
              <>
                <Pause className="w-4 h-4 mr-1" />
                Pausar
              </>
            )}
          </Button>
        )}

        {/* Mostrar/ocultar transcrição */}
        {currentText && (
          <Button
            onClick={() => setShowTranscription(!showTranscription)}
            variant="outline"
            size="sm"
          >
            {showTranscription ? 'Ocultar' : 'Ver'} Texto
          </Button>
        )}
      </div>

      {/* Status da gravação */}
      {isRecording && (
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-orange-500' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-gray-600">
              {isPaused ? 'Pausado' : 'Gravando'}
            </span>
          </div>

          <div className="font-mono text-gray-700">
            {formatDuration(recordingDuration)}
          </div>

          {isProcessing && (
            <div className="flex items-center gap-1 text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-xs">Transcrevendo...</span>
            </div>
          )}
        </div>
      )}

      {/* Preview da transcrição */}
      {showTranscription && currentText && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-600 uppercase">
              Transcrição em tempo real
            </span>
            <span className="text-xs text-gray-500">
              {currentText.split(' ').length} palavras
            </span>
          </div>
          <div className="text-sm text-gray-800 max-h-32 overflow-y-auto">
            {currentText}
          </div>
        </div>
      )}
    </div>
  )
}
