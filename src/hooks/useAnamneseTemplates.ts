'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { DEFAULT_ANAMNESE_QUESTIONS } from '@/lib/anamnese-templates'
import type { AnamneseTemplate } from '@/lib/types'

const templatesKey = ['anamnese-templates'] as const
// O schema gerado do projeto ainda não inclui esta nova tabela; manter o acesso
// isolado aqui evita espalhar casts até a próxima geração automática dos tipos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

async function fetchTemplates(): Promise<AnamneseTemplate[]> {
  const { data, error } = await db
    .from('anamnese_templates')
    .select('*')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false })

  if (error) throw error
  if (data?.length) return data

  const { data: created, error: createError } = await db
    .from('anamnese_templates')
    .insert({
      name: 'Anamnese padrão',
      description: 'Modelo completo utilizado atualmente pela Clínica Vitall.',
      questions: DEFAULT_ANAMNESE_QUESTIONS,
      is_default: true,
      is_active: true,
    })
    .select()
    .single()

  if (createError) {
    // Dois dispositivos podem abrir a tela pela primeira vez ao mesmo tempo.
    // Se o outro já criou o padrão, apenas reutilizamos o registro existente.
    if (createError.code === '23505') {
      const { data: existing, error: refetchError } = await db
        .from('anamnese_templates')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
      if (refetchError) throw refetchError
      return existing || []
    }
    throw createError
  }
  return [created]
}

export function useAnamneseTemplates() {
  return useQuery({ queryKey: templatesKey, queryFn: fetchTemplates })
}

export function useAnamneseTemplatesRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase
      .channel('anamnese-templates-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anamnese_templates' }, () => {
        void queryClient.invalidateQueries({ queryKey: templatesKey })
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [queryClient])
}

type TemplateInput = Pick<AnamneseTemplate, 'name' | 'description' | 'questions'> & {
  id?: string
}

export function useSaveAnamneseTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: TemplateInput) => {
      if (input.id) {
        const { data, error } = await db
          .from('anamnese_templates')
          .update({ name: input.name, description: input.description, questions: input.questions })
          .eq('id', input.id)
          .select()
          .single()
        if (error) throw error
        return data
      }

      const { data, error } = await db
        .from('anamnese_templates')
        .insert({
          name: input.name,
          description: input.description,
          questions: input.questions,
          is_default: false,
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}

export function useSetDefaultAnamneseTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error: resetError } = await db
        .from('anamnese_templates')
        .update({ is_default: false })
        .eq('is_default', true)
      if (resetError) throw resetError

      const { error } = await db
        .from('anamnese_templates')
        .update({ is_default: true })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}

export function useDeleteAnamneseTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('anamnese_templates')
        .update({ is_active: false, is_default: false })
        .eq('id', id)
      if (error) throw error
      return id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templatesKey }),
  })
}
