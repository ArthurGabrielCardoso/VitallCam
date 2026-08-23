import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Contratos já emitidos para um paciente.
 *
 * "Emitido" = foi impresso para assinatura. É esse o momento que a clínica
 * considera contrato feito, então é onde o registro é gravado.
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
      if (error) throw error
      return (data || []) as ContratoEmitido[]
    },
    enabled: !!patientId,
  })
}

export interface NovoContrato {
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
      const { data, error } = await supabase
        .from('contratos_emitidos')
        .insert(novo as never)
        .select()
        .single()
      if (error) throw error
      return data as ContratoEmitido
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patient_id] })
    },
  })
}

export const useApagarContrato = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id }: { id: string; patientId: string }) => {
      const { error } = await supabase.from('contratos_emitidos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['contratos-emitidos', vars.patientId] })
    },
  })
}
