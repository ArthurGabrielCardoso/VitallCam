import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { deleteMediaFromR2 } from '@/lib/r2-client'

/**
 * Contratos já emitidos para um paciente.
 *
 * "Emitido" = foi impresso para assinatura. É esse o momento que a clínica
 * considera contrato feito, então é onde o registro é gravado.
 *
 * O ciclo só fecha quando o papel assinado volta digitalizado: `via_assinada_key`
 * nulo é a lista de pendências, sem precisar de coluna de status pra manter em
 * sincronia com a realidade.
 */

export interface ContratoEmitido {
  id: string
  patient_id: string
  template_id: string
  titulo: string
  eyebrow: string | null
  grupo: string | null
  profissional: string | null
  valores: Record<string, string>
  created_at: string
  /** Chave do PDF digitalizado no R2. Nulo = ainda não voltou assinado. */
  via_assinada_key: string | null
  via_assinada_paginas: number | null
  via_assinada_em: string | null
  enviado_paciente_em: string | null
}

/** Contrato pendente com o nome do paciente junto — a lista é entre pacientes. */
export interface ContratoPendente extends ContratoEmitido {
  paciente_nome: string
}

/**
 * Tabela ou colunas ausentes (migration não rodada) não são erro de rede:
 * repetir não resolve. A UI simplesmente não mostra o histórico até rodar.
 */
function ehMigrationPendente(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST205'
    || error.code === '42703'
    || /contratos_emitidos|via_assinada/.test(error.message || '')
}

export const useContratosEmitidos = (patientId: string | null) => {
  return useQuery({
    queryKey: ['contratos-emitidos', patientId],
    queryFn: async (): Promise<ContratoEmitido[]> => {
      if (!patientId) return []
      const { data, error } = await supabase
        .from('contratos_emitidos')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
      if (error) {
        if (ehMigrationPendente(error)) {
          console.warn('[Contratos] tabela contratos_emitidos ainda não existe — rode a migration.')
          return []
        }
        throw error
      }
      return (data || []) as ContratoEmitido[]
    },
    enabled: !!patientId,
    // Sem isso o 404 da tabela ausente vira uma cascata de tentativas no console.
    retry: false,
    staleTime: 30_000,
  })
}

/**
 * Contratos impressos que nunca receberam a via assinada de volta, entre todos
 * os pacientes — mais antigos primeiro, porque é o papel esquecido há semanas
 * que vira problema, não o de ontem.
 */
export const useContratosPendentes = () => {
  return useQuery({
    queryKey: ['contratos-pendentes'],
    queryFn: async (): Promise<ContratoPendente[]> => {
      const { data, error } = await supabase
        .from('contratos_emitidos')
        .select('*, patients(name)')
        .is('via_assinada_key', null)
        .order('created_at', { ascending: true })
      if (error) {
        if (ehMigrationPendente(error)) return []
        throw error
      }
      return ((data || []) as never[]).map((row: Record<string, unknown>) => ({
        ...(row as unknown as ContratoEmitido),
        paciente_nome: (row.patients as { name?: string } | null)?.name || 'Paciente removido',
      }))
    },
    retry: false,
    staleTime: 30_000,
  })
}

export interface NovoContrato {
  /**
   * Gerado no cliente para que o rodapé impresso já tenha o número sem esperar
   * a rede — a impressão não pode ficar bloqueada num insert.
   */
  id: string
  patient_id: string
  template_id: string
  titulo: string
  eyebrow?: string | null
  grupo?: string | null
  profissional?: string | null
  valores: Record<string, string>
}

export const useRegistrarContrato = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (novo: NovoContrato) => {
      // Upsert, não insert: o id vem do editor, então reimprimir o mesmo
      // documento depois de corrigir um campo atualiza o registro em vez de
      // criar uma duplicata. Só as colunas enviadas mudam — a via assinada já
      // anexada fica intacta.
      const { data, error } = await supabase
        .from('contratos_emitidos')
        .upsert(novo as never, { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      return data as ContratoEmitido
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patient_id] })
      queryClient.invalidateQueries({ queryKey: ['contratos-pendentes'] })
    },
  })
}

export const useApagarContrato = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; patientId: string }) => {
      // Lê a via antes de apagar a linha: depois não há mais como saber qual
      // PDF era, e ele ficaria pra sempre no R2 sem ninguém pra encontrá-lo.
      const { data } = await supabase
        .from('contratos_emitidos')
        .select('via_assinada_key')
        .eq('id', id)
        .maybeSingle()

      const { error } = await supabase.from('contratos_emitidos').delete().eq('id', id)
      if (error) throw error

      const key = (data as { via_assinada_key?: string | null } | null)?.via_assinada_key
      if (key) {
        deleteMediaFromR2(`r2://${key}`).catch(err =>
          console.error('Erro ao limpar via assinada do R2:', err))
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patientId] })
      queryClient.invalidateQueries({ queryKey: ['contratos-pendentes'] })
    },
  })
}

/** Registra o PDF digitalizado do contrato assinado. */
export const useAnexarViaAssinada = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, key, paginas }: {
      id: string
      patientId: string
      key: string
      paginas: number | null
    }) => {
      const { error } = await supabase
        .from('contratos_emitidos')
        .update({
          via_assinada_key: key,
          via_assinada_paginas: paginas,
          via_assinada_em: new Date().toISOString(),
        } as never)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patientId] })
      queryClient.invalidateQueries({ queryKey: ['contratos-pendentes'] })
    },
  })
}

/**
 * Marca que a cópia foi mandada ao paciente. Não falha a operação se der erro:
 * o envio já aconteceu no WhatsApp, e travar a UI por causa do registro seria
 * mentir sobre o que de fato ocorreu.
 */
export const useMarcarEnviado = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; patientId: string }) => {
      const { error } = await supabase
        .from('contratos_emitidos')
        .update({ enviado_paciente_em: new Date().toISOString() } as never)
        .eq('id', id)
      if (error) console.warn('[Contratos] não foi possível registrar o envio:', error.message)
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patientId] })
    },
  })
}
