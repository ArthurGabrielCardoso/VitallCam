'use client'

import { useState } from 'react'
import { CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useMarcarEnviado, type ContratoEmitido } from '@/hooks/useContratos'
import { supabase } from '@/lib/supabase'
import ViaAssinadaUpload from '@/components/ViaAssinadaUpload'

/**
 * Rodapé do card de um contrato emitido: mostra se o papel assinado já voltou
 * digitalizado e oferece o que fazer a seguir.
 */
export default function ViaAssinadaAcoes({
  contrato, patientId,
}: {
  contrato: ContratoEmitido
  patientId: string
}) {
  const { toast } = useToast()
  const marcarEnviado = useMarcarEnviado()
  const [enviando, setEnviando] = useState(false)

  const temVia = !!contrato.via_assinada_key

  const abrir = () => {
    if (!contrato.via_assinada_key) return
    window.open(`/api/r2/object?key=${encodeURIComponent(contrato.via_assinada_key)}`, '_blank', 'noopener')
  }

  const enviar = async () => {
    setEnviando(true)
    try {
      const resposta = await fetch('/api/contrato/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: contrato.id }),
      })
      const corpo = await resposta.json()
      if (!resposta.ok) throw new Error(corpo?.detalhe || corpo?.error || 'Falha ao gerar o link')

      // O telefone mora na anamnese, não na tabela de pacientes. Sem ele o
      // WhatsApp abre no seletor de contato — que resolve igual, só com um
      // toque a mais.
      const { data } = await supabase
        .from('anamneses')
        .select('telefone')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const digitos = ((data as { telefone?: string } | null)?.telefone || '').replace(/\D/g, '')
      const numero = digitos.length >= 10 ? `55${digitos.slice(-11)}` : ''

      const texto = `Olá! Segue a via assinada do documento "${contrato.titulo}".\n\n${corpo.url}\n\nO link vale por 7 dias.`
      window.open(
        `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`,
        '_blank',
        'noopener',
      )

      marcarEnviado.mutate({ id: contrato.id, patientId })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível preparar o envio',
        description: error instanceof Error ? error.message : 'Tente novamente.',
      })
    } finally {
      setEnviando(false)
    }
  }

  if (!temVia) {
    return (
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-0">
        <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
          Falta a via assinada
        </span>
        <ViaAssinadaUpload
          contratoId={contrato.id}
          patientId={patientId}
          label="Anexar"
          className="text-[11px] font-medium text-teal-700 hover:text-teal-800 px-2 py-1 rounded hover:bg-teal-50"
        />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-0">
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 shrink-0">
        <CheckCircle2 className="w-3 h-3" />
        Assinado
      </span>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={abrir}
          title="Abrir a via assinada"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Abrir
        </button>
        <button
          onClick={enviar}
          disabled={enviando}
          title={contrato.enviado_paciente_em ? 'Já enviado — mandar de novo' : 'Enviar ao paciente pelo WhatsApp'}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-teal-700 px-2 py-1 rounded hover:bg-teal-50 transition-colors disabled:opacity-50"
        >
          {enviando
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />}
          {contrato.enviado_paciente_em ? 'Reenviar' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
