'use client'

import { useState } from 'react'
import { Transcription } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Clock, Copy, Check, FileText, Hash } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface TranscriptionDocumentProps {
  transcription: Transcription
}

// Função para renderizar markdown básico (negrito)
function renderMarkdown(text: string): JSX.Element[] {
  const parts: JSX.Element[] = []
  let currentIndex = 0
  let key = 0

  // Regex para encontrar texto entre ** **
  const boldRegex = /\*\*([^*]+)\*\*/g
  let match: RegExpExecArray | null

  while ((match = boldRegex.exec(text)) !== null) {
    // Adicionar texto antes do negrito
    if (match.index > currentIndex) {
      parts.push(
        <span key={`text-${key++}`}>
          {text.substring(currentIndex, match.index)}
        </span>
      )
    }

    // Adicionar texto em negrito
    parts.push(
      <strong key={`bold-${key++}`} className="font-bold text-gray-900">
        {match[1]}
      </strong>
    )

    currentIndex = match.index + match[0].length
  }

  // Adicionar texto restante
  if (currentIndex < text.length) {
    parts.push(
      <span key={`text-${key++}`}>
        {text.substring(currentIndex)}
      </span>
    )
  }

  return parts
}

// Função para dividir texto em parágrafos
function splitIntoParagraphs(text: string): string[] {
  return text.split('\n\n').filter(p => p.trim().length > 0)
}

export default function TranscriptionDocument({ transcription }: TranscriptionDocumentProps) {
  const [showId, setShowId] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  const paragraphs = splitIntoParagraphs(transcription.text)

  // Formatar duração
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Copiar texto
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcription.text)
      setCopied(true)
      toast({
        title: 'Copiado!',
        description: 'Texto copiado para área de transferência'
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Falha ao copiar texto'
      })
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Cabeçalho do Documento */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Transcrição
            </h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(transcription.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
              {transcription.duration_seconds && (
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDuration(transcription.duration_seconds)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-2">
          <Button
            onClick={() => setShowId(!showId)}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Hash className="w-4 h-4" />
            {showId ? 'Ocultar ID' : 'Ver ID'}
          </Button>
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                Copiado
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ID da Transcrição (opcional) */}
      {showId && (
        <Card className="mb-4 bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs font-mono text-gray-600">
              <strong>ID:</strong> {transcription.id}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Documento da Transcrição */}
      <Card className="shadow-lg">
        <CardContent className="p-8 sm:p-12">
          {/* Corpo do Documento - Estilo de Página A4 */}
          <div className="prose prose-lg max-w-none">
            <div className="space-y-4 text-gray-800 leading-relaxed">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-base sm:text-lg">
                  {renderMarkdown(paragraph)}
                </p>
              ))}
            </div>

            {/* Mensagem caso esteja vazio */}
            {paragraphs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Transcrição vazia</p>
              </div>
            )}
          </div>

          {/* Linha de Rodapé */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Gerado em {new Date(transcription.created_at).toLocaleString('pt-BR')}
              </span>
              <span
                className={`px-2 py-1 rounded-full ${
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
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
