'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Biohazard, BookText, Calendar, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, FileText, FlaskConical, Loader2, Package, PackageCheck, Pencil, Plus, Printer, Search,
  Square, X,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import {
  AUTOCLAVE_PADRAO, CicloEsterilizacao, MigrationPendenteError,
  RESPONSAVEL_PADRAO, VALIDADE_MESES, formatarData, formatarHora, hojeLocal, montarLote,
  DIAS_AVISO_VENCIMENTO, garantirPacotes, proximoNumeroDoDia, resumoEsterilizacao,
  situacaoDoCiclo, somarDias, somarMeses, useAbrirCiclo, useCiclosEsterilizacao,
  useEstoquePacotes, useRegistrarMonitoramento,
} from '@/hooks/useEsterilizacao'
import {
  DadosEtiqueta, FORMATO_PADRAO, FormatoEtiqueta, bitmapDeTeste, canvasParaBitmap, carregarLogo,
  desenharEtiqueta, fontesProntas,
} from '@/lib/etiqueta-esterilizacao'
import {
  ImpressoraEncontrada, ModoImpressao, aquecerImpressora, escolherImpressora,
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
  // A D110_M da clínica precisa do comando de 4 bytes, com a largura junto.
  // Com o de 2 bytes ela imprime só os primeiros 48 pontos de cada linha — a
  // régua saiu com 6 degraus dos 12 e metade da etiqueta em branco. O nome
  // "D110" estava do lado errado da lista, e ninguém tinha como adivinhar isso.
  variante: 'b21',
}

function lerAjustes(): Ajustes {
  if (typeof window === 'undefined') return AJUSTES_PADRAO
  try {
    const salvo = window.localStorage.getItem(AJUSTES_CHAVE)
    return salvo ? { ...AJUSTES_PADRAO, ...JSON.parse(salvo) } : AJUSTES_PADRAO
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

  // A busca é pelo lote impresso no pacote: é assim que a fiscalização chega ao
  // registro — pega um pacote do estoque, lê a etiqueta e pede o ciclo dela.
  const [busca, setBusca] = useState('')
  const achados = useMemo(() => {
    const alvo = busca.replace(/\s/g, '').toLowerCase()
    if (alvo.length < 2) return null
    // Aceita tanto o lote (0901-02) quanto o código do pacote (0901-02-03): é o
    // pacote que está impresso, e ninguém vai apagar mentalmente o final dele.
    return (ciclos || []).filter(
      (c) => c.lote.toLowerCase().includes(alvo) || alvo.startsWith(c.lote.toLowerCase()),
    )
  }, [busca, ciclos])

  return (
    <div className="space-y-6">
      {!migrationPendente && <Resumo resumo={resumo} estoque={estoque} />}

      {/* No celular "Novo ciclo" é a ação da tela e ocupa a linha inteira; o
          livro de registro é para a inspeção, que acontece de vez em quando, e
          recua para um ícone. No notebook os dois cabem lado a lado. */}
      {/* A impressora não é assunto até a hora de imprimir.
          Havia um "Conectar impressora" fixo no topo, mais o aviso de qual está
          pronta — decisão de bastidor ocupando o lugar da lista. Agora quem
          pergunta é o botão Imprimir: se já está conectada, imprime; se não
          está, o seletor aparece ali, no momento em que ele faz sentido. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setAberto('novo')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 h-11 sm:h-9 rounded-lg text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo ciclo
          </button>
          <Link
            href="/patients/esterilizacao/livro"
            className="flex items-center justify-center gap-2 h-11 sm:h-9 w-11 sm:w-auto sm:px-4 rounded-lg border border-gray-200 bg-white text-sm text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors shrink-0"
            title="Um ciclo por linha, para entregar na inspeção"
          >
            <BookText className="h-4 w-4" />
            <span className="hidden sm:inline">Livro de registro</span>
          </Link>
        </div>
      </div>

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
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar pelo lote do pacote (ex.: 0831-02)"
            inputMode="numeric"
            className="w-full h-12 sm:h-10 pl-9 pr-9 rounded-lg border border-gray-200 text-base sm:text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
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

/**
 * O que a clínica precisa saber antes de abrir mais um ciclo.
 *
 * O aviso do teste biológico é o que evita a não conformidade mais cara: a RDC
 * 1.002/2025 pede o indicador biológico semanal, no primeiro ciclo do dia
 * programado, e na inspeção é isso que o fiscal vai conferir depois de ler o
 * lote de um pacote qualquer do estoque. Descobrir o atraso no dia da visita é
 * tarde demais — então o número de dias fica na cara, sempre.
 */
function Resumo({
  resumo, estoque,
}: {
  resumo: ReturnType<typeof resumoEsterilizacao>
  estoque?: { vencidos: unknown[]; vencendo: unknown[]; total: number }
}) {
  const biologico = resumo.diasSemBiologico === null
    ? { texto: 'Teste biológico nunca registrado', urgente: true }
    : resumo.biologicoVencido
      ? { texto: `Teste biológico há ${resumo.diasSemBiologico} dias — a norma pede semanal`, urgente: true }
      : {
        texto: resumo.diasSemBiologico === 0
          ? 'Teste biológico feito hoje'
          : `Teste biológico há ${resumo.diasSemBiologico} dia(s) — em dia`,
        urgente: false,
      }

  return (
    <div className="space-y-3">
      {/* No celular os números viram uma faixa que rola de lado, como os
          carrosséis do resto do app: cinco cartões empilhados em duas colunas
          empurravam os ciclos para fora da tela, e o que interessa ali embaixo é
          a lista, não o resumo. No desktop sobra largura, então ficam os cinco
          lado a lado. */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [&::-webkit-scrollbar]:hidden [scrollbar-width:none] sm:grid sm:grid-cols-5 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0">
        <Indicador icone={<Biohazard className="w-4 h-4" />} valor={resumo.ciclosHoje} rotulo="ciclos hoje" />
        <Indicador icone={<Package className="w-4 h-4" />} valor={resumo.pacotesHoje} rotulo="pacotes hoje" />
        <Indicador icone={<Calendar className="w-4 h-4" />} valor={resumo.ciclosMes} rotulo="ciclos no mês" />
        <Indicador
          icone={<Clock className="w-4 h-4" />}
          valor={resumo.pendentes}
          rotulo="sem conferência"
          alerta={resumo.pendentes > 0}
        />
        <Indicador
          icone={<PackageCheck className="w-4 h-4" />}
          valor={estoque?.total ?? 0}
          rotulo="pacotes no estoque"
        />
      </div>

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

      <p
        className={`text-xs rounded px-3 py-2 border flex items-center gap-2 ${
          biologico.urgente
            ? 'text-red-700 bg-red-50 border-red-200'
            : 'text-teal-700 bg-teal-50 border-teal-200'
        }`}
      >
        {biologico.urgente ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <FlaskConical className="w-3.5 h-3.5 shrink-0" />}
        {biologico.texto}
        {biologico.urgente && (
          <span className="text-gray-500">· faça no primeiro ciclo do próximo dia</span>
        )}
      </p>
    </div>
  )
}

function Indicador({
  icone, valor, rotulo, alerta,
}: {
  icone: React.ReactNode
  valor: number
  rotulo: string
  alerta?: boolean
}) {
  return (
    <div
      className={`snap-start shrink-0 w-28 sm:w-auto rounded-xl border px-3 py-3 ${
        alerta ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
      }`}
    >
      {/* O número primeiro e grande: é o que se lê de relance. O rótulo embaixo,
          por extenso, sem caixa alta — "SEM CONFERÊNCIA" em 11px espremido era
          mais difícil de ler do que "sem conferência". */}
      <p className={`text-3xl font-bold leading-none tabular-nums ${alerta ? 'text-amber-800' : 'text-gray-800'}`}>
        {valor}
      </p>
      <div className={`flex items-center gap-1.5 text-[11px] mt-2 ${alerta ? 'text-amber-700' : 'text-gray-400'}`}>
        {icone} <span className="truncate">{rotulo}</span>
      </div>
    </div>
  )
}

/** Faixa horizontal por data, no mesmo formato das radiografias. */
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
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{titulo}</h3>
          <span className="text-[11px] px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
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
      className="w-full h-full text-left bg-white border border-gray-200 rounded-xl shadow-sm p-4 hover:border-teal-500 hover:shadow-md active:scale-[0.99] transition-all group"
    >
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
function ListaImpressoras({
  lista, onEscolher, onFechar,
}: {
  lista: ImpressoraEncontrada[]
  onEscolher: (i: ImpressoraEncontrada) => void
  onFechar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={onFechar}
    >
      <div
        className="clean-dialog w-full max-w-sm max-h-[80vh] overflow-y-auto bg-white rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Escolha a impressora</h2>
            <p className="text-xs text-gray-400">Toque na sua Niimbot. Fica salva para as próximas.</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 space-y-2">
          {lista.length === 0 && (
            <p className="text-sm text-gray-500 p-4 text-center">
              Nenhum aparelho apareceu. Confira se a Niimbot está ligada, perto do tablet e não conectada
              no app dela — ela aceita uma conexão por vez.
            </p>
          )}
          {lista.map((impressora) => (
            <button
              key={impressora.mac}
              onClick={() => onEscolher(impressora)}
              className="w-full text-left px-4 py-3 rounded border border-gray-200 hover:bg-teal-50 hover:border-teal-500 transition-colors"
            >
              <span className="block text-sm font-medium text-gray-800">{impressora.nome}</span>
              <span className="block text-[11px] text-gray-400">
                {impressora.mac}
                {impressora.provavel ? ' · parece uma Niimbot' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>
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
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Sai da mesma lista que já está na tela: a conferência avisa que o biológico
  // da semana está atrasado em vez de esperar alguém lembrar.
  const biologicoVencido = useMemo(() => resumoEsterilizacao(ciclos).biologicoVencido, [ciclos])

  // Um assunto por vez. Antes o modal abria com dados do ciclo, conferência e
  // impressão empilhados: três perguntas diferentes na mesma tela, e a mais
  // importante — "deu certo?" — no meio, onde ninguém para para responder.
  //
  // Ciclo por conferir abre na conferência; ciclo já conferido e ciclo novo vão
  // direto para a impressão, que é o que se quer deles.
  const [avancado, setAvancado] = useState(false)
  const [impressorasAchadas, setImpressorasAchadas] = useState<ImpressoraEncontrada[] | null>(null)
  const [buscandoImpressora, setBuscandoImpressora] = useState(false)
  const [passo, setPasso] = useState<'conferir' | 'imprimir'>(
    ciclo && !ciclo.integrador_quimico ? 'conferir' : 'imprimir',
  )

  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO)
  useEffect(() => setAjustes(lerAjustes()), [])
  const restaurarAjustes = () => {
    try {
      window.localStorage.removeItem(AJUSTES_CHAVE)
    } catch {
      // Sem storage: os padrões valem para esta sessão de qualquer jeito.
    }
    setAjustes(AJUSTES_PADRAO)
  }

  const salvarAjustes = (novos: Partial<Ajustes>) => {
    setAjustes((atual) => {
      const proximos = { ...atual, ...novos }
      try {
        window.localStorage.setItem(AJUSTES_CHAVE, JSON.stringify(proximos))
      } catch {
        // Modo anônimo sem storage: os ajustes valem só para esta sessão.
      }
      return proximos
    })
  }

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

      // No app, primeira impressão do aparelho: em vez de exigir um "conectar"
      // antes, a lista aparece agora — e antes de gravar o ciclo, para não
      // deixar lote aberto por causa de uma escolha que ainda não foi feita.
      if (modo === 'app' && !impressoraLembrada() && podeListarImpressoras()) {
        setProgresso(null)
        setBuscandoImpressora(true)
        try {
          setImpressorasAchadas(await procurarImpressoras())
        } catch (erro: unknown) {
          setUltimoErro(erro instanceof Error ? erro.message : 'Não deu para procurar a impressora')
        } finally {
          setBuscandoImpressora(false)
        }
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
   * Imprime a régua: uma escada de degraus de 1 mm ao longo da largura.
   *
   * Responde o que a prévia não responde: a prévia mostra o desenho centrado e a
   * etiqueta sai cortada em cima, porque quem está fora de centro é o rolo
   * debaixo da cabeça térmica, não o desenho. Contando quantos degraus saíram
   * inteiros sai o quanto descer, medido em vez de chutado.
   *
   * Continua separando "a impressora não recebeu nada" de "o desenho saiu
   * errado", e não abre ciclo nenhum: dá para tentar as variantes do protocolo à
   * vontade sem sujar o histórico da CME com lotes que não existem.
   */
  const imprimirTeste = async () => {
    setProgresso(0)
    try {
      let conectada = impressora
      if (modo === 'navegador' && !conectada?.conectado) {
        conectada = await Niimbot.conectar(false)
        onImpressora(conectada)
      }

      // No app, primeira impressão do aparelho: em vez de exigir um "conectar"
      // antes, a lista aparece agora — e antes de gravar o ciclo, para não
      // deixar lote aberto por causa de uma escolha que ainda não foi feita.
      if (modo === 'app' && !impressoraLembrada() && podeListarImpressoras()) {
        setProgresso(null)
        setBuscandoImpressora(true)
        try {
          setImpressorasAchadas(await procurarImpressoras())
        } catch (erro: unknown) {
          setUltimoErro(erro instanceof Error ? erro.message : 'Não deu para procurar a impressora')
        } finally {
          setBuscandoImpressora(false)
        }
        return
      }
      setUltimoErro(null)
      await fontesProntas()
      await enviarEtiqueta(
        bitmapDeTeste({
          comprimentoMm: ajustes.comprimentoMm,
          larguraMm: ajustes.larguraMm,
          margem: ajustes.margem,
        }, ajustes.rotacao),
        {
          copias: 1,
          densidade: ajustes.densidade,
          variante: ajustes.variante,
          aoProgredir: setProgresso,
        },
        { impressora: conectada, aoConectar: onImpressora },
      )
      toast({
        title: 'Teste enviado',
        description: 'Saiu tarja preta e xadrez? Então os dados chegam. Em branco, troque a família da impressora nos ajustes.',
      })
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Falha ao imprimir'
      if (!/cancel|user/i.test(msg)) {
        setUltimoErro(msg)
        toast({ variant: 'destructive', title: 'Não deu para imprimir a régua', description: msg })
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
  const campoClasse = 'w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'
  const bloqueado = !!ciclo || !editando

  // No celular a caixa sobe do rodapé e ocupa a tela: é onde o polegar está, e
  // é no celular que esta tela vai ser usada de verdade. No notebook, centrada.
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 animate-fade-in"
      onClick={() => !ocupado && onFechar()}
    >
      <div
        className="w-full sm:max-w-lg h-[88dvh] sm:h-auto sm:max-h-[90vh] flex flex-col bg-white rounded-t-2xl sm:rounded-xl shadow-2xl"
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
            <p className="text-xs text-gray-400">
              {passo === 'conferir'
                ? 'Antes de imprimir: o ciclo deu certo?'
                : ciclo ? 'Imprimir etiquetas deste lote' : 'Já vem preenchido — só dizer quantas'}
            </p>
          </div>
          <button onClick={onFechar} disabled={ocupado} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        {passo === 'conferir' && ciclo && (
          <div className="p-5 space-y-4 overflow-y-auto">
            <ResultadoDoCiclo
              ciclo={ciclo}
              responsavelPadrao={responsavel}
              biologicoVencido={biologicoVencido}
              onPronto={() => setPasso('imprimir')}
            />
            <button
              onClick={() => setPasso('imprimir')}
              className="w-full h-10 rounded-lg text-sm font-medium text-gray-500 hover:text-teal-700 hover:bg-gray-50 transition-colors"
            >
              Agora não — só quero imprimir
            </button>
          </div>
        )}

        {passo === 'imprimir' && (
        <>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* A prévia é o próprio desenho que vai para a impressora, em 203 dpi:
              o que estiver ilegível aqui vai sair ilegível no adesivo. */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 flex justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto bg-white shadow-sm"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

          {/* A prévia JÁ mostra lote, datas, autoclave e responsável — repetir
              tudo embaixo em campos era dizer duas vezes a mesma coisa. Fica só
              a porta para o dia que foge do padrão. */}
          {!ciclo && (
            <button
              onClick={() => setEditando((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-teal-700 hover:text-teal-800 font-medium"
            >
              <Pencil className="w-3.5 h-3.5" />
              {editando ? 'Pronto' : 'Editar os dados deste ciclo'}
            </button>
          )}

          {editando && !ciclo && (
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Lote">
              <input value={lote} readOnly className={`${campoClasse} font-semibold bg-gray-50`} />
            </Campo>
            <Campo rotulo="Ciclo do dia">
              <input value={String(numero).padStart(2, '0')} readOnly className={`${campoClasse} bg-gray-50`} />
            </Campo>
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

          {/* A pergunta da tela — e a única coisa que se responde aqui no dia
              normal. Uma caixa só: os atalhos de 5/10/20/30 ocupavam uma fileira
              inteira para adivinhar um número que a pessoa já sabe. Os botões de
              menos e mais existem porque no celular acertar um dígito com o
              polegar é pior do que tocar duas vezes. */}
          <div>
            <p className="text-sm text-gray-700 mb-2 text-center">
              Quantas etiquetas? <span className="text-gray-400">(uma por pacote)</span>
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { setQuantidadeTexto(String(Math.max(1, quantidade - 1))); setAvisouQuantidade(false) }}
                className="h-14 w-14 rounded-full border border-gray-200 text-2xl text-gray-500 hover:border-teal-500 hover:text-teal-700 transition-colors shrink-0"
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
                className="h-14 w-14 rounded-full border border-gray-200 text-2xl text-gray-500 hover:border-teal-500 hover:text-teal-700 transition-colors shrink-0"
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

          {/* Os ajustes do rolo ficam guardados, não removidos.
              Depois de calibrados ninguém mexe neles de novo, e eles enchiam a
              tela de decisões que não são do dia a dia. Mas apagar seria trocar
              "tela cheia" por "sem saída" no dia que o rolo mudar de
              fornecedor — aí só um deploy resolveria. */}
          {!ocupado && (
            <div className="pt-1">
              {avancado ? (
                <AjustesImpressora
                  ajustes={ajustes}
                  onMudar={salvarAjustes}
                  onRestaurar={restaurarAjustes}
                  onTestar={imprimirTeste}
                  ocupado={ocupado}
                />
              ) : (
                <button
                  onClick={() => setAvancado(true)}
                  className="text-[11px] text-gray-300 hover:text-gray-500 transition-colors"
                >
                  ajustes do rolo e da impressora
                </button>
              )}
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

        {impressorasAchadas && (
          <ListaImpressoras
            lista={impressorasAchadas}
            onEscolher={(escolhida) => {
              escolherImpressora(escolhida)
              setImpressorasAchadas(null)
              toast({ title: `${escolhida.nome} escolhida`, description: 'Toque em imprimir de novo.' })
            }}
            onFechar={() => setImpressorasAchadas(null)}
          />
        )}
      </div>
    </div>
  )
}

/**
 * "Deu certo?" — a conferência do ciclo, do jeito que ela acontece na bancada.
 *
 * A RDC 1.002/2025 exige integrador químico classe 5 ou 6 em pacote-teste a cada
 * ciclo e indicador biológico semanal, no primeiro ciclo do dia programado, com
 * registro formal. A etiqueta prova que o ciclo existiu; isto prova que ele deu
 * certo, e a liberação da carga sai daqui — integrador não conforme ou biológico
 * positivo não libera nada, volta para o reprocessamento.
 *
 * A tela pergunta o que a pessoa acabou de OLHAR — "a fita virou?" — e deixa o
 * nome técnico embaixo, pequeno, para quem precisa dele. A versão anterior fazia
 * o contrário: abria com "Integrador químico classe 5 ou 6 (pacote-teste, todo
 * ciclo)", que é o texto da norma, não a pergunta.
 *
 * Ciclo já conferido não reabre o formulário: vira um resumo de uma linha com
 * "Corrigir" do lado. O que está resolvido tem que PARECER resolvido, senão a
 * tela pede a mesma coisa todo dia.
 */
function ResultadoDoCiclo({
  ciclo, responsavelPadrao, biologicoVencido, onPronto,
}: {
  ciclo: CicloEsterilizacao
  responsavelPadrao: string
  /** O biológico da semana está em atraso — a tela avisa em vez de cobrar memória. */
  biologicoVencido: boolean
  /** Respondida a conferência, o modal segue para a impressão. */
  onPronto?: () => void
}) {
  const { toast } = useToast()
  const registrar = useRegistrarMonitoramento()

  const [integrador, setIntegrador] = useState<'conforme' | 'nao_conforme' | null>(
    (ciclo.integrador_quimico as 'conforme' | 'nao_conforme' | null) ?? null,
  )
  const [biologico, setBiologico] = useState<'negativo' | 'positivo' | null>(
    (ciclo.indicador_biologico as 'negativo' | 'positivo' | null) ?? null,
  )
  const [temperatura, setTemperatura] = useState(ciclo.temperatura ? String(ciclo.temperatura) : '')
  const [observacao, setObservacao] = useState(ciclo.observacao ?? '')
  const [detalhes, setDetalhes] = useState(false)

  // Conferido é o que já tem integrador registrado — o biológico é semanal e a
  // temperatura é opcional, então nenhum dos dois serve de marca.
  const conferido = !!ciclo.integrador_quimico
  const [corrigindo, setCorrigindo] = useState(false)

  const reprovado = integrador === 'nao_conforme' || biologico === 'positivo'

  const salvar = async () => {
    if (!integrador) return
    try {
      await registrar.mutateAsync({
        id: ciclo.id,
        integrador,
        biologico,
        temperatura: temperatura ? Number(temperatura) : null,
        observacao,
        por: responsavelPadrao,
      })
      setCorrigindo(false)
      onPronto?.()
      toast({
        title: reprovado ? 'Ciclo reprovado' : 'Carga liberada',
        description: reprovado
          ? 'Os pacotes deste lote não podem ser usados — recolha e reprocesse.'
          : `Lote ${ciclo.lote} conferido e liberado para uso.`,
        variant: reprovado ? 'destructive' : undefined,
      })
    } catch (erro: unknown) {
      toast({
        variant: 'destructive',
        title: 'Não deu para registrar',
        description: erro instanceof Error ? erro.message : 'Tente de novo',
      })
    }
  }

  // Ciclo já conferido: resumo de uma linha. Reabrir é escolha, não obrigação.
  if (conferido && !corrigindo) {
    const negado = ciclo.integrador_quimico === 'nao_conforme' || ciclo.indicador_biologico === 'positivo'
    return (
      <div
        className={`rounded-lg border p-4 flex items-start gap-3 ${
          negado ? 'border-red-200 bg-red-50' : 'border-teal-200 bg-teal-50'
        }`}
      >
        {negado
          ? <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
          : <CheckCircle2 className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${negado ? 'text-red-800' : 'text-teal-800'}`}>
            {negado ? 'Ciclo reprovado' : 'Carga liberada'}
          </p>
          <p className={`text-xs mt-0.5 ${negado ? 'text-red-700' : 'text-teal-700'}`}>
            {negado
              ? 'Os pacotes deste lote não podem ser usados — recolha e reprocesse.'
              : `Conferido por ${ciclo.liberado_por || 'equipe'}.`}
            {ciclo.indicador_biologico && ` Biológico ${ciclo.indicador_biologico}.`}
            {ciclo.temperatura ? ` ${ciclo.temperatura} °C.` : ''}
          </p>
        </div>
        <button
          onClick={() => setCorrigindo(true)}
          className={`text-xs shrink-0 underline underline-offset-2 ${
            negado ? 'text-red-700' : 'text-teal-700'
          }`}
        >
          Corrigir
        </button>
      </div>
    )
  }

  const escolha = (ativo: boolean, tom: 'bom' | 'ruim' | 'neutro') =>
    `flex-1 h-11 px-3 rounded-lg text-sm font-semibold border transition-colors ${
      ativo
        ? tom === 'bom' ? 'bg-teal-700 text-white border-teal-700'
        : tom === 'ruim' ? 'bg-red-600 text-white border-red-600'
        : 'bg-gray-700 text-white border-gray-700'
        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
    }`

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800">O ciclo deu certo?</h3>

      <div>
        <p className="text-sm text-gray-700 mb-2">A fita do pacote-teste virou?</p>
        <div className="flex gap-2">
          <button onClick={() => setIntegrador('conforme')} className={escolha(integrador === 'conforme', 'bom')}>
            Virou
          </button>
          <button onClick={() => setIntegrador('nao_conforme')} className={escolha(integrador === 'nao_conforme', 'ruim')}>
            Não virou
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Integrador químico classe 5 ou 6, no pacote-teste, a cada ciclo.
        </p>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-sm text-gray-700">Fez o teste biológico neste ciclo?</p>
          {biologicoVencido && !ciclo.indicador_biologico && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
              está na hora
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {/* Cinza, não verde: "não fiz" não é um resultado bom, é ausência de
              resultado. Antes vinha marcado em verde já na abertura, o que dava
              à tela o ar de pergunta respondida. */}
          <button onClick={() => setBiologico(null)} className={escolha(biologico === null, 'neutro')}>
            Não fiz
          </button>
          <button onClick={() => setBiologico('negativo')} className={escolha(biologico === 'negativo', 'bom')}>
            Negativo
          </button>
          <button onClick={() => setBiologico('positivo')} className={escolha(biologico === 'positivo', 'ruim')}>
            Positivo
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">
          Indicador biológico: uma vez por semana, no primeiro ciclo do dia.
        </p>
      </div>

      {/* Temperatura e observação não decidem nada — ficam fora do caminho de
          quem só quer conferir e liberar. */}
      {detalhes ? (
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Temperatura (°C)">
            <input
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value.replace(/\D/g, '').slice(0, 3))}
              inputMode="numeric"
              placeholder="134"
              className="w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
            />
          </Campo>
          <Campo rotulo="Observação">
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="opcional"
              className="w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
            />
          </Campo>
        </div>
      ) : (
        <button
          onClick={() => setDetalhes(true)}
          className="text-xs text-gray-500 hover:text-teal-700 flex items-center gap-1.5"
        >
          <Pencil className="w-3.5 h-3.5" /> Anotar temperatura ou observação
        </button>
      )}

      {reprovado && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Os pacotes deste lote não poderão ser usados. Recolha o que já foi para o estoque e
          reprocesse.
        </p>
      )}

      <button
        onClick={salvar}
        disabled={!integrador || registrar.isPending}
        className={`w-full h-11 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
          reprovado ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-700 hover:bg-teal-800'
        }`}
      >
        {registrar.isPending
          ? 'Registrando…'
          : !integrador ? 'Responda a fita do pacote-teste'
          : reprovado ? 'Registrar reprovação'
          : 'Liberar carga'}
      </button>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 mb-1">{rotulo}</span>
      {children}
    </label>
  )
}

/** Ajustes do rolo e da impressora — muda de fornecedor, muda aqui. */
function AjustesImpressora({
  ajustes, onMudar, onRestaurar, onTestar, ocupado,
}: {
  ajustes: Ajustes
  onMudar: (a: Partial<Ajustes>) => void
  onRestaurar: () => void
  onTestar: () => void
  ocupado: boolean
}) {
  const campo = 'h-8 px-2 rounded border border-gray-200 text-xs text-gray-700 focus:border-teal-500 focus:outline-none'

  return (
    <details className="rounded border border-gray-100 bg-gray-50 px-3 py-2">
      <summary className="text-xs text-gray-500 cursor-pointer select-none">Ajustes do rolo e da impressora</summary>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="text-[11px] text-gray-500">
          Comprimento (mm)
          <input
            type="number" min={10} max={100} value={ajustes.comprimentoMm}
            onChange={(e) => onMudar({ comprimentoMm: Number(e.target.value) || 50 })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Largura útil (mm)
          <input
            type="number" min={6} max={15} value={ajustes.larguraMm}
            onChange={(e) => onMudar({ larguraMm: Number(e.target.value) || 12 })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500" title="Folga branca em volta, em pontos da cabeça (8 pontos = 1 mm). Aumentar abre espaço para o ajuste de centralizar.">
          Margem (pontos)
          <input
            type="number" min={0} max={32} value={ajustes.margem}
            onChange={(e) => onMudar({ margem: Math.min(32, Math.max(0, Number(e.target.value) || 0)) })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500" title="Positivo desce o desenho na etiqueta; negativo sobe.">
          Centralizar (mm)
          <input
            type="number" min={-6} max={6} step={0.25} value={ajustes.deslocamentoMm ?? 0}
            onChange={(e) => onMudar({
              deslocamentoMm: Math.min(6, Math.max(-6, Number(e.target.value) || 0)),
            })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Giro na impressora
          <select
            value={ajustes.rotacao}
            onChange={(e) => onMudar({ rotacao: Number(e.target.value) as Ajustes['rotacao'] })}
            className={`${campo} w-full mt-1`}
          >
            <option value={0}>0°</option>
            <option value={90}>90°</option>
            <option value={180}>180°</option>
            <option value={270}>270°</option>
          </select>
        </label>
        <label className="text-[11px] text-gray-500">
          Tamanho da logo (%)
          <input
            type="number" min={0} max={60} value={ajustes.logoPorcento ?? 34}
            onChange={(e) => onMudar({ logoPorcento: Math.min(60, Math.max(0, Number(e.target.value) || 0)) })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500">
          Densidade (1 a 5)
          <input
            type="number" min={1} max={5} value={ajustes.densidade}
            onChange={(e) => onMudar({ densidade: Number(e.target.value) || 3 })}
            className={`${campo} w-full mt-1`}
          />
        </label>
        <label className="text-[11px] text-gray-500 col-span-2">
          Família da impressora
          <select
            value={ajustes.variante}
            onChange={(e) => onMudar({ variante: e.target.value as VarianteProtocolo })}
            className={`${campo} w-full mt-1`}
          >
            <option value="b21">D110 / D110_M / B21 / B3 — linhas e largura</option>
            <option value="d11">D11 / D101 — só as linhas</option>
            <option value="b1">B1 — linhas, largura e cópias</option>
          </select>
          <span className="block mt-1 text-gray-400">
            Cada família manda um comando de tamanho de página diferente. Se a régua
            sair com METADE dos degraus, a impressora não está sabendo a largura da
            linha e está cortando: troque para uma opção que mande a largura.
          </span>
        </label>

        <button
          type="button"
          onClick={() => {
            if (confirm('Voltar todos os ajustes ao padrão de fábrica?')) onRestaurar()
          }}
          className="col-span-2 h-8 rounded border border-gray-200 bg-white text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors"
        >
          Restaurar ajustes padrão
        </button>

        <button
          type="button"
          onClick={onTestar}
          disabled={ocupado}
          className="col-span-2 flex items-center justify-center gap-1.5 h-8 rounded border border-gray-200 bg-white text-xs text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors disabled:opacity-60"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir régua (mede o corte, sem gravar ciclo)
        </button>

      </div>
    </details>
  )
}
