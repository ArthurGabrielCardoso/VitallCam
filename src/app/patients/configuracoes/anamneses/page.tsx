'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronUp, ClipboardList,
  Copy, Eye, Loader2, Plus, Save, Star, Trash2, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  createBlankQuestion, QUESTION_TYPE_LABELS,
  type AnamneseQuestion, type AnamneseQuestionType,
} from '@/lib/anamnese-templates'
import type { AnamneseTemplate } from '@/lib/types'
import {
  useAnamneseTemplates, useAnamneseTemplatesRealtime, useDeleteAnamneseTemplate,
  useSaveAnamneseTemplate, useSetDefaultAnamneseTemplate,
} from '@/hooks/useAnamneseTemplates'

type Draft = { id?: string; name: string; description: string; questions: AnamneseQuestion[] }

const emptyDraft = (): Draft => ({ name: 'Novo modelo', description: '', questions: [createBlankQuestion()] })
const toDraft = (template: AnamneseTemplate): Draft => ({
  id: template.id,
  name: template.name,
  description: template.description || '',
  questions: structuredClone(template.questions),
})

export default function AnamneseTemplatesPage() {
  useAnamneseTemplatesRealtime()
  const { data: templates = [], isLoading, error } = useAnamneseTemplates()
  const saveTemplate = useSaveAnamneseTemplate()
  const setDefault = useSetDefaultAnamneseTemplate()
  const deleteTemplate = useDeleteAnamneseTemplate()
  const { toast } = useToast()
  const [draft, setDraft] = useState<Draft | null>(null)

  const openDuplicate = (template: AnamneseTemplate) => {
    const copy = toDraft(template)
    setDraft({ ...copy, id: undefined, name: `${copy.name} (cópia)` })
  }

  const handleSave = async () => {
    if (!draft) return
    if (!draft.name.trim() || draft.questions.some((question) => !question.label.trim())) {
      toast({ variant: 'destructive', title: 'Preencha o nome e todas as perguntas.' })
      return
    }
    if (draft.questions.some((question) =>
      ['single_choice', 'multiple_choice'].includes(question.type) && (question.options?.filter(Boolean).length || 0) < 2
    )) {
      toast({ variant: 'destructive', title: 'Perguntas de seleção precisam de pelo menos duas opções.' })
      return
    }
    try {
      const saved = await saveTemplate.mutateAsync({
        id: draft.id,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        questions: draft.questions,
      })
      setDraft(toDraft(saved))
      toast({ title: 'Modelo salvo com sucesso.' })
    } catch (saveError) {
      console.error(saveError)
      toast({ variant: 'destructive', title: 'Não foi possível salvar o modelo.' })
    }
  }

  if (draft) {
    return <TemplateEditor draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} onSave={handleSave} saving={saveTemplate.isPending} />
  }

  return (
    <main className="min-h-full bg-gray-50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Link href="/patients/configuracoes" className="mt-0.5 rounded-lg border bg-white p-2 text-gray-500 hover:text-teal-700" aria-label="Voltar">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Modelos de anamnese</h1>
              <p className="mt-1 text-sm text-gray-500">Monte formulários e escolha qual abrirá automaticamente.</p>
            </div>
          </div>
          <Button onClick={() => setDraft(emptyDraft())} className="bg-teal-700 text-white hover:bg-teal-800">
            <Plus className="mr-2 h-4 w-4" /> Criar modelo
          </Button>
        </div>

        <div className="mb-5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-900">
          <strong>Anamnese padrão preservada.</strong> Ela continua completa e já vem selecionada ao criar uma ficha. Você pode editar uma cópia ou escolher outro modelo como padrão.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Não foi possível carregar os modelos. Verifique se a atualização do banco foi aplicada.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className={`rounded-2xl border bg-white p-5 shadow-sm ${template.is_default ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${template.is_default ? 'bg-amber-100 text-amber-700' : 'bg-teal-50 text-teal-700'}`}>
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-gray-900">{template.name}</h2>
                        {template.is_default && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Padrão</span>}
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{template.description || 'Sem descrição'}</p>
                      <p className="mt-2 text-xs text-gray-400">{template.questions.length} perguntas</p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                  <Button variant="outline" size="sm" onClick={() => setDraft(toDraft(template))}>Editar</Button>
                  <Button variant="outline" size="sm" onClick={() => openDuplicate(template)}><Copy className="mr-1.5 h-3.5 w-3.5" />Duplicar</Button>
                  {!template.is_default && (
                    <Button variant="outline" size="sm" onClick={async () => {
                      await setDefault.mutateAsync(template.id)
                      toast({ title: `${template.name} agora é o modelo padrão.` })
                    }}><Star className="mr-1.5 h-3.5 w-3.5" />Usar como padrão</Button>
                  )}
                  {!template.is_default && templates.length > 1 && (
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={async () => {
                      if (!window.confirm(`Remover o modelo “${template.name}”? As fichas já preenchidas serão preservadas.`)) return
                      await deleteTemplate.mutateAsync(template.id)
                    }}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remover</Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function TemplateEditor({ draft, setDraft, onClose, onSave, saving }: {
  draft: Draft
  setDraft: (draft: Draft) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
}) {
  const [expanded, setExpanded] = useState<string | null>(draft.questions[0]?.id || null)
  const updateQuestion = (index: number, next: AnamneseQuestion) => {
    const questions = [...draft.questions]
    questions[index] = next
    setDraft({ ...draft, questions })
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.questions.length) return
    const questions = [...draft.questions]
    ;[questions[index], questions[target]] = [questions[target], questions[index]]
    setDraft({ ...draft, questions })
  }

  return (
    <main className="min-h-full bg-gray-50 px-3 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <div className="sticky top-0 z-20 -mx-3 mb-5 flex items-center justify-between gap-3 border-b bg-gray-50/95 px-3 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
          <Button variant="ghost" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />Modelos</Button>
          <Button onClick={onSave} disabled={saving} className="bg-teal-700 text-white hover:bg-teal-800">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar modelo
          </Button>
        </div>

        <section className="mb-4 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><Label htmlFor="template-name">Nome do modelo</Label><Input id="template-name" className="mt-1.5" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
            <div><Label htmlFor="template-description">Descrição</Label><Input id="template-description" className="mt-1.5" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Quando este modelo deve ser usado?" /></div>
          </div>
        </section>

        <div className="mb-3 flex items-center justify-between">
          <div><h2 className="font-semibold text-gray-900">Perguntas</h2><p className="text-xs text-gray-500">Arraste pela ordem usando as setas e configure regras quando necessário.</p></div>
          <Button variant="outline" size="sm" onClick={() => {
            const question = createBlankQuestion()
            setDraft({ ...draft, questions: [...draft.questions, question] })
            setExpanded(question.id)
          }}><Plus className="mr-1.5 h-4 w-4" />Adicionar</Button>
        </div>

        <div className="space-y-3">
          {draft.questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={index}
              allQuestions={draft.questions}
              expanded={expanded === question.id}
              onToggle={() => setExpanded(expanded === question.id ? null : question.id)}
              onChange={(next) => updateQuestion(index, next)}
              onMove={(direction) => move(index, direction)}
              onDelete={() => setDraft({ ...draft, questions: draft.questions.filter((_, itemIndex) => itemIndex !== index) })}
            />
          ))}
        </div>
      </div>
    </main>
  )
}

function QuestionEditor({ question, index, allQuestions, expanded, onToggle, onChange, onMove, onDelete }: {
  question: AnamneseQuestion
  index: number
  allQuestions: AnamneseQuestion[]
  expanded: boolean
  onToggle: () => void
  onChange: (question: AnamneseQuestion) => void
  onMove: (direction: -1 | 1) => void
  onDelete: () => void
}) {
  const previousQuestions = useMemo(() => allQuestions.slice(0, index).filter((item) => item.options?.length || item.type === 'yes_no'), [allQuestions, index])
  const hasOptions = question.type === 'single_choice' || question.type === 'multiple_choice'
  const options = question.options || (hasOptions ? ['Opção 1', 'Opção 2'] : [])

  const setType = (type: AnamneseQuestionType) => onChange({
    ...question,
    type,
    options: type === 'single_choice' || type === 'multiple_choice' ? (question.options?.length ? question.options : ['Opção 1', 'Opção 2']) : undefined,
    maxSelections: type === 'multiple_choice' ? question.maxSelections : undefined,
  })

  return (
    <article className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 p-3 sm:p-4">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-sm font-medium text-gray-900">{question.label || 'Pergunta sem título'}</span>
          <span className="text-xs text-gray-400">{QUESTION_TYPE_LABELS[question.type]}{question.visibility?.rules.length ? ' · Condicional' : ''}</span>
        </button>
        <div className="hidden gap-1 sm:flex">
          <button type="button" onClick={() => onMove(-1)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" onClick={() => onMove(1)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100"><ArrowDown className="h-4 w-4" /></button>
        </div>
        <button type="button" onClick={onToggle} className="rounded p-1.5 text-gray-400">{expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
      </div>

      {expanded && (
        <div className="space-y-5 border-t p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <div><Label>Pergunta</Label><Input className="mt-1.5" value={question.label} onChange={(event) => onChange({ ...question, label: event.target.value })} /></div>
            <div><Label>Tipo de resposta</Label><select className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={question.type} onChange={(event) => setType(event.target.value as AnamneseQuestionType)}>{Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={question.required} onChange={(event) => onChange({ ...question, required: event.target.checked })} className="h-4 w-4 accent-teal-700" />Resposta obrigatória</label>

          {hasOptions && (
            <div className="rounded-xl bg-gray-50 p-4">
              <Label>Opções de resposta</Label>
              <div className="mt-2 space-y-2">{options.map((option, optionIndex) => (
                <div key={optionIndex} className="flex gap-2"><Input value={option} onChange={(event) => { const next = [...options]; next[optionIndex] = event.target.value; onChange({ ...question, options: next }) }} /><button type="button" onClick={() => onChange({ ...question, options: options.filter((_, i) => i !== optionIndex) })} className="rounded-md border bg-white px-2 text-gray-400 hover:text-red-600"><X className="h-4 w-4" /></button></div>
              ))}</div>
              <Button variant="ghost" size="sm" className="mt-2 text-teal-700" onClick={() => onChange({ ...question, options: [...options, `Opção ${options.length + 1}`] })}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar opção</Button>
              {question.type === 'multiple_choice' && <div className="mt-3 max-w-xs"><Label>Limite de escolhas (opcional)</Label><Input type="number" min={1} className="mt-1" value={question.maxSelections || ''} onChange={(event) => onChange({ ...question, maxSelections: event.target.value ? Number(event.target.value) : undefined })} placeholder="Sem limite" /></div>}
            </div>
          )}

          {(question.type === 'yes_no' || hasOptions) && (
            <FollowUpsEditor question={question} onChange={onChange} options={question.type === 'yes_no' ? ['sim', 'nao'] : options} />
          )}

          <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/40 p-4">
            <div className="flex items-center justify-between gap-3"><div><Label>Exibição condicional</Label><p className="mt-0.5 text-xs text-gray-500">Mostre esta pergunta somente conforme respostas anteriores.</p></div><Eye className="h-5 w-5 text-teal-600" /></div>
            {question.visibility?.rules.length ? (
              <div className="mt-3 space-y-3">
                <select className="h-9 rounded-md border bg-white px-2 text-sm" value={question.visibility.logic} onChange={(event) => onChange({ ...question, visibility: { ...question.visibility!, logic: event.target.value as 'all' | 'any' } })}><option value="all">Todas as condições</option><option value="any">Qualquer condição</option></select>
                {question.visibility.rules.map((rule, ruleIndex) => {
                  const source = previousQuestions.find((item) => item.id === rule.questionId)
                  const sourceOptions = source?.type === 'yes_no' ? ['sim', 'nao'] : source?.options || []
                  return <div key={ruleIndex} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1fr_130px_1fr_auto]">
                    <select className="h-9 min-w-0 rounded-md border px-2 text-sm" value={rule.questionId} onChange={(event) => onChange({ ...question, visibility: { ...question.visibility!, rules: question.visibility!.rules.map((item, i) => i === ruleIndex ? { ...item, questionId: event.target.value, values: [] } : item) } })}>{previousQuestions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
                    <select className="h-9 rounded-md border px-2 text-sm" value={rule.operator} onChange={(event) => onChange({ ...question, visibility: { ...question.visibility!, rules: question.visibility!.rules.map((item, i) => i === ruleIndex ? { ...item, operator: event.target.value as 'is' | 'is_not' | 'contains' } : item) } })}><option value="is">é</option><option value="is_not">não é</option><option value="contains">contém</option></select>
                    <div className="flex flex-wrap gap-1.5">{sourceOptions.map((option) => <button key={option} type="button" onClick={() => { const values = rule.values.includes(option) ? rule.values.filter((value) => value !== option) : [...rule.values, option]; onChange({ ...question, visibility: { ...question.visibility!, rules: question.visibility!.rules.map((item, i) => i === ruleIndex ? { ...item, values } : item) } }) }} className={`rounded-full border px-2 py-1 text-xs ${rule.values.includes(option) ? 'border-teal-600 bg-teal-600 text-white' : 'bg-white text-gray-600'}`}>{option === 'sim' ? 'Sim' : option === 'nao' ? 'Não' : option}</button>)}</div>
                    <button type="button" onClick={() => { const rules = question.visibility!.rules.filter((_, i) => i !== ruleIndex); onChange({ ...question, visibility: rules.length ? { ...question.visibility!, rules } : undefined }) }} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                  </div>
                })}
                {previousQuestions.length > 0 && <Button variant="ghost" size="sm" onClick={() => { const source = previousQuestions[0]; onChange({ ...question, visibility: { logic: question.visibility?.logic || 'all', rules: [...(question.visibility?.rules || []), { questionId: source.id, operator: 'is', values: [] }] } }) }}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar condição</Button>}
              </div>
            ) : previousQuestions.length ? (
              <Button variant="outline" size="sm" className="mt-3 bg-white" onClick={() => onChange({ ...question, visibility: { logic: 'all', rules: [{ questionId: previousQuestions[0].id, operator: 'is', values: [] }] } })}><Plus className="mr-1.5 h-3.5 w-3.5" />Criar condição</Button>
            ) : <p className="mt-3 text-xs text-gray-400">Adicione antes uma pergunta de Sim/Não ou seleção para usar como condição.</p>}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <div className="flex gap-1 sm:hidden"><Button variant="outline" size="sm" onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button><Button variant="outline" size="sm" onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button></div>
            <Button variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={onDelete}><Trash2 className="mr-1.5 h-4 w-4" />Excluir pergunta</Button>
          </div>
        </div>
      )}
    </article>
  )
}

function FollowUpsEditor({ question, onChange, options }: { question: AnamneseQuestion; onChange: (question: AnamneseQuestion) => void; options: string[] }) {
  const followUps = question.followUps || []
  return <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
    <Label>Complementos da resposta</Label><p className="mt-0.5 text-xs text-gray-500">Ex.: ao responder “Sim”, pedir “Qual medicamento?”.</p>
    <div className="mt-3 space-y-2">{followUps.map((followUp, index) => <div key={followUp.id} className="grid gap-2 rounded-lg border bg-white p-3 sm:grid-cols-[1fr_160px_auto]">
      <Input value={followUp.label} onChange={(event) => onChange({ ...question, followUps: followUps.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} placeholder="Pergunta complementar" />
      <select className="h-10 rounded-md border px-2 text-sm" value={followUp.when} onChange={(event) => onChange({ ...question, followUps: followUps.map((item, i) => i === index ? { ...item, when: event.target.value } : item) })}>{options.map((option) => <option key={option} value={option}>Quando: {option === 'sim' ? 'Sim' : option === 'nao' ? 'Não' : option}</option>)}</select>
      <button type="button" onClick={() => onChange({ ...question, followUps: followUps.filter((_, i) => i !== index) })} className="justify-self-end text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
    </div>)}</div>
    <Button variant="ghost" size="sm" className="mt-2" onClick={() => onChange({ ...question, followUps: [...followUps, { id: `complemento_${crypto.randomUUID()}`, label: '', when: options[0] || 'sim', required: false }] })}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar complemento</Button>
  </div>
}
