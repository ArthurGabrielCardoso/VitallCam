/**
 * Dados fixos da clínica e o quadro de profissionais.
 *
 * Vêm preenchidos em todo documento — são os mesmos sempre, e digitar CRO à mão
 * num termo de consentimento é onde o erro passa despercebido.
 *
 * O endereço e o CRO da clínica foram tirados do próprio termo de implante que
 * a clínica já usava: "Clínica localizada à Rua Coronel Souza Franco, nº 904,
 * Mogi das Cruzes/SP, CEP 08710-025, devidamente inscrito no Conselho Regional
 * de Odontologia sob o n° 034917".
 */

export const CLINICA = {
  endereco: 'Rua Coronel Souza Franco, nº 904',
  cidade: 'Mogi das Cruzes/SP',
  cep: '08710-025',
  /** CRO da pessoa jurídica — não confundir com o CRO do profissional. */
  cro: '034917',
  /** Cidade que abre a linha da data ("Mogi das Cruzes, 18 de Agosto de 2026"). */
  localAssinatura: 'Mogi das Cruzes',
} as const

export interface Profissional {
  nome: string
  cro: string
}

/** Quadro clínico. Escolher aqui preenche nome e CRO de uma vez. */
export const PROFISSIONAIS: Profissional[] = [
  { nome: 'Dra. Ana Maria Cardoso de Oliveira', cro: '53681' },
  { nome: 'Dra. Marcela Marques Sobral', cro: '79455' },
  { nome: 'Dr. Diego da Costa Esteves', cro: '99280' },
  { nome: 'Dr. Rodolfo Thomé Cocco', cro: '102415' },
  { nome: 'Dra. Fabiana Bárbara Piveta Flores', cro: '104087' },
  { nome: 'Dra. Ariatna De Sabath', cro: '104437' },
  { nome: 'Dra. Victoria Nomura Bou Ghosn', cro: '150762' },
  { nome: 'Dra. Tayane Cristina Chaves Ramos', cro: '151370' },
]

/** Valores que todo documento já abre preenchido. */
export const PADRAO_CLINICA: Record<string, string> = {
  consultorioEnd: CLINICA.endereco,
  consultorioCidade: CLINICA.cidade,
  consultorioCep: CLINICA.cep,
  localData: CLINICA.localAssinatura,
}
