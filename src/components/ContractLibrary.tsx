'use client'

import { useMemo, useRef, useState } from 'react'
import { FileSignature, Search, ClipboardList, ChevronRight, ChevronLeft } from 'lucide-react'
import {
  CONTRACT_GROUPS, ContractGroup, ContractTemplate, GROUP_LABELS,
  contractFullTitle, searchContracts,
} from '@/lib/contracts'
import ContractEditor from '@/components/ContractEditor'

interface ContractLibraryProps {
  /** Nome do paciente para pré-preencher o documento */
  patientName?: string
  /** Escopo do rascunho salvo localmente (id do paciente, ou "geral") */
  scope?: string
}

const GROUP_ICON: Record<ContractGroup, typeof FileSignature> = {
  'termos-odontologicos': FileSignature,
  'orientacoes-odontologicas': ClipboardList,
}

function Setas({ onScroll }: { onScroll: (dir: 'left' | 'right') => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        onClick={() => onScroll('left')}
        title="Anterior"
        className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button
        onClick={() => onScroll('right')}
        title="Próximo"
        className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function ContractLibrary({ patientName, scope = 'geral' }: ContractLibraryProps) {
  const [query, setQuery] = useState('')
  const [openTemplate, setOpenTemplate] = useState<ContractTemplate | null>(null)

  const results = useMemo(() => searchContracts(query), [query])

  // Uma trilha por grupo; o ref é criado sob demanda porque os grupos visíveis
  // mudam conforme a busca filtra.
  const trilhas = useRef<Record<string, HTMLDivElement | null>>({})
  const trilhaRef = (group: string) => (el: HTMLDivElement | null) => { trilhas.current[group] = el }
  const scrollTrilha = (group: string, dir: 'left' | 'right') => {
    const el = trilhas.current[group]
    if (!el) return
    const passo = el.clientWidth * 0.8
    el.scrollBy({ left: dir === 'left' ? -passo : passo, behavior: 'smooth' })
  }

  const byGroup = useMemo(() => {
    return CONTRACT_GROUPS.map(group => ({
      group,
      items: results.filter(t => t.group === group),
    })).filter(g => g.items.length > 0)
  }, [results])

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar documento (ex.: endodontia, clareamento...)"
          className="w-full h-11 pl-10 pr-3 rounded border border-gray-200 bg-white text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30 transition-colors"
        />
      </div>

      {byGroup.length === 0 && (
        <div className="border border-dashed border-gray-200 rounded py-12 text-center">
          <p className="text-sm text-gray-500">Nenhum documento encontrado para “{query}”.</p>
        </div>
      )}

      {byGroup.map(({ group, items }) => {
        const Icon = GROUP_ICON[group]
        return (
          <section key={group}>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {GROUP_LABELS[group]}
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                  {items.length}
                </span>
              </div>
              <Setas onScroll={dir => scrollTrilha(group, dir)} />
            </div>
            {/* Trilha horizontal: os títulos das orientações são longos e numa
                grade eles quebravam em alturas diferentes, deixando a lista
                irregular. Em linha, cada card tem a mesma largura e a leitura
                acompanha o grupo. A navegação é pelas setas do cabeçalho — a
                barra fica escondida, como nos carrosséis da câmera. */}
            <div
              ref={trilhaRef(group)}
              className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
            >
              {items.map(template => (
                <button
                  key={template.id}
                  onClick={() => setOpenTemplate(template)}
                  className="snap-start shrink-0 w-72 text-left bg-white border border-gray-200 rounded shadow-sm p-4 hover:bg-teal-50 hover:border-teal-500 hover:shadow-md transition-all group"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-gray-400 truncate">{template.eyebrow}</p>
                      <h3 className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors leading-snug">
                        {contractFullTitle(template)}
                      </h3>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {template.pages.length} {template.pages.length === 1 ? 'página' : 'páginas'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-600 transition-colors shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {openTemplate && (
        <ContractEditor
          template={openTemplate}
          patientName={patientName}
          scope={scope}
          onClose={() => setOpenTemplate(null)}
        />
      )}
    </div>
  )
}
