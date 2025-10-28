'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Transcription, TranscriptionSegment } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Download, Trash2, Clock, Calendar, Copy, Check } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

interface TranscriptionViewerProps {
  patientId: string
}

export default function TranscriptionViewer({ patientId }: TranscriptionViewerProps) {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [selectedTranscription, setSelectedTranscription] = useState<Transcription | null>(null)
  const [segments, setSegments] = useState<TranscriptionSegment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const { toast } = useToast()

  // Carregar transcrições do paciente
  useEffect(() => {
    loadTranscriptions()
  }, [patientId])

  const loadTranscriptions = async () => {
    try {
      setIsLoading(true)

      const { data, error } = await supabase
        .from('transcriptions')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (error) throw error

      setTranscriptions(data || [])
    } catch (error) {
      console.error('Error loading transcriptions:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao carregar transcrições'
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Carregar segmentos de uma transcrição específica
  const loadSegments = async (transcriptionId: string) => {
    try {
      const { data, error } = await supabase
        .from('transcription_segments')
        .select('*')
        .eq('transcription_id', transcriptionId)
        .order('sequence_number', { ascending: true })

      if (error) throw error

      setSegments(data || [])
    } catch (error) {
      console.error('Error loading segments:', error)
    }
  }

  // Selecionar transcrição
  const handleSelectTranscription = (transcription: Transcription) => {
    setSelectedTranscription(transcription)
    loadSegments(transcription.id)
  }

  // Deletar transcrição
  const handleDelete = async (transcriptionId: string) => {
    if (!confirm('Tem certeza que deseja deletar esta transcrição?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('transcriptions')
        .delete()
        .eq('id', transcriptionId)

      if (error) throw error

      toast({
        title: 'Sucesso',
        description: 'Transcrição deletada'
      })

      // Atualizar lista
      setTranscriptions(prev => prev.filter(t => t.id !== transcriptionId))

      if (selectedTranscription?.id === transcriptionId) {
        setSelectedTranscription(null)
        setSegments([])
      }
    } catch (error) {
      console.error('Error deleting transcription:', error)
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao deletar transcrição'
      })
    }
  }

  // Copiar texto
  const handleCopy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)

      toast({
        title: 'Copiado!',
        description: 'Texto copiado para área de transferência'
      })

      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao copiar texto'
      })
    }
  }

  // Exportar como TXT
  const handleExport = (transcription: Transcription) => {
    const blob = new Blob([transcription.text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcricao-${new Date(transcription.created_at).toLocaleDateString('pt-BR')}.txt`
    a.click()
    URL.revokeObjectURL(url)

    toast({
      title: 'Exportado!',
      description: 'Arquivo TXT baixado'
    })
  }

  // Formatar duração
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Formatar timestamp
  const formatTimestamp = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )
  }

  if (transcriptions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Nenhuma transcrição encontrada</p>
          <p className="text-sm text-gray-500 mt-2">
            Inicie uma gravação para criar a primeira transcrição
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-black">
        Transcrições ({transcriptions.length})
      </h3>

      {/* Lista de transcrições */}
      <div className="grid gap-3">
        {transcriptions.map((transcription) => (
          <Card
            key={transcription.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedTranscription?.id === transcription.id
                ? 'ring-2 ring-primary'
                : ''
            }`}
            onClick={() => handleSelectTranscription(transcription)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Cabeçalho */}
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(transcription.created_at).toLocaleString('pt-BR')}
                    </span>
                    {transcription.duration_seconds && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(transcription.duration_seconds)}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        transcription.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : transcription.status === 'completed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {transcription.status === 'active'
                        ? 'Ativa'
                        : transcription.status === 'completed'
                        ? 'Concluída'
                        : 'Erro'}
                    </span>
                  </div>

                  {/* Preview do texto */}
                  <p className="text-sm text-gray-700 line-clamp-2">
                    {transcription.text || 'Transcrição vazia'}
                  </p>
                </div>

                {/* Botões de ação */}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopy(transcription.text, transcription.id)
                    }}
                    title="Copiar texto"
                  >
                    {copiedId === transcription.id ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExport(transcription)
                    }}
                    title="Exportar"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(transcription.id)
                    }}
                    title="Deletar"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detalhes da transcrição selecionada */}
      {selectedTranscription && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>Detalhes da Transcrição</span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleCopy(selectedTranscription.text, 'detail')}
                  variant="outline"
                >
                  {copiedId === 'detail' ? (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 mr-1" />
                      Copiar
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleExport(selectedTranscription)}
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Exportar
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Texto completo */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {selectedTranscription.text}
              </p>
            </div>

            {/* Segmentos com timestamps */}
            {segments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Segmentos com Timestamps
                </h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="flex gap-3 p-2 bg-white rounded border border-gray-200 hover:bg-gray-50"
                    >
                      <span className="text-xs font-mono text-gray-500 flex-shrink-0 pt-0.5">
                        {formatTimestamp(segment.timestamp_start)}
                      </span>
                      <p className="text-sm text-gray-700 flex-1">
                        {segment.text}
                      </p>
                      {segment.speaker && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded flex-shrink-0">
                          {segment.speaker}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
