'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle, Biohazard, BookText, Calendar, ChevronLeft, ChevronRight,
  Clock, FileText, Loader2, Package, PackageCheck, Pencil, Plus, Printer, Search,
  Square, X,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import {
  AUTOCLAVE_PADRAO, CicloEsterilizacao, MigrationPendenteError,
  RESPONSAVEL_PADRAO, VALIDADE_MESES, formatarData, formatarHora, hojeLocal, montarLote,
  DIAS_AVISO_VENCIMENTO, garantirPacotes, proximoNumeroDoDia, resumoEsterilizacao,
  situacaoDoCiclo, somarDias, somarMeses, useAbrirCiclo, useCiclosEsterilizacao,
  useEstoquePacotes,
} from '@/hooks/useEsterilizacao'
import {
  DadosEtiqueta, FORMATO_PADRAO, FormatoEtiqueta, canvasParaBitmap, carregarLogo,
  desenharEtiqueta, fontesProntas,
} from '@/lib/etiqueta-esterilizacao'
import {
  ImpressoraEncontrada, ModoImpressao, aquecerImpressora, conectarImpressora, esquecerImpressora,
  impressaoInterrompida, imprimirEtiqueta as enviarEtiqueta, impressoraLembrada, modoImpressao,
  pararImpressao, podeListarImpressoras, procurarImpressoras,
} from '@/lib/impressora-etiqueta'
import { Niimbot, VarianteProtocolo } from '@/lib/niimbot'

/**
 * Etiquetas de esterilização da CME.
 *
 * A tela tem um caminho de um clique: "Novo ciclo" já vem com a data de hoje, a
 * validade de três meses, a Autoclave 01, a responsável técnica e o número do
 * ciclo do dia — só falta dizer quantos pacotes vão para a autoclave. Editar
 * existe para o dia em que algo foge do padrão, não para o dia normal.
 *
 * Cada cartão é um ciclo já aberto; abrir um cartão reimprime aquele lote, que
 * é o que acontece quando falta etiqueta no meio da embalagem.
 *
 * Dentro do APK não há nada para conectar: o app guarda a Niimbot e imprime no
 * toque. No navegador o Chrome exige escolher o aparelho a cada sessão, e é por
 * isso — e só por isso — que existe um botão de conectar nesta tela.
 */

/**
 * Onde ficam os ajustes calibrados na bancada.
 *
 * A chave NÃO muda de versão. Cheguei a versioná-la para forçar um padrão novo e
 * o efeito foi apagar a calibração da clínica — comprimento do rolo, giro,
 * densidade, tudo o que tinha sido acertado etiqueta a etiqueta — e a impressão
 * saiu cortada na manhã seguinte. Padrão novo vale para quem ainda não calibrou;
 * quem já calibrou tem razão sobre o próprio rolo. Para recomeçar existe o botão
 * de restaurar padrões, que é uma escolha de quem está lá, não minha.
 */
const AJUSTES_CHAVE = 'vitallcam:etiqueta-esterilizacao:ajustes'

interface Ajustes extends FormatoEtiqueta {
  /** Giro do bitmap na impressora — depende de como o rolo entra na Niimbot. */
  rotacao: 0 | 90 | 180 | 270
  /** 1 a 5; acima de 3 a etiqueta escurece e pode borrar. */
  densidade: number
  /**
   * Família da impressora. Decide o formato do comando de tamanho de página —
   * errar faz a etiqueta andar em branco, que é como isso aparece na bancada.
   */
  variante: VarianteProtocolo
}

const AJUSTES_PADRAO: Ajustes = {
  ...FORMATO_PADRAO,
  rotacao: 90,
  densidade: 3,
  // A D110_M da clínica roda firmware V4 (atualizada pelo app oficial) e
  // espera esse protocolo — INICIAR_IMPRESSAO e DIMENSAO em formatos
  // próprios, documentados em printers.niim.blue/interfacing/print-tasks/.
  // Não tem tela para trocar isso: não tem por quê, é sempre a mesma
  // impressora.
  variante: 'd110m_v4',
}

function lerAjustes(): Ajustes {
  if (typeof window === 'undefined') return AJUSTES_PADRAO
  try {
    const salvo = window.localStorage.getItem(AJUSTES_CHAVE)
    // `variante` sempre do padrão atual, nunca do que ficou salvo — não tem
    // tela para escolher, e um valor antigo (de antes da D110M_V4) parado no
    // localStorage não pode vencer o protocolo certo.
    return salvo ? { ...AJUSTES_PADRAO, ...JSON.parse(salvo), variante: AJUSTES_PADRAO.variante } : AJUSTES_PADRAO
  } catch {
    return AJUSTES_PADRAO
  }
}

/** Cabeçalho do grupo: "Hoje", "Ontem" ou a data por extenso. */
function tituloDoDia(iso: string): string {
  const hoje = hojeLocal()
  if (iso === hoje) return `Hoje · ${formatarData(iso)}`
  if (iso === somarDias(hoje, -1)) return `Ontem · ${formatarData(iso)}`
  return formatarData(iso)
}

/**
 * Carrega a marca da clínica uma vez para desenhar na etiqueta.
 *
 * O canvas precisa da imagem já decodificada — desenhar antes disso sai em
 * branco, sem erro. Enquanto ela não chega a etiqueta se desenha sem a logo, e
 * o efeito redesenha quando ela carrega.
 */
function useLogoDaClinica(): HTMLImageElement | null {
  const [logo, setLogo] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    let vivo = true
    carregarLogo().then((img) => { if (vivo) setLogo(img) })
    return () => { vivo = false }
  }, [])
  return logo
}

function etiquetaDoCiclo(ciclo: CicloEsterilizacao, logo: HTMLImageElement | null): DadosEtiqueta {
  return {
    lote: ciclo.lote,
    data: formatarData(ciclo.data),
    validade: formatarData(ciclo.validade),
    responsavel: ciclo.responsavel,
    autoclave: ciclo.autoclave,
    conteudo: ciclo.conteudo,
    logo,
  }
}

export default function EsterilizacaoPanel() {
  const { data: ciclos, isLoading, error } = useCiclosEsterilizacao()
  const [aberto, setAberto] = useState<CicloEsterilizacao | 'novo' | null>(null)
  const [impressora, setImpressora] = useState<Niimbot | null>(null)
  // Em efeito, não no valor inicial: `window` não existe na renderização do
  // servidor e um valor diferente ali quebraria a hidratação.
  const [modo, setModo] = useState<ModoImpressao>('indisponivel')
  useEffect(() => setModo(modoImpressao()), [])

  // Aquece a conexão assim que a tela abre. O trabalho que abre a conexão é o
  // que sai em branco, então a etiqueta dela nunca deve ser o primeiro contato.
  useEffect(() => {
    if (modo === 'app') aquecerImpressora()
  }, [modo])

  const grupos = useMemo(() => {
    const mapa = new Map<string, CicloEsterilizacao[]>()
    for (const ciclo of ciclos || []) {
      const lista = mapa.get(ciclo.data) || []
      lista.push(ciclo)
      mapa.set(ciclo.data, lista)
    }
    return Array.from(mapa.entries())
  }, [ciclos])

  const migrationPendente = error instanceof MigrationPendenteError
  const resumo = useMemo(() => resumoEsterilizacao(ciclos || []), [ciclos])
  const { data: estoque } = useEstoquePacotes()

  /**
   * Busca por qualquer coisa que esteja no ciclo.
   *
   * Era só o lote, porque é assim que a fiscalização chega ao registro: pega um
   * pacote, lê a etiqueta, pede o ciclo. Mas de dentro da clínica a pergunta
   * quase nunca é essa — é "o que a Jéssica esterilizou na terça?", "quais
   * ciclos ainda não foram conferidos", "cadê o kit exame". Cada uma dessas
   * pedia rolar a lista com o olho.
   *
   * Data entra em qualquer formato que se digita de verdade: 02/09, 2/9,
   * 02/09/2026 ou 2026-09-02 — quem procura pela terça não escreve ISO.
   */
  const [busca, setBusca] = useState('')
  const achados = useMemo(() => {
    const cru = busca.trim().toLowerCase()
    if (cru.length < 2) return null
    const semEspaco = cru.replace(/\s/g, '')

    // dd/mm[/aaaa] vira o aaaa-mm-dd do banco; ano faltando é o ano corrente.
    const comoData = (() => {
      const m = semEspaco.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/)
      if (!m) return null
      const [, d, mes, ano] = m
      const cheio = !ano ? hojeLocal().slice(0, 4)
        : ano.length === 2 ? `20${ano}`
        : ano
      return `${cheio}-${mes.padStart(2, '0')}-${d.padStart(2, '0')}`
    })()

    const situacaoBuscada =
      /reprov/.test(cru) ? 'reprovado'
      : /liber/.test(cru) ? 'liberado'
      : /pendent|conferir|sem confer/.test(cru) ? 'pendente'
      : null

    return (ciclos || []).filter((c) => {
      const lote = c.lote.toLowerCase()
      // O código do pacote (0901-02-03) contém o lote: quem digita o código
      // inteiro tem que achar o ciclo dele, sem apagar o final mentalmente.
      if (lote.includes(semEspaco) || semEspaco.startsWith(lote)) return true
      if (comoData && c.data === comoData) return true
      if (c.data.includes(semEspaco)) return true
      if (situacaoBuscada && situacaoDoCiclo(c) === situacaoBuscada) return true
      return [c.responsavel, c.autoclave, c.conteudo]
        .some((campo) => (campo || '').toLowerCase().includes(cru))
    })
  }, [busca, ciclos])

  return (
    // Espaço no fim para a barra do rodapé não tapar o último cartão.
    <div className="space-y-6 pb-24 sm:pb-6">
      {!migrationPendente && <Resumo resumo={resumo} estoque={estoque} />}

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          A tabela <code>esterilizacao_ciclos</code> ainda não existe no banco. Rode a migration
          <code className="mx-1">20260831_add_esterilizacao_ciclos.sql</code> no Supabase para começar a registrar os ciclos.
        </p>
      )}

      {!migrationPendente && estoque?.semTabela && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          A tabela <code>esterilizacao_pacotes</code> ainda não existe no banco, então cada
          etiqueta sai <strong>só com o lote</strong> — sem o número que identifica pacote por
          pacote. Rode a migration
          <code className="mx-1">20260902_add_pacotes_esterilizacao.sql</code> no Supabase e as
          próximas etiquetas já saem numeradas. As que já foram impressas continuam válidas pelo
          lote.
        </p>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando ciclos…
        </div>
      )}

      {!isLoading && !migrationPendente && grupos.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-lg bg-white">
          <Biohazard className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum ciclo registrado ainda.</p>
          <p className="text-xs text-gray-400 mt-1">O primeiro ciclo do dia sai como 01.</p>
        </div>
      )}

      {!migrationPendente && (grupos.length > 0 || busca) && (
        <div className="relative">
          <Search className="w-4 h-4 text-dourado-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Lote, data, responsável, autoclave, conteúdo…"
            className="w-full h-12 sm:h-10 pl-9 pr-9 rounded-lg border border-gray-200 text-base sm:text-sm text-gray-700 focus:border-dourado-400 focus:ring-2 focus:ring-dourado-100 focus:outline-none transition-all"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
              aria-label="limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {achados && (
        <section>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {achados.length === 0 ? 'Nenhum lote com esse número' : `${achados.length} lote(s) encontrado(s)`}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {achados.map((ciclo) => (
              <Cartao key={ciclo.id} ciclo={ciclo} onAbrir={setAberto} />
            ))}
          </div>
        </section>
      )}

      {!achados && grupos.map(([data, doDia]) => (
        <Trilha key={data} titulo={tituloDoDia(data)} ciclos={doDia} onAbrir={setAberto} />
      ))}

      {/* As duas acoes da tela moram no rodape, presas.
          No topo elas empurravam a lista para baixo e ficavam longe do polegar;
          aqui estao onde a mao ja esta, e a lista comeca no primeiro dado. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 sm:sticky sm:bottom-4 sm:left-auto sm:right-auto">
        <div className="bg-white/95 backdrop-blur border-t sm:border border-gray-200 sm:rounded-xl sm:shadow-lg px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:py-3 flex items-center gap-2 max-w-6xl mx-auto">
          <button
            onClick={() => setAberto('novo')}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-lg text-base font-semibold bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white transition-all"
          >
            <Plus className="h-5 w-5" />
            Novo ciclo
          </button>
          <Link
            href="/patients/esterilizacao/livro"
            className="h-12 w-12 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 transition-colors shrink-0"
            title="Livro de registro — um ciclo por linha, para a inspeção"
          >
            <BookText className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {aberto && (
        <ModalEtiqueta
          ciclo={aberto === 'novo' ? null : aberto}
          ciclos={ciclos || []}
          modo={modo}
          impressora={impressora}
          onImpressora={setImpressora}
          onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}

/** O que a clínica precisa saber antes de abrir mais um ciclo. */
/**
 * Os cinco números da faixa, com o que cada um quer dizer.
 *
 * A explicação mora aqui e não no cartão porque no celular o rótulo já vive
 * truncado: cabe o número, não a frase. Quem quiser a frase toca no cartão.
 */
const NUMEROS: {
  rotulo: string
  explicacao: string
  icone: React.ReactNode
  valor: (r: ReturnType<typeof resumoEsterilizacao>, e?: { total: number }) => number
  alerta?: (valor: number) => boolean
}[] = [
  {
    rotulo: 'ciclos hoje',
    explicacao: 'Quantas cargas foram para a autoclave hoje. Cada uma vira um lote, numerado na ordem do dia.',
    icone: <Biohazard className="w-4 h-4" />,
    valor: (r) => r.ciclosHoje,
  },
  {
    rotulo: 'pacotes hoje',
    explicacao: 'Somando todos os ciclos de hoje, quantos pacotes de grau cirúrgico foram etiquetados.',
    icone: <Package className="w-4 h-4" />,
    valor: (r) => r.pacotesHoje,
  },
  {
    rotulo: 'ciclos no mês',
    explicacao: 'Total do mês corrente. É o número que aparece no cabeçalho do livro de registro entregue na inspeção.',
    icone: <Calendar className="w-4 h-4" />,
    valor: (r) => r.ciclosMes,
  },
  {
    rotulo: 'sem conferência',
    explicacao: 'Ciclos que ainda não tiveram o integrador químico registrado. Sem essa resposta a carga não está formalmente liberada — e é o primeiro lugar onde a fiscalização olha.',
    icone: <Clock className="w-4 h-4" />,
    valor: (r) => r.pendentes,
    alerta: (v) => v > 0,
  },
  {
    rotulo: 'pacotes no estoque',
    explicacao: 'Pacotes esterilizados que ainda não foram usados em ninguém. Cai sozinho quando um pacote é vinculado a um paciente.',
    icone: <PackageCheck className="w-4 h-4" />,
    valor: (_r, e) => e?.total ?? 0,
  },
]

function Resumo({
  resumo, estoque,
}: {
  resumo: ReturnType<typeof resumoEsterilizacao>
  estoque?: { vencidos: unknown[]; vencendo: unknown[]; total: number }
}) {
  // Só avisa quando está atrasado.
  //
  // "Teste biológico há 2 dias — em dia" era uma faixa colorida permanente
  // dizendo que estava tudo certo, e faixa que aparece sempre para de ser lida.
  // O que precisa de espaço na tela é o problema, não a ausência dele.
  const [detalhe, setDetalhe] = useState<string | null>(null)
  const aberto = NUMEROS.find((n) => n.rotulo === detalhe) ?? null

  return (
    <div className="space-y-3">
      {/* No celular os números viram uma faixa que rola de lado, como os
          carrosséis do resto do app: cinco cartões empilhados em duas colunas
          empurravam os ciclos para fora da tela, e o que interessa ali embaixo é
          a lista, não o resumo. No desktop sobra largura, então ficam os cinco
          lado a lado. */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        {NUMEROS.map((n) => {
          const valor = n.valor(resumo, estoque)
          return (
            <Indicador
              key={n.rotulo}
              icone={n.icone}
              valor={valor}
              rotulo={n.rotulo}
              alerta={n.alerta?.(valor)}
              onAbrir={() => setDetalhe(n.rotulo)}
            />
          )
        })}
      </div>

      {aberto && (
        <DetalheIndicador
          valor={aberto.valor(resumo, estoque)}
          rotulo={aberto.rotulo}
          explicacao={aberto.explicacao}
          alerta={aberto.alerta?.(aberto.valor(resumo, estoque))}
          onFechar={() => setDetalhe(null)}
        />
      )}

      {estoque && estoque.vencidos.length > 0 && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {estoque.vencidos.length} pacote(s) vencido(s) no estoque — recolha e reprocesse antes que
          alguém abra na cadeira.
        </p>
      )}

      {estoque && estoque.vencidos.length === 0 && estoque.vencendo.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          {estoque.vencendo.length} pacote(s) vencem nos próximos {DIAS_AVISO_VENCIMENTO} dias — use
          esses primeiro.
        </p>
      )}
    </div>
  )
}

function Indicador({
  icone, valor, rotulo, alerta, onAbrir,
}: {
  icone: React.ReactNode
  valor: number
  rotulo: string
  alerta?: boolean
  onAbrir?: () => void
}) {
  return (
    <button
      onClick={onAbrir}
      className={`snap-start shrink-0 w-28 sm:w-auto text-left rounded-xl border px-3 py-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${
        alerta
          ? 'bg-amber-50 border-amber-200 hover:border-amber-400'
          : 'bg-white border-gray-200 hover:border-dourado-400'
      }`}
    >
      {/* O número primeiro e grande: é o que se lê de relance. O rótulo embaixo,
          por extenso, sem caixa alta — "SEM CONFERÊNCIA" em 11px espremido era
          mais difícil de ler do que "sem conferência". */}
      <p className={`text-3xl font-bold leading-none tabular-nums ${alerta ? 'text-amber-800' : 'text-gray-800'}`}>
        {valor}
      </p>
      <div className={`flex items-center gap-1.5 text-[11px] mt-2 ${alerta ? 'text-amber-700' : 'text-gray-400'}`}>
        <span className={alerta ? '' : 'text-dourado-500'}>{icone}</span>
        <span className="truncate">{rotulo}</span>
      </div>
    </button>
  )
}

/**
 * O número por extenso, quando o cartão não cabe a explicação.
 *
 * No celular o rótulo vive truncado — "pacotes no est…" — e o número sozinho não
 * diz de onde saiu nem o que fazer com ele. Tocar abre isto: o mesmo número,
 * grande, com a frase inteira e o porquê de ele estar na tela.
 */
function DetalheIndicador({
  valor, rotulo, explicacao, alerta, onFechar,
}: {
  valor: number
  rotulo: string
  explicacao: string
  alerta?: boolean
  onFechar: () => void
}) {
  const caixa = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 animate-fade-in"
      onClick={onFechar}
    >
      <div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-xl shadow-2xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <p className={`text-6xl font-bold leading-none tabular-nums ${alerta ? 'text-amber-700' : 'text-teal-700'}`}>
            {valor}
          </p>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 -mt-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-lg font-semibold text-gray-800 mt-3">{rotulo}</p>
        <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{explicacao}</p>
      </div>
    </div>
  )
  return typeof document === 'undefined' ? caixa : createPortal(caixa, document.body)
}

function Trilha({
  titulo, ciclos, onAbrir,
}: {
  titulo: string
  ciclos: CicloEsterilizacao[]
  onAbrir: (ciclo: CicloEsterilizacao) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const rolar = (dir: 'left' | 'right') => {
    const el = ref.current
    if (!el) return
    const passo = el.clientWidth * 0.8
    el.scrollBy({ left: dir === 'left' ? -passo : passo, behavior: 'smooth' })
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Um risco dourado antes da data: separa os dias sem precisar de
              linha divisória atravessando a tela. */}
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-dourado-400 to-dourado-600 shrink-0" />
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider truncate">{titulo}</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-dourado-50 text-dourado-700 border border-dourado-200 shrink-0">
            {ciclos.length}
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          <button
            onClick={() => rolar('left')}
            title="Anterior"
            className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => rolar('right')}
            title="Próximo"
            className="h-8 w-8 flex items-center justify-center rounded border border-gray-200 bg-white text-gray-500 hover:text-teal-700 hover:border-teal-500 hover:bg-teal-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {/* Quase a largura da tela no celular: cartão de 288px fixos deixava um
            toco do próximo aparecendo, e o polegar acertava o errado. */}
        {ciclos.map((ciclo) => (
          <div key={ciclo.id} className="snap-start shrink-0 w-[85vw] max-w-xs sm:w-72">
            <Cartao ciclo={ciclo} onAbrir={onAbrir} />
          </div>
        ))}
      </div>
    </section>
  )
}

/** Como a situação do ciclo aparece na tela, em uma palavra e uma cor. */
const SELO: Record<string, { texto: string; cls: string }> = {
  pendente: { texto: 'Conferir', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  liberado: { texto: 'Liberado', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  reprovado: { texto: 'Reprovado', cls: 'bg-red-50 text-red-700 border-red-200' },
}

function Cartao({ ciclo, onAbrir }: { ciclo: CicloEsterilizacao; onAbrir: (c: CicloEsterilizacao) => void }) {
  const vencido = ciclo.validade < hojeLocal()
  const situacao = situacaoDoCiclo(ciclo)
  const selo = SELO[situacao]

  return (
    <button
      onClick={() => onAbrir(ciclo)}
      className="relative w-full h-full text-left bg-white border border-gray-200 rounded-xl shadow-sm p-4 pl-5 hover:shadow-md active:scale-[0.99] transition-all group overflow-hidden"
    >
      {/* Marcador de situação: reto, colado à esquerda, mas SEM ir de ponta a
          ponta. Ocupando a altura inteira ele virava a lateral do cartão e se
          lia como moldura; recuado em cima e embaixo, volta a ser um sinal.
          Verde conferido, amarelo a conferir, vermelho reprovado. */}
      <span
        className={`absolute left-0 top-4 bottom-4 w-[5px] ${
          situacao === 'reprovado' ? 'bg-red-500'
          : situacao === 'pendente' ? 'bg-amber-400'
          : 'bg-teal-600'
        }`}
      />

      {/* O lote é o que se procura, então é o que se lê primeiro e grande — é o
          número impresso no pacote que está na mão de quem consulta. Antes ele
          dividia a linha com um ícone e vinha no mesmo corpo do resto. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-gray-800 group-hover:text-teal-700 transition-colors tabular-nums">
            {ciclo.lote}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {formatarData(ciclo.data)} · {formatarHora(ciclo.created_at)}
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-1 rounded-md border shrink-0 ${selo.cls}`}>
          {selo.texto}
        </span>
      </div>

      {/* Duas linhas de rodapé com o que decide alguma coisa: quantos pacotes
          aquele lote gerou e até quando eles valem. Autoclave, responsável e
          conteúdo saíram — estão na etiqueta, no modal e no livro, e aqui só
          faziam o cartão virar parágrafo. */}
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-gray-100">
        <span className="text-xs text-gray-500 flex items-center gap-1.5">
          <Package className="w-3.5 h-3.5 text-gray-400" />
          {ciclo.quantidade_etiquetas} pacote{ciclo.quantidade_etiquetas === 1 ? '' : 's'}
        </span>
        <span
          className={`text-xs font-medium flex items-center gap-1.5 ${
            vencido ? 'text-amber-700' : 'text-gray-500'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          {vencido ? 'venceu' : 'vale até'} {formatarData(ciclo.validade)}
        </span>
      </div>
    </button>
  )
}

/** Escolha da Niimbot, aberta pelo botão Imprimir quando ainda não há uma. */
/**
 * Primeiro passo do modal: qual Niimbot vai imprimir.
 *
 * Antes isto era uma caixa que aparecia DEPOIS do "imprimir", quando o trabalho
 * já tinha falhado. Sem impressora não há nada a fazer nesta tela, então a
 * pergunta vem antes da quantidade — e com impressora salva o passo nem existe.
 *
 * No app a busca dispara sozinha ao entrar: quem chegou aqui já pediu para
 * imprimir, e um botão "procurar" seria um toque a mais para dizer a mesma
 * coisa. No navegador quem lista é o Chrome, e o seletor dele só abre a partir
 * de um clique — por isso lá continua havendo um botão.
 */
function PassoImpressora({
  modo, achadas, buscando, conectando, erro, onBuscar, onEscolher, onConectarNavegador, onPular,
}: {
  modo: ModoImpressao
  achadas: ImpressoraEncontrada[] | null
  buscando: boolean
  conectando: boolean
  erro: string | null
  onBuscar: () => void
  onEscolher: (i: ImpressoraEncontrada) => void
  onConectarNavegador: () => void
  onPular: () => void
}) {
  const podeListar = podeListarImpressoras()

  useEffect(() => {
    if (modo === 'app' && podeListar && !achadas && !buscando) onBuscar()
    // Uma vez ao entrar. Repetir a cada render viraria varredura sem fim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="p-5 space-y-4 overflow-y-auto flex-1">
      {modo === 'navegador' && (
        <>
          <p className="text-sm text-gray-600">
            O Chrome pede para você apontar a impressora a cada sessão — é regra do navegador, não
            escolha nossa.
          </p>
          <button
            onClick={onConectarNavegador}
            className="w-full h-12 rounded-lg text-base font-semibold bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" /> Escolher a impressora
          </button>
        </>
      )}

      {modo === 'app' && !podeListar && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Este app é anterior à lista de impressoras.{' '}
          <a href="/vitallcam-android.apk" className="font-semibold underline underline-offset-2">
            Baixe o app atualizado
          </a>{' '}
          e instale por cima.
        </p>
      )}

      {modo === 'app' && podeListar && (
        <>
          {buscando && (
            <p className="text-sm text-gray-500 flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" /> Procurando a impressora…
            </p>
          )}

          {achadas?.length === 0 && !buscando && (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
              Nenhum aparelho apareceu. Confira se a Niimbot está ligada, perto do aparelho e
              <strong> não conectada no app dela</strong> — ela aceita uma conexão por vez.
            </p>
          )}

          <div className="space-y-2">
            {(achadas ?? []).map((impressora) => (
              <button
                key={impressora.mac}
                onClick={() => onEscolher(impressora)}
                disabled={conectando}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:bg-teal-50 hover:border-teal-500 transition-colors flex items-center gap-3 disabled:opacity-60"
              >
                {conectando
                  ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-teal-600" />
                  : <Printer className={`w-4 h-4 shrink-0 ${impressora.provavel ? 'text-teal-600' : 'text-gray-300'}`} />}
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800 truncate">{impressora.nome}</span>
                  <span className="block text-[11px] text-gray-400">
                    {impressora.mac}
                    {impressora.provavel ? ' · parece uma Niimbot' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {!buscando && (
            <button
              onClick={onBuscar}
              className="text-xs text-teal-700 hover:text-teal-800 font-medium"
            >
              Procurar de novo
            </button>
          )}
        </>
      )}

      {erro && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{erro}</p>
      )}

      {/* Sem impressora ainda dá para usar a saída de papel, e ninguém deve
          ficar preso neste passo por causa de um Bluetooth teimoso. */}
      <button
        onClick={onPular}
        className="w-full h-10 rounded-lg text-sm font-medium text-gray-500 hover:text-teal-700 hover:bg-gray-50 transition-colors"
      >
        Seguir sem a impressora
      </button>
    </div>
  )
}

function ModalEtiqueta({
  ciclo, ciclos, modo, impressora, onImpressora, onFechar,
}: {
  ciclo: CicloEsterilizacao | null
  ciclos: CicloEsterilizacao[]
  modo: ModoImpressao
  impressora: Niimbot | null
  onImpressora: (i: Niimbot | null) => void
  onFechar: () => void
}) {
  const { toast } = useToast()
  const abrirCiclo = useAbrirCiclo()
  // Mutável de propósito: quem preenche é o ref de função `montarCanvas`.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [impressorasAchadas, setImpressorasAchadas] = useState<ImpressoraEncontrada[] | null>(null)
  const [buscandoImpressora, setBuscandoImpressora] = useState(false)
  const [conectandoImpressora, setConectandoImpressora] = useState(false)

  /**
   * Impressora antes de tudo.
   *
   * A escolha da Niimbot estava DENTRO do botao imprimir: a tela abria na
   * quantidade, a pessoa dizia 15, apertava, e so ali descobria que nao havia
   * impressora escolhida. Ordem errada — sem impressora nao ha o que fazer nesta
   * tela, entao a pergunta vem primeiro.
   *
   * Confia no nome salvo: reconectar sozinho ficou confiavel depois do fix do
   * endereco duplicado, entao pedir confirmacao em todo ciclo novo so virou
   * atrito. Volta a abrir direto na impressao quando ja tem impressora salva.
   */
  const semImpressora =
    modo === 'app' ? !impressoraLembrada()
    : modo === 'navegador' ? !impressora?.conectado
    : false

  // Não pergunta mais "a fita virou?"/"fez o biológico?" antes de imprimir — a
  // conferência saía do caminho de quem só queria a etiqueta.
  const proximoPasso = 'imprimir'
  const [passo, setPasso] = useState<'impressora' | 'imprimir'>(
    semImpressora ? 'impressora' : proximoPasso,
  )

  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO)
  useEffect(() => setAjustes(lerAjustes()), [])
  const [editando, setEditando] = useState(false)
  const [data, setData] = useState(ciclo?.data ?? hojeLocal())
  const [validade, setValidade] = useState(ciclo?.validade ?? somarMeses(hojeLocal(), VALIDADE_MESES))
  const [validadeManual, setValidadeManual] = useState(false)
  const [autoclave, setAutoclave] = useState(ciclo?.autoclave ?? AUTOCLAVE_PADRAO)
  const [responsavel, setResponsavel] = useState(ciclo?.responsavel ?? RESPONSAVEL_PADRAO)
  const [conteudo, setConteudo] = useState(ciclo?.conteudo ?? '')
  // Quantidade como texto, não como número: guardada como número, o campo nunca
  // fica vazio — apagar o "0" de "10" já virava "1", e trocar 10 por 3 exigia
  // digitar por cima e apagar de novo. Vazio é um estado legítimo enquanto ela
  // digita; só na hora de imprimir é que ele vira erro.
  const [quantidadeTexto, setQuantidadeTexto] = useState(String(ciclo?.quantidade_etiquetas ?? 10))
  const quantidade = Math.min(100, Math.max(0, parseInt(quantidadeTexto, 10) || 0))
  const quantidadeInvalida = quantidade < 1
  const [avisouQuantidade, setAvisouQuantidade] = useState(false)
  const [progresso, setProgresso] = useState<number | null>(null)
  // O aviso de erro fica na tela, não só no toast: quem está na bancada precisa
  // conseguir ler a mensagem inteira e repetir para quem vai consertar.
  const [ultimoErro, setUltimoErro] = useState<string | null>(null)

  const buscarImpressoras = useCallback(async () => {
    setBuscandoImpressora(true)
    setUltimoErro(null)
    try {
      setImpressorasAchadas(await procurarImpressoras())
    } catch (erro: unknown) {
      setUltimoErro(erro instanceof Error ? erro.message : 'Não deu para procurar a impressora')
    } finally {
      setBuscandoImpressora(false)
    }
  }, [])
  const logo = useLogoDaClinica()

  // A validade acompanha a data do ciclo enquanto ninguém a escreveu à mão.
  useEffect(() => {
    if (!ciclo && !validadeManual) setValidade(somarMeses(data, VALIDADE_MESES))
  }, [data, validadeManual, ciclo])

  const numero = ciclo?.numero ?? proximoNumeroDoDia(ciclos, data)
  const lote = ciclo?.lote ?? montarLote(data, numero)

  const dados: DadosEtiqueta = useMemo(() => ({
    lote,
    data: formatarData(data),
    validade: formatarData(validade),
    responsavel: responsavel.trim() || RESPONSAVEL_PADRAO,
    autoclave: autoclave.trim() || null,
    conteudo: conteudo.trim() || null,
    logo,
    // Na prévia, o primeiro pacote do ciclo: o código sai mais comprido que o
    // lote sozinho, e é ele que decide o tamanho da fonte na etiqueta impressa.
    pacote: `${lote}-01`,
  }), [lote, data, validade, responsavel, autoclave, conteudo, logo])

  const desenhar = useCallback((alvo: HTMLCanvasElement) => {
    desenharEtiqueta(alvo, dados, {
      comprimentoMm: ajustes.comprimentoMm,
      larguraMm: ajustes.larguraMm,
      margem: ajustes.margem,
      logoPorcento: ajustes.logoPorcento,
      deslocamentoMm: ajustes.deslocamentoMm,
    })
  }, [
    dados, ajustes.comprimentoMm, ajustes.larguraMm, ajustes.margem,
    ajustes.logoPorcento, ajustes.deslocamentoMm,
  ])

  // A prévia também precisa esperar a fonte: desenhada antes, ela mostra um
  // texto mais largo do que o que vai sair, e a tela deixaria de avisar.
  const [comFontes, setComFontes] = useState(false)
  useEffect(() => {
    let vivo = true
    fontesProntas().then(() => { if (vivo) setComFontes(true) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (canvasRef.current) desenhar(canvasRef.current)
  }, [desenhar, comFontes])

  /**
   * Desenha no momento em que o canvas entra na tela.
   *
   * O efeito acima só roda quando os dados mudam, e para um ciclo já existente o
   * modal abre no passo da conferência — o canvas ainda não existe, o efeito
   * desenha em `null` e, quando o passo vira "imprimir" e o canvas aparece,
   * nada mais o redesenha: prévia em branco. Um ref de função resolve na raiz,
   * porque ele é chamado exatamente quando o elemento monta.
   */
  const montarCanvas = useCallback((el: HTMLCanvasElement | null) => {
    canvasRef.current = el
    if (el) desenhar(el)
  }, [desenhar])

  const imprimir = async () => {
    if (quantidadeInvalida) {
      setAvisouQuantidade(true)
      return
    }
    setProgresso(0)
    try {
      // No navegador o seletor de Bluetooth só abre enquanto o clique ainda
      // "vale" — depois de uma ida ao banco ele já não vale. No app não há
      // seletor: a impressora está salva e a conexão fica de pé.
      let conectada = impressora
      if (modo === 'navegador' && !conectada?.conectado) {
        conectada = await Niimbot.conectar(false)
        onImpressora(conectada)
      }

      // A escolha da impressora acontece no primeiro passo do modal; se ela
      // sumiu no meio do caminho, volta para lá em vez de falhar aqui.
      if (modo === 'app' && !impressoraLembrada() && podeListarImpressoras()) {
        setProgresso(null)
        setPasso('impressora')
        return
      }

      // Ciclo novo grava antes de imprimir: o número do lote é do banco, não do
      // que está na tela. Reimpressão não abre ciclo nenhum.
      const alvo = ciclo ?? await abrirCiclo.mutateAsync({
        responsavel, autoclave, quantidade, conteudo, data, validade,
      })

      // Espera a marca E as fontes antes de desenhar. Quem abre a tela e aperta
      // imprimir chega aqui antes das duas coisas: sem a marca a etiqueta sai
      // sem logo, e sem a fonte a medida do texto vem menor do que a realidade
      // e o lote sai batendo na borda.
      const [marca] = await Promise.all([logo ?? carregarLogo(), fontesProntas()])

      // Cada etiqueta é um pacote com identidade própria: dez etiquetas do mesmo
      // ciclo viram dez códigos, porque cinco podem ir para um paciente e cinco
      // para outro. Reimpressão acrescenta pacotes novos em vez de repetir os
      // antigos — o pacote que já está na gaveta continua com o código dele.
      let codigos: (string | null)[] = new Array(quantidade).fill(null)
      let semPacotes = false
      try {
        const existentes = await garantirPacotes(alvo.id, 0)
        const todos = await garantirPacotes(alvo.id, existentes.length + quantidade)
        codigos = todos.slice(existentes.length).map((p) => p.codigo)
      } catch {
        // Sem a migration dos pacotes a etiqueta sai como antes, só com o lote:
        // rastreabilidade por ciclo é pior que por pacote e melhor que nenhuma.
        // Mas cair para o lote em silêncio foi o que fez a numeração sumir sem
        // ninguém saber por quê — a etiqueta sai, e o aviso sai junto.
        semPacotes = true
      }

      const formato = {
        comprimentoMm: ajustes.comprimentoMm,
        larguraMm: ajustes.larguraMm,
        margem: ajustes.margem,
        logoPorcento: ajustes.logoPorcento,
        deslocamentoMm: ajustes.deslocamentoMm,
        }

      // Todos os desenhos antes de mandar, e UM envio para o lote inteiro.
      //
      // Já foi um envio por etiqueta, e isso é um TRABALHO por etiqueta na
      // impressora: a Niimbot recolhe o papel no fim de cada trabalho, então a
      // seguinte nascia fora de posição e saía cortada, subindo a cada uma.
      const bitmaps = codigos.map((codigo) => {
        const canvas = document.createElement('canvas')
        desenharEtiqueta(canvas, { ...etiquetaDoCiclo(alvo, marca), pacote: codigo }, formato)
        return canvasParaBitmap(canvas, ajustes.rotacao)
      })

      await enviarEtiqueta(
        bitmaps,
        {
          copias: bitmaps.length,
          densidade: ajustes.densidade,
          variante: ajustes.variante,
          aoProgredir: setProgresso,
        },
        { impressora: conectada, aoConectar: onImpressora },
      )

      setUltimoErro(null)
      // O caminho do navegador encerra o trabalho e volta sem erro quando a
      // parada é pedida; dizer "lote impresso" aí seria mentir sobre quantas
      // etiquetas existem na bancada.
      if (impressaoInterrompida()) {
        toast({
          title: 'Impressão interrompida',
          description: `O que já saiu continua valendo — o lote ${alvo.lote} segue aberto.`,
        })
        return
      }
      toast({
        title: `Lote ${alvo.lote} impresso`,
        description: semPacotes
          ? `${quantidade} etiqueta${quantidade > 1 ? 's' : ''} — saíram só com o lote, sem o número do pacote: falta rodar a migration 20260902_add_pacotes_esterilizacao.sql no Supabase.`
          : `${quantidade} etiqueta${quantidade > 1 ? 's' : ''} — cole no papel grau cirúrgico, que já traz o indicador químico.`,
      })
      onFechar()
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Falha ao imprimir'
      if (/interrompid/i.test(msg)) {
        toast({ title: 'Impressão interrompida', description: 'O que já saiu continua valendo.' })
      } else if (!/cancel|user/i.test(msg)) {
        setUltimoErro(msg)
        toast({ variant: 'destructive', title: 'Não deu para imprimir', description: msg })
      }
    } finally {
      setProgresso(null)
    }
  }

  /**
   * Saída em papel, quando a Niimbot não é opção.
   *
   * Manda a etiqueta para a impressora comum, no tamanho físico exato, repetida
   * pela quantidade pedida e com um fio de contorno para cortar. Serve para
   * impressora sem bateria, rolo acabado ou Bluetooth teimoso — e para colar em
   * folha adesiva quando for o caso.
   *
   * Não grava ciclo: quem imprime em papel está resolvendo um problema, não
   * abrindo um lote. O registro nasce da impressão na etiquetadora.
   *
   * Por iframe e não por janela nova: WebView costuma bloquear pop-up, e a
   * impressão morreria calada dentro do app da clínica.
   */
  const imprimirNaFolha = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const imagem = canvas.toDataURL('image/png')
    const quantas = Math.max(1, quantidade)

    const moldura = document.createElement('iframe')
    moldura.setAttribute('aria-hidden', 'true')
    moldura.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
    document.body.appendChild(moldura)

    const doc = moldura.contentDocument
    if (!doc) {
      moldura.remove()
      return
    }

    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas ${lote}</title>
      <style>
        @page { margin: 8mm; }
        body { margin: 0; font-family: Arial, sans-serif; }
        .etiqueta {
          width: ${ajustes.comprimentoMm}mm;
          height: ${ajustes.larguraMm}mm;
          border: 0.2mm dashed #999;
          margin: 0 0 2mm 0;
          page-break-inside: avoid;
        }
        .etiqueta img { width: 100%; height: 100%; display: block; }
      </style></head><body>
      ${Array.from({ length: quantas }, () => `<div class="etiqueta"><img src="${imagem}" alt=""></div>`).join('')}
      </body></html>`)
    doc.close()

    // Espera a imagem decodificar: mandar imprimir antes disso sai em branco.
    const janela = moldura.contentWindow
    const mandar = () => {
      janela?.focus()
      janela?.print()
      setTimeout(() => moldura.remove(), 1000)
    }
    if (janela) janela.onload = mandar
    else setTimeout(mandar, 300)
  }

  const ocupado = progresso !== null || abrirCiclo.isPending || buscandoImpressora
  // Mesmo raio, mesma altura de toque e mesmo foco dourado do resto da tela.
  // Estes campos tinham ficado no desenho antigo — 36px, canto pequeno, foco
  // teal — e destoavam de tudo o que passou a ser 48px e arredondado.
  const campoClasse = 'w-full h-12 px-3 rounded-lg border border-gray-200 text-base sm:text-sm text-gray-700 focus:border-dourado-400 focus:ring-2 focus:ring-dourado-100 focus:outline-none transition-all disabled:bg-gray-50 disabled:text-gray-500'
  const bloqueado = !!ciclo || !editando

  // No celular a caixa sobe do rodapé: é onde o polegar está, e é no celular
  // que esta tela vai ser usada de verdade. No notebook, centrada.
  //
  // Vai num portal para o body porque a tela mora dentro do <main>, e o header
  // do app é um `sticky z-40` irmão dele: sem o portal a pelicula preta comecava
  // abaixo do header, que ficava aceso por cima do modal — e tocar nele nao
  // fechava nada, porque aquilo nao era o fundo do modal.
  //
  // A altura acompanha o conteudo em vez de ser fixa: com uma pergunta so na
  // tela, 88dvh deixava meia folha em branco embaixo.
  const caixa = (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 animate-fade-in"
      onClick={() => !ocupado && onFechar()}
    >
      <div
        className="w-full sm:max-w-lg min-h-[60dvh] max-h-[92dvh] sm:min-h-0 sm:max-h-[90vh] flex flex-col bg-white rounded-t-2xl sm:rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Puxador: no celular a caixa parece arrastável, e sem ele fica com
            cara de tela travada. */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <span className="h-1 w-10 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 sm:py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-800 truncate">
              {ciclo ? `Lote ${ciclo.lote}` : 'Novo ciclo'}
            </h2>
            {passo === 'impressora' && (
              <p className="text-xs text-gray-400">Primeiro: qual impressora?</p>
            )}
          </div>
          <button onClick={onFechar} disabled={ocupado} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {passo === 'impressora' && (
          <PassoImpressora
            modo={modo}
            achadas={impressorasAchadas}
            buscando={buscandoImpressora}
            erro={ultimoErro}
            onBuscar={buscarImpressoras}
            conectando={conectandoImpressora}
            onEscolher={async (escolhida) => {
              setConectandoImpressora(true)
              setUltimoErro(null)
              try {
                await conectarImpressora(escolhida)
                setImpressorasAchadas(null)
                setPasso(proximoPasso)
                toast({ title: `${escolhida.nome} conectada` })
              } catch (erro: unknown) {
                setUltimoErro(erro instanceof Error ? erro.message : 'Não deu para conectar')
              } finally {
                setConectandoImpressora(false)
              }
            }}
            onConectarNavegador={async () => {
              try {
                onImpressora(await Niimbot.conectar(false))
                setPasso(proximoPasso)
              } catch (erro: unknown) {
                const msg = erro instanceof Error ? erro.message : 'Falha ao conectar'
                if (!/cancel|user/i.test(msg)) setUltimoErro(msg)
              }
            }}
            onPular={() => setPasso(proximoPasso)}
          />
        )}

        {passo === 'imprimir' && (
        <>
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* A prévia é o próprio desenho que vai para a impressora, em 203 dpi:
              o que estiver ilegível aqui vai sair ilegível no adesivo. */}
          {/* O lápis mora no canto da prévia: é aquilo ali que ele muda, e uma
              linha inteira de texto para uma exceção era peso demais. */}
          <div className="relative rounded-xl border-2 border-dashed border-dourado-300 bg-dourado-50 p-4 flex justify-center">
            {/* A moldura é da casa; o adesivo é branco.
                O pontilhado cinza em fundo cinza fazia a etiqueta desaparecer
                dentro da própria moldura — o branco dela é o que precisa saltar,
                porque é o adesivo de verdade. */}
            <canvas
              ref={montarCanvas}
              className="max-w-full h-auto bg-white rounded shadow-md"
              style={{ imageRendering: 'pixelated' }}
            />
            {(!ciclo || modo === 'app' || modo === 'navegador') && (
              <button
                onClick={() => setEditando((v) => !v)}
                title={editando ? 'Pronto' : 'Editar os dados desta etiqueta'}
                className={`absolute top-2 right-2 h-9 w-9 flex items-center justify-center rounded-lg border transition-colors ${
                  editando
                    ? 'bg-dourado-500 border-dourado-500 text-white'
                    : 'bg-white border-dourado-200 text-dourado-600 hover:bg-dourado-100 hover:border-dourado-400'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>


          {editando && (
          <div className="rounded-xl border border-dourado-200 bg-dourado-50/40 p-4 space-y-3">
            {!ciclo && (
            <div className="grid grid-cols-2 gap-3">
              {/* Lote e ciclo não entram aqui: quem numera é o banco, na hora de
                  gravar, e mostrar os dois em campo cinza só ensinava que dava
                  para mexer. Eles já aparecem na prévia, que é o que vai sair. */}
              <Campo rotulo="Esterilizado em">
                <input
                  type="date"
                  value={data}
                  disabled={bloqueado}
                  onChange={(e) => setData(e.target.value)}
                  className={campoClasse}
                />
              </Campo>
              <Campo rotulo={`Validade (${VALIDADE_MESES} meses)`}>
                <input
                  type="date"
                  value={validade}
                  disabled={bloqueado}
                  onChange={(e) => { setValidadeManual(true); setValidade(e.target.value) }}
                  className={campoClasse}
                />
              </Campo>
              <Campo rotulo="Autoclave">
                <input
                  value={autoclave}
                  disabled={bloqueado}
                  onChange={(e) => setAutoclave(e.target.value)}
                  className={campoClasse}
                />
              </Campo>
              <Campo rotulo="Responsável técnico">
                <input
                  value={responsavel}
                  disabled={bloqueado}
                  onChange={(e) => setResponsavel(e.target.value)}
                  className={campoClasse}
                />
              </Campo>
              <div className="col-span-2">
                <Campo rotulo="Conteúdo (opcional)">
                  <input
                    value={conteudo}
                    disabled={bloqueado}
                    placeholder="kit exame, fórceps…"
                    onChange={(e) => setConteudo(e.target.value)}
                    className={campoClasse}
                  />
                </Campo>
              </div>
            </div>
            )}

            {(modo === 'app' || modo === 'navegador') && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setImpressorasAchadas(null)
                    setUltimoErro(null)
                    setEditando(false)
                    setPasso('impressora')
                  }}
                  className="flex-1 h-10 rounded-lg text-sm font-medium border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors flex items-center justify-center gap-2"
                >
                  <Printer className="w-4 h-4" /> Conectar impressora
                </button>
                {modo === 'app' && (
                  <button
                    onClick={() => {
                      esquecerImpressora()
                      setImpressorasAchadas(null)
                      setUltimoErro(null)
                      setEditando(false)
                      setPasso('impressora')
                      toast({ title: 'Impressora desconectada', description: 'Escolha outra na próxima tela.' })
                    }}
                    className="flex-1 h-10 rounded-lg text-sm font-medium border border-red-200 text-red-700 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Printer className="w-4 h-4" /> Desconectar
                  </button>
                )}
              </div>
            )}
          </div>
          )}

          {/* A pergunta da tela — e a única coisa que se responde aqui no dia
              normal. Uma caixa só: os atalhos de 5/10/20/30 ocupavam uma fileira
              inteira para adivinhar um número que a pessoa já sabe. Os botões de
              menos e mais existem porque no celular acertar um dígito com o
              polegar é pior do que tocar duas vezes. */}
          <div className="py-4 sm:py-3">
            <p className="text-sm text-gray-700 mb-4 text-center">
              Quantas etiquetas? <span className="text-gray-400">(uma por pacote)</span>
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { setQuantidadeTexto(String(Math.max(1, quantidade - 1))); setAvisouQuantidade(false) }}
                className="h-14 w-14 rounded-xl border-2 border-teal-600 text-3xl leading-none text-teal-700 hover:bg-teal-50 active:scale-95 transition-all shrink-0"
                aria-label="uma a menos"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={quantidadeTexto}
                onChange={(e) => {
                  setQuantidadeTexto(e.target.value.replace(/\D/g, ''))
                  setAvisouQuantidade(false)
                }}
                className={`h-16 w-28 rounded-xl border-2 text-3xl font-semibold text-center focus:outline-none ${
                  avisouQuantidade && quantidadeInvalida
                    ? 'border-red-400 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-800 focus:border-teal-500'
                }`}
              />
              <button
                onClick={() => { setQuantidadeTexto(String(Math.min(999, quantidade + 1))); setAvisouQuantidade(false) }}
                className="h-14 w-14 rounded-xl border-2 border-teal-600 text-3xl leading-none text-teal-700 hover:bg-teal-50 active:scale-95 transition-all shrink-0"
                aria-label="uma a mais"
              >
                +
              </button>
            </div>
            {avisouQuantidade && quantidadeInvalida && (
              <p className="text-xs text-red-600 font-medium text-center mt-2">
                Diga quantas antes de imprimir.
              </p>
            )}
          </div>

          {/* Só aparece quando há um beco sem saída: APK velho ou navegador que
              não fala Bluetooth. Impressora funcionando não vira aviso. */}
          {modo === 'app-antigo' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Este app é anterior à impressão de etiquetas.{' '}
              <a href="/vitallcam-android.apk" className="font-semibold underline underline-offset-2">
                Baixe o app atualizado
              </a>{' '}
              e instale por cima.
            </p>
          )}
          {modo === 'indisponivel' && (
            <p className="text-xs text-gray-600 bg-gray-100 border border-gray-200 rounded-lg p-3">
              Este navegador não conversa com a Niimbot. Abra pelo app da clínica ou pelo Chrome —
              ou use o botão de folha aqui do lado e recorte.
            </p>
          )}

          {ultimoErro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              {ultimoErro}
            </p>
          )}

          {progresso !== null && (
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${progresso}%` }} />
            </div>
          )}

        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-gray-100 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {ocupado ? (
            <button
              onClick={pararImpressao}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-lg text-base font-semibold border-2 border-red-300 text-red-700 bg-white hover:bg-red-50 transition-colors"
            >
              <Square className="w-4 h-4 fill-current" /> Parar impressão
            </button>
          ) : (
            <button
              onClick={imprimir}
              className="flex-1 flex items-center justify-center gap-2 h-12 rounded-lg text-base font-semibold bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white transition-all"
            >
              {buscandoImpressora ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {buscandoImpressora
                ? 'Procurando a impressora…'
                : quantidadeInvalida ? 'Imprimir' : `Imprimir ${quantidade}`}
            </button>
          )}
          {!ocupado && (
            <button
              onClick={imprimirNaFolha}
              title="Sai na impressora comum, no tamanho real, com contorno para cortar"
              className="h-12 w-12 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-teal-700 hover:border-teal-500 transition-colors shrink-0"
            >
              <FileText className="w-4 h-4" />
            </button>
          )}
        </div>
        </>
        )}

      </div>
    </div>
  )

  // No servidor não há body para receber o portal.
  return typeof document === 'undefined' ? caixa : createPortal(caixa, document.body)
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}
