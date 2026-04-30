'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Patient } from '@/lib/types'

export const usePatients = () => {
  return useQuery({
    queryKey: ['patients'],
    queryFn: async (): Promise<Patient[]> => {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
    },
  })
}

export const usePatient = (patientId: string | null) => {
  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: async (): Promise<Patient> => {
      if (!patientId) throw new Error('Patient ID is required')

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('id', patientId)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!patientId,
  })
}

export const useUpdatePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ patientId, name }: { patientId: string; name: string }) => {
      const { data, error } = await supabase
        .from('patients')
        .update({ name })
        .eq('id', patientId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient', data.id] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export const useDeletePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patientId: string) => {
      // Deletar em ordem para respeitar foreign keys
      await supabase.from('photos').delete().eq('patient_id', patientId)
      await supabase.from('folders').delete().eq('patient_id', patientId)
      await supabase.from('transcriptions').delete().eq('patient_id', patientId)
      await supabase.from('anamneses').delete().eq('patient_id', patientId)

      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', patientId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })
}

export const usePrefetchPatient = () => {
  const queryClient = useQueryClient()

  const prefetchPatient = async (patientId: string) => {
    await queryClient.prefetchQuery({
      queryKey: ['patient', patientId],
      queryFn: async (): Promise<Patient> => {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single()

        if (error) throw error
        return data
      },
      staleTime: 1000 * 60 * 5, // 5 minutos
    })

    // Também prefetch as fotos do paciente
    await queryClient.prefetchQuery({
      queryKey: ['photos', patientId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('photos')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: false })

        if (error) throw error
        return data || []
      },
      staleTime: 1000 * 60 * 5,
    })
  }

  return { prefetchPatient }
}