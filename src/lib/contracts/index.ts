import { ContractGroup, ContractTemplate, GROUP_LABELS } from './types'
import { TERMOS_PARTE_1 } from './termos-odontologicos-1'
import { TERMOS_PARTE_2 } from './termos-odontologicos-2'
import { ORIENTACOES_ODONTOLOGICAS } from './orientacoes-odontologicas'

export * from './types'

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  ...TERMOS_PARTE_1,
  ...TERMOS_PARTE_2,
  ...ORIENTACOES_ODONTOLOGICAS,
]

export const CONTRACT_GROUPS: ContractGroup[] = [
  'termos-odontologicos',
  'orientacoes-odontologicas',
]

export function getContractTemplate(id: string): ContractTemplate | undefined {
  return CONTRACT_TEMPLATES.find(t => t.id === id)
}

export function templatesByGroup(group: ContractGroup): ContractTemplate[] {
  return CONTRACT_TEMPLATES.filter(t => t.group === group)
}

export function contractFullTitle(t: ContractTemplate): string {
  return t.subtitle ? `${t.title} ${t.subtitle}` : t.title
}

/** Busca simples por título/grupo, usada na biblioteca de contratos. */
export function searchContracts(query: string): ContractTemplate[] {
  const q = query.trim().toLowerCase()
  if (!q) return CONTRACT_TEMPLATES
  return CONTRACT_TEMPLATES.filter(t =>
    contractFullTitle(t).toLowerCase().includes(q) ||
    t.eyebrow.toLowerCase().includes(q) ||
    GROUP_LABELS[t.group].toLowerCase().includes(q)
  )
}
