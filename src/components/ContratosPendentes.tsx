'use client'

import { useRouter } from 'next/navigation'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { useContratosPendentes } from '@/hooks/useContratos'
import ViaAssinadaUpload from '@/components/ViaAssinadaUpload'

/**
 * Contratos impressos que nunca voltaram assinados, entre todos os pacientes.
 *
 * Mais antigos primeiro: o papel esquecido há três semanas é o que vira
 * problema, não o de ontem. Some sozinha quando está tudo em dia — lista vazia
 * aqui é a situação normal, e não precisa ocupar espaço dizendo isso.
 */

/** "hoje" / "ontem" / "há 12 dias" — o que importa é quanto tempo faz. */
function haQuantoTempo(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (dias <= 0) return 'hoje'
  if (dias === 1) return 'ontem'
  if (dias < 30) return `há ${dias} dias`
  const meses = Math.floor(dias / 30)
  return meses === 1 ? 'há 1 mês' : `há ${meses} meses`
}

export default function ContratosPendentes() {
  const router = useRouter()
  const { data: pendentes = [] } = useContratosPendentes()

  if (pendentes.length === 0) return null

  return (
    <section className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-4 h-4 text-amber-500" />
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Aguardando via assinada
        </h2>
        <span className="text-[11px] px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
          {pendentes.length}
        </span>
      </div>

      <div className="border border-amber-200 rounded bg-amber-50/40 divide-y divide-amber-100">
        {pendentes.map(c => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
            <button
              onClick={() => router.push(`/patients/${c.patient_id}`)}
              className="flex-1 min-w-0 text-left group"
              title="Abrir a ficha do paciente"
            >
              <p className="text-sm font-medium text-gray-800 truncate group-hover:text-teal-700 transition-colors">
                {c.paciente_nome}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {c.titulo} · impresso {haQuantoTempo(c.created_at)}
              </p>
            </button>
            <ViaAssinadaUpload
              contratoId={c.id}
              patientId={c.patient_id}
              label="Anexar"
              className="shrink-0 text-[11px] font-medium text-teal-700 hover:text-teal-800 px-2 py-1 rounded hover:bg-teal-100/60 border border-teal-200 bg-white"
            />
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  )
}
