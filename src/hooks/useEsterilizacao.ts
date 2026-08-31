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
}

export const RESPONSAVEL_PADRAO = 'Jéssica Pádua'
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
    || /esterilizacao_ciclos|abrir_ciclo_esterilizacao/.test(error.message || '')
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
