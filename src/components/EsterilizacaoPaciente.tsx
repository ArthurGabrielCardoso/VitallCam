'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Keyboard, Loader2, PackageCheck } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  PacoteComCiclo, RESPONSAVEL_PADRAO, formatarData, hojeLocal, usePacotesDoPaciente, useUsarPacote,
} from '@/hooks/useEsterilizacao'

/**
 * Esterilização na ficha do paciente.
 *
 * Fecha a rastreabilidade que a RDC 1.002/2025 pede: o ciclo diz que dez pacotes
 * foram esterilizados juntos, mas é aqui que se sabe que o pacote 03 daquele
 * ciclo foi aberto neste paciente. Sem este elo, um indicador biológico positivo
 * obriga a avisar todo mundo que passou pela cadeira naquele dia.
 *
 * O código é digitado, não lido por câmera. Houve QR na etiqueta por uma versão
 * e ele não coube: num adesivo de 50 por 12 mm, só cabia roubando espaço do
 * texto que a Vigilância lê. Digitar dez caracteres uma vez por pacote é o preço
 * — e é menor que o de uma etiqueta apertada.
 */
export default function EsterilizacaoPaciente({ patientId }: { patientId: string }) {
  const { toast } = useToast()
  const { data: pacotes, isLoading } = usePacotesDoPaciente(patientId)
  const usar = useUsarPacote()
  const [codigo, setCodigo] = useState('')

  const registrar = async (valor: string) => {
    const limpo = valor.trim().toUpperCase()
    if (!limpo) return
    try {
      const pacote = await usar.mutateAsync({ codigo: limpo, patientId, por: RESPONSAVEL_PADRAO })
      setCodigo('')
      toast({ title: `Pacote ${pacote.codigo} registrado`, description: 'Ligado a este paciente.' })
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Tente de novo'
      toast({ variant: 'destructive', title: 'Não deu para registrar', description: msg })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Keyboard className="w-4 h-4 text-gray-400" />
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') registrar(codigo) }}
          placeholder="código do pacote: 0901-02-03"
          className="h-10 w-56 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
        />
        <button
          onClick={() => registrar(codigo)}
          disabled={!codigo.trim() || usar.isPending}
          className="flex items-center gap-2 h-10 px-5 rounded text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-sm disabled:opacity-50"
        >
          {usar.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Registrar pacote'}
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando pacotes…
        </div>
      )}

      {!isLoading && (pacotes || []).length === 0 && (
        <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg bg-white">
          <PackageCheck className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum pacote registrado neste paciente.</p>
          <p className="text-xs text-gray-400 mt-1">
            Digite o código impresso na etiqueta ao abrir o pacote na cadeira.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {(pacotes || []).map((pacote) => <LinhaPacote key={pacote.id} pacote={pacote} />)}
      </div>

    </div>
  )
}

function LinhaPacote({ pacote }: { pacote: PacoteComCiclo }) {
  const ciclo = pacote.esterilizacao_ciclos
  const vencido = !!ciclo && ciclo.validade < hojeLocal()
  const reprovado = ciclo?.integrador_quimico === 'nao_conforme' || ciclo?.indicador_biologico === 'positivo'

  return (
    <div className="bg-white border border-gray-200 rounded p-4 flex items-start gap-3">
      <div
        className={`h-10 w-10 rounded flex items-center justify-center shrink-0 ${
          reprovado ? 'bg-red-600' : 'bg-gradient-to-br from-teal-600 to-teal-700'
        }`}
      >
        {reprovado ? <AlertTriangle className="w-5 h-5 text-white" /> : <PackageCheck className="w-5 h-5 text-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-gray-800">{pacote.codigo}</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {ciclo ? `Esterilizado em ${formatarData(ciclo.data)} · validade ${formatarData(ciclo.validade)}` : 'Ciclo não encontrado'}
          {ciclo?.autoclave ? ` · ${ciclo.autoclave}` : ''}
        </p>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {reprovado && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
              Ciclo reprovado
            </span>
          )}
          {ciclo?.liberado_em && !reprovado && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">
              Carga liberada
            </span>
          )}
          {vencido && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
              Usado após a validade
            </span>
          )}
          {ciclo?.conteudo && <span className="text-[10px] text-gray-500">{ciclo.conteudo}</span>}
        </div>
      </div>

      {pacote.usado_em && (
        <span className="text-[11px] text-gray-400 shrink-0">
          {new Date(pacote.usado_em).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      )}
    </div>
  )
}
