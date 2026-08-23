'use client'

import { useMemo } from 'react'

/**
 * Escolha de dentes por odontograma, na notação FDI (a mesma do prontuário).
 *
 * Existe porque digitar "16, 26" à mão num termo de consentimento é onde o erro
 * passa batido — e o campo continua editável para quem preferir escrever, ou
 * para casos que não cabem no quadrante (ex.: "todos os superiores").
 *
 * Os quadrantes seguem a ordem clínica: do fundo para a linha média em cima,
 * e da linha média para o fundo embaixo — é assim que o dentista lê a boca de
 * frente para o paciente.
 */

const SUP_DIR = [18, 17, 16, 15, 14, 13, 12, 11]
const SUP_ESQ = [21, 22, 23, 24, 25, 26, 27, 28]
const INF_DIR = [48, 47, 46, 45, 44, 43, 42, 41]
const INF_ESQ = [31, 32, 33, 34, 35, 36, 37, 38]

/** "16, 26" → Set{16,26}. Ignora o que não for número, pra não brigar com texto livre. */
function parse(valor: string): Set<number> {
  const s = new Set<number>()
  for (const parte of (valor || '').split(/[,;/\s]+/)) {
    const n = Number(parte.trim())
    if (Number.isInteger(n) && n >= 11 && n <= 48) s.add(n)
  }
  return s
}

export default function SeletorDentes({
  valor, onChange,
}: {
  valor: string
  onChange: (v: string) => void
}) {
  const marcados = useMemo(() => parse(valor), [valor])

  const alternar = (d: number) => {
    const novo = new Set(marcados)
    if (novo.has(d)) novo.delete(d)
    else novo.add(d)
    // Ordena numericamente pra lista não depender da ordem dos cliques.
    onChange(Array.from(novo).sort((a, b) => a - b).join(', '))
  }

  const limpar = () => onChange('')

  return (
    <div className="rounded border border-gray-200 bg-white p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500">Odontograma</span>
        {marcados.size > 0 && (
          <button
            onClick={limpar}
            className="text-[10px] text-gray-400 hover:text-red-600 transition-colors"
          >
            limpar
          </button>
        )}
      </div>

      <div className="space-y-1">
        <Arcada esquerda={SUP_DIR} direita={SUP_ESQ} marcados={marcados} onToggle={alternar} />
        <div className="h-px bg-gray-200 my-1" />
        <Arcada esquerda={INF_DIR} direita={INF_ESQ} marcados={marcados} onToggle={alternar} />
      </div>

      <p className="text-[10px] text-gray-400 mt-2 leading-snug">
        Clique nos dentes ou escreva direto no campo acima.
      </p>
    </div>
  )
}

function Arcada({
  esquerda, direita, marcados, onToggle,
}: {
  esquerda: number[]
  direita: number[]
  marcados: Set<number>
  onToggle: (d: number) => void
}) {
  return (
    <div className="flex items-center gap-1 justify-center">
      <Metade dentes={esquerda} marcados={marcados} onToggle={onToggle} />
      <div className="w-px h-6 bg-gray-300 mx-0.5" />
      <Metade dentes={direita} marcados={marcados} onToggle={onToggle} />
    </div>
  )
}

function Metade({
  dentes, marcados, onToggle,
}: {
  dentes: number[]
  marcados: Set<number>
  onToggle: (d: number) => void
}) {
  return (
    <div className="flex gap-0.5">
      {dentes.map(d => {
        const on = marcados.has(d)
        return (
          <button
            key={d}
            onClick={() => onToggle(d)}
            title={`Dente ${d}`}
            className={`w-6 h-7 rounded text-[10px] font-semibold border transition-colors ${
              on
                ? 'bg-teal-700 border-teal-700 text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-teal-400 hover:text-teal-700'
            }`}
          >
            {d}
          </button>
        )
      })}
    </div>
  )
}
