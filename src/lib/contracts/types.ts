// Modelo de dados dos contratos/termos imprimíveis.
//
// Um template é uma sequência de PÁGINAS A4 explícitas (do mesmo jeito que o PDF
// original), cada uma com blocos de conteúdo. Trechos preenchíveis viram
// referências de campo `{ f: 'paciente' }` — o editor renderiza o valor digitado
// no painel lateral ou uma linha em branco quando vazio.

export type ContractInline =
  | string
  /** Trecho preenchível — referência ao id de um `ContractField` */
  | { f: string }
  /** Trecho em negrito (rótulos como "Diagnóstico e Planejamento do Tratamento:") */
  | { b: string }

export type ContractBlock =
  | { t: 'p'; c: ContractInline[]; bold?: boolean; italic?: boolean; align?: 'center' }
  | { t: 'h'; c: string }
  | { t: 'ul'; items: ContractInline[][] }
  | { t: 'ol'; items: ContractInline[][] }
  | { t: 'sp' }
  | { t: 'date' }
  | { t: 'sign'; labels: string[] }

export type ContractPage = {
  /** Repete o cabeçalho (logo + título) nesta página. Padrão: true */
  header?: boolean
  blocks: ContractBlock[]
}

export type ContractFieldWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'

export type ContractField = {
  id: string
  label: string
  width?: ContractFieldWidth
  placeholder?: string
  /** Campo de dados da clínica — reaproveitado entre todos os documentos */
  clinic?: boolean
  /** Preenchido automaticamente com o paciente aberto */
  fromPatient?: 'name'
  multiline?: boolean
}

export type ContractGroup = 'termos-odontologicos' | 'orientacoes-odontologicas'

export type ContractTemplate = {
  id: string
  group: ContractGroup
  /** Linha fina acima do título, ex.: "Termo de consentimento livre e esclarecido" */
  eyebrow: string
  title: string
  /** Complemento do título, ex.: "(menor de idade)" */
  subtitle?: string
  /** `compact` reduz a fonte para caber textos longos na folha */
  density?: 'normal' | 'compact' | 'dense'
  fields: ContractField[]
  pages: ContractPage[]
}

export const GROUP_LABELS: Record<ContractGroup, string> = {
  'termos-odontologicos': 'Termos odontológicos',
  'orientacoes-odontologicas': 'Orientações odontológicas',
}

// ---------------------------------------------------------------------------
// Campos reutilizáveis
// ---------------------------------------------------------------------------

export const F = {
  paciente:   { id: 'paciente',   label: 'Nome do paciente', width: 'full', fromPatient: 'name' } as ContractField,
  rg:         { id: 'rg',         label: 'RG do paciente', width: 'sm' } as ContractField,
  cpf:        { id: 'cpf',        label: 'CPF do paciente', width: 'sm' } as ContractField,
  endereco:   { id: 'endereco',   label: 'Endereço do paciente', width: 'full' } as ContractField,
  cidade:     { id: 'cidade',     label: 'Cidade do paciente', width: 'md' } as ContractField,
  cep:        { id: 'cep',        label: 'CEP do paciente', width: 'sm' } as ContractField,

  responsavel:    { id: 'responsavel',    label: 'Nome do responsável legal', width: 'full' } as ContractField,
  cpfResponsavel: { id: 'cpfResponsavel', label: 'CPF do responsável', width: 'sm' } as ContractField,

  profissional:      { id: 'profissional',      label: 'Cirurgião(ã)-dentista', width: 'full', clinic: true } as ContractField,
  cro:               { id: 'cro',               label: 'CRO nº', width: 'sm', clinic: true } as ContractField,
  consultorioEnd:    { id: 'consultorioEnd',    label: 'Endereço do consultório', width: 'full', clinic: true } as ContractField,
  consultorioCidade: { id: 'consultorioCidade', label: 'Cidade do consultório', width: 'md', clinic: true } as ContractField,
  consultorioCep:    { id: 'consultorioCep',    label: 'CEP do consultório', width: 'sm', clinic: true } as ContractField,

  localData: { id: 'localData', label: 'Cidade da assinatura', width: 'md', clinic: true } as ContractField,
  dia:       { id: 'dia',       label: 'Dia', width: 'xs' } as ContractField,
  mes:       { id: 'mes',       label: 'Mês', width: 'sm' } as ContractField,
  ano:       { id: 'ano',       label: 'Ano', width: 'xs' } as ContractField,

  dentes: { id: 'dentes', label: 'Dente(s)', width: 'md', placeholder: 'ex.: 16, 26' } as ContractField,
}

/** Bloco de identificação do paciente adulto (comum à maioria dos termos) */
export const IDENT_ADULTO: ContractField[] = [
  F.paciente, F.rg, F.cpf, F.endereco, F.cidade, F.cep,
  F.profissional, F.cro, F.consultorioEnd, F.consultorioCidade, F.consultorioCep,
  F.localData, F.dia, F.mes, F.ano,
]

/** Bloco de identificação com responsável legal (menor de idade) */
export const IDENT_MENOR: ContractField[] = [
  F.responsavel, F.cpfResponsavel,
  F.paciente, F.rg, F.cpf, F.endereco, F.cidade, F.cep,
  F.profissional, F.cro, F.consultorioEnd, F.consultorioCidade, F.consultorioCep,
  F.localData, F.dia, F.mes, F.ano,
]

export const ASSINATURAS_PACIENTE = ['Assinatura do paciente', 'Assinatura do profissional', 'Testemunha 1/CPF', 'Testemunha 2/CPF']
export const ASSINATURAS_RESPONSAVEL = ['Assinatura do responsável', 'Assinatura do profissional', 'Testemunha 1/CPF', 'Testemunha 2/CPF']

// ---------------------------------------------------------------------------
// Helpers de autoria dos templates (deixam o conteúdo legível)
// ---------------------------------------------------------------------------

export const p = (...c: ContractInline[]): ContractBlock => ({ t: 'p', c })
export const pb = (...c: ContractInline[]): ContractBlock => ({ t: 'p', c, bold: true })
export const pi = (...c: ContractInline[]): ContractBlock => ({ t: 'p', c, italic: true })
export const h = (c: string): ContractBlock => ({ t: 'h', c })
export const ul = (...items: ContractInline[][]): ContractBlock => ({ t: 'ul', items })
export const ol = (...items: ContractInline[][]): ContractBlock => ({ t: 'ol', items })
export const f = (id: string): ContractInline => ({ f: id })
export const b = (text: string): ContractInline => ({ b: text })
export const dateLine = (): ContractBlock => ({ t: 'date' })
export const sign = (labels: string[]): ContractBlock => ({ t: 'sign', labels })

/** Parágrafo padrão de fechamento presente em quase todos os termos */
export const CERTIFICO =
  'Certifico que este termo me foi lido e explicado, ou que o li. Ademais, reitero que entendi o seu conteúdo e, assim, autorizo a realização dos procedimentos necessários e assumo os riscos inerentes.'

export const CERTIFICO_2 =
  'Certifico que este termo me foi lido e explicado. Reitero que também li e entendi o seu conteúdo, assim, autorizando a realização dos procedimentos necessários e assumindo os riscos inerentes.'

/** Parágrafo de anamnese — versão paciente adulto */
export const ANAMNESE_ADULTO =
  'A ficha de anamnese foi por mim preenchida e assinada, apresentando informações que correspondem à verdade no que diz respeito às minhas condições de saúde geral e bucal. Não suprimi ou omiti qualquer dado quanto a doenças pré-existentes — as quais sejam de meu conhecimento, tampouco quanto ao uso de medicamentos controlados ou não. Estou ciente de que a omissão de dados sobre a minha saúde geral e bucal e sobre o uso de medicamentos pode interferir negativamente no planejamento e andamento de tratamento, na resposta biológica do meu organismo à técnica empregada, podendo, também, ocasionar danos irreversíveis à minha saúde bucal e geral.'

/** Parágrafo de anamnese — versão responsável por menor */
export const ANAMNESE_MENOR =
  'A ficha de anamnese foi por mim preenchida e assinada, apresentando informações que correspondem à verdade no que diz respeito às condições de saúde geral e bucal do(a) menor de idade em questão. Não suprimi ou omiti qualquer dado (referente ao menor) quanto a doenças pré-existentes — as quais sejam de meu conhecimento, tampouco quanto ao uso de medicamentos controlados ou não. Estou ciente de que a omissão de dados sobre saúde geral e bucal do(a) menor de idade, o(a) qual possuo responsabilidade legal, e sobre o uso de medicamentos pode interferir negativamente no planejamento e andamento de tratamento, na resposta biológica do seu organismo à técnica empregada, podendo, também, ocasionar danos irreversíveis à saúde bucal e geral do paciente.'
