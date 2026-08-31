'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Biohazard, Bluetooth, Calendar, ChevronLeft, ChevronRight, Download, Loader2, Pencil, Plus,
  Printer, X,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  AUTOCLAVE_PADRAO, CicloEsterilizacao, MigrationPendenteError, RESPONSAVEL_PADRAO,
  VALIDADE_MESES, formatarData, hojeLocal, montarLote, proximoNumeroDoDia, somarMeses,
  useAbrirCiclo, useCiclosEsterilizacao,
} from '@/hooks/useEsterilizacao'
import {
  DadosEtiqueta, FORMATO_PADRAO, FormatoEtiqueta, bitmapDeTeste, canvasParaBitmap, carregarLogo,
  desenharEtiqueta,
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

const AJUSTES_CHAVE = 'vitallcam:etiqueta-esterilizacao:ajustes'
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

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const data = new Date(Date.UTC(a, m - 1, d + dias))
  return data.toISOString().slice(0, 10)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <EstadoImpressora modo={modo} impressora={impressora} onMudar={setImpressora} />
        <button
          onClick={() => setAberto('novo')}
          className="flex items-center gap-2 px-6 h-9 rounded text-sm font-semibold bg-teal-700 text-white hover:bg-teal-800 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Novo ciclo
        </button>
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

      {grupos.map(([data, doDia]) => (
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

function Cartao({ ciclo, onAbrir }: { ciclo: CicloEsterilizacao; onAbrir: (c: CicloEsterilizacao) => void }) {
  const vencido = ciclo.validade < hojeLocal()

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
            <Calendar className="w-3 h-3" /> {formatarData(ciclo.data)} · ciclo {String(ciclo.numero).padStart(2, '0')}
          </p>
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
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

  if (modo === 'indisponivel') {
    return (
      <p className="text-xs text-gray-500 bg-gray-100 border border-gray-200 rounded px-3 py-2">
        Este navegador não conversa com a Niimbot. Abra pelo app da clínica, use o Chrome — ou baixe o PNG e imprima pelo app da impressora.
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
  const [quantidade, setQuantidade] = useState(ciclo?.quantidade_etiquetas ?? 10)
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
  }), [lote, data, validade, responsavel, autoclave, conteudo, logo])

  const desenhar = useCallback((alvo: HTMLCanvasElement) => {
    desenharEtiqueta(alvo, dados, {
      comprimentoMm: ajustes.comprimentoMm,
      larguraMm: ajustes.larguraMm,
      margem: ajustes.margem,
      logoPorcento: ajustes.logoPorcento,
    })
  }, [dados, ajustes.comprimentoMm, ajustes.larguraMm, ajustes.margem])

  useEffect(() => {
    if (canvasRef.current) desenhar(canvasRef.current)
  }, [desenhar])

  const imprimir = async () => {
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

      // Espera a marca antes de desenhar: a etiqueta tem que sair com a logo
      // sempre, e quem aperta imprimir logo depois de abrir a tela chegaria
      // aqui antes de a imagem terminar de carregar.
      const marca = logo ?? await carregarLogo()

      const canvas = document.createElement('canvas')
      desenharEtiqueta(canvas, etiquetaDoCiclo(alvo, marca), {
        comprimentoMm: ajustes.comprimentoMm,
        larguraMm: ajustes.larguraMm,
        margem: ajustes.margem,
        logoPorcento: ajustes.logoPorcento,
      })
      const bitmap = canvasParaBitmap(canvas, ajustes.rotacao)

      await enviarEtiqueta(
        bitmap,
        {
          copias: quantidade,
          densidade: ajustes.densidade,
          variante: ajustes.variante,
          aoProgredir: setProgresso,
        },
        { impressora: conectada, aoConectar: onImpressora },
      )

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
            <p className="text-xs font-medium text-gray-500 mb-2">Quantas etiquetas (uma por pacote)</p>
            <div className="flex items-center gap-2 flex-wrap">
              {QUANTIDADES.map((n) => (
                <button
                  key={n}
                  onClick={() => setQuantidade(n)}
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
                type="number"
                min={1}
                max={100}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
                className="h-9 w-20 px-3 rounded border border-gray-200 text-sm text-gray-700 focus:border-teal-500 focus:outline-none"
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
            {ocupado ? 'Imprimindo…' : `Imprimir ${quantidade}`}
          </button>
        </div>
      </div>
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
