import { ContractBlock, ContractInline, f, p } from './types'

/**
 * Parágrafo de qualificação do PACIENTE ADULTO.
 * `finalidade` completa a frase "...foi o(a) profissional escolhido para realizar ___".
 */
export function introAdulto(finalidade: ContractInline[], fecho?: string): ContractBlock {
  return p(
    'Eu, ', f('paciente'), ', paciente portador(a) do RG nº ', f('rg'),
    ', CPF nº ', f('cpf'), ', residente à ', f('endereco'),
    ', na cidade ', f('cidade'), ', CEP ', f('cep'),
    ', declaro que o(a) cirurgião(ã)-dentista ', f('profissional'),
    ', devidamente inscrito(a) no Conselho Regional de Odontologia sob o nº ', f('cro'),
    ', com consultório à ', f('consultorioEnd'),
    ', (cidade) ', f('consultorioCidade'), ', CEP ', f('consultorioCep'),
    ', foi o(a) profissional escolhido para realizar ', ...finalidade,
    fecho ?? ', me apresentou o planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.',
  )
}

/**
 * Parágrafo de qualificação do RESPONSÁVEL LEGAL por paciente menor de idade.
 */
export function introMenor(finalidade: ContractInline[], fecho?: string): ContractBlock {
  return p(
    'Eu, ', f('responsavel'), ', CPF ', f('cpfResponsavel'),
    ', responsável pelo paciente ', f('paciente'),
    ', portador(a) do RG nº ', f('rg'), ', CPF nº ', f('cpf'),
    ', residente na ', f('endereco'),
    ', (cidade) ', f('cidade'), ', CEP ', f('cep'),
    ', declaro que o(a) cirurgião(ã)-dentista ', f('profissional'),
    ', devidamente inscrito(a) no Conselho Regional de Odontologia sob o nº ', f('cro'),
    ', com consultório na ', f('consultorioEnd'),
    ', (cidade) ', f('consultorioCidade'), ', CEP ', f('consultorioCep'),
    ', foi o(a) profissional escolhido para realizar ', ...finalidade,
    fecho ?? ' do(a) menor citado acima, sob minha responsabilidade legal, recebi a apresentação do planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.',
  )
}
