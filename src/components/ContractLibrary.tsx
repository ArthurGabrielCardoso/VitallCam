'use client'

import { useMemo, useRef, useState } from 'react'
import {
  FileSignature, Search, ClipboardList, ChevronRight, ChevronLeft, FileCheck2, Trash2,
} from 'lucide-react'
import {
  useContratosEmitidos, useRegistrarContrato, useApagarContrato, type ContratoEmitido,
} from '@/hooks/useContratos'
import { useToast } from '@/hooks/use-toast'
import {
  CONTRACT_GROUPS, CONTRACT_TEMPLATES, ContractGroup, ContractTemplate, GROUP_LABELS,
  contractFullTitle, searchContracts,
} from '@/lib/contracts'
import ContractEditor from '@/components/ContractEditor'
import ViaAssinadaAcoes from '@/components/ViaAssinadaAcoes'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ContractLibraryProps {
  /** Nome do paciente para pré-preencher o documento */
  patientName?: string
  /** Escopo do rascunho salvo localmente (id do paciente, ou "geral") */
  scope?: string
  /** Id do paciente. Sem ele não há histórico — a biblioteca geral não tem dono. */
  patientId?: string
}

const GROUP_ICON: Record<ContractGroup, typeof FileSignature> = {
  'termos-odontologicos': FileSignature,
  'orientacoes-odontologicas': ClipboardList,
}

/** "hoje 14:32" / "ontem" / "18/08/2026" — o recente é o que importa na lista. */
function fmtQuando(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hoje = new Date()
  const dia = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (dia(d) === dia(hoje)) return `hoje ${hm}`
  if (dia(d) === dia(ontem)) return `ontem ${hm}`
  return d.toLocaleDateString('pt-BR')
}

function primeiroNome(nome: string): string {
  const partes = nome.replace(/^(Dra?\.)\s*/i, '').split(/\s+/)
  return partes.slice(0, 2).join(' ')
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

export default function ContractLibrary({ patientName, scope = 'geral', patientId }: ContractLibraryProps) {
  const [query, setQuery] = useState('')
  const [openTemplate, setOpenTemplate] = useState<ContractTemplate | null>(null)
  const [reabrindo, setReabrindo] = useState<ContratoEmitido | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<ContratoEmitido | null>(null)

  const { toast } = useToast()
  const { data: emitidos = [] } = useContratosEmitidos(patientId ?? null)
  const registrar = useRegistrarContrato()
  const apagar = useApagarContrato()

  const abrirEmitido = (c: ContratoEmitido) => {
    const tpl = CONTRACT_TEMPLATES.find(t => t.id === c.template_id)
    if (!tpl) return
    setReabrindo(c)
    setOpenTemplate(tpl)
  }

  const fecharEditor = () => { setOpenTemplate(null); setReabrindo(null) }

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
      {emitidos.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Contratos feitos
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded bg-dourado-500/15 text-dourado-600 border border-dourado-400/40">
                {emitidos.length}
              </span>
            </div>
            <Setas onScroll={dir => scrollTrilha('__emitidos', dir)} />
          </div>
          <div
            ref={trilhaRef('__emitidos')}
            className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
          >
            {emitidos.map(c => (
              <div
                key={c.id}
                className="snap-start shrink-0 w-72 relative bg-white border border-dourado-400/50 rounded shadow-sm hover:border-dourado-500 hover:shadow-md transition-all group"
              >
                <button onClick={() => abrirEmitido(c)} className="w-full text-left p-4 pb-2">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded bg-gradient-to-br from-dourado-500 to-dourado-600 flex items-center justify-center shrink-0 shadow-sm">
                      <FileCheck2 className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 pr-5">
                      <p className="text-[11px] text-gray-400 truncate">{c.eyebrow || 'Documento'}</p>
                      <h3 className="text-sm font-semibold text-gray-800 leading-snug">{c.titulo}</h3>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {fmtQuando(c.created_at)}
                        {c.profissional ? ` · ${primeiroNome(c.profissional)}` : ''}
                      </p>
                    </div>
                  </div>
                </button>
                {patientId && <ViaAssinadaAcoes contrato={c} patientId={patientId} />}
                <button
                  onClick={() => {
                    if (!patientId) return
                    // Contrato sem via anexada é só um registro: sai na hora.
                    // Com a via, some junto o único documento assinado que a
                    // clínica tem em digital — aí pergunta antes.
                    if (c.via_assinada_key) setConfirmandoExclusao(c)
                    else apagar.mutate({ id: c.id, patientId })
                  }}
                  title="Remover do histórico"
                  className="absolute top-2 right-2 h-6 w-6 rounded flex items-center justify-center text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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
          valoresIniciais={reabrindo?.valores}
          contratoId={reabrindo?.id}
          onEmitir={(valores, contratoId) => {
            // Sem paciente (biblioteca geral) não há histórico pra gravar.
            // Reabrir um emitido é pra conferir o que foi assinado: reimprimir
            // dali não mexe no registro.
            if (!patientId || reabrindo) return
            registrar.mutate({
              id: contratoId,
              patient_id: patientId,
              template_id: openTemplate.id,
              titulo: contractFullTitle(openTemplate),
              eyebrow: openTemplate.eyebrow ?? null,
              grupo: openTemplate.group,
              profissional: valores.profissional ?? null,
              valores,
            }, {
              // Falha silenciosa aqui seria pior que o erro: a pessoa imprime,
              // assina, e o documento nunca aparece no histórico.
              onError: (err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err)
                toast({
                  variant: 'destructive',
                  title: 'Contrato impresso, mas não registrado',
                  description: /contratos_emitidos/.test(msg)
                    ? 'A tabela contratos_emitidos ainda não existe no banco. Rode a migration.'
                    : msg,
                })
              },
            })
          }}
          onClose={fecharEditor}
        />
      )}

      <AlertDialog
        open={!!confirmandoExclusao}
        onOpenChange={aberto => { if (!aberto) setConfirmandoExclusao(null) }}
      >
        <AlertDialogContent className="bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-black">Remover contrato assinado</AlertDialogTitle>
            <AlertDialogDescription className="text-black">
              &quot;{confirmandoExclusao?.titulo}&quot; tem a via assinada anexada, e ela
              será apagada junto. A via em papel continua guardada no arquivo da
              clínica, mas a cópia digital não tem como voltar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-black">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmandoExclusao && patientId) {
                  apagar.mutate({ id: confirmandoExclusao.id, patientId })
                }
                setConfirmandoExclusao(null)
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
