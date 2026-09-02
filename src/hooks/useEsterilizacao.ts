import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Ciclos de esterilização da CME.
 *
 * Um registro por ciclo da autoclave, não por etiqueta: as vinte etiquetas de
 * um mesmo ciclo levam o mesmo lote, e é isso que liga o pacote ao processo
 * quando a Vigilância pede rastreabilidade (RDC 1.002/2025, art. 81).
 *
 * O número do ciclo vem do banco, nunca do dispositivo. Se o contador morasse
 * no tablet, o celular da recepção abriria outro "01" no mesmo dia e dois
 * pacotes diferentes teriam o mesmo lote.
 */

export interface CicloEsterilizacao {
  id: string
  /** Data do ciclo em ISO (aaaa-mm-dd). */
  data: string
  numero: number
  /** MMDD-NN, como sai impresso: 0831-01. */
  lote: string
  validade: string
  responsavel: string
  autoclave: string | null
  quantidade_etiquetas: number
  conteudo: string | null
  created_at: string
  /** 'conforme' | 'nao_conforme'. Nulo = ciclo ainda não conferido. */
  integrador_quimico: string | null
  /** 'negativo' (aprovado) | 'positivo'. Nulo = não houve biológico no ciclo. */
  indicador_biologico: string | null
  temperatura: number | null
  duracao_minutos: number | null
  liberado_em: string | null
  liberado_por: string | null
  observacao: string | null
}

/** Situação do ciclo, do jeito que a bancada e a fiscalização enxergam. */
export type SituacaoCiclo = 'pendente' | 'liberado' | 'reprovado'

export function situacaoDoCiclo(ciclo: CicloEsterilizacao): SituacaoCiclo {
  if (!ciclo.integrador_quimico) return 'pendente'
  if (ciclo.liberado_em) return 'liberado'
  return 'reprovado'
}

export const RESPONSAVEL_PADRAO = 'Jéssica Pádua'
/**
 * Dias entre um teste biológico e o seguinte.
 *
 * A RDC 1.002/2025 pede o indicador biológico semanal, no primeiro ciclo do dia
 * programado. Sete dias é o teto; o aviso aparece antes disso para a clínica não
 * descobrir o atraso no dia da inspeção.
 */
export const DIAS_ENTRE_BIOLOGICOS = 7
export const AUTOCLAVE_PADRAO = 'Autoclave 01'
/** Validade padrão do pacote embalado, em meses. */
export const VALIDADE_MESES = 3

/** Hoje no fuso da clínica — em UTC, um ciclo da noite cairia no dia seguinte. */
export function hojeLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** "2026-08-31" → "31/08/2026" */
export function formatarData(iso: string): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/**
 * Soma meses a uma data ISO sem passar por `Date`, que faria 31/08 + 3 virar
 * 01/12 (novembro não tem dia 31). Vencimento estourado por um dia é o tipo de
 * detalhe que só aparece quando o pacote já foi usado.
 */
export function somarMeses(iso: string, meses: number): string {
  const m = (iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return iso
  const ano = Number(m[1])
  const mes = Number(m[2]) - 1 + meses
  const dia = Number(m[3])
  const anoFinal = ano + Math.floor(mes / 12)
  const mesFinal = ((mes % 12) + 12) % 12
  const ultimoDia = new Date(Date.UTC(anoFinal, mesFinal + 1, 0)).getUTCDate()
  const diaFinal = Math.min(dia, ultimoDia)
  return `${anoFinal}-${String(mesFinal + 1).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

/** Lote como o banco monta, para a tela mostrar antes de gravar. */
export function montarLote(data: string, numero: number): string {
  const m = (data || '').match(/^\d{4}-(\d{2})-(\d{2})/)
  return `${m ? m[1] + m[2] : '0000'}-${String(numero).padStart(2, '0')}`
}

/**
 * Tabela ausente (migration não rodada) não é erro de rede: repetir não
 * resolve. A tela mostra o aviso e continua utilizável para conferência.
 */
function ehMigrationPendente(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205'
    || error.code === 'PGRST202'
    || error.code === '42703'
    || error.code === '42883'
    || /esterilizacao_ciclos|esterilizacao_pacotes|abrir_ciclo_esterilizacao|garantir_pacotes_do_ciclo|usar_pacote_esterilizacao/.test(error.message || '')
}

export class MigrationPendenteError extends Error {
  constructor() {
    super('A tabela esterilizacao_ciclos ainda não existe no banco. Rode a migration.')
    this.name = 'MigrationPendenteError'
  }
}

/** Histórico recente, do ciclo mais novo para o mais antigo. */
export const useCiclosEsterilizacao = (limite = 200) => {
  return useQuery({
    queryKey: ['esterilizacao-ciclos', limite],
    queryFn: async (): Promise<CicloEsterilizacao[]> => {
      const { data, error } = await supabase
        .from('esterilizacao_ciclos')
        .select('*')
        .order('data', { ascending: false })
        .order('numero', { ascending: false })
        .limit(limite)
      if (error) {
        if (ehMigrationPendente(error)) {
          console.warn('[Esterilização] tabela esterilizacao_ciclos ainda não existe — rode a migration.')
          throw new MigrationPendenteError()
        }
        throw error
      }
      return (data || []) as CicloEsterilizacao[]
    },
    retry: false,
    staleTime: 15_000,
  })
}

export interface NovoCiclo {
  responsavel?: string
  autoclave?: string | null
  quantidade?: number
  conteudo?: string | null
  /** Data do ciclo em ISO; padrão é hoje no fuso da clínica. */
  data?: string
  /** Validade em ISO; padrão são três meses a partir da data do ciclo. */
  validade?: string
}

/**
 * Abre o ciclo e devolve a linha já numerada.
 *
 * A numeração acontece dentro da função no Postgres, sob advisory lock: é lá
 * que "primeira vez hoje = 01, segunda = 02" fica verdade mesmo com dois
 * aparelhos imprimindo ao mesmo tempo.
 */
export const useAbrirCiclo = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (novo: NovoCiclo = {}): Promise<CicloEsterilizacao> => {
      const { data, error } = await supabase.rpc('abrir_ciclo_esterilizacao', {
        p_responsavel: novo.responsavel?.trim() || RESPONSAVEL_PADRAO,
        p_autoclave: novo.autoclave?.trim() || AUTOCLAVE_PADRAO,
        p_quantidade: Math.max(1, Math.floor(novo.quantidade ?? 1)),
        p_conteudo: novo.conteudo?.trim() || null,
        p_data: novo.data ?? null,
        p_validade: novo.validade ?? null,
      })
      if (error) {
        if (ehMigrationPendente(error)) throw new MigrationPendenteError()
        throw error
      }
      // A função retorna a linha inteira; o cliente entrega como objeto único.
      return (Array.isArray(data) ? data[0] : data) as CicloEsterilizacao
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esterilizacao-ciclos'] })
    },
  })
}

/** Qual seria o próximo ciclo do dia, para a tela mostrar antes de gravar. */
export function proximoNumeroDoDia(ciclos: CicloEsterilizacao[], data: string): number {
  const doDia = ciclos.filter((c) => c.data === data)
  return doDia.reduce((maior, c) => Math.max(maior, c.numero), 0) + 1
}

/** Ciclos de um dia, na ordem em que saíram da autoclave. */
export function ciclosDoDia(ciclos: CicloEsterilizacao[], data: string): CicloEsterilizacao[] {
  return ciclos.filter((c) => c.data === data)
}

export interface ResumoEsterilizacao {
  ciclosHoje: number
  /** Etiquetas impressas hoje — uma por pacote de grau cirúrgico. */
  pacotesHoje: number
  ciclosMes: number
  pacotesMes: number
  /** Ciclos com o integrador ainda não conferido. */
  pendentes: number
  /** Data do último ciclo com teste biológico, ou null se nunca houve. */
  ultimoBiologico: string | null
  /** Dias desde o último biológico; null quando nunca foi feito. */
  diasSemBiologico: number | null
  /** Vencido = passou da semana que a norma pede. */
  biologicoVencido: boolean
}

export function resumoEsterilizacao(ciclos: CicloEsterilizacao[]): ResumoEsterilizacao {
  const hoje = hojeLocal()
  const mes = hoje.slice(0, 7)
  const soma = (lista: CicloEsterilizacao[]) =>
    lista.reduce((total, c) => total + (c.quantidade_etiquetas || 0), 0)

  const doDia = ciclos.filter((c) => c.data === hoje)
  const doMes = ciclos.filter((c) => c.data.startsWith(mes))

  // O biológico mais recente manda no aviso: a norma conta a semana a partir
  // dele, não a partir do último ciclo qualquer.
  const comBiologico = ciclos
    .filter((c) => c.indicador_biologico)
    .sort((a, b) => b.data.localeCompare(a.data))
  const ultimoBiologico = comBiologico[0]?.data ?? null
  const diasSemBiologico = ultimoBiologico ? diasEntre(ultimoBiologico, hoje) : null

  return {
    ciclosHoje: doDia.length,
    pacotesHoje: soma(doDia),
    ciclosMes: doMes.length,
    pacotesMes: soma(doMes),
    pendentes: ciclos.filter((c) => !c.integrador_quimico).length,
    ultimoBiologico,
    diasSemBiologico,
    biologicoVencido: diasSemBiologico === null || diasSemBiologico >= DIAS_ENTRE_BIOLOGICOS,
  }
}

/** Dias inteiros entre duas datas ISO. */
export function diasEntre(de: string, ate: string): number {
  const dia = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((dia(ate) - dia(de)) / 86_400_000)
}

/** "2026-08-31T22:41:11Z" → "19:41", no fuso da clínica. */
export function formatarHora(iso: string): string {
  const quando = new Date(iso)
  if (Number.isNaN(quando.getTime())) return ''
  return quando.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export interface Monitoramento {
  id: string
  integrador: 'conforme' | 'nao_conforme'
  biologico?: 'negativo' | 'positivo' | null
  temperatura?: number | null
  duracao?: number | null
  observacao?: string | null
  por?: string | null
}

/**
 * Grava o resultado do ciclo e libera a carga quando os indicadores passam.
 *
 * É o registro que a fiscalização pede depois de ler o lote no pacote: sem ele,
 * a etiqueta prova que o ciclo existiu e não prova que deu certo.
 */
export const useRegistrarMonitoramento = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (registro: Monitoramento): Promise<CicloEsterilizacao> => {
      const { data, error } = await supabase.rpc('registrar_monitoramento_ciclo', {
        p_id: registro.id,
        p_integrador: registro.integrador,
        p_biologico: registro.biologico ?? null,
        p_temperatura: registro.temperatura ?? null,
        p_duracao: registro.duracao ?? null,
        p_observacao: registro.observacao ?? null,
        p_por: registro.por ?? null,
      })
      if (error) {
        if (ehMigrationPendente(error)) throw new MigrationPendenteError()
        throw error
      }
      return (Array.isArray(data) ? data[0] : data) as CicloEsterilizacao
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esterilizacao-ciclos'] })
    },
  })
}

/** Um pacote de grau cirúrgico, com identidade própria dentro do ciclo. */
export interface PacoteEsterilizacao {
  id: string
  ciclo_id: string
  sequencia: number
  /** LOTE-NN, como sai impresso e dentro do QR: 0901-02-03. */
  codigo: string
  patient_id: string | null
  usado_em: string | null
  usado_por: string | null
  created_at: string
}

/** Pacote com o ciclo junto — é assim que ele aparece na ficha do paciente. */
export interface PacoteComCiclo extends PacoteEsterilizacao {
  esterilizacao_ciclos: Pick<
    CicloEsterilizacao,
    'lote' | 'data' | 'validade' | 'responsavel' | 'autoclave' | 'conteudo'
    | 'integrador_quimico' | 'indicador_biologico' | 'liberado_em'
  > | null
}

/**
 * Garante que o ciclo tenha os pacotes das etiquetas que vão sair.
 *
 * Chamado antes de imprimir: cada etiqueta precisa do seu código, e a
 * reimpressão acrescenta pacotes novos em vez de repetir os antigos.
 */
export async function garantirPacotes(cicloId: string, quantidade: number): Promise<PacoteEsterilizacao[]> {
  const { data, error } = await supabase.rpc('garantir_pacotes_do_ciclo', {
    p_ciclo_id: cicloId,
    p_quantidade: quantidade,
  })
  if (error) {
    if (ehMigrationPendente(error)) throw new MigrationPendenteError()
    throw error
  }
  return (data || []) as PacoteEsterilizacao[]
}

/** Pacotes usados num paciente, do mais recente para o mais antigo. */
export const usePacotesDoPaciente = (patientId: string | null) => {
  return useQuery({
    queryKey: ['esterilizacao-pacotes', patientId],
    queryFn: async (): Promise<PacoteComCiclo[]> => {
      if (!patientId) return []
      const { data, error } = await supabase
        .from('esterilizacao_pacotes')
        .select('*, esterilizacao_ciclos(lote, data, validade, responsavel, autoclave, conteudo, integrador_quimico, indicador_biologico, liberado_em)')
        .eq('patient_id', patientId)
        .order('usado_em', { ascending: false })
      if (error) {
        if (ehMigrationPendente(error)) return []
        throw error
      }
      return (data || []) as PacoteComCiclo[]
    },
    enabled: !!patientId,
    retry: false,
    staleTime: 30_000,
  })
}

/** Pacotes de um ciclo — quem recebeu material dele, para o caso de recall. */
export const usePacotesDoCiclo = (cicloId: string | null) => {
  return useQuery({
    queryKey: ['esterilizacao-pacotes-ciclo', cicloId],
    queryFn: async (): Promise<(PacoteEsterilizacao & { patients: { name: string } | null })[]> => {
      if (!cicloId) return []
      const { data, error } = await supabase
        .from('esterilizacao_pacotes')
        .select('*, patients(name)')
        .eq('ciclo_id', cicloId)
        .order('sequencia', { ascending: true })
      if (error) {
        if (ehMigrationPendente(error)) return []
        throw error
      }
      return (data || []) as (PacoteEsterilizacao & { patients: { name: string } | null })[]
    },
    enabled: !!cicloId,
    retry: false,
    staleTime: 15_000,
  })
}

/**
 * Registra o pacote usado no paciente — o elo que faltava.
 *
 * É esta linha que responde, num biológico positivo, quais pacientes receberam
 * material do ciclo. Sem ela a resposta é "todos os do dia", que na prática
 * significa ligar para todo mundo.
 */
export const useUsarPacote = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (uso: { codigo: string; patientId: string; por?: string }): Promise<PacoteEsterilizacao> => {
      const { data, error } = await supabase.rpc('usar_pacote_esterilizacao', {
        p_codigo: uso.codigo.trim().toUpperCase(),
        p_patient_id: uso.patientId,
        p_por: uso.por ?? null,
      })
      if (error) {
        if (ehMigrationPendente(error)) throw new MigrationPendenteError()
        throw error
      }
      return (Array.isArray(data) ? data[0] : data) as PacoteEsterilizacao
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['esterilizacao-pacotes'] })
      queryClient.invalidateQueries({ queryKey: ['esterilizacao-pacotes-ciclo'] })
    },
  })
}

/** Pacote parado no estoque, com a validade do ciclo que o gerou. */
export interface PacoteEmEstoque extends PacoteEsterilizacao {
  esterilizacao_ciclos: Pick<CicloEsterilizacao, 'lote' | 'data' | 'validade' | 'conteudo' | 'autoclave'> | null
}

export interface Estoque {
  /** Passaram da validade e ainda estão na gaveta. */
  vencidos: PacoteEmEstoque[]
  /** Vencem nos próximos dias — dá tempo de usar antes de perder. */
  vencendo: PacoteEmEstoque[]
  /** Total de pacotes esterilizados ainda não usados. */
  total: number
  /**
   * A tabela dos pacotes ainda não existe no banco.
   *
   * Antes isto voltava como estoque zerado, que na tela é indistinguível de "não
   * tem pacote na gaveta" — e a etiqueta saía só com o lote, sem ninguém
   * entender por quê. Estoque vazio e tabela ausente são coisas diferentes e
   * precisam aparecer diferentes.
   */
  semTabela: boolean
}

/** Dias de antecedência do aviso de vencimento. */
export const DIAS_AVISO_VENCIMENTO = 7

/**
 * O que está esterilizado e ainda não foi usado.
 *
 * Pacote vencido esquecido na gaveta é não conformidade clássica — e, pior, é
 * material aberto na cadeira achando que está bom. O app já sabia a validade de
 * cada lote desde o começo; o que faltava era alguém ser avisado.
 */
export const useEstoquePacotes = () => {
  return useQuery({
    queryKey: ['esterilizacao-estoque'],
    queryFn: async (): Promise<Estoque> => {
      const { data, error } = await supabase
        .from('esterilizacao_pacotes')
        .select('*, esterilizacao_ciclos(lote, data, validade, conteudo, autoclave)')
        .is('usado_em', null)
        .order('created_at', { ascending: true })
      if (error) {
        if (ehMigrationPendente(error)) return { vencidos: [], vencendo: [], total: 0, semTabela: true }
        throw error
      }

      const hoje = hojeLocal()
      const limite = somarDias(hoje, DIAS_AVISO_VENCIMENTO)
      const pacotes = (data || []) as PacoteEmEstoque[]

      return {
        semTabela: false,
        total: pacotes.length,
        vencidos: pacotes.filter((p) => (p.esterilizacao_ciclos?.validade ?? '9999') < hoje),
        vencendo: pacotes.filter((p) => {
          const validade = p.esterilizacao_ciclos?.validade
          return !!validade && validade >= hoje && validade <= limite
        }),
      }
    },
    retry: false,
    staleTime: 60_000,
  })
}

/** Soma dias a uma data ISO, sem passar por fuso. */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}
