'use client'

import { useId, useState } from 'react'
import { Loader2, ScanLine } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAnexarViaAssinada } from '@/hooks/useContratos'
import { deleteMediaFromR2, uploadMediaToR2 } from '@/lib/r2-client'
import { montarPdfDaVia } from '@/lib/contracts/via-assinada'

interface ViaAssinadaUploadProps {
  contratoId: string
  patientId: string
  /** Rótulo do botão. Sem ele fica só o ícone, para caber no card. */
  label?: string
  className?: string
}

/**
 * Anexa o contrato assinado, escaneado na multifuncional da recepção.
 *
 * Aceita o PDF do scanner ou as páginas em imagem — em qualquer caso o que sobe
 * é um PDF só, montado por `montarPdfDaVia`.
 */
export default function ViaAssinadaUpload({
  contratoId, patientId, label, className = '',
}: ViaAssinadaUploadProps) {
  const inputId = useId()
  const { toast } = useToast()
  const anexar = useAnexarViaAssinada()
  const [processando, setProcessando] = useState(false)

  const ocupado = processando || anexar.isPending

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    setProcessando(true)
    // Guarda a URL, não a chave: é o que `deleteMediaFromR2` sabe interpretar.
    let urlEnviada: string | null = null
    try {
      const { blob, paginas } = await montarPdfDaVia(files)

      const enviado = await uploadMediaToR2({
        patientId,
        mediaType: 'contrato',
        data: blob,
        contentType: 'application/pdf',
      })
      urlEnviada = enviado.url

      await anexar.mutateAsync({ id: contratoId, patientId, key: enviado.key, paginas })

      toast({
        title: 'Via assinada anexada',
        // A contagem só existe quando as páginas foram montadas aqui a partir
        // de imagens; PDF vindo pronto do scanner não declara nada.
        description: paginas
          ? `${paginas} ${paginas === 1 ? 'página' : 'páginas'} na ficha do paciente.`
          : 'Guardada na ficha do paciente.',
      })
    } catch (error) {
      // O arquivo já subiu mas o registro falhou: sem isso fica um PDF órfão no
      // R2 que ninguém nunca mais encontra — mesmo cuidado do ImageUpload.
      if (urlEnviada) {
        deleteMediaFromR2(urlEnviada).catch(err => console.error('Erro ao limpar via assinada:', err))
      }
      toast({
        variant: 'destructive',
        title: 'Não foi possível anexar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      })
    } finally {
      setProcessando(false)
    }
  }

  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/*"
        multiple
        onChange={handleFileChange}
        disabled={ocupado}
        className="hidden"
      />
      <label
        htmlFor={inputId}
        title="Anexar o contrato assinado, escaneado"
        className={`inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${className} ${
          ocupado ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        {ocupado
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <ScanLine className="w-3.5 h-3.5" />}
        {label && <span>{ocupado ? 'Enviando…' : label}</span>}
      </label>
    </>
  )
}
