'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import SignatureCanvas from 'react-signature-canvas'
import { ArrowLeft, Check, ChevronDown, ClipboardList, Eraser, Loader2, Save, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import {
  isQuestionVisible,
  type AnamneseAnswers, type AnamneseQuestion, type AnamneseTemplateSnapshot,
} from '@/lib/anamnese-templates'
import { useAnamneseTemplates, useAnamneseTemplatesRealtime } from '@/hooks/useAnamneseTemplates'
import type { Anamnese } from '@/lib/types'

type PersonalData = {
  nome: string
  endereco: string
  telefone: string
  telefoneAuxiliar: string
  email: string
  instagram: string
}

const emptyPersonal: PersonalData = { nome: '', endereco: '', telefone: '', telefoneAuxiliar: '', email: '', instagram: '' }

export default function AnamneseFormPage() {
  useAnamneseTemplatesRealtime()
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const patientId = params.id as string
  const anamneseId = searchParams.get('anamneseId')
  const { data: templates = [], isLoading: loadingTemplates } = useAnamneseTemplates()
  const { toast } = useToast()
  // Os tipos do Supabase serão regenerados depois que a migration for aplicada.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any
  const signatureRef = useRef<SignatureCanvas>(null)
  const [personal, setPersonal] = useState<PersonalData>(emptyPersonal)
  const [answers, setAnswers] = useState<AnamneseAnswers>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [savedSnapshot, setSavedSnapshot] = useState<AnamneseTemplateSnapshot | null>(null)
  const [savedSignature, setSavedSignature] = useState<string | null>(null)
  const [loadingRecord, setLoadingRecord] = useState(Boolean(anamneseId))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (anamneseId || selectedTemplateId || !templates.length) return
    setSelectedTemplateId((templates.find((template) => template.is_default) || templates[0]).id)
  }, [anamneseId, selectedTemplateId, templates])

  useEffect(() => {
    if (!patientId || anamneseId) return
    void db.from('patients').select('name').eq('id', patientId).single().then(({ data }: { data: { name: string } | null }) => {
      if (data) setPersonal((current) => ({ ...current, nome: data.name }))
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
      const snapshot = record.template_snapshot as unknown as AnamneseTemplateSnapshot | null
      setPersonal({
        nome: record.nome || '', endereco: record.endereco || '', telefone: record.telefone || '',
        telefoneAuxiliar: record.telefone_auxiliar || '', email: record.email || '', instagram: record.instagram || '',
      })
      setAnswers((record.dados_saude || {}) as AnamneseAnswers)
      setSavedSnapshot(snapshot)
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

  const visibleQuestions = useMemo(() => activeTemplate?.questions.filter((question) => isQuestionVisible(question, answers)) || [], [activeTemplate, answers])

  const changeTemplate = (id: string) => {
    if (Object.keys(answers).length && !window.confirm('Trocar o modelo limpará as respostas já preenchidas. Deseja continuar?')) return
    setAnswers({})
    setErrors({})
    setSelectedTemplateId(id)
  }

  const validate = () => {
    const nextErrors: Record<string, boolean> = {}
    if (!personal.nome.trim()) nextErrors.nome = true
    for (const question of visibleQuestions) {
      const answer = answers[question.id]
      if (question.required && (!answer || (Array.isArray(answer) && !answer.length))) nextErrors[question.id] = true
      for (const followUp of question.followUps || []) {
        const selected = Array.isArray(answer) ? answer : [answer]
        if (selected.includes(followUp.when) && followUp.required && !answers[followUp.id]) nextErrors[followUp.id] = true
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      toast({ variant: 'destructive', title: 'Preencha os campos obrigatórios destacados.' })
      setTimeout(() => document.querySelector('[data-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
      return false
    }
    return true
  }

  const handleSave = async () => {
    if (!activeTemplate || !validate()) return
    let signature = savedSignature
    if (signatureRef.current && !signatureRef.current.isEmpty()) signature = signatureRef.current.getCanvas().toDataURL('image/png')
    if (!signature) {
      toast({ variant: 'destructive', title: 'A assinatura do paciente é obrigatória.' })
      return
    }
    setSaving(true)
    const payload = {
      patient_id: patientId,
      nome: personal.nome.trim(),
      endereco: personal.endereco.trim(),
      telefone: personal.telefone.trim(),
      telefone_auxiliar: personal.telefoneAuxiliar.trim(),
      email: personal.email.trim(),
      instagram: personal.instagram.trim(),
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

  if (loadingTemplates || loadingRecord || !activeTemplate) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-700" /></div>
  }

  return (
    <main className="min-h-full bg-gray-50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href={`/patients/${patientId}?tab=anamnese`} className="mt-0.5 rounded-lg border bg-white p-2 text-gray-500 hover:text-teal-700"><ArrowLeft className="h-5 w-5" /></Link>
            <div><h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">{anamneseId ? 'Editar anamnese' : 'Nova anamnese'}</h1><p className="mt-1 text-sm text-gray-500">Preencha as informações do paciente com segurança.</p></div>
          </div>
          <Link href="/patients/configuracoes/anamneses" className="inline-flex h-9 items-center justify-center rounded-md border bg-white px-3 text-sm text-gray-600 hover:text-teal-700"><Settings2 className="mr-2 h-4 w-4" />Gerenciar modelos</Link>
        </div>

        <section className="mb-4 rounded-2xl border border-teal-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><ClipboardList className="h-5 w-5" /></span><div><p className="text-xs font-medium uppercase tracking-wide text-gray-400">Modelo selecionado</p><p className="font-semibold text-gray-900">{activeTemplate.name}</p></div></div>
            {!anamneseId && <div className="relative"><select aria-label="Selecionar modelo" className="h-10 min-w-56 appearance-none rounded-lg border bg-white px-3 pr-9 text-sm" value={selectedTemplateId} onChange={(event) => changeTemplate(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.is_default ? ' — padrão' : ''}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-gray-400" /></div>}
          </div>
          {activeTemplate.description && <p className="mt-3 border-t pt-3 text-sm text-gray-500">{activeTemplate.description}</p>}
        </section>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <h2 className="mb-4 font-semibold text-gray-900">Dados pessoais</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" required error={errors.nome}><Input value={personal.nome} onChange={(event) => setPersonal({ ...personal, nome: event.target.value })} /></Field>
            <Field label="Telefone"><Input value={personal.telefone} onChange={(event) => setPersonal({ ...personal, telefone: formatPhone(event.target.value) })} inputMode="tel" /></Field>
            <Field label="Telefone auxiliar"><Input value={personal.telefoneAuxiliar} onChange={(event) => setPersonal({ ...personal, telefoneAuxiliar: formatPhone(event.target.value) })} inputMode="tel" /></Field>
            <Field label="E-mail"><Input type="email" value={personal.email} onChange={(event) => setPersonal({ ...personal, email: event.target.value })} /></Field>
            <Field label="Endereço"><Input value={personal.endereco} onChange={(event) => setPersonal({ ...personal, endereco: event.target.value })} /></Field>
            <Field label="Instagram"><Input value={personal.instagram} onChange={(event) => setPersonal({ ...personal, instagram: event.target.value })} placeholder="@usuario" /></Field>
          </div>
        </section>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5"><h2 className="font-semibold text-gray-900">Informações de saúde</h2><p className="mt-1 text-sm text-gray-500">{visibleQuestions.length} perguntas aplicáveis neste momento.</p></div>
          <div className="space-y-5">{visibleQuestions.map((question, index) => <QuestionField key={question.id} question={question} index={index} value={answers[question.id]} answers={answers} errors={errors} onChange={(value) => { setAnswers((current) => ({ ...current, [question.id]: value })); setErrors((current) => ({ ...current, [question.id]: false })) }} onFollowUp={(id, value) => setAnswers((current) => ({ ...current, [id]: value }))} />)}</div>
        </section>

        <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold text-gray-900">Assinatura do paciente</h2><p className="mt-1 text-sm text-gray-500">Assine no espaço abaixo para concluir.</p></div><Button type="button" variant="ghost" size="sm" onClick={() => { signatureRef.current?.clear(); setSavedSignature(null) }}><Eraser className="mr-1.5 h-4 w-4" />Limpar</Button></div>
          {savedSignature && <div className="mb-3 rounded-lg border bg-gray-50 p-2"><img src={savedSignature} alt="Assinatura atual" className="mx-auto h-20 object-contain" /><p className="text-center text-xs text-gray-400">Assinatura atual — desenhe abaixo somente para substituir.</p></div>}
          <div className="overflow-hidden rounded-xl border-2 border-dashed border-gray-200 bg-white"><SignatureCanvas ref={signatureRef} penColor="#0f766e" canvasProps={{ className: 'h-40 w-full touch-none' }} /></div>
        </section>

        <div className="sticky bottom-0 z-10 -mx-3 flex justify-end border-t bg-gray-50/95 px-3 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0">
          <Button onClick={handleSave} disabled={saving} className="w-full bg-teal-700 text-white hover:bg-teal-800 sm:w-auto sm:min-w-44">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{anamneseId ? 'Salvar alterações' : 'Finalizar anamnese'}</Button>
        </div>
      </div>
    </main>
  )
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: boolean; children: React.ReactNode }) {
  return <div data-error={error || undefined} className={error ? 'rounded-lg ring-2 ring-red-200' : ''}><Label>{label}{required && <span className="ml-1 text-red-500">*</span>}</Label><div className="mt-1.5">{children}</div></div>
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
  return <div data-error={errors[question.id] || undefined} className={`rounded-xl border p-4 transition-colors ${errors[question.id] ? 'border-red-300 bg-red-50/50' : 'border-gray-100 bg-gray-50/60'}`}>
    <p className="mb-3 text-sm font-medium leading-6 text-gray-900"><span className="mr-2 text-teal-700">{index + 1}.</span>{question.label}{question.required && <span className="ml-1 text-red-500">*</span>}</p>
    {(question.type === 'yes_no' || question.type === 'single_choice') && <div className="flex flex-wrap gap-2">{choices.map((choice) => <button key={choice.value} type="button" onClick={() => onChange(choice.value)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 text-sm transition-colors ${value === choice.value ? 'border-teal-700 bg-teal-700 text-white' : 'bg-white text-gray-700 hover:border-teal-300'}`}>{value === choice.value && <Check className="h-4 w-4" />}{choice.label}</button>)}</div>}
    {question.type === 'multiple_choice' && <div className="grid gap-2 sm:grid-cols-2">{choices.map((choice) => { const checked = selected.includes(choice.value); const limitReached = Boolean(question.maxSelections && selected.length >= question.maxSelections && !checked); return <label key={choice.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 text-sm ${checked ? 'border-teal-600 ring-1 ring-teal-100' : ''} ${limitReached ? 'cursor-not-allowed opacity-50' : ''}`}><input type="checkbox" checked={checked} disabled={limitReached} onChange={() => onChange(checked ? selected.filter((item) => item !== choice.value) : [...selected, choice.value])} className="h-4 w-4 accent-teal-700" />{choice.label}</label> })}{question.maxSelections && <p className="text-xs text-gray-400 sm:col-span-2">Selecione até {question.maxSelections} opções.</p>}</div>}
    {question.type === 'short_text' && <Input value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} />}
    {question.type === 'long_text' && <textarea value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} rows={4} className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200" />}
    {(question.followUps || []).map((followUp) => selected.includes(followUp.when) ? <div key={followUp.id} data-error={errors[followUp.id] || undefined} className={`mt-3 border-l-2 pl-3 ${errors[followUp.id] ? 'border-red-400' : 'border-teal-300'}`}><Label>{followUp.label}{followUp.required && <span className="ml-1 text-red-500">*</span>}</Label><Input className="mt-1.5 bg-white" value={typeof answers[followUp.id] === 'string' ? answers[followUp.id] as string : ''} onChange={(event) => onFollowUp(followUp.id, event.target.value)} /></div> : null)}
  </div>
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return digits ? `(${digits}` : ''
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}
