'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import SignatureCanvas from 'react-signature-canvas'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { isQuestionVisible, type AnamneseAnswers, type AnamneseQuestion, type AnamneseTemplateSnapshot } from '@/lib/anamnese-templates'
import { useAnamneseTemplates, useAnamneseTemplatesRealtime } from '@/hooks/useAnamneseTemplates'
import type { Anamnese } from '@/lib/types'
import './custom-anamnese.css'

const TOTAL_STEPS = 4

export default function AnamneseFormPage() {
  useAnamneseTemplatesRealtime()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const patientId = params.id as string
  const anamneseId = searchParams.get('anamneseId')
  const { data: templates = [], isLoading: loadingTemplates } = useAnamneseTemplates()
  const { toast } = useToast()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const signatureRef = useRef<SignatureCanvas>(null)
  const [step, setStep] = useState(0)
  const [patientName, setPatientName] = useState('')
  const [answers, setAnswers] = useState<AnamneseAnswers>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState<AnamneseTemplateSnapshot | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [loadingRecord, setLoadingRecord] = useState(Boolean(anamneseId))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [greeting, setGreeting] = useState('Excelente dia')

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Excelente dia' : hour < 18 ? 'Excelente tarde' : 'Excelente noite')
  }, [])

  useEffect(() => {
    if (anamneseId || selectedTemplateId || !templates.length) return
    setSelectedTemplateId((templates.find((template) => template.is_default) || templates[0]).id)
  }, [anamneseId, selectedTemplateId, templates])

  useEffect(() => {
    if (!patientId || anamneseId) return
    void db.from('patients').select('name').eq('id', patientId).single().then(({ data }: { data: { name: string } | null }) => {
      if (data) setPatientName(data.name)
    })
  }, [anamneseId, db, patientId])

  useEffect(() => {
    if (!anamneseId) return
    let active = true
    void db.from('anamneses').select('*').eq('id', anamneseId).eq('patient_id', patientId).single().then(({ data, error }: { data: Anamnese | null; error: unknown }) => {
      if (!active) return
      if (error || !data) {
        toast({ variant: 'destructive', title: 'Não foi possível abrir esta anamnese.' })
        setLoadingRecord(false)
        return
      }
      const record = data as Anamnese
      setPatientName(record.nome || '')
      setAnswers((record.dados_saude || {}) as AnamneseAnswers)
      setSavedSnapshot(record.template_snapshot as unknown as AnamneseTemplateSnapshot | null)
      setSavedSignature(record.assinatura || null)
      setSelectedTemplateId(record.template_id || '')
      setLoadingRecord(false)
    })
    return () => { active = false }
  }, [anamneseId, db, patientId, toast])

  const activeTemplate = useMemo<AnamneseTemplateSnapshot | null>(() => {
    if (savedSnapshot) return savedSnapshot
    const selected = templates.find((template) => template.id === selectedTemplateId)
    return selected ? { id: selected.id, name: selected.name, description: selected.description, questions: selected.questions } : null
  }, [savedSnapshot, selectedTemplateId, templates])

  const allQuestions = activeTemplate?.questions || []
  const splitAt = Math.ceil(allQuestions.length / 2)
  const firstPageQuestions = allQuestions.slice(0, splitAt).filter((question) => isQuestionVisible(question, answers))
  const secondPageQuestions = allQuestions.slice(splitAt).filter((question) => isQuestionVisible(question, answers))
  const visibleQuestions = [...firstPageQuestions, ...secondPageQuestions]
  const currentQuestions = step === 1 ? firstPageQuestions : secondPageQuestions
  const firstName = patientName.trim().split(/\s+/)[0] || 'Paciente'
  const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase()
  const progress = ((step + 1) / TOTAL_STEPS) * 100

  const validateQuestions = (questions: AnamneseQuestion[]) => {
    const nextErrors: Record<string, boolean> = {}
    for (const question of questions) {
      const answer = answers[question.id]
      if (question.required && (!answer || (Array.isArray(answer) && !answer.length))) nextErrors[question.id] = true
      const selected = Array.isArray(answer) ? answer : [answer]
      for (const followUp of question.followUps || []) {
        if (selected.includes(followUp.when) && followUp.required && !answers[followUp.id]) nextErrors[followUp.id] = true
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      toast({ variant: 'destructive', title: 'Por favor, responda todas as perguntas obrigatórias.' })
      setTimeout(() => document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    return true
  }

  const nextStep = () => {
    if (step === 1 && !validateQuestions(currentQuestions)) return
    if (step === 2 && !validateQuestions(currentQuestions)) return
    setErrors({})
    setStep((current) => Math.min(current + 1, TOTAL_STEPS - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const previousStep = () => {
    setErrors({})
    setStep((current) => Math.max(current - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSave = async () => {
    if (!activeTemplate || !validateQuestions(visibleQuestions)) return
    let signature = savedSignature
    if (signatureRef.current && !signatureRef.current.isEmpty()) signature = signatureRef.current.getCanvas().toDataURL('image/png')
    if (!signature) {
      toast({ variant: 'destructive', title: 'A assinatura do paciente é obrigatória.' })
      return
    }
    setSaving(true)
    const payload = {
      patient_id: patientId,
      nome: patientName.trim(),
      dados_saude: answers,
      assinatura: signature,
      template_id: activeTemplate.id || null,
      template_name: activeTemplate.name,
      template_snapshot: activeTemplate,
      updated_at: new Date().toISOString(),
    }
    const result = anamneseId
      ? await db.from('anamneses').update(payload).eq('id', anamneseId).eq('patient_id', patientId)
      : await db.from('anamneses').insert(payload)
    setSaving(false)
    if (result.error) {
      console.error(result.error)
      toast({ variant: 'destructive', title: 'Não foi possível salvar a anamnese.' })
      return
    }
    toast({ title: anamneseId ? 'Anamnese atualizada.' : 'Anamnese criada com sucesso.' })
    router.push(`/patients/${patientId}?tab=anamnese`)
  }

  if (loadingTemplates || loadingRecord || !activeTemplate || !patientName) {
    return <div className="flex min-h-screen items-center justify-center bg-white"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="min-h-screen flex flex-col bg-white pt-3">
      <div className="fixed inset-x-0 top-0 z-50 h-3 bg-gray-200"><div className="progress-bar h-full" style={{ width: `${progress}%` }} /></div>
      <header className="w-full bg-white py-3">
        <div className="max-w-xl mx-auto w-full px-3 sm:px-2">
          <Image src="/assets/images/logo.png" alt="Vitall Check-UP Odontologia" width={150} height={75} className="object-contain mx-auto" priority />
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-3 sm:px-2 pt-4 pb-28 text-sm sm:text-base overflow-x-hidden">
        {step === 0 && (
          <div className="text-left">
            <h2 className="text-2xl font-semibold mb-3 text-center"><span className="text-secondary">{greeting}, {displayName}!</span></h2>
            <h3 className="text-xl font-semibold mb-4 text-center text-primary">ANAMNESE CLÍNICA</h3>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-gray-700">A anamnese é de extrema importância para o conhecimento do estado de saúde geral e bucal do paciente e interfere no tratamento a ser realizado. Informações omitidas ou incorretas podem alterar os resultados esperados em relação à terapia odontológica realizada.</p>
            </div>
            <p className="text-gray-700 mb-4">Por favor, responda às perguntas a seguir com atenção. Suas respostas são confidenciais e serão utilizadas apenas para fins de tratamento odontológico.</p>
            <p className="text-gray-700">Nas próximas telas, você responderá a perguntas sobre seu histórico médico e condições de saúde. Ao final, você assinará digitalmente o documento.</p>
            {activeTemplate.description && <p className="mt-4 text-sm text-gray-600">{activeTemplate.description}</p>}
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start">
              <AlertCircle className="text-yellow-500 mr-2 mt-0.5 shrink-0" size={18} />
              <p className="text-sm text-yellow-700"><strong>Importante:</strong> responda com precisão. As perguntas marcadas com * são obrigatórias e essenciais para seu atendimento.</p>
            </div>
          </div>
        )}

        {(step === 1 || step === 2) && (
          <div className="text-left">
            <h2 className="text-xl font-semibold mb-6 text-center text-primary">ANAMNESE CLÍNICA</h2>
            <div className="space-y-6">
              {currentQuestions.map((question) => (
                <QuestionField
                  key={question.id}
                  question={question}
                  index={allQuestions.findIndex((item) => item.id === question.id)}
                  value={answers[question.id]}
                  answers={answers}
                  errors={errors}
                  onChange={(value) => { setAnswers((current) => ({ ...current, [question.id]: value })); setErrors((current) => ({ ...current, [question.id]: false })) }}
                  onFollowUp={(id, value) => { setAnswers((current) => ({ ...current, [id]: value })); setErrors((current) => ({ ...current, [id]: false })) }}
                />
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-left">
            <h2 className="text-xl font-semibold mb-4 text-center text-primary">ASSINATURA</h2>
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
              <p className="text-gray-700">Declaro que li atentamente o questionário da anamnese e que o respondi de acordo com a verdade. Estou ciente de que o ocultamento de qualquer condição sobre minha saúde ou sobre o uso de algum medicamento ou tratamento interfere no diagnóstico e tratamento odontológico.</p>
            </div>
            {savedSignature && (
              <div className="mb-5 rounded-lg border bg-gray-50 p-3">
                <img src={savedSignature} alt="Assinatura atual" className="mx-auto h-20 object-contain" />
                <p className="mt-1 text-center text-xs text-gray-500">Assinatura atual — desenhe abaixo somente se quiser substituí-la.</p>
              </div>
            )}
            <div className="mt-8">
              <p className="text-center mb-2 font-medium">Assine abaixo: <span className="text-red-500">*</span></p>
              <div className="signature-canvas h-48 w-full overflow-hidden">
                <SignatureCanvas ref={signatureRef} canvasProps={{ className: 'w-full h-full touch-none' }} backgroundColor="white" dotSize={0.5} minWidth={0.5} maxWidth={1.5} />
              </div>
              <div className="flex justify-center mt-2"><Button type="button" variant="outline" onClick={() => { signatureRef.current?.clear(); setSavedSignature(null) }} className="text-sm">Limpar assinatura</Button></div>
            </div>
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white py-3 border-t print-hide">
        <div className="max-w-xl mx-auto w-full px-3 sm:px-2 flex justify-between gap-2">
          {step > 0 ? <Button variant="outline" onClick={previousStep} className="min-w-0 flex-1 sm:flex-none sm:min-w-[120px] py-5">Anterior</Button> : <div />}
          {step < 3 ? (
            <Button onClick={nextStep} className="min-w-0 flex-1 sm:flex-none sm:min-w-[200px] py-5 text-base">{step === 0 ? 'Iniciar' : 'Próximo'}</Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="bg-secondary hover:bg-secondary/90 text-white min-w-0 flex-1 sm:flex-none sm:min-w-[200px] py-5 text-base">{saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Finalizando...</> : anamneseId ? 'Salvar alterações' : 'Finalizar'}</Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function QuestionField({ question, index, value, answers, errors, onChange, onFollowUp }: {
  question: AnamneseQuestion
  index: number
  value: string | string[] | undefined
  answers: AnamneseAnswers
  errors: Record<string, boolean>
  onChange: (value: string | string[]) => void
  onFollowUp: (id: string, value: string) => void
}) {
  const choices = question.type === 'yes_no' ? [{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }] : (question.options || []).map((option) => ({ value: option, label: option }))
  const selected = Array.isArray(value) ? value : value ? [value] : []
  return (
    <div data-error={errors[question.id] || undefined} className={`question-group rounded-md px-1 ${errors[question.id] ? 'error-highlight' : ''}`}>
      <p className="font-medium mb-3 flex items-start">{index + 1}. {question.label}{question.required && <span className="text-red-500 ml-1">*</span>}</p>
      {(question.type === 'yes_no' || question.type === 'single_choice') && (
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-2">
          {choices.map((choice) => <Choice key={choice.value} label={choice.label} checked={value === choice.value} onChange={() => onChange(choice.value)} />)}
        </div>
      )}
      {question.type === 'multiple_choice' && (
        <div className="grid gap-3 sm:grid-cols-2 mb-2">
          {choices.map((choice) => {
            const checked = selected.includes(choice.value)
            const disabled = Boolean(question.maxSelections && selected.length >= question.maxSelections && !checked)
            return <Choice key={choice.value} label={choice.label} checked={checked} disabled={disabled} onChange={() => onChange(checked ? selected.filter((item) => item !== choice.value) : [...selected, choice.value])} />
          })}
          {question.maxSelections && <p className="text-xs text-gray-500 sm:col-span-2">Selecione até {question.maxSelections} opções.</p>}
        </div>
      )}
      {question.type === 'short_text' && <Input className="anamnese-input" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />}
      {question.type === 'long_text' && <textarea className="anamnese-input min-h-28 w-full resize-y" value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />}
      {errors[question.id] && <p className="text-red-500 text-sm mt-2">Esta pergunta é obrigatória</p>}
      {(question.followUps || []).map((followUp) => selected.includes(followUp.when) ? (
        <div key={followUp.id} data-error={errors[followUp.id] || undefined} className={`conditional-field ${errors[followUp.id] ? 'error-highlight rounded-md p-2' : ''}`}>
          <Label className="text-sm">{followUp.label}{followUp.required && <span className="text-red-500 ml-1">*</span>}</Label>
          <Input className="anamnese-input mt-1.5" value={typeof answers[followUp.id] === 'string' ? answers[followUp.id] as string : ''} onChange={(event) => onFollowUp(followUp.id, event.target.value)} />
          {errors[followUp.id] && <p className="text-red-500 text-sm mt-1">Este campo é obrigatório</p>}
        </div>
      ) : null)}
    </div>
  )
}

function Choice({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 text-lg ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="sr-only" />
      <span aria-hidden="true" className={`custom-choice-square flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${checked ? 'is-checked' : ''}`}>{checked && <span className="text-sm font-bold leading-none text-white">✓</span>}</span>
      <span>{label}</span>
    </label>
  )
}
