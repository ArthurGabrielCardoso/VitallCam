'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Biohazard, Bluetooth, BookText, Calendar, CheckCircle2, ChevronLeft, ChevronRight,
  Clock, Download, FlaskConical, Loader2, Package, PackageCheck, Pencil, Plus, Printer, Search, X,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/hooks/use-toast'
import {
  AUTOCLAVE_PADRAO, CicloEsterilizacao, DIAS_ENTRE_BIOLOGICOS, MigrationPendenteError,
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
  ImpressoraEncontrada, ModoImpressao, aquecerImpressora, escolherImpressora, esquecerImpressora,
  imprimirEtiqueta as enviarEtiqueta, impressoraLembrada, modoImpressao, podeListarImpressoras,
  procurarImpressoras,
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

// A chave muda de versão quando os padrões mudam: o tamanho da logo guardado no
// aparelho foi encolhido para caber o QR que não existe mais, e ajuste velho
// sobrevivendo a um padrão novo é bug que só aparece em um tablet.
const AJUSTES_CHAVE = 'vitallcam:etiqueta-esterilizacao:ajustes:v2'
const QUANTIDADES = [5, 10, 20, 30]

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
  variante: 'd11',
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

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EstadoImpressora modo={modo} impressora={impressora} onMudar={setImpressora} />
        <div className="flex items-center gap-2">
          <Link
            href="/patients/esterilizacao/livro"
            className="flex items-center gap-2 h-9 px-4 rounded border border-gray-200 bg-white text-sm text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors"
            title="Um ciclo por linha, para entregar na inspeção"
          >
            <BookText className="h-4 w-4" />
            Livro de registro
          </Link>
          <button
            onClick={() => setAberto('novo')}
            className="flex items-center gap-2 px-6 h-9 rounded text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo ciclo
          </button>
        </div>
      </div>

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3">
          A tabela <code>esterilizacao_ciclos</code> ainda não existe no banco. Rode a migration
          <code className="mx-1">20260831_add_esterilizacao_ciclos.sql</code> no Supabase para começar a registrar os ciclos.
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
            className="w-full h-10 pl-9 pr-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
          />
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
      className={`snap-start shrink-0 w-32 sm:w-auto rounded border p-3 ${
        alerta ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
      }`}
    >
      <div className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${alerta ? 'text-amber-700' : 'text-gray-400'}`}>
        {icone} <span className="truncate">{rotulo}</span>
      </div>
      <p className={`text-2xl font-semibold mt-1 ${alerta ? 'text-amber-800' : 'text-gray-800'}`}>{valor}</p>
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
        <div className="flex items-center gap-1 shrink-0">
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
        {ciclos.map((ciclo) => (
          <div key={ciclo.id} className="snap-start shrink-0 w-72">
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
      className="w-full h-full text-left bg-white border border-gray-200 rounded shadow-sm p-4 hover:bg-teal-50 hover:border-teal-500 hover:shadow-md transition-all group"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shrink-0 shadow-sm">
          <Biohazard className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 group-hover:text-teal-700 transition-colors leading-snug truncate">
            Lote {ciclo.lote}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {formatarData(ciclo.data)}
            <Clock className="w-3 h-3 ml-1" /> {formatarHora(ciclo.created_at)}
            <span className="ml-1">· ciclo {String(ciclo.numero).padStart(2, '0')}</span>
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${selo.cls}`}>
              {selo.texto}
            </span>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                vencido
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-teal-50 text-teal-700 border-teal-200'
              }`}
            >
              {vencido ? 'Vencido' : 'Val'} {formatarData(ciclo.validade)}
            </span>
            <span className="text-[10px] text-gray-500">{ciclo.quantidade_etiquetas} etiq.</span>
            {ciclo.autoclave && <span className="text-[10px] text-gray-500">{ciclo.autoclave}</span>}
          </div>
          <p className="text-[11px] text-gray-400 mt-1 truncate">
            {ciclo.responsavel}
            {ciclo.conteudo ? ` · ${ciclo.conteudo}` : ''}
          </p>
        </div>
      </div>
    </button>
  )
}

/** Estado da impressora. No app é informação; no navegador é um botão. */
function EstadoImpressora({
  modo, impressora, onMudar,
}: {
  modo: ModoImpressao
  impressora: Niimbot | null
  onMudar: (i: Niimbot | null) => void
}) {
  const { toast } = useToast()
  const [conectando, setConectando] = useState(false)
  const [lembrada, setLembrada] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [encontradas, setEncontradas] = useState<ImpressoraEncontrada[] | null>(null)

  useEffect(() => {
    if (modo === 'app') setLembrada(impressoraLembrada())
  }, [modo])

  const buscar = async () => {
    setBuscando(true)
    try {
      setEncontradas(await procurarImpressoras())
    } catch (erro: unknown) {
      toast({
        variant: 'destructive',
        title: 'Não deu para procurar',
        description: erro instanceof Error ? erro.message : 'Tente de novo',
      })
    } finally {
      setBuscando(false)
    }
  }

  const conectar = async (mostrarTodos: boolean) => {
    setConectando(true)
    try {
      onMudar(await Niimbot.conectar(mostrarTodos))
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Falha ao conectar'
      // Cancelar o seletor do navegador não é erro que mereça alarde.
      if (!/cancel|user/i.test(msg)) {
        toast({ variant: 'destructive', title: 'Impressora não conectou', description: msg })
      }
    } finally {
      setConectando(false)
    }
  }

  if (modo === 'app') {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-3 py-2">
          <Printer className="w-3.5 h-3.5" />
          {lembrada ? `${lembrada} — pronta` : 'Nenhuma impressora escolhida ainda'}
        </div>
        {podeListarImpressoras() && (
          <button
            onClick={buscar}
            disabled={buscando}
            className="flex items-center gap-2 h-9 px-4 rounded border border-gray-200 bg-white text-sm text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors disabled:opacity-60"
          >
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
            {buscando ? 'Procurando…' : 'Conectar impressora'}
          </button>
        )}

        {encontradas && (
          <ListaImpressoras
            lista={encontradas}
            onEscolher={(impressora) => {
              escolherImpressora(impressora)
              setLembrada(impressora.nome)
              setEncontradas(null)
              toast({ title: `${impressora.nome} escolhida`, description: 'As próximas etiquetas vão direto para ela.' })
            }}
            onFechar={() => setEncontradas(null)}
          />
        )}
      </div>
    )
  }

  if (modo === 'app-antigo') {
    return (
      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Este app é de uma versão anterior à impressão de etiquetas.{' '}
        <a href="/vitallcam-android.apk" className="font-semibold underline underline-offset-2">
          Baixe o app atualizado
        </a>{' '}
        e instale por cima — depois disso a impressora aparece aqui.
      </p>
    )
  }

  if (modo === 'indisponivel') {
    return (
      <p className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-3 py-2">
        Esta tela está aberta num navegador que não conversa com a Niimbot. Abra pelo{' '}
        <a href="/vitallcam-android.apk" className="font-semibold underline underline-offset-2">
          app da clínica
        </a>{' '}
        ou pelo Chrome — ou baixe o PNG e imprima pelo app da impressora.
      </p>
    )
  }

  if (impressora?.conectado) {
    return (
      <div className="flex items-center gap-2 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded px-3 py-2">
        <Bluetooth className="w-3.5 h-3.5" />
        {impressora.nome} conectada
        <button
          onClick={() => { impressora.desconectar(); onMudar(null) }}
          className="text-gray-400 hover:text-gray-600"
          title="Desconectar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => conectar(false)}
        disabled={conectando}
        className="flex items-center gap-2 h-9 px-4 rounded border border-gray-200 bg-white text-sm text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors disabled:opacity-60"
      >
        {conectando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
        Conectar impressora
      </button>
      <button
        onClick={() => conectar(true)}
        className="text-xs text-gray-400 hover:text-teal-700 underline underline-offset-2"
        title="Mostra todos os aparelhos Bluetooth, caso a impressora anuncie outro nome"
      >
        não aparece?
      </button>
    </div>
  )
}

/** Lista do que apareceu no ar — a pessoa toca na impressora dela. */
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

  const [ajustes, setAjustes] = useState<Ajustes>(AJUSTES_PADRAO)
  useEffect(() => setAjustes(lerAjustes()), [])
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
    // Na prévia, o primeiro pacote do ciclo — para o QR aparecer do tamanho que
    // vai sair, e não como uma surpresa na primeira etiqueta.
    pacote: `${lote}-01`,
  }), [lote, data, validade, responsavel, autoclave, conteudo, logo])

  const desenhar = useCallback((alvo: HTMLCanvasElement) => {
    desenharEtiqueta(alvo, dados, {
      comprimentoMm: ajustes.comprimentoMm,
      larguraMm: ajustes.larguraMm,
      margem: ajustes.margem,
      logoPorcento: ajustes.logoPorcento,
    })
  }, [dados, ajustes.comprimentoMm, ajustes.larguraMm, ajustes.margem])

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
      try {
        const existentes = await garantirPacotes(alvo.id, 0)
        const todos = await garantirPacotes(alvo.id, existentes.length + quantidade)
        codigos = todos.slice(existentes.length).map((p) => p.codigo)
      } catch {
        // Sem a migration dos pacotes a etiqueta sai como antes, só com o lote:
        // rastreabilidade por ciclo é pior que por pacote e melhor que nenhuma.
      }

      const formato = {
        comprimentoMm: ajustes.comprimentoMm,
        larguraMm: ajustes.larguraMm,
        margem: ajustes.margem,
        logoPorcento: ajustes.logoPorcento,
        }

      for (let i = 0; i < codigos.length; i++) {
        const canvas = document.createElement('canvas')
        desenharEtiqueta(canvas, { ...etiquetaDoCiclo(alvo, marca), pacote: codigos[i] }, formato)
        const bitmap = canvasParaBitmap(canvas, ajustes.rotacao)

        await enviarEtiqueta(
          bitmap,
          {
            copias: 1,
            densidade: ajustes.densidade,
            variante: ajustes.variante,
            // Cada etiqueta é um envio; a barra soma o progresso das anteriores.
            aoProgredir: (pct) => setProgresso(Math.round(((i + pct / 100) / codigos.length) * 100)),
          },
          { impressora: conectada, aoConectar: onImpressora },
        )
      }

      setUltimoErro(null)
      toast({
        title: `Lote ${alvo.lote} impresso`,
        description: `${quantidade} etiqueta${quantidade > 1 ? 's' : ''} — cole no papel grau cirúrgico, que já traz o indicador químico.`,
      })
      onFechar()
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Falha ao imprimir'
      if (!/cancel|user/i.test(msg)) {
        setUltimoErro(msg)
        toast({ variant: 'destructive', title: 'Não deu para imprimir', description: msg })
      }
    } finally {
      setProgresso(null)
    }
  }

  /**
   * Imprime o padrão de teste: tarjas e xadrez, sem texto e sem QR.
   *
   * É o que separa "a impressora não recebeu nada" de "o desenho saiu errado" —
   * e não abre ciclo nenhum, então dá para tentar as variantes do protocolo à
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
        toast({ variant: 'destructive', title: 'Não deu para imprimir o teste', description: msg })
      }
    } finally {
      setProgresso(null)
    }
  }

  /**
   * Saída sem Bluetooth: baixa o PNG no tamanho exato da etiqueta para imprimir
   * pelo app da Niimbot. Não grava ciclo — o registro nasce da impressão.
   */
  const baixarPng = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `etiqueta-${lote}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const ocupado = progresso !== null || abrirCiclo.isPending
  const campoClasse = 'w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500'
  const bloqueado = !!ciclo || !editando

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
      onClick={() => !ocupado && onFechar()}
    >
      <div
        className="clean-dialog w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-800">
              {ciclo ? `Ciclo ${ciclo.lote}` : 'Novo ciclo'}
            </h2>
            <p className="text-xs text-gray-400">
              {ciclo ? 'Reimprimir etiquetas deste lote' : 'Tudo preenchido — confira e imprima'}
            </p>
          </div>
          <button onClick={onFechar} disabled={ocupado} className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* A prévia é o próprio desenho que vai para a impressora, em 203 dpi:
              o que estiver ilegível aqui vai sair ilegível no adesivo. */}
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 flex justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full h-auto bg-white shadow-sm"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>

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

          {ciclo && <ResultadoDoCiclo ciclo={ciclo} responsavelPadrao={responsavel} />}

          {!ciclo && (
            <button
              onClick={() => setEditando((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-700"
            >
              <Pencil className="w-3.5 h-3.5" />
              {editando ? 'Voltar ao padrão preenchido' : 'Editar os dados deste ciclo'}
            </button>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              Quantas etiquetas (uma por pacote)
              {avisouQuantidade && quantidadeInvalida && (
                <span className="ml-2 text-red-600">diga quantas antes de imprimir</span>
              )}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {QUANTIDADES.map((n) => (
                <button
                  key={n}
                  onClick={() => { setQuantidadeTexto(String(n)); setAvisouQuantidade(false) }}
                  className={`h-9 w-12 rounded text-sm font-semibold border transition-colors ${
                    quantidade === n
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-teal-500 hover:text-teal-700'
                  }`}
                >
                  {n}
                </button>
              ))}
              <input
                type="text"
                inputMode="numeric"
                maxLength={3}
                value={quantidadeTexto}
                onChange={(e) => {
                  setQuantidadeTexto(e.target.value.replace(/\D/g, ''))
                  setAvisouQuantidade(false)
                }}
                className={`h-9 w-20 px-3 rounded border text-sm focus:outline-none ${
                  avisouQuantidade && quantidadeInvalida
                    ? 'border-red-400 bg-red-50 text-red-700 focus:border-red-500'
                    : 'border-gray-200 text-gray-700 focus:border-teal-500'
                }`}
              />
            </div>
          </div>

          <AjustesImpressora ajustes={ajustes} onMudar={salvarAjustes} onTestar={imprimirTeste} ocupado={ocupado} />

          {ultimoErro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {ultimoErro}
            </p>
          )}

          {progresso !== null && (
            <div className="h-1.5 rounded bg-gray-100 overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${progresso}%` }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
          <button
            onClick={baixarPng}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-700"
            title="Para imprimir pelo app da Niimbot, se o Bluetooth não colaborar"
          >
            <Download className="w-3.5 h-3.5" /> Baixar PNG
          </button>
          <button
            onClick={imprimir}
            disabled={ocupado}
            className="flex items-center gap-2 px-6 h-10 rounded text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors disabled:opacity-60"
          >
            {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {ocupado ? 'Imprimindo…' : quantidadeInvalida ? 'Imprimir' : `Imprimir ${quantidade}`}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Registro do resultado do ciclo — o que a fiscalização pede depois de ler o
 * lote no pacote.
 *
 * A RDC 1.002/2025 exige integrador químico classe 5 ou 6 em pacote-teste a cada
 * ciclo e indicador biológico semanal, no primeiro ciclo do dia programado, com
 * registro formal dos resultados. A etiqueta prova que o ciclo existiu; isto
 * aqui prova que ele deu certo.
 *
 * A liberação da carga sai do resultado, não de um botão separado: carga com
 * integrador não conforme, ou com biológico positivo, não é liberada — volta
 * para o reprocessamento.
 */
function ResultadoDoCiclo({
  ciclo, responsavelPadrao,
}: {
  ciclo: CicloEsterilizacao
  responsavelPadrao: string
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
      toast({
        title: reprovado ? 'Ciclo reprovado registrado' : 'Carga liberada',
        description: reprovado
          ? 'A carga não pode ser usada: reprocesse os pacotes deste lote.'
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

  const opcao = (ativo: boolean, tom: 'bom' | 'ruim') =>
    `h-9 px-3 rounded text-xs font-semibold border transition-colors ${
      ativo
        ? tom === 'bom'
          ? 'bg-teal-700 text-white border-teal-700'
          : 'bg-red-600 text-white border-red-600'
        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
    }`

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Resultado do ciclo</h3>
        {ciclo.liberado_em && (
          <span className="text-[11px] text-teal-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            liberado por {ciclo.liberado_por || 'equipe'}
          </span>
        )}
      </div>

      <div>
        <p className="text-[11px] font-medium text-gray-500 mb-1.5">
          Integrador químico classe 5 ou 6 (pacote-teste, todo ciclo)
        </p>
        <div className="flex gap-2">
          <button onClick={() => setIntegrador('conforme')} className={opcao(integrador === 'conforme', 'bom')}>
            Conforme
          </button>
          <button onClick={() => setIntegrador('nao_conforme')} className={opcao(integrador === 'nao_conforme', 'ruim')}>
            Não conforme
          </button>
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium text-gray-500 mb-1.5">
          Indicador biológico (semanal, no primeiro ciclo do dia)
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setBiologico(null)} className={opcao(biologico === null, 'bom')}>
            Não fiz neste ciclo
          </button>
          <button onClick={() => setBiologico('negativo')} className={opcao(biologico === 'negativo', 'bom')}>
            Negativo
          </button>
          <button onClick={() => setBiologico('positivo')} className={opcao(biologico === 'positivo', 'ruim')}>
            Positivo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Temperatura (°C)</span>
          <input
            value={temperatura}
            onChange={(e) => setTemperatura(e.target.value.replace(/\D/g, '').slice(0, 3))}
            inputMode="numeric"
            placeholder="134"
            className="w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium text-gray-500 mb-1">Observação</span>
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="opcional"
            className="w-full h-9 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
          />
        </label>
      </div>

      {reprovado && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Ciclo reprovado: os pacotes deste lote não podem ser usados. Recolha o que já saiu para o
          estoque e reprocesse.
        </p>
      )}

      <button
        onClick={salvar}
        disabled={!integrador || registrar.isPending}
        className="w-full h-9 rounded text-sm font-semibold bg-gray-800 text-white hover:bg-gray-900 transition-colors disabled:opacity-50"
      >
        {registrar.isPending ? 'Registrando…' : reprovado ? 'Registrar reprovação' : 'Registrar e liberar carga'}
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
  ajustes, onMudar, onTestar, ocupado,
}: {
  ajustes: Ajustes
  onMudar: (a: Partial<Ajustes>) => void
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
            <option value="d11">D110 / D11 / D101</option>
            <option value="b21">B21 / B3</option>
            <option value="b1">B1</option>
          </select>
          <span className="block mt-1 text-gray-400">
            Etiqueta andando em branco é quase sempre isto: cada família espera um
            comando de tamanho de página diferente. Teste as três.
          </span>
        </label>

        <button
          type="button"
          onClick={onTestar}
          disabled={ocupado}
          className="col-span-2 flex items-center justify-center gap-1.5 h-8 rounded border border-gray-200 bg-white text-xs text-gray-600 hover:text-teal-700 hover:border-teal-500 transition-colors disabled:opacity-60"
        >
          <Printer className="w-3.5 h-3.5" /> Imprimir teste (tarja e xadrez, sem gravar ciclo)
        </button>

      </div>
    </details>
  )
}
