'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Loader2, X } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

interface NewPatientModalProps {
  onPatientCreated: () => void
}

export default function NewPatientModal({ onPatientCreated }: NewPatientModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [patientName, setPatientName] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const { } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Pega o valor direto do input para compatibilidade com Android 7.x
    const form = e.target as HTMLFormElement
    const input = form.querySelector('input[name="patientName"]') as HTMLInputElement
    const name = input?.value?.trim() || patientName.trim()

    console.log('🔄 Tentando criar paciente:', name)

    if (!name) {
      console.log('❌ Nome vazio')
      alert('Por favor, digite o nome do paciente')
      return
    }

    setIsCreating(true)
    try {
      const { data, error } = await supabase
        .from('patients')
        .insert([{ name }])
        .select()
        .single()

      if (error) {
        console.error('❌ Erro do Supabase:', error)
        throw error
      }

      console.log('✅ Paciente criado:', data)
      onPatientCreated()
      setPatientName('')
      setIsOpen(false)

      alert(`✅ Paciente "${data.name}" criado com sucesso!`)
    } catch (error: unknown) {
      console.error('❌ Erro completo:', error)
      alert(`❌ Erro ao criar paciente: ${error instanceof Error ? error.message : 'Tente novamente'}`)
    } finally {
      setIsCreating(false)
    }
  }

  const handleOpenModal = () => {
    console.log('🔄 Abrindo modal de novo paciente')
    setIsOpen(true)
  }

  return (
    <>
      {/* Botão para abrir modal */}
      <button
        className="rounded-full shadow-lg px-6 py-3 text-white font-semibold hover:scale-105 transition-all duration-200 flex items-center gap-2 bg-primary hover:bg-primary/90"
        style={{
          cursor: 'pointer',
          pointerEvents: 'auto',
          position: 'relative',
          WebkitBackfaceVisibility: 'hidden',
          WebkitTransform: 'translateZ(0)',
        }}
        onMouseDown={handleOpenModal}
        onClick={handleOpenModal}
        onTouchStart={handleOpenModal}
        type="button"
      >
        <Plus className="w-5 h-5" />
        Novo Paciente
      </button>

      {/* Modal simples */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-black">Criar Novo Paciente</h2>
              <button
                onMouseDown={() => setIsOpen(false)}
                onClick={() => setIsOpen(false)}
                onTouchStart={() => setIsOpen(false)}
                style={{
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  position: 'relative',
                  WebkitBackfaceVisibility: 'hidden',
                  WebkitTransform: 'translateZ(0)',
                }}
                className="text-primary hover:text-primary/80 transition-colors"
                type="button"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="text"
                  name="patientName"
                  placeholder="Nome do paciente"
                  defaultValue={patientName}
                  onInput={(e) => setPatientName((e.target as HTMLInputElement).value)}
                  onChange={(e) => setPatientName(e.target.value)}
                  disabled={isCreating}
                  style={{
                    pointerEvents: 'auto',
                    WebkitBackfaceVisibility: 'hidden',
                    WebkitTransform: 'translateZ(0)',
                  }}
                  className="w-full px-4 py-3 border border-primary/30 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors text-black"
                  autoFocus
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onMouseDown={() => setIsOpen(false)}
                  onClick={() => setIsOpen(false)}
                  onTouchStart={() => setIsOpen(false)}
                  style={{
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    position: 'relative',
                    WebkitBackfaceVisibility: 'hidden',
                    WebkitTransform: 'translateZ(0)',
                  }}
                  disabled={isCreating}
                  className="px-4 py-2 text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    position: 'relative',
                    WebkitBackfaceVisibility: 'hidden',
                    WebkitTransform: 'translateZ(0)',
                  }}
                  disabled={isCreating || !patientName.trim()}
                  className="px-6 py-2 text-white rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 bg-primary hover:bg-primary/90"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Criando...
                    </>
                  ) : (
                    'Criar Paciente'
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