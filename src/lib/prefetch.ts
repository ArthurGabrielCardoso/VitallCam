'use client'

import { queryClient } from './queryClient'
import { supabase } from './supabase'

// Prefetch múltiplos pacientes
export const prefetchPatients = async (patientIds: string[]) => {
  const prefetchPromises = patientIds.map(patientId => 
    queryClient.prefetchQuery({
      queryKey: ['patient', patientId],
      queryFn: async () => {
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
  )

  await Promise.all(prefetchPromises)
}

// Prefetch dados completos de um paciente
export const prefetchPatientData = async (patientId: string) => {
  await Promise.all([
    // Prefetch paciente
    queryClient.prefetchQuery({
      queryKey: ['patient', patientId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from('patients')
          .select('*')
          .eq('id', patientId)
          .single()

        if (error) throw error
        return data
      },
    }),
    // Prefetch fotos
    queryClient.prefetchQuery({
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
    })
  ])
}