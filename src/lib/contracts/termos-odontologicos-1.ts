// Termos odontológicos — parte 1 (endodontia, clareamento, restauração,
// prótese, implante e periodontia). Dividido em dois arquivos apenas por
// tamanho; a lista completa é montada em `./index`.

import {
  ContractTemplate, ANAMNESE_ADULTO, ANAMNESE_MENOR, ASSINATURAS_PACIENTE,
  ASSINATURAS_RESPONSAVEL, CERTIFICO, CERTIFICO_2, F, IDENT_ADULTO, IDENT_MENOR,
  b, dateLine, f, p, sign,
} from './types'
import { introAdulto, introMenor } from './comum'

const EIXO = 'termos-odontologicos' as const
const EYEBROW = 'Termo de consentimento livre e esclarecido'

const RISCOS_ENDODONTIA_INTRO =
  'Estou ciente dos riscos aos quais está sujeito(a), tais como: 1) Desconforto após o tratamento que poderá durar horas ou alguns dias — neste caso, poderá haver a necessidade de uso de medicamentos que serão prescritos; 2) Edema (inchaço) na gengiva próximo ao dente tratado ou edema facial, que poderá persistir por alguns dias ou mesmo se prolongar; 3) Presença de infecção; 4) Trismo (limitação de abertura bucal), que poderá persistir por alguns dias ou mesmo se prolongar; 5) Índice de insucesso de 5% a 10% nos tratamentos endodônticos e de 15 a 40% nos retratamentos endodônticos — caso ocorra falha no primeiro tratamento endodôntico, poderá haver necessidade de retratamento, cirurgia ou até mesmo extração do elemento dentário; 6) Poderá ocorrer fratura de instrumento dentro da raiz do dente e o(a) dentista irá decidir se deixará no local ou se deverá remover através de cirurgia — sendo assim, cada caso é examinado pelo(a) profissional, pois existem casos onde não há necessidade de sua remoção; 7) Perfuração do canal radicular, através de uso de instrumentos, que poderá necessitar de intervenção cirúrgica; 8) Perda prematura do dente devido doença periodontal avançada; 9) Imagem radiográfica imprecisa dando origem à interpretação equivocada; 10) Restaurações altas podem comprometer o sucesso do tratamento de canal.'

// ---------------------------------------------------------------------------
// ENDODONTIA
// ---------------------------------------------------------------------------

const endodontiaMenor: ContractTemplate = {
  id: 'endodontia-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ENDODONTIA',
  subtitle: '(menor de idade)',
  fields: [...IDENT_MENOR, F.dentes],
  pages: [{
    blocks: [
      introMenor(['o tratamento endodôntico (canal)']),
      p(ANAMNESE_MENOR),
      p(
        b('Diagnóstico e Planejamento do Tratamento:'),
        ' Fui informado(a) de que o(a) menor apresenta a necessidade de realizar tratamento endodôntico (canal) no(s) dente(s) ',
        f('dentes'),
        '. Desse modo, possuo o direito de não autorizar o tratamento. Tenho ciência de que se o tratamento odontológico proposto não for realizado, o(a) menor sob minha responsabilidade poderá ter sua saúde comprometida com a perda do dente, além de graves infecções que podem gerar problemas cardíacos e que podem levá-lo(a) até o óbito. Considerando a queixa do(a) menor e após avaliação clínica e de exames complementares, o(a) profissional prestou a mim esclarecimentos sobre o diagnóstico, informando sobre as condições do elemento dentário, incluindo sua fragilidade e riscos de carga e sobrecarga que podem gerar a fratura da raiz e perda do dente em questão. ',
        RISCOS_ENDODONTIA_INTRO,
      ),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

const endodontia: ContractTemplate = {
  id: 'endodontia',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'ENDODONTIA',
  fields: [...IDENT_ADULTO, F.dentes],
  pages: [{
    blocks: [
      introAdulto(['o meu tratamento endodôntico (canal)'], ', recebi a apresentação do planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.'),
      p(ANAMNESE_ADULTO),
      p(
        b('Diagnóstico e Planejamento do Tratamento:'),
        ' Fui informado(a) de que tenho a necessidade de realizar tratamento endodôntico (canal) no(s) dente(s) ',
        f('dentes'),
        '. É de meu conhecimento de que possuo o direito de escolher não me tratar. Tenho ciência de que se o tratamento odontológico proposto não for realizado, poderei ter minha saúde comprometida com a perda do dente, além de graves infecções que podem gerar problemas cardíacos e até levar ao óbito. Considerando a minha queixa e, após avaliação clínica e de exames complementares, o(a) profissional prestou a mim esclarecimentos sobre o diagnóstico, informando sobre as condições do elemento dentário, incluindo sua fragilidade e riscos de carga e sobrecarga que podem gerar a fratura da raiz e perda do dente em questão. ',
        RISCOS_ENDODONTIA_INTRO,
      ),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// CLAREAMENTO DENTÁRIO
// ---------------------------------------------------------------------------

const CLAREAMENTO_CORPO = [
  'Recebi as informações necessárias para o meu entendimento acerca do tratamento proposto. Sendo assim, declaro que estou ciente de que não existe possibilidade de predizer o grau de mudança de cor que será atingido nos dentes do indivíduo, assim como sei que o sucesso do tratamento depende da minha colaboração. A presença de resina composta referente à colagem de braquetes do tratamento ortodôntico influencia negativamente no resultado do clareamento, portanto, torna-se necessária a remoção com o seu ortodontista ou será cobrado o adicional de valor referente à execução deste procedimento.',
  'Em caso de perda ou danificação das placas de clareamento será cobrado o valor laboratorial adicional por placa realizada. Independente do tipo de clareamento escolhido, seja ele o clareamento realizado no consultório ou misto (moldeira + consultório), cabe ao paciente realizar o tratamento no tempo devido. Caso a satisfação do paciente não tenha sido atingida após a finalização do regime de clareamento proposto, o clareamento dental deverá ser prosseguido. Entretanto, será cobrado um valor adicional referente à consulta ou seringa necessária.',
]

const clareamentoMenor: ContractTemplate = {
  id: 'clareamento-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'CLAREAMENTO DENTÁRIO',
  subtitle: '(menor de idade)',
  fields: IDENT_MENOR,
  pages: [{
    blocks: [
      introMenor(['o clareamento dentário']),
      p(ANAMNESE_MENOR),
      ...CLAREAMENTO_CORPO.map(t => p(t)),
      p('Estou ciente de que o uso indiscriminado do gel clareador e falta de acompanhamento durante o tratamento pode trazer lesões irreversíveis aos dentes do paciente.'),
      p('Estou ciente dos riscos aos quais o(a) menor sob minha responsabilidade está sujeito(a), tais como: sensibilidade dentária durante a realização do clareamento dental; aparecimento/exacerbação de manchas brancas já aparentes ou não; queimaduras na gengiva em caso de extravasamento de gel clareador.'),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

const clareamento: ContractTemplate = {
  id: 'clareamento',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'CLAREAMENTO DENTÁRIO',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['o meu clareamento dentário'], ', recebi a apresentação do planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.'),
      p(ANAMNESE_ADULTO),
      ...CLAREAMENTO_CORPO.map(t => p(t)),
      p('Estou ciente de que o uso indiscriminado do gel clareador e falta de acompanhamento durante o tratamento pode trazer lesões irreversíveis aos dentes.'),
      p('Estou ciente dos riscos aos quais estou sujeito(a), tais como: sensibilidade dentária durante a realização do clareamento dental; aparecimento/exacerbação de manchas brancas já aparentes ou não; queimaduras na gengiva em caso de extravasamento de gel clareador.'),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// RESTAURAÇÃO DENTÁRIA
// ---------------------------------------------------------------------------

const FIELD_TIPO_RESTAURACAO = { id: 'tipoRestauracao', label: 'Tipo de restauração', width: 'lg' as const }
const FIELD_MATERIAL = { id: 'material', label: 'Material utilizado', width: 'lg' as const }

const restauracaoMenor: ContractTemplate = {
  id: 'restauracao-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'RESTAURAÇÃO DENTÁRIA',
  subtitle: '(menor de idade)',
  fields: [...IDENT_MENOR, F.dentes, FIELD_TIPO_RESTAURACAO, FIELD_MATERIAL],
  pages: [{
    blocks: [
      introMenor(
        ['o procedimento descrito no plano de tratamento e de planejamento de custos'],
        ', constante no prontuário do(a) menor de idade em questão de minha responsabilidade legal, cuja cópia encontra-se em meu poder e sob a minha guarda.',
      ),
      p(ANAMNESE_MENOR),
      p('O dente afetado pela cárie volta à sua forma e à sua função normal quando o dentista faz uma restauração. Estou ciente de que o profissional removerá a parte do dente que está deteriorada, promoverá limpeza da área atingida e, em seguida, preencherá a cavidade limpa com um material de restauração.'),
      p(
        'Ao fechar os espaços onde as bactérias podem se infiltrar, a restauração também ajuda a prevenir uma deterioração posterior. Assim, os materiais utilizados para as restaurações definitivas podem ser de ouro, de metais, de porcelana ou de resina composta (restauração da cor do dente). Para as restaurações provisórias, utiliza-se cimentos ou obturadores provisórios. Neste caso, será feita uma restauração do tipo ',
        f('tipoRestauracao'), ' no dente ', f('dentes'), ' com o material ', f('material'), '.',
      ),
      p('Estou ciente de que o(a) profissional irá indicar o melhor para o caso e, assim, a restauração será determinada pela extensão do preparo.'),
      p('Estou ciente de que, dependendo da extensão da lesão cariosa e/ou fratura, esse dente pode vir a necessitar de tratamento endodôntico (tratamento de canal) e novo planejamento.'),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

const restauracao: ContractTemplate = {
  id: 'restauracao',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'RESTAURAÇÃO DENTÁRIA',
  fields: [...IDENT_ADULTO, F.dentes, FIELD_TIPO_RESTAURACAO, FIELD_MATERIAL],
  pages: [{
    blocks: [
      introAdulto(
        ['o procedimento descrito no plano de tratamento e de planejamento de custos'],
        ', constante em meu prontuário, cuja cópia encontra-se em meu poder e sob a minha guarda.',
      ),
      p(ANAMNESE_ADULTO),
      p('O dente afetado pela cárie volta à sua forma e à sua função normal quando o dentista faz uma restauração. Estou ciente de que o profissional irá remover a parte do dente que está deteriorada, promoverá limpeza da área atingida e, em seguida, preencherá a cavidade limpa com um material de restauração. Estou ciente de que, dependendo da extensão da lesão cariosa e/ou fratura, esse dente pode vir a necessitar de tratamento endodôntico (tratamento de canal) e novo planejamento.'),
      p(
        'Ao fechar os espaços onde as bactérias podem se infiltrar, a restauração também ajuda a prevenir uma deterioração posterior. Os materiais utilizados para as restaurações definitivas podem ser de ouro, de metais, de porcelana ou de resina composta (restauração da cor do dente). Para as restaurações provisórias, utiliza-se cimentos ou obturadores provisórios. Neste caso, será feita uma restauração do tipo ',
        f('tipoRestauracao'), ' no dente ', f('dentes'), ' com o material ', f('material'), '.',
      ),
      p('Estou ciente de que o(a) profissional irá indicar o melhor para o caso e, assim, a restauração será determinada pela extensão do preparo.'),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// PRÓTESE DENTÁRIA
// ---------------------------------------------------------------------------

const protese: ContractTemplate = {
  id: 'protese',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'PRÓTESE DENTÁRIA',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['o meu tratamento de prótese dentária']),
      p(ANAMNESE_ADULTO),
      p(
        b('Prótese total removível:'),
        ' Conhecida como dentadura, a prótese total removível é recomendada para casos em que houve perda de todos os dentes. Ela é feita a partir de moldagens que reproduzem a anatomia da arcada superior (maxilar) e da arcada inferior (mandíbula) do paciente. A solução tem estrutura removível e possui dentes de resina mais resistentes. Estou ciente de que a prótese fica apoiada sobre a mucosa, ou seja, na gengiva, o que facilita a colocação e a retirada da boca. Contudo, havendo dificuldade de fixação, esse problema pode ser contornado com o uso de cremes fixadores. A fixação da prótese depende de fatores como qualidade óssea, por isso nem sempre é possível mantê-la fixa. Sabendo disso, entendo que, para casos como esse, a solução de prótese protocolo (com a associação de implantes para a fixação) é a mais indicada.',
      ),
      p('Tenho conhecimento de que a higienização das próteses também demanda cuidados. Como complementação, a limpeza pode ser feita com produtos efervescentes disponíveis no mercado, de acordo com a orientação de meu dentista.'),
      p(
        b('Prótese parcial removível:'),
        ' Esse tipo de prótese é utilizada em pacientes que possuem um número razoável de dentes remanescentes. Se há integridade desses dentes, não é necessário extrair ou desgastar os dentes que ainda estão em boca. No entanto, é necessário avaliar a saúde deles, pois servirão de apoio para a estrutura metálica da prótese, que, na maioria das vezes, será confeccionada com ligas de cobalto e cromo.',
      ),
      p('A manutenção dessas duas próteses não é complexa, já que a prótese é retirada com facilidade da boca. Mas vale ressaltar que é preciso realizar a limpeza após todas as refeições.'),
      p(
        b('Prótese fixa:'),
        ' pode ser de um ou de mais dentes, esta prótese é fixa com um pino, podendo ser realizada com diversos tipos de materiais. É necessário ter cuidado para com todas as próteses citadas, o cuidado é exclusivamente responsabilidade do paciente e, em caso de quebras e mau cuidado, será necessário fazer a confecção de uma nova prótese, assim como o pagamento desta.',
      ),
      p('É de meu conhecimento o dever de informar ao(à) profissional qualquer alteração em decorrência do tratamento realizado, insatisfações ou dúvidas sobre o tratamento em execução. Devo manter meus dados cadastrais sempre atualizados e informar eventuais mudanças de endereço, telefone etc.'),
      p(CERTIFICO),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

// ---------------------------------------------------------------------------
// IMPLANTE DENTÁRIO (2 páginas)
// ---------------------------------------------------------------------------

const implante: ContractTemplate = {
  id: 'implante',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'IMPLANTE DENTÁRIO',
  fields: IDENT_ADULTO,
  pages: [
    {
      blocks: [
        introAdulto(['o meu tratamento de implante dentário']),
        p(ANAMNESE_ADULTO),
        p('O implante dental é um método utilizado para substituir uma ou mais raízes perdidas, ou ausentes (agenesia), funcionando como uma base estável para uma futura prótese. Existem mais de um tipo de implante dental, sendo que somente após o estudo individual de cada caso é que se torna possível avaliar o tipo mais adequado àquele caso. O implante adere ao osso por meio da osseointegração, que é um processo natural onde o implante se integra/fixa ao tecido ósseo, fornecendo estabilidade similar aos dentes naturais e tornando possível proporcionar ao paciente dentes semelhantes aos naturais, como se assim o fossem.'),
        p('O tratamento é executado de acordo com um planejamento baseado em informações clínicas como o exame da cavidade bucal, análise facial e outras, advindas de documentação radiográfica dos arcos dentários e fotografias. Dentre as alternativas para a substituição de um ou mais dentes perdidos, ou ausentes, as mais comuns são via de regra prótese total (dentadura); prótese parcial removível a grampos; prótese fixa convencional sobre dentes; e prótese sobre implantes.'),
        p(
          b('Duração do implante dental:'),
          ' O implante dental é confeccionado com materiais de extrema resistência, entretanto é impossível saber o tempo de duração de implante, uma vez que depende de vários fatores, principalmente orgânicos do próprio paciente.',
        ),
        p('Há de se ressaltar que todos os problemas que envolvem a perda de um dente natural também podem ocorrer com o implante dental, tais como causas locais (ex.: acúmulo de bactérias ao redor do implante dental, desencadeando um processo inflamatório — perimplantite; uso indevido de instrumentos de limpeza; fatores mecânicos, químicos ou térmicos); causas sistêmicas (ex.: osteoporose, diabetes, tabagismo, consumo excessivo de álcool, consumo de drogas, pacientes que utilizam medicamentos contendo bifosfonato em sua fórmula); e sobrecarga ou trauma oclusal (mordida errada ou muito forte).'),
        p(
          b('Benefícios:'),
          ' o objetivo do tratamento é, dentro do possível, substituir os dentes perdidos ou faltantes, trazendo ao paciente os benefícios do restabelecimento das funções do aparelho mastigatório, um maior conforto, além do ganho estético.',
        ),
        p(
          b('Possíveis riscos:'),
          ' a intensidade e a amplitude dos riscos dependem das condições iniciais de cada caso e muito da resposta individual ao tratamento. Esta resposta é desconhecida e depende das condições biológicas e do envolvimento e participação do paciente no processo.',
        ),
        p('O paciente deve estar ciente, compreender e concordar que todo ato cirúrgico tem seus riscos inerentes. Além disso, no que diz respeito aos implantes dentários, as consequências podem ser: 1) desconforto pós-operatório e edema, o que pode requisitar alguns dias de repouso em casa; 2) hemorragia que pode persistir (sangramento prolongado); 3) danos a dentes, restaurações ou elementos protéticos próximos; 4) infecção pós-operatória, com necessidade de tratamento (custos) adicional(is); 5) trauma provocado pelos afastadores nos lábios, causando feridas e rachaduras nos lábios e nos cantos da boca (comissuras); 6) abertura da boca reduzida por alguns dias; 7) fratura maxilo-mandibular (quebra ou rompimento do osso da mandíbula ou da maxila); 8) em casos raros, pode ocorrer parestesia ou paresia da face (paralisia da musculatura da face) em função de algum nervo atingido na cirurgia, de maneira temporária ou permanente; 9) abertura do seio maxilar (cavidade anatômica situada acima dos dentes superiores); 10) reações alérgicas a medicamentos; 11) problemas de articulação têmporo-mandibular e problemas no mecanismo da osseointegração; 12) problemas inerentes à anestesia e seus riscos.'),
      ],
    },
    {
      blocks: [
        p('Uma vez iniciado o tratamento, é importante que ele seja finalizado, incluindo a reconstrução protética (colocação dos dentes) sobre os implantes, que deverá ocorrer após 5 a 8 meses da data da implantação. A quebra da sequência do tratamento pode ser prejudicial ao implante, que corresponde à raiz artificial do dente perdido, podendo acarretar a perda deste.'),
        p('Para minimizar os riscos do tratamento, a fim de garantir o sucesso dos implantes, o paciente deve observar rigorosamente as instruções pós-operatórias: seguir todas as instruções contidas nos impressos "ORIENTAÇÃO PRÉ-OPERATÓRIA" e "CUIDADOS NO PERÍODO PÓS-OPERATÓRIO". Não usar, sem autorização, nenhum tipo de prótese sobre a área operada, pois, se isso ocorrer, poderá perder os implantes. Durante os primeiros dias após a cirurgia, manter uma dieta alimentar exclusivamente líquida, não devendo fumar nem ingerir bebida alcoólica. Deverá tomar a medicação prescrita, cumprindo o horário, a dosagem e o tempo em dias determinado, objetivando atingir os efeitos desejados.'),
        p('Declaro ter sido informado(a) de que não existem garantias absolutas de que estes implantes e seus respectivos dentes artificiais irão manter-se estáveis durante toda a minha vida e de que o seu sucesso a longo prazo dependerá de uma manutenção regular. Entendo ainda que, em certos casos, uma pequena porcentagem dos implantes poderá ser perdida em decorrência de fatores como, por exemplo, má qualidade óssea ou infecções pós-operatórias. Nestes casos, poderá ser colocado um novo implante, após ocorrido um período para reparo ósseo no local.'),
        p('Dentro do prazo de 2 (dois) anos, caso ocorra a perda de um ou mais implantes, desde que não seja devido a fatores externos (paciente não seguir as recomendações pós-cirúrgicas, como alimentação e higienização adequadas, dentre outros, fornecidas ao paciente) ou fatores internos (rejeição, infecção, perda de enxerto, periimplantite, dentre outros), se a reposição deles for essencial para a instalação dos dentes artificiais, o paciente arcará com os custos do material empregado, sendo que caberá ao paciente a realização de nova cirurgia sem a cobrança de novos honorários.'),
        p(
          b('Problemas:'),
          ' as atividades na área de saúde, envolvendo a implantodontia, têm riscos e limitações; embora sejam exceções na prática clínica, é importante que você conheça problemas potenciais. Ocorrências importantes e não esperadas, ou qualquer anormalidade durante o tratamento, deverão ser comunicadas primeiramente ao profissional que está fazendo o tratamento.',
        ),
        p(b('Tempo de tratamento:'), ' Não há uma previsão exata, mas uma estimativa será fornecida individualmente.'),
        p('Estou ciente de fatores que podem afetar o sucesso de um implante dentário: doença gengival nos dentes vizinhos; fumar durante a cicatrização do implante; volume ósseo insuficiente para o implante dentário; condições de saúde do paciente; má higienização dentária — manutenção; infecção no local do implante (pus); micromovimentos de implantes dentais; suporte ósseo insuficiente para o implante odontológico; reação alérgica ao titânio do implante bucal; falha em seguir as instruções pós-operatórias da implantação; problemas tardios e falhas em implantes dentários.'),
        p('O paciente está ciente e se compromete a, após o encerramento do tratamento, comparecer ao consultório para o acompanhamento nos retornos agendados, que se darão, inicialmente a cada 6 (seis) meses, e, posteriormente, a cada 1 (um) ano. Nestes retornos, serão necessários os procedimentos de limpeza e raio-x, cujos valores não estão incluídos no presente contrato e serão cobrados de acordo com a tabela vigente à época.'),
        p('Caso o paciente não compareça aos retornos ou não cumpra os demais deveres acima expostos, o profissional ou clínica não poderá ser responsabilizado(a) por possíveis danos causados.'),
        p(CERTIFICO_2),
        dateLine(),
        sign(ASSINATURAS_PACIENTE),
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// TRATAMENTO PERIODONTAL
// ---------------------------------------------------------------------------

const periodontal: ContractTemplate = {
  id: 'periodontal',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'TRATAMENTO PERIODONTAL',
  fields: IDENT_ADULTO,
  pages: [{
    blocks: [
      introAdulto(['o meu tratamento periodontal']),
      p('Este profissional deverá realizar o meu procedimento periodontal, que consiste na remoção de tártaro, placa bacteriana e superfície da raiz do dente contaminado (sob a gengiva). Será realizada a remoção desses fatores do dente por meio de aparelhos como o ultrassom, o jato de bicarbonato e as curetas manuais.'),
      p(ANAMNESE_ADULTO),
      p('O procedimento será realizado no consultório do dentista acima referido e sob cooperação do paciente, seguindo a orientação de higiene bucal feita pelo dentista.'),
      p('O procedimento é feito através de avaliação clínica e radiológica (raio-x) durante e após o tratamento, anestesia local, remoção do tártaro supragengival com ultrassom, remoção da placa bacteriana com jato de bicarbonato, raspagem de superfície da raiz do dente com curetas. Caso seja necessário, será feita uma cirurgia periodontal, onde será feito um corte na gengiva, exposição da raiz e osso ao redor dos dentes, para completa remoção do tártaro com curetas, em seguida sutura (pontos) e colocação do curativo cirúrgico. Esse tratamento poderá ser realizado em uma ou mais sessões de acordo com a complexidade do tratamento. Estou ciente que minha cooperação é extremamente importante para o sucesso do tratamento.'),
      p('Entendo que, mesmo havendo total comprometimento do profissional, pode haver perda dentária nos elementos tratados.'),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_PACIENTE),
    ],
  }],
}

const periodontalMenor: ContractTemplate = {
  id: 'periodontal-menor',
  group: EIXO,
  eyebrow: EYEBROW,
  title: 'TRATAMENTO PERIODONTAL',
  subtitle: '(menor de idade)',
  fields: IDENT_MENOR,
  pages: [{
    blocks: [
      introMenor(
        ['o procedimento periodontal necessário no paciente menor de idade'],
        ', citado acima, o(a) qual encontra-se sob minha responsabilidade legal.',
      ),
      p('Este procedimento consiste na remoção de tártaro, placa bacteriana e superfície da raiz do dente contaminado (por baixo da gengiva). Será realizada a remoção desses fatores do dente com aparelho de ultrassom, jato de bicarbonato e curetas.'),
      p('Fui orientado(a) quanto ao planejamento do tratamento e de custos, cuja cópia encontra-se em meu poder e sob a minha guarda.'),
      p(ANAMNESE_MENOR),
      p('O tratamento periodontal é feito através de avaliação clínica e radiológica (raio-x) durante e após o tratamento, anestesia local, remoção do tártaro supragengival com ultrassom, remoção da placa bacteriana com jato de bicarbonato, raspagem de superfície da raiz do dente com curetas. Caso seja necessário, será feita uma cirurgia periodontal, onde será feito um corte na gengiva, exposição da raiz e osso ao redor dos dentes, para completa remoção do tártaro com curetas, em seguida sutura (pontos) e colocação do curativo cirúrgico. Esse tratamento poderá ser realizado em uma ou mais sessões de acordo com a complexidade do tratamento.'),
      p('O procedimento será realizado no consultório do(a) dentista acima referido(a) e sob cooperação do paciente, seguindo a orientação de higiene bucal feita pelo(a) dentista.'),
      p('Paciente e responsável legal estão cientes de que a cooperação do(a) paciente é extremamente importante para o sucesso do tratamento.'),
      p('Entendo que, mesmo havendo total comprometimento do profissional, pode haver perda dentária nos elementos tratados.'),
      p(CERTIFICO_2),
      dateLine(),
      sign(ASSINATURAS_RESPONSAVEL),
    ],
  }],
}

export const TERMOS_PARTE_1: ContractTemplate[] = [
  endodontia,
  endodontiaMenor,
  clareamento,
  clareamentoMenor,
  restauracao,
  restauracaoMenor,
  protese,
  implante,
  periodontal,
  periodontalMenor,
]
