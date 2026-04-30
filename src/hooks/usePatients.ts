'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Patient } from '@/lib/types'

export const usePatients = () => {
  const queryClient = useQueryClient()

  // Realtime: atualiza a lista quando qualquer paciente é criado, editado ou deletado
  useEffect(() => {
    const channel = supabase
      .channel('patients-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patients' }, () => {
        queryClient.invalidateQueries({ queryKey: ['patients'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])

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
      // Atualizar cache imediatamente sem esperar refetch
      queryClient.setQueryData(['patients'], (old: Patient[] | undefined) =>
        old ? old.map(p => p.id === data.id ? { ...p, name: data.name } : p) : old
      )
      queryClient.setQueryData(['patient', data.id], (old: Patient | undefined) =>
        old ? { ...old, name: data.name } : old
      )
    },
  })
}

export const useDeletePatient = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (patientId: string) => {
      await supabase.from('photos').delete().eq('patient_id', patientId)
      await supabase.from('folders').delete().eq('patient_id', patientId)
      await supabase.from('transcriptions').delete().eq('patient_id', patientId)
      await supabase.from('anamneses').delete().eq('patient_id', patientId)

      const { error } = await supabase
        .from('patients')
        .delete()
        .eq('id', patientId)

      if (error) throw error
      return patientId
    },
    onSuccess: (patientId) => {
      // Remover do cache imediatamente — lista atualiza sem reload
      queryClient.setQueryData(['patients'], (old: Patient[] | undefined) =>
        old ? old.filter(p => p.id !== patientId) : old
      )
      queryClient.removeQueries({ queryKey: ['patient', patientId] })
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