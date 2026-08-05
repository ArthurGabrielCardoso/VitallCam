export type AnamneseQuestionType =
  | 'yes_no'
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'

export type AnamneseQuestion = {
  id: string
  label: string
  type: AnamneseQuestionType
  required: boolean
  options?: string[]
  maxSelections?: number
  visibility?: {
    logic: 'all' | 'any'
    rules: {
      questionId: string
      operator: 'is' | 'is_not' | 'contains'
      values: string[]
    }[]
  }
  followUps?: {
    id: string
    label: string
    when: string
    required?: boolean
  }[]
}

export type AnamneseAnswers = Record<string, string | string[]>

export type AnamneseTemplateSnapshot = {
  id: string
  name: string
  description?: string | null
  questions: AnamneseQuestion[]
}

export const QUESTION_TYPE_LABELS: Record<AnamneseQuestionType, string> = {
  yes_no: 'Sim ou não',
  short_text: 'Resposta curta',
  long_text: 'Resposta longa',
  single_choice: 'Escolha única',
  multiple_choice: 'Múltipla escolha',
}

const yesNo = (
  id: string,
  label: string,
  followUps: { id: string; label: string; required?: boolean }[] = [],
): AnamneseQuestion => ({
  id,
  label,
  type: 'yes_no',
  required: true,
  ...(followUps.length
    ? { followUps: followUps.map((item) => ({ ...item, when: 'sim', required: item.required ?? true })) }
    : {}),
})

export const DEFAULT_ANAMNESE_QUESTIONS: AnamneseQuestion[] = [
  yesNo('tratamentoMedico', 'Está em tratamento médico?', [
    { id: 'motivoTratamento', label: 'Motivo do tratamento' },
    { id: 'nomeMedico', label: 'Nome do médico' },
  ]),
  yesNo('medicamentoContinuo', 'Faz uso de algum medicamento de forma contínua?', [
    { id: 'quaisMedicamentos', label: 'Quais medicamentos?' },
  ]),
  yesNo('medicamentosNaturais', 'Faz uso de medicamentos naturais?', [
    { id: 'quaisMedicamentosNaturais', label: 'Quais?' },
  ]),
  yesNo('hospitalizado', 'Já foi hospitalizado(a)?', [
    { id: 'motivoHospitalizacao', label: 'Motivo da hospitalização' },
  ]),
  yesNo('gravida', 'Está grávida?', [{ id: 'periodoGestacional', label: 'Período gestacional' }]),
  yesNo('dieta', 'Faz algum tipo de dieta?', [
    { id: 'qualDieta', label: 'Qual dieta?' },
  ]),
  yesNo('alergia', 'Tem alguma alergia?', [{ id: 'qualAlergia', label: 'Qual alergia?' }]),
  yesNo('alteracaoCoagulacao', 'Tem alterações na coagulação sanguínea?', [
    { id: 'qualAlteracaoCoagulacao', label: 'Qual alteração?' },
  ]),
  yesNo('febreReumatica', 'Teve febre reumática?'),
  yesNo('doencaAutoimune', 'Tem doença autoimune?', [{ id: 'qualDoencaAutoimune', label: 'Qual doença?' }]),
  yesNo('doencaRenalHepatica', 'Tem doença renal ou hepática?', [{ id: 'qualDoencaRenalHepatica', label: 'Qual doença?' }]),
  yesNo('diabetes', 'É diabético(a)?', [{ id: 'tipoDiabetes', label: 'Qual tipo?' }]),
  yesNo('doencaCardiovascular', 'Tem doença cardiovascular?', [{ id: 'qualDoencaCardiovascular', label: 'Qual doença?' }]),
  yesNo('hepatite', 'Tem hepatite?', [{ id: 'tipoHepatite', label: 'Qual tipo?' }]),
  {
    id: 'pressaoArterial',
    label: 'Como é sua pressão arterial?',
    type: 'single_choice',
    required: true,
    options: ['Baixa', 'Normal', 'Alta', 'Não sei informar'],
  },
  yesNo('problemasRespiratorios', 'Tem problemas respiratórios?', [{ id: 'quaisProblemasRespiratorios', label: 'Quais problemas?' }]),
  yesNo('gastriteUlcera', 'Tem gastrite ou úlcera?'),
  yesNo('alteracoesNeurologicas', 'Tem alterações neurológicas?', [{ id: 'qualAlteracaoNeurologica', label: 'Qual alteração?' }]),
  yesNo('condicaoPsicologica', 'Tem alguma condição psicológica?', [{ id: 'qualCondicaoPsicologica', label: 'Qual condição?' }]),
  yesNo('hiv', 'É portador(a) de HIV?'),
  yesNo('historicoDoencasFamiliares', 'Há histórico de doenças na família?', [{ id: 'quaisDoencasFamiliares', label: 'Quais doenças?' }]),
  yesNo('tratamentoCancer', 'Está em tratamento contra câncer?'),
  yesNo('fumante', 'É fumante?', [{ id: 'quantosCigarros', label: 'Quantidade de cigarros' }]),
  yesNo('drogas', 'Faz uso de drogas?', [{ id: 'quaisDrogas', label: 'Quais drogas?' }]),
  yesNo('traumaFace', 'Já sofreu trauma na face?'),
  yesNo('anestesiaOdontologica', 'Já fez anestesia odontológica?', [{ id: 'reacaoAnestesia', label: 'Teve alguma reação?' }]),
  yesNo('outrasDoencas', 'Tem outras doenças?', [{ id: 'quaisOutrasDoencas', label: 'Quais doenças?' }]),
  {
    id: 'motivoConsultaOpcao',
    label: 'Qual é o motivo da consulta?',
    type: 'single_choice',
    required: true,
    options: ['Rotina', 'Dor', 'Emergência', 'Outro'],
    followUps: [{ id: 'motivoConsultaOutros', label: 'Descreva o motivo', when: 'Outro', required: true }],
  },
  {
    id: 'comoConheceuOpcao',
    label: 'Como conheceu a clínica?',
    type: 'single_choice',
    required: true,
    options: ['Google', 'Instagram', 'Indicação', 'Outro'],
    followUps: [{ id: 'comoConheceuOutros', label: 'Conte como nos conheceu', when: 'Outro', required: true }],
  },
]

export const createBlankQuestion = (): AnamneseQuestion => ({
  id: `pergunta_${crypto.randomUUID()}`,
  label: '',
  type: 'yes_no',
  required: true,
})

export function isQuestionVisible(question: AnamneseQuestion, answers: AnamneseAnswers) {
  const visibility = question.visibility
  if (!visibility?.rules.length) return true

  const matches = visibility.rules.map((rule) => {
    const answer = answers[rule.questionId]
    const selected = Array.isArray(answer) ? answer : answer ? [answer] : []
    const overlaps = rule.values.some((value) => selected.includes(value))
    if (rule.operator === 'is_not') return !overlaps
    return overlaps
  })

  return visibility.logic === 'any' ? matches.some(Boolean) : matches.every(Boolean)
}

export function formatAnamneseAnswer(value: unknown) {
  if (Array.isArray(value)) return value.join(', ')
  if (value === 'sim') return 'Sim'
  if (value === 'nao') return 'Não'
  return String(value ?? '')
}
