'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Loader2, X, User } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface NewPatientModalProps {
  onPatientCreated: () => void
}

export default function NewPatientModal({ onPatientCreated }: NewPatientModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [patientName, setPatientName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const input = form.querySelector('input[name="patientName"]') as HTMLInputElement
    const name = input?.value?.trim() || patientName.trim()

    if (!name) {
      toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Digite o nome do paciente' })
      return
    }

    setIsCreating(true)
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert([{ name }])
        .select()
        .single()

      if (error) throw error

      onPatientCreated()
      setPatientName('')
      setIsOpen(false)
      toast({ title: 'Paciente criado', description: `"${data.name}" foi adicionado com sucesso.` })
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar paciente',
        description: error instanceof Error ? error.message : 'Tente novamente',
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-6 h-9 rounded text-sm font-semibold bg-transparent border border-dourado-500 text-dourado-600 hover:bg-dourado-50 transition-all shadow-none"
      >
        <Plus className="h-4 w-4" />
        Novo paciente
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in"
          onClick={() => !isCreating && setIsOpen(false)}
        >
          <div
            className="clean-dialog w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden"
            data-state="open"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header surface-teal */}
            <div className="surface-teal px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold">Novo Paciente</h2>
                  <p className="text-xs text-white/80">Cadastre rápido — só o nome basta.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isCreating}
                className="p-1.5 rounded-md hover:bg-white/15 transition-colors disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Nome do paciente
                </label>
                <input
                  type="text"
                  name="patientName"
                  placeholder="Ex.: Maria Silva"
                  defaultValue={patientName}
                  onInput={(e) => setPatientName((e.target as HTMLInputElement).value)}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={isCreating}
                  autoFocus
                  className="w-full px-0 py-2.5 bg-transparent border-0 border-b-2 border-gray-200 focus:border-teal-600 outline-none text-gray-900 placeholder:text-gray-300 transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isCreating}
                  className="btn-outline-teal disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isCreating || !patientName.trim()}
                  className="btn-primary disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar paciente'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
