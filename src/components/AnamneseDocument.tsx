'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Anamnese } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Copy, Check, FileText, Hash, User, Phone, Mail, Instagram } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface AnamneseDocumentProps {
  anamnese: Anamnese
}

export default function AnamneseDocument({ anamnese }: AnamneseDocumentProps) {
  const [showId, setShowId] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()

  // Função para formatar dados de saúde em texto
  const formatDadosSaude = (dados: Record<string, any>): string => {
    const linhas: string[] = []

    for (const [key, value] of Object.entries(dados)) {
      if (value && value !== 'Não' && value !== 'não') {
        // Formatar o nome da chave de camelCase para texto legível
        const label = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase())
          .trim()

        linhas.push(`**${label}:** ${value}`)
      }
    }

    return linhas.join('\n\n')
  }

  const textoCompleto = `
**DADOS PESSOAIS**

**Nome:** ${anamnese.nome}
${anamnese.endereco ? `**Endereço:** ${anamnese.endereco}` : ''}
${anamnese.telefone ? `**Telefone:** ${anamnese.telefone}` : ''}
${anamnese.telefone_auxiliar ? `**Telefone Auxiliar:** ${anamnese.telefone_auxiliar}` : ''}
${anamnese.email ? `**E-mail:** ${anamnese.email}` : ''}
${anamnese.instagram ? `**Instagram:** ${anamnese.instagram}` : ''}

**INFORMAÇÕES DE SAÚDE**

${formatDadosSaude(anamnese.dados_saude)}
  `.trim()

  // Copiar texto
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textoCompleto)
      setCopied(true)
      toast({
        title: 'Copiado!',
        description: 'Anamnese copiada para área de transferência'
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

  // Renderizar markdown básico
  const renderMarkdown = (text: string): JSX.Element[] => {
    const parts: JSX.Element[] = []
    let currentIndex = 0
    let key = 0

    const boldRegex = /\*\*([^*]+)\*\*/g
    let match: RegExpExecArray | null

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > currentIndex) {
        parts.push(
          <span key={`text-${key++}`}>
            {text.substring(currentIndex, match.index)}
          </span>
        )
      }

      parts.push(
        <strong key={`bold-${key++}`} className="font-bold text-gray-900">
          {match[1]}
        </strong>
      )

      currentIndex = match.index + match[0].length
    }

    if (currentIndex < text.length) {
      parts.push(
        <span key={`text-${key++}`}>
          {text.substring(currentIndex)}
        </span>
      )
    }

    return parts
  }

  const paragraphs = textoCompleto.split('\n\n').filter(p => p.trim().length > 0)

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Cabeçalho do Documento */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Ficha de Anamnese
            </h2>
            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {new Date(anamnese.created_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
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

      {/* ID da Anamnese (opcional) */}
      {showId && (
        <Card className="mb-4 bg-gray-50 border-gray-200">
          <CardContent className="p-4">
            <p className="text-xs font-mono text-gray-600">
              <strong>ID:</strong> {anamnese.id}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Documento da Anamnese */}
      <Card className="shadow-lg">
        <CardContent className="p-8 sm:p-12">
          {/* Logo */}
          <div className="mb-8 text-center border-b pb-6">
            <Image
              src="/assets/images/logo.png"
              alt="Logo"
              width={150}
              height={75}
              className="mx-auto object-contain"
            />
          </div>

          {/* Corpo do Documento */}
          <div className="prose prose-lg max-w-none">
            <div className="space-y-4 text-gray-800 leading-relaxed">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-base sm:text-lg">
                  {renderMarkdown(paragraph)}
                </p>
              ))}
            </div>
          </div>

          {/* Assinatura */}
          {anamnese.assinatura && (
            <div className="mt-12 pt-6 border-t border-gray-200">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">Assinatura do Paciente:</p>
                <div className="border border-gray-300 rounded-lg p-4 bg-white inline-block">
                  <img
                    src={anamnese.assinatura}
                    alt="Assinatura"
                    className="max-w-xs h-24 object-contain"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Linha de Rodapé */}
          <div className="mt-12 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                Gerado em {new Date(anamnese.created_at).toLocaleString('pt-BR')}
              </span>
              <span className="px-2 py-1 rounded-full bg-green-100 text-green-700">
                Completa
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
