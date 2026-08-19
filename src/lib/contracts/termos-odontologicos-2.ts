// Termos odontológicos — parte 2 (ortodontia, extração, facetas, laminados
// cerâmicos e limpeza). Ver comentário em `./termos-odontologicos-1`.

import {
  ContractTemplate, ContractField, ANAMNESE_ADULTO, ANAMNESE_MENOR,
  ASSINATURAS_PACIENTE, ASSINATURAS_RESPONSAVEL, CERTIFICO_2,
  F, IDENT_ADULTO, IDENT_MENOR, b, dateLine, f, p, sign,
} from './types'
import { introAdulto, introMenor } from './comum'

const EIXO = 'termos-odontologicos' as const
const EYEBROW = 'Termo de consentimento livre e esclarecido'

// ---------------------------------------------------------------------------
// ORTODONTIA — campos e blocos compartilhados
// ---------------------------------------------------------------------------

const FIELD_MESES: ContractField = { id: 'meses', label: 'Tempo estimado (meses)', width: 'xs' }
const FIELD_MARCA: ContractField = { id: 'marcaAlinhadores', label: 'Marca dos alinhadores', width: 'lg' }
const FIELD_PLANO: ContractField = { id: 'plano', label: 'Plano adquirido', width: 'full' }
const FIELD_VALOR: ContractField = { id: 'valorTratamento', label: 'Valor do tratamento', width: 'full', multiline: true }
const FIELD_VALOR_CONSULTA: ContractField = { id: 'valorConsultaExtra', label: 'Valor da consulta extra (R$)', width: 'sm' }
const FIELD_EMPRESA: ContractField = { id: 'empresa', label: 'Nome da empresa', width: 'md' }
const FIELD_PLANO_GARANTIA: ContractField = { id: 'planoGarantia', label: 'Plano com garantia', width: 'md' }
const FIELD_TAXA: ContractField = { id: 'valorTaxa', label: 'Taxa por falta/consulta (R$)', width: 'sm' }

const DIETA_HIGIENE =
  'A alimentação inadequada e rica em açúcares e uma escovação inadequada podem manchar permanentemente os dentes com manchas brancas. Esse problema pode ser agravado com inflamação na gengiva e, em casos extremos, chegar à perda do suporte ósseo. Os cuidados com a higiene oral e visitas periódicas ao dentista clínico são fundamentais para o controle desses problemas. É bom lembrar que estas manchas não são causadas pelo aparelho, mas pela falta de higiene apropriada.'

const REABSORCAO =
  'É comum acontecer o arredondamento das raízes dos dentes (perda da ponta da raiz) quando submetidas ao tratamento ortodôntico. Em casos raros, a perda de raiz é maior, reduzindo o comprimento desse tecido. Alguns pacientes têm maior tendência a esse tipo de situação. As radiografias que serão solicitadas a cada 6 meses possuem o objetivo de monitorar essa possibilidade. Caso seja detectado esse tipo de processo, você será alertado.'

const IRRITACOES =
  'Quando se inicia o tratamento, é comum termos desconforto inicial, como dores nos dentes, aftas, alterações leves na fala e na deglutição. Esses sintomas tendem a desaparecer logo nos primeiros 15 dias de tratamento, sendo que, após a reativação do aparelho, os dentes podem voltar a ficar doloridos.'

const ORTO_CIRURGICO =
  'Os tratamentos orto-cirúrgicos são propostos aos pacientes que possuem alterações nos ossos da face e nos arcos dentários, afetando sua estética facial. Após adequada orientação, o paciente inicia o tratamento que terá uma fase de tratamento ortodôntico pré-cirúrgico (cujo tempo vai variar de caso para caso), fase cirúrgica (acompanhamento pós-operatório imediato) e tratamento pós-cirúrgico. O paciente deve estar ciente de que o preparo ortodôntico para cirurgia ortognática piora momentaneamente o caso de forma intencional, com finalidades cirúrgicas, porém não será possível reverter o preparo caso haja desistência do procedimento cirúrgico.'

const ALINHADORES_COOPERACAO =
  'Os resultados do tratamento com aparelhos removíveis dependem da cooperação do paciente e do seu responsável. É de grande importância que o paciente siga as recomendações dos profissionais quanto ao uso e aos cuidados com o aparelho. O não cumprimento das recomendações pode comprometer o resultado final do tratamento.'

const FALTA =
  'Durante o período ativo do tratamento, o paciente deverá evitar faltas, uma vez que elas podem atrapalhar o andamento do tratamento. Em caso de falta, o paciente deverá avisar com antecedência e providenciar o reagendamento da sua consulta. O reagendamento será feito de acordo com a disponibilidade da agenda do profissional, podendo o paciente não conseguir vagas próximas à data da desistência. É de responsabilidade do paciente manter seu cadastro (telefone e endereço) sempre atualizado, para que o consultório possa fazer contato sempre que necessário.'

/** Página 2 dos termos de ortodontia com alinhadores (cláusulas comerciais) */
const alinhadoresPagina2 = (assinaturas: string[]) => ({
  blocks: [
    p(b('Garantia do tratamento:'), ' A empresa ', f('empresa'), ' oferece uma garantia de 5 (cinco) anos para pacientes que adquiram o plano ', f('planoGarantia'), '. Não será necessário fazer pagamento de nenhuma placa adicional durante 5 (cinco) anos, a partir da data deste contrato. Para este novo tratamento, será cobrado o valor da consulta do cirurgião-dentista de acordo com o valor vigente no dia/ano de retorno.'),
    p(b('Tratamentos sem garantia:'), ' Caso o paciente tenha optado por não realizar o tratamento com a garantia de 5 (cinco) anos, ou não tenha a necessidade desta garantia, ou o mesmo perca/extravie alguma placa e a reposição da mesma exceda o valor que foi acordado no início do tratamento, terá um custo adicional por placa perdida.'),
    p(b('Abandono ou cancelamento do tratamento:'), ' Caso o paciente abandone o tratamento e não compareça mais ao consultório, ele terá que arcar com todos os valores acordados. Caso o paciente queira efetuar o cancelamento do tratamento, ele terá que arcar com os custos da empresa ', f('empresa'), ' e, em caso de inadimplência, o paciente está sujeito ao protesto de boleto e ao processo judicial.'),
    p('No caso de desistência ou de abandono do tratamento por parte do paciente, deverá ser assinado um termo de desistência, responsabilizando-se integralmente pela interrupção.'),
    p('Em caso de desistência, precedido de uma comunicação prévia de 5 dias, lhe serão cobrados os serviços realizados até a data da comunicação da desistência, pelo preço normal de venda de serviços avulsos praticados pelo consultório/clínica prestadora do serviço.'),
    p(b('Boleto bancário:'), ' Caso a forma de pagamento seja feita através de boleto bancário, este será acompanhado de nota promissória no valor total deste contrato. Mesmo com o término do tratamento, o contratante deve cumprir com o acordo.'),
    p(b('Outros procedimentos:'), ' Qualquer procedimento odontológico extra a ser realizado não está incluso no valor do tratamento do aparelho invisível, tendo que ser feito o pagamento separadamente. É de responsabilidade do dentista a entrega dos cuidados no dia da consulta, de forma impressa ou em formato de PDF.'),
    p(b('Informações sobre as consultas:'), ' Consultas agendadas, confirmadas e não desmarcadas com menos de 24 horas de antecedência estão sujeitas à cobrança de uma taxa referente à hora clínica disponibilizada ao paciente no valor de ', f('valorTaxa'), '.'),
    p(b('Término do tratamento ortodôntico:'), ' Após a finalização do tratamento ortodôntico, será necessário realizar nova documentação ortodôntica e instalação/utilização de aparelhos de contenção, conforme orientação do profissional. O paciente deverá retornar às consultas para controle após 30 dias, 3 meses, 6 meses e 1 ano pós-tratamento. O valor das consultas de retorno será cobrado de acordo com o valor vigente à época. Os valores das contenções superior e inferior são cobrados ao final do tratamento ortodôntico.'),
    p(b('Falta:'), ' ', FALTA),
    p(CERTIFICO_2),
    dateLine(),
    sign(assinaturas),
  ],
})

const alinhadores: ContractTemplate = {
  id: 'ortodontia-alinhadores',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ORTODONTIA COM ALINHADORES',
  fields: [...IDENT_ADULTO, FIELD_MARCA, FIELD_MESES, FIELD_PLANO, FIELD_VALOR, FIELD_VALOR_CONSULTA, FIELD_EMPRESA, FIELD_PLANO_GARANTIA, FIELD_TAXA],
  pages: [
    {
      blocks: [
        introAdulto(['o meu tratamento ortodôntico com alinhadores invisíveis da marca ', f('marcaAlinhadores')], ' e me apresentou o planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.'),
        p(ANAMNESE_ADULTO),
        p(b('Tempo de tratamento:'), ' A previsão do tempo de tratamento não é exata, sendo o tempo estimado para o seu caso de ', f('meses'), ' meses. O tempo de tratamento pode variar de acordo com as limitações do caso, variações individuais e cooperação do paciente.'),
        p(b('Plano adquirido pelo paciente:'), ' ', f('plano')),
        p(b('Valor do tratamento:'), ' ', f('valorTratamento')),
        p(b('Dieta e higiene:'), ' ', DIETA_HIGIENE),
        p(b('Reabsorção radicular:'), ' ', REABSORCAO),
        p(b('Irritações:'), ' ', IRRITACOES),
        p(b('Tratamento orto-cirúrgico:'), ' ', ORTO_CIRURGICO),
        p(b('Tratamento com alinhadores:'), ' ', ALINHADORES_COOPERACAO),
        p('O paciente está ciente de que o não uso das moldeiras acarreta maior número de consultas e, caso seja necessário, acrescentaremos consultas devido à não utilização das placas. Desse modo, serão cobradas consultas à parte no valor de R$ ', f('valorConsultaExtra'), ' cada uma.'),
      ],
    },
    alinhadoresPagina2(ASSINATURAS_PACIENTE),
  ],
}

const alinhadoresMenor: ContractTemplate = {
  id: 'ortodontia-alinhadores-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ORTODONTIA COM ALINHADORES',
  subtitle: '(menor de idade)',
  fields: [...IDENT_MENOR, FIELD_MESES, FIELD_PLANO, FIELD_VALOR, FIELD_VALOR_CONSULTA, FIELD_EMPRESA, FIELD_PLANO_GARANTIA, FIELD_TAXA],
  pages: [
    {
      blocks: [
        introMenor(['o tratamento ortodôntico com alinhadores'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
        p(ANAMNESE_MENOR),
        p(b('Tempo de tratamento:'), ' A previsão do tempo de tratamento não é exata, sendo o tempo estimado para o seu caso de ', f('meses'), ' meses. O tempo de tratamento pode variar de acordo com as limitações do caso, variações individuais e cooperação do paciente.'),
        p(b('Plano adquirido pelo paciente:'), ' ', f('plano')),
        p(b('Valor do tratamento:'), ' ', f('valorTratamento')),
        p(b('Dieta e higiene:'), ' ', DIETA_HIGIENE),
        p(b('Reabsorção radicular:'), ' ', REABSORCAO),
        p(b('Irritações:'), ' ', IRRITACOES),
        p(b('Tratamento orto-cirúrgico:'), ' ', ORTO_CIRURGICO),
        p(b('Tratamento com alinhadores:'), ' ', ALINHADORES_COOPERACAO),
        p('O paciente está ciente de que o não uso das moldeiras acarreta maior número de consultas e, caso seja necessário, acrescentaremos consultas devido à não utilização das placas. Portanto, serão cobradas consultas à parte no valor de R$ ', f('valorConsultaExtra'), ' cada uma.'),
      ],
    },
    alinhadoresPagina2(ASSINATURAS_RESPONSAVEL),
  ],
}

const CUIDADOS_FIXOS: string[] = [
  'Deve-se evitar quebras dos aparelhos fixos, pois elas podem atrasar ou atrapalhar o andamento do tratamento. Para isso, recomenda-se evitar alimentos duros/pegajosos e evitar hábitos nocivos, como morder a tampa de caneta, roer unha, dentre outros.',
  'Deve-se realizar um ótimo controle da higiene bucal. No início do tratamento, o paciente será ensinado a fazer a sua higiene de forma correta. É importante usar escova macia e fio dental. Caso haja alguma dúvida quanto à higienização bucal, avise o profissional para que ele possa orientá-lo da melhor forma.',
  'Recomenda-se utilizar protetores bucais para prática de exercícios físicos de contato. Em caso de dúvida, entre em contato com a clínica para esclarecimentos.',
]

const CANCELAMENTOS =
  'No caso de desistência ou abandono do tratamento por parte do paciente ou do responsável, deverá ser assinado um termo de desistência, responsabilizando-se integralmente pela interrupção. Poderá o ortodontista suspender o tratamento quando não houver colaboração do paciente com uso de aparelhos e dispositivos auxiliares, como cuidados, higiene e faltas, ou seja, situações que comprometam os resultados finais do tratamento.'

const ortodontia: ContractTemplate = {
  id: 'ortodontia',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ORTODONTIA',
  fields: [...IDENT_ADULTO, FIELD_MESES],
  pages: [
    {
      blocks: [
        introAdulto(['o meu tratamento ortodôntico']),
        p(ANAMNESE_ADULTO),
        p(b('Tempo de tratamento:'), ' A previsão do tempo de tratamento não é exata, sendo o tempo estimado para o seu caso de ', f('meses'), ' meses. O tempo de tratamento pode variar de acordo com as limitações do caso, variações individuais e cooperação do paciente.'),
        p(b('Dieta e higiene:'), ' ', DIETA_HIGIENE),
        p(b('Reabsorção radicular:'), ' ', REABSORCAO),
        p(b('Irritações:'), ' ', IRRITACOES),
        p(b('Tratamento orto-cirúrgico:'), ' ', ORTO_CIRURGICO),
        p(b('Tratamento com aparelhos móveis e alinhadores:'), ' ', ALINHADORES_COOPERACAO),
        p(b('Término do tratamento ortodôntico:'), ' Após a finalização do tratamento ortodôntico, será necessário realizar nova documentação ortodôntica e instalação/utilização de aparelhos de contenção, conforme orientação do profissional. O paciente deverá retornar às consultas para controle após 30 dias, 3 meses, 6 meses e 1 ano pós-tratamento. Essas consultas de retorno serão cobradas igual ao valor de uma consulta vigente na época. Também será cobrado o valor das contenções superior e inferior.'),
      ],
    },
    {
      blocks: [
        p(b('Cuidados com aparelhos fixos:')),
        { t: 'ul', items: CUIDADOS_FIXOS.map(t => [t]) },
        p(b('Falta:'), ' ', FALTA),
        p(b('Cancelamentos:'), ' ', CANCELAMENTOS),
        p(CERTIFICO_2),
        dateLine(),
        sign(ASSINATURAS_PACIENTE),
      ],
    },
  ],
}

const ortodontiaMenor: ContractTemplate = {
  id: 'ortodontia-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ORTODONTIA',
  subtitle: '(menor de idade)',
  fields: [...IDENT_MENOR, FIELD_MESES],
  pages: [
    {
      blocks: [
        introMenor(['o tratamento ortodôntico'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
        p(ANAMNESE_MENOR),
        p(b('Tempo de tratamento:'), ' A previsão do tempo de tratamento não é exata, sendo o tempo estimado para o seu caso de ', f('meses'), ' meses. O tempo de tratamento pode variar de acordo com as limitações do caso, variações individuais e cooperação do paciente.'),
        p(b('Dieta e higiene:'), ' ', DIETA_HIGIENE),
        p(b('Reabsorção radicular:'), ' ', REABSORCAO),
        p(b('Irritações:'), ' ', IRRITACOES),
        p(b('Tratamento orto-cirúrgico:'), ' ', ORTO_CIRURGICO),
        p(b('Tratamento com aparelhos móveis:'), ' ', ALINHADORES_COOPERACAO),
        p(b('Cuidados com aparelhos fixos:'), ' Deve-se evitar quebras dos aparelhos fixos, pois elas podem atrasar ou atrapalhar o andamento do tratamento. Para isso, recomenda-se evitar alimentos duros/pegajosos e evitar hábitos nocivos, como morder a tampa de caneta, roer unha, dentre outros. Deve-se realizar um ótimo controle da higiene bucal. No início do tratamento, o paciente será ensinado a fazer a sua higiene de forma correta. É importante usar escova macia e fio dental.'),
      ],
    },
    {
      blocks: [
        p('Caso haja alguma dúvida quanto à higienização bucal, avise o profissional para que ele possa orientá-lo da melhor forma. Recomenda-se utilizar protetores bucais para prática de exercícios físicos de contato. Em caso de dúvida, entre em contato com a clínica para esclarecimentos.'),
        p(b('Cuidados com aparelhos móveis:'), ' Remova os aparelhos para praticar esportes; sempre faça a correta higiene dos aparelhos, utilizando detergente ou sabão neutro e escova de dente macia; evite perder ou danificar o seu aparelho, guardando-o na sua caixa apropriada; use o seu aparelho da forma como o seu dentista solicitou. Colabore com o tratamento para que o resultado esperado seja alcançado.'),
        p(b('Término do tratamento ortodôntico:'), ' Após a finalização do tratamento ortodôntico, será necessário realizar nova documentação ortodôntica e instalação/utilização de aparelhos de contenção, conforme orientação do profissional. O paciente deverá retornar às consultas para controle após 30 dias, 3 meses, 6 meses e 1 ano pós-tratamento. Essas consultas de retorno serão cobradas de acordo com o valor de uma consulta vigente na época. Para a contenção superior e inferior, o custo será cobrado à parte.'),
        p(b('Falta:'), ' ', FALTA),
        p(b('Cancelamentos:'), ' ', CANCELAMENTOS),
        p(CERTIFICO_2),
        dateLine(),
        sign(ASSINATURAS_RESPONSAVEL),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// EXTRAÇÃO DENTÁRIA
// ---------------------------------------------------------------------------

const FIELD_DIAGNOSTICO: ContractField = { id: 'diagnostico', label: 'Diagnóstico apresentado', width: 'full', multiline: true }

const EXTRACAO_CORPO: string[] = [
  'Estou ciente de que o procedimento de extração dentária visa eliminar focos infecciosos intrabucais (restos de raízes dentárias, dentes amplamente cariados, dentes com comprometimento endodôntico sem possibilidades de tratamento, dentes que apresentam sinais inflamatórios e/ou infecciosos) que podem apresentar risco à saúde geral do paciente. Isso porque as bactérias presentes podem ocasionar doenças sistêmicas (endocardite bacteriana, pneumonia, infecções generalizadas, entre outras).',
  'Estou ciente de que a extração dentária é realizada no consultório e este apresenta condições clínicas favoráveis para tal procedimento.',
  'Fui informado(a) de que em todo procedimento pode ocorrer fato imprevisível ou de força maior, independentemente da técnica empregada ou da vontade dos profissionais envolvidos durante ou após o ato.',
  'Estou ciente e concordo com a reposição do(s) elemento(s) dentário(s) extraído(s) e demais procedimentos odontológicos necessários para restabelecer a saúde bucal do paciente.',
  'Estou ciente de que pode ocorrer parestesia se o dente estiver perto do nervo alveolar inferior, podendo haver perda de sensibilidade. Essa sensação pode permanecer por alguns meses. Caso isso ocorra, o cirurgião-dentista irá conduzir para a melhora do caso e todos os custos serão de inteira responsabilidade do paciente. Havendo fratura de algum dente e se a retirada deste causar danos maiores ao paciente, o profissional poderá optar por deixá-lo no local e acompanhar radiograficamente.',
]

const extracaoMenor: ContractTemplate = {
  id: 'extracao-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'EXTRAÇÃO DENTÁRIA',
  subtitle: '(menor de idade)',
  fields: [...IDENT_MENOR, F.dentes, FIELD_DIAGNOSTICO],
  pages: [{
    blocks: [
      introMenor(['a extração dentária'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
      p(ANAMNESE_MENOR),
      p('Será realizada a extração dentária do(s) seguinte(s) elemento(s) ', f('dentes'), ', considerando a queixa do paciente; e, após avaliação clínica e exames complementares, o profissional apresentou o diagnóstico abaixo: ', f('diagnostico'), '.'),
      ...EXTRACAO_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

const extracao: ContractTemplate = {
  id: 'extracao',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'EXTRAÇÃO DENTÁRIA',
  fields: [...IDENT_ADULTO, F.dentes, FIELD_DIAGNOSTICO],
  pages: [{
    blocks: [
      introAdulto(['a minha extração dentária']),
      p(ANAMNESE_ADULTO),
      p('Será realizada a extração dentária do(s) seguinte(s) elemento(s) ', f('dentes'), ', considerando minha queixa; e, após avaliação clínica e exames complementares, o profissional apresentou o diagnóstico abaixo: ', f('diagnostico'), '.'),
      ...EXTRACAO_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// FACETAS DE RESINA
// ---------------------------------------------------------------------------

const FACETAS_CORPO: string[] = [
  'Estou ciente de que a faceta de resina realizada sem desgastar a superfície do dente é um procedimento reversível, ou seja, a resina pode ser removida e os dentes voltam a ser o que eram antes, bastando remover as camadas de resina que foram aplicadas.',
  'Faceta de resina realizada após o desgaste do dente é irreversível, porque foi desgastada a superfície do dente. Sempre que a camada de resina é removida, é preciso instalar algum tipo de faceta dentária de cerâmica ou então utilizar a mesma técnica anterior.',
  'Fui informado(a) de que, para aumentar a durabilidade das facetas de resina, é importante: usar uma escova de dentes com cerdas extra macias; evitar os cremes dentais abrasivos; evitar o consumo excessivo de alimentos e bebidas pigmentados; abster-se do tabaco; evitar roer as unhas, morder objetos ou usar os dentes como ferramentas; manter uma boa higiene bucal e fazer consultas periódicas ao dentista para polimento e ajustes.',
  'Faceta em resina composta é biomaterial que exige consultas periódicas para repolimento e renaturalização, com o objetivo de manter seu brilho ao longo do tempo, sem sofrer alterações perceptíveis a olho nu.',
  'Estou ciente de que consultas para manutenção das facetas de resina serão cobradas à parte de acordo com o valor vigente na época.',
  'Comprometo-me a ter uma boa higienização para não haver perda do material, assim como fazer consultas periódicas para conservação dela.',
]

const FACETA_DEFINICAO =
  ' é realizada com resina composta que recobre toda a parte estética (visível) dos dentes com incrementos de resina composta, um biomaterial resistente e capaz de reproduzir as propriedades de cor, transparência e opalescência presentes nos dentes naturais. Em alguns casos, são necessários desgastes para que se tenha a estética desejada. Questões como inclinações dentárias, presença de restaurações antigas em resina e exigências estéticas individuais são levadas em conta para determinar se os desgastes são essenciais para que os resultados estéticos sejam naturais e harmônicos.'

const facetasMenor: ContractTemplate = {
  id: 'facetas-resina-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'FACETAS DE RESINA',
  subtitle: '(menor de idade)',
  fields: IDENT_MENOR,
  pages: [{
    blocks: [
      introMenor(['as facetas de resina'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
      p(ANAMNESE_MENOR),
      p(b('Faceta de resina'), FACETA_DEFINICAO),
      ...FACETAS_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

const facetas: ContractTemplate = {
  id: 'facetas-resina',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'FACETAS DE RESINA',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['o procedimento de facetas de resina']),
      p(ANAMNESE_ADULTO),
      p(b('Faceta de resina'), FACETA_DEFINICAO),
      ...FACETAS_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// LAMINADOS CERÂMICOS
// ---------------------------------------------------------------------------

const LAMINADOS_CORPO = [
  p(b('Facetas em cerâmica'), ' necessitam de pequenos desgastes, em média 0,7 mm, pois o material precisa ter espessura entre 1 e 1,5 mm para ter boa resistência estrutural. Cerâmicas apresentam uma superfície vítrea que não sofre abrasão pela escovação diária ou pela ingestão de alimentos e, por isso, mantêm o polimento e a cor intactos mesmo com o passar dos anos.'),
  p(b('Lente de contato em cerâmica'), ' tem o objetivo de maior preservação do esmalte dental. As lentes têm cerca de 0,2 mm. Devido à sua pouca espessura, não recobrem grandes defeitos estruturais, funcionando bem para dentes que já apresentam uma ótima tonalidade e só necessitam de pequenas correções de forma.'),
  p('Pacientes que apresentam hábitos funcionais, como bruxismo (ranger os dentes patologicamente) ou apertamento, necessitam de materiais com ótima resistência, como cerâmicas, porém é extremamente importante o uso de placa de bruxismo para que não venham a ter quebra desse material.'),
  p('É necessário comprometimento do paciente durante o tratamento e disponibilidade para prova de cerâmica. Assim que o paciente aprovar o caso, ele não poderá mais modificar as facetas; caso haja essa necessidade, é necessário fazer o pagamento desta nova solicitação.'),
  p('Deve-se escovar e usar o fio dental normalmente; escovar os dentes diariamente e usar cremes dentais com flúor não abrasivos; limitar o consumo de café e de outros alimentos causadores de manchas.'),
  p('Mesmo que o procedimento seja executado da forma correta, não isenta o paciente de ter que refazer esse procedimento em algum momento.'),
  p('Pacientes com doença periodontal devem seguir com o tratamento para não haver perda dos elementos. É de responsabilidade do paciente manter sua saúde bucal em dia para conservação do trabalho realizado.'),
]

const laminados: ContractTemplate = {
  id: 'laminados-ceramicos',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'LAMINADOS CERÂMICOS',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['o procedimento de faceta/lente de cerâmica']),
      p(ANAMNESE_ADULTO),
      ...LAMINADOS_CORPO,
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

const laminadosMenor: ContractTemplate = {
  id: 'laminados-ceramicos-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'LAMINADOS CERÂMICOS',
  subtitle: '(menor de idade)',
  fields: IDENT_MENOR,
  pages: [{
    blocks: [
      introMenor(['o(s) laminado(s) cerâmico(s)'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
      p(ANAMNESE_MENOR),
      ...LAMINADOS_CORPO,
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

// ---------------------------------------------------------------------------
// LIMPEZA DENTÁRIA
// ---------------------------------------------------------------------------

const LIMPEZA_CORPO: string[] = [
  'Estou ciente de que a gengivite é a inflamação da gengiva pela ação do biofilme bacteriano sob os dentes e a gengiva. É caracterizada pela vermelhidão na gengiva, inchaço, presença de dor ao toque e sangramento espontâneo. Esta fase da doença ainda é reversível, ou seja, a higienização e a limpeza proporcionada pelo cirurgião-dentista são suficientes para não causar maiores danos às estruturas da boca.',
  'Estou ciente de que o tártaro, não sendo removido e permanecendo durante meses na boca, torna a higiene cada vez mais prejudicada. Dessa forma, o tártaro se intensifica e se direciona para a raiz do dente, causando destruição do osso, retração da gengiva e, consequentemente, amolecimento e perda dental. Estou ciente de que esse estágio da doença é mais crítico e não há reversão: o osso perdido não pode ser recuperado.',
  'A gengiva, quando fica em contato direto com o dente, forma um espaço livre que se chama bolsa periodontal. Este espaço deveria ser preenchido pelo osso. Nessa espécie de bolsa, há o acúmulo de restos de alimentos e proliferação de bactérias, intensificando o problema, porque o espaço é restrito para a higienização. Havendo casos mais graves como o citado, é necessário fazer o número de consultas que a periodontista determinar. Não seguindo o plano de tratamento, o risco e a perda dentária aumentam significativamente.',
  'Além da gengivite e perda óssea, a má higiene bucal pode causar cáries, mau hálito e perda de dentes, entre outros problemas.',
  'O processo da limpeza no consultório consiste na remoção da placa e do tártaro sobre os dentes, por meio de escovas rotatórias e pasta profilática, instrumentos manuais ou por meio do aparelho de ultrassom odontológico.',
  'Diante disso, deixei o cirurgião-dentista ciente do meu histórico médico e entendo que, apesar de ser um procedimento seguro, dependendo do caso, se faz necessária a utilização de uma profilaxia antibiótica prévia em caso de histórico de endocardite bacteriana, para evitar a disseminação das bactérias por via circulatória. É de minha inteira responsabilidade avisar o profissional sobre o uso de marcapasso.',
]

const limpeza: ContractTemplate = {
  id: 'limpeza',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'LIMPEZA DENTÁRIA',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['a limpeza dentária']),
      p(ANAMNESE_ADULTO),
      ...LIMPEZA_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

const limpezaMenor: ContractTemplate = {
  id: 'limpeza-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'LIMPEZA DENTÁRIA',
  subtitle: '(menor de idade)',
  fields: IDENT_MENOR,
  pages: [{
    blocks: [
      introMenor(['a limpeza dentária'], ' do(a) menor citado acima, sob minha responsabilidade legal.'),
      p(ANAMNESE_MENOR),
      ...LIMPEZA_CORPO.map(t => p(t)),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

export const TERMOS_PARTE_2: ContractTemplate[] = [
  ortodontia,
  ortodontiaMenor,
  alinhadores,
  alinhadoresMenor,
  extracao,
  extracaoMenor,
  facetas,
  facetasMenor,
  laminados,
  laminadosMenor,
  limpeza,
  limpezaMenor,
]
