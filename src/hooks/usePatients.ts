'use client'

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Patient } from '@/lib/types'

const broadcastPatientsChanged = async () => {
  await supabase.channel('patients-broadcast').send({
    type: 'broadcast',
    event: 'patients-changed',
    payload: {},
  })
}

// Escuta mudanças de pacientes via broadcast (leve, não usa WAL)
export const usePatientsBroadcast = () => {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('patients-broadcast')
      .on('broadcast', { event: 'patients-changed' }, () => {
        queryClient.invalidateQueries({ queryKey: ['patients'] })
        queryClient.invalidateQueries({ queryKey: ['patient'] })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [queryClient])
}

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
      queryClient.setQueryData(['patients'], (old: Patient[] | undefined) =>
        old ? old.map(p => p.id === data.id ? { ...p, name: data.name } : p) : old
      )
      queryClient.setQueryData(['patient', data.id], (old: Patient | undefined) =>
        old ? { ...old, name: data.name } : old
      )
      broadcastPatientsChanged()
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
      queryClient.setQueryData(['patients'], (old: Patient[] | undefined) =>
        old ? old.filter(p => p.id !== patientId) : old
      )
      queryClient.removeQueries({ queryKey: ['patient', patientId] })
      broadcastPatientsChanged()
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