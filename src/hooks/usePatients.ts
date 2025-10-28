'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
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