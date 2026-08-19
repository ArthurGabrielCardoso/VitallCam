// Orientações odontológicas — folhas de cuidados entregues ao paciente.
// Não têm campos de qualificação: são listas de instruções impressas.

import { ContractTemplate, ContractField, f, p, ul, ol } from './types'

const EIXO = 'orientacoes-odontologicas' as const

/** Todas as orientações permitem identificar o paciente e a data no rodapé. */
const IDENT_ORIENTACAO: ContractField[] = [
  { id: 'paciente', label: 'Nome do paciente', width: 'full', fromPatient: 'name' },
  { id: 'localData', label: 'Cidade', width: 'md', clinic: true },
  { id: 'dia', label: 'Dia', width: 'xs' },
  { id: 'mes', label: 'Mês', width: 'sm' },
  { id: 'ano', label: 'Ano', width: 'xs' },
]

const extracao: ContractTemplate = {
  id: 'orientacoes-extracao',
  group: EIXO,
  eyebrow: 'Orientações após',
  title: 'EXTRAÇÃO DENTÁRIA',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['Repouse após a extração — é essencial, principalmente nos primeiros 3 dias;'],
        ['Evite falar muito;'],
        ['Mantenha a cabeça mais elevada do que o resto do corpo por um período de 24 horas após a cirurgia de extração;'],
        ['Não fique exposto ao sol;'],
        ['Evite atividades físicas;'],
        ['Evite banhos muito quentes nos 5 primeiros dias;'],
        ['Não deixe de se alimentar, mas evite alimentos que possam ferir a área operada. Evite alimentos quentes nos primeiros dois dias após a cirurgia, portanto prefira os gelados ou frios para prevenir possíveis sangramentos;'],
        ['A alimentação deve ser líquida ou pastosa, morna/fria nos 2 primeiros dias, fracionada de 3 em 3 horas (ex.: leite, sucos, vitaminas, sorvetes, picolés, mingau, iogurtes, gelatina, sopas, caldos, purês, alimentos batidos no liquidificador, macarrão, etc.);'],
        ['Não faça movimentos de sucção. Nesses dias, é importante não usar canudos e até garrafinhas para ingerir os líquidos. A dica é utilizar um copo para beber;'],
        ['Higienize a área operada, sempre na frente do espelho, utilizando corretamente o fio dental e a escova de dentes com cerdas macias, com quantidade reduzida de creme dental, para que se forme pouca espuma;'],
        ['Utilize um cotonete embebido de água filtrada ou enxaguante bucal sem álcool, à base de clorexidina, como auxiliar para remover os restos de alimentos que ficam retidos nos pontos. Escove o dorso da língua. Não deixe que os pontos fiquem brancos;'],
        ['Não bocheche vigorosamente nos 4 primeiros dias. Apenas lave a boca com água, banhando a área operada cuidadosamente e cuspa para remover a espuma da pasta de dentes. Assim, é possível evitar possíveis sangramentos;'],
        ['Não fique cuspindo por qualquer motivo;'],
        ['Nos 2 primeiros dias, coloque compressas geladas próximas à região operada, utilizando um saco plástico e grande quantidade de gelo, protegendo a pele com uma toalha fina. As compressas de gelo deverão ser feitas por 20 minutos, seguidos, obrigatoriamente, de um período de descanso de outros 20 minutos; após esse período, faça uma nova aplicação de gelo por mais 20 minutos e assim por diante, até 24 horas, para evitar possíveis inchaços;'],
        ['Não passe a língua, dedo ou qualquer objeto na área operada. Esse descuido pode atrapalhar e aumentar o tempo do processo de cicatrização da extração dentária;'],
        ['É normal ter a sensação de gosto de sangue com saliva na boca e ter um sangramento pequeno na primeira noite, podendo inclusive manchar a roupa de cama. Para evitar que isso ocorra, durma com 2 travesseiros;'],
        ['Se for fumante, tente não fumar, ou ao menos reduza a quantidade de cigarros até a cicatrização do corte;'],
        ['Não faça a ingestão de bebidas alcoólicas de nenhuma espécie;'],
        ['A prescrição medicamentosa deve ser seguida à risca, os horários das medicações devem ser rigorosamente respeitados. Em caso de dor forte ou febre, entre em contato com o seu cirurgião-dentista o mais breve possível;'],
        ['Não deixe de comparecer à consulta de retorno para a remoção dos pontos e avaliação da cicatrização;'],
        ['Não tome nenhum medicamento por conta própria. O seu cirurgião-dentista é o profissional mais habilitado para esclarecer as suas dúvidas.'],
      ),
    ],
  }],
}

const clareamentoCaseiro: ContractTemplate = {
  id: 'orientacoes-clareamento-caseiro',
  group: EIXO,
  eyebrow: 'Orientações para',
  title: 'CLAREAMENTO DENTAL CASEIRO',
  fields: [
    ...IDENT_ORIENTACAO,
    { id: 'horasGel', label: 'Horas de uso do gel', width: 'xs' },
  ],
  pages: [{
    blocks: [
      ol(
        ['Após escovar os dentes e fazer uso do fio dental, aplique o gel clareador na parte interna da moldeira. Uma pequena gota é o suficiente para a superfície de cada dente;'],
        ['Encaixe a moldeira nos dentes e pressione levemente para envolvê-los com gel;'],
        ['Com o dedo ou cotonete, remova o excesso de gel. O ideal é que não haja excesso de gel na moldeira;'],
        ['Utilize o gel por ', f('horasGel'), ' horas;'],
        ['Após a utilização, enxágue bem a boca;'],
        ['Em caso de desconforto ou sensibilidade excessiva, comunique nossa equipe;'],
        ['É normal, durante o clareamento, sentir sensibilidade nos dentes, principalmente durante variações de temperatura. Esta sensibilidade pode diminuir ao utilizar o creme dental para sensibilidade;'],
        ['Pode ocorrer leve irritação na gengiva, garganta, língua ou lábios, geralmente em decorrência do uso excessivo de gel;'],
        ['Recomenda-se evitar a ingestão de bebidas ou alimentos ácidos durante o tratamento. Também procure evitar as bebidas coradas, como os refrigerantes, os vinhos, os sucos artificiais, os chás e o café;'],
        ['Qualquer dúvida entre em contato, será sempre um prazer atendê-lo(a).'],
      ),
    ],
  }],
}

const aparelhoDentario: ContractTemplate = {
  id: 'orientacoes-aparelho-dentario',
  group: EIXO,
  eyebrow: 'Orientações sobre o uso do',
  title: 'APARELHO DENTÁRIO',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['Escove os dentes imediatamente após as refeições;'],
        ['Use escova de cerdas macias, escovas interdentais e escovas próprias para aparelho;'],
        ['O ideal é utilizar o passa-fio para facilitar o uso do fio dental;'],
        ['A partir do momento em que se coloca aparelho fixo, o paciente não deve mais utilizar os dentes anteriores (da frente) para cortar os seguintes alimentos: maçã, cenoura, sanduíches mais consistentes, carnes, balas, etc;'],
        ['Evite alimentos pegajosos (chicletes, balas de goma, caramelo, etc.) ou duros (pé de moleque, rapadura, amendoim, castanhas, nozes, pipoca, etc.);'],
        ['Se o seu aparelho possuir borrachinhas (ligaduras), elas amarelam/escurecem com o tempo e de acordo com sua dieta. Então, para manter a cor das borrachinhas por mais tempo, tente evitar consumo excessivo de alimentos muito corados;'],
        ['É normal sentir uma sensibilidade nos 3 (três) primeiros dias após as ativações do aparelho. Se houver dificuldade para mastigar o alimento, recomendam-se alimentos líquidos e pastosos como sopas, caldos e purê. O nível de sensibilidade à dor varia de pessoa para pessoa;'],
        ['Em caso de quebra do aparelho ortodôntico, entre em contato conosco e guarde as peças soltas. Tome cuidado para não ingerir nenhuma peça que tenha soltado;'],
        ['No início, o aparelho ortodôntico pode incomodar um pouco as bochechas, lábio e língua. Isso ocorre em função de uma reação normal do organismo a um corpo estranho, sendo que com o tempo essa reação desaparece. Para evitar, utilize a cera ortodôntica fornecida com o kit que recebeu;'],
        ['Se algo estiver o machucando, não tente remover por conta própria. Entre em contato com a clínica;'],
        ['Venha à consulta periodicamente para a prevenção de cáries e doenças gengivais.'],
      ),
    ],
  }],
}

const implante: ContractTemplate = {
  id: 'orientacoes-implante',
  group: EIXO,
  eyebrow: 'Orientações após a instalação de',
  title: 'IMPLANTE DENTÁRIO',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['Após a cirurgia de instalação do implante, recomenda-se fazer compressa gelada na parte externa do lado operado;'],
        ['Evitar alimentos duros ou crocantes, quentes e ácidos, optando, nas primeiras 48h, por alimentos frios, líquidos e pastosos, como açaí, sucos e sorvetes;'],
        ['Não utilizar a região operada para mastigar, pois podem ocorrer lesões nos tecidos e prejudicar a cicatrização, além de acumular resíduos, dificultando a higienização;'],
        ['Os cuidados com a higiene bucal devem ser redobrados após a cirurgia. Portanto, deve-se aplicar movimentos leves e suaves para não agredir os tecidos. Nos primeiros 3 dias, o ideal é evitar o uso da escova diretamente no local do procedimento para não comprometer a cicatrização;'],
        ['Evitar a exposição ao sol, pois o calor causa a dilatação dos vasos sanguíneos e pode aumentar o sangramento;'],
        ['Dormir com a cabeça um pouco mais elevada para reduzir o sangramento. Jamais fique de bruços ou pressionando a área operada;'],
        ['Após a cirurgia de implante dentário, deve-se fazer uso de analgésicos, anti-inflamatórios e antibióticos prescritos pelo dentista. O objetivo é aliviar dores e desconfortos, além de favorecer o processo de cicatrização e um melhor pós-operatório;'],
        ['Retornar ao dentista uma semana após o procedimento para uma avaliação na qual o profissional acompanhará a recuperação e removerá os pontos.'],
      ),
      p('Atenção: mesmo após a total recuperação, o paciente deve manter a rotina de consultas periódicas, conforme recomendações do dentista.'),
    ],
  }],
}

const protese: ContractTemplate = {
  id: 'orientacoes-protese',
  group: EIXO,
  eyebrow: 'Orientações após a instalação de',
  title: 'PRÓTESE DENTÁRIA',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      { t: 'p', c: ['As próteses dentárias, fixas ou móveis, têm grande durabilidade, porém necessitam de cuidados especiais para garantir a sua longevidade:'], italic: true, align: 'center' },
      ul(
        ['Cuidado na hora de inserir e remover a prótese;'],
        ['Para higienização da prótese podem ser usadas pastilhas, bicarbonato ou hipoclorito. Vale ressaltar que estes usos devem ser feitos a partir de indicações específicas do profissional, de acordo com o tipo de prótese;'],
        ['Recomenda-se que a alimentação apresente itens mais fáceis de mastigar. Na fase em que a prótese já está ajustada e adaptada à estrutura bucal, é possível seguir com a alimentação normal graças ao aumento da eficiência mastigatória. Para os alimentos pegajosos e muito duros, é preciso atenção e cuidado;'],
        ['Após a adaptação, recomenda-se remover a prótese ao dormir;'],
        ['Mantenha sempre uma higiene bucal adequada;'],
        ['A prótese fixa deve ser higienizada com o uso de escovas dentais, fio ou fita dental. Se necessário, utilizar o auxílio de passadores de fio dental ou fios com a ponta endurecida e escovas interdentais;'],
        ['A prótese removível deve ser lavada após todas as refeições utilizando escovas macias, sabão neutro ou pasta de dente. Evite usar qualquer tipo de pó para polir;'],
        ['Não deixe de ir ao dentista: o profissional consegue ter um acompanhamento eficaz do tratamento, avaliando a oclusão, mucosas e manutenção da prótese.'],
      ),
    ],
  }],
}

const restauracao: ContractTemplate = {
  id: 'orientacoes-restauracao',
  group: EIXO,
  eyebrow: 'Orientações após',
  title: 'RESTAURAÇÃO DENTÁRIA',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      p({ b: 'Mastigue devagar e morda levemente:' }, ' a mordida exerce uma enorme pressão nos dentes e isto pode fazer com que fiquem doloridos após uma restauração. Ao mastigar seu alimento, faça-o devagar e com cuidado;'),
      p({ b: 'Evite alimentos pegajosos:' }, ' comer alimentos pegajosos pode, em casos raros, soltar a nova restauração, portanto é melhor evitá-los por um período de tempo;'),
      p({ b: 'Evite bebidas muito quentes ou muito frias:' }, ' temperaturas moderadas são menos propensas a desencadear dor em dentes sensíveis;'),
      p({ b: 'Evite doces:' }, ' alimentos açucarados e refrigerantes provocam sensibilidade em algumas pessoas e podem promover o crescimento de bactérias em torno das restaurações;'),
      p({ b: 'Não mastigue nozes, balas duras ou gelo:' }, ' além de causar uma pressão indevida sobre os dentes enquanto eles ainda estão se recuperando, morder alimentos duros pode soltar a nova restauração que ainda não está devidamente acomodada. Isto é particularmente importante para as restaurações metálicas (amálgama), pois elas levam mais tempo para acomodar do que as restaurações de resina (da cor do dente).'),
    ],
  }],
}

const canal: ContractTemplate = {
  id: 'orientacoes-canal',
  group: EIXO,
  eyebrow: 'Orientações após',
  title: 'TRATAMENTO DE CANAL',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['Evite alimentos sólidos nas primeiras horas após o tratamento de canal. Durante a mastigação, existe o risco de morder a bochecha, língua ou lábios em decorrência do efeito da anestesia;'],
        ['É preferível o consumo de alimentos à base de líquidos até cessar o efeito do anestésico;'],
        ['Não mastigue com o dente tratado até que seja realizada a restauração definitiva;'],
        ['Após o tratamento de canal, é realizado um curativo provisório para que o dente não fique aberto até a realização da restauração definitiva;'],
        ['Os curativos provisórios não possuem a resistência necessária para proteger o dente tratado de uma fratura e podem, inclusive, se deslocar durante a mastigação, permitindo a infiltração de bactérias nos canais radiculares. Para evitar que isso ocorra, a restauração definitiva deve ser feita o mais rápido possível e o paciente não deve mastigar com o dente tratado até a sua realização;'],
        ['Os dentes e os tecidos ao redor do dente tratado podem apresentar sensibilidade, reação normal e passageira decorrente do processo inflamatório. Nessa hipótese, o paciente pode fazer uso das medicações receitadas pelo cirurgião-dentista. Caso não cesse a dor, o profissional responsável pelo tratamento deve ser informado, para que seja possível avaliação e conduta adequada ao caso;'],
        ['É importante que o paciente realize o controle clínico (através de exames radiográficos) de 6 em 6 meses. Para dentes que apresentam lesão apical, esse controle radiográfico deve ser feito até que os sinais de lesão diminuam ou desapareçam, no período de 2 anos.'],
      ),
    ],
  }],
}

const periodontal: ContractTemplate = {
  id: 'orientacoes-periodontal',
  group: EIXO,
  eyebrow: 'Orientações após',
  title: 'TRATAMENTO PERIODONTAL',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['A necessidade de manter a frequência dessas consultas depende das bolsas gengivais residuais e da complexidade do caso;'],
        ['O sucesso do tratamento gengival será garantido se o paciente tiver uma adequada higiene bucal diária, prevenindo assim o reaparecimento da inflamação gengival por um novo biofilme bacteriano;'],
        ['Para evitar que a inflamação reapareça, os cuidados com o profissional especialista não devem deixar de acontecer;'],
        ['Após a alta do paciente, os intervalos das consultas de manutenção periódica costumam ser de três, quatro ou seis meses. A frequência depende da qualidade da higiene bucal, complexidade do caso, presença de fatores modificadores (como diabetes e fumo, por exemplo) e da resposta individual de cada paciente;'],
        ['As sequelas conhecidas da doença periodontal são o aparecimento de espaços negros entre os dentes e uma sensibilidade perceptível em superfícies radiculares expostas. No primeiro caso, por conta da perda óssea, a gengiva — após cicatrizar — reduz o inchaço e toma sua posição real, que está diminuída, acompanhando a altura óssea, também reduzida;'],
        ['É importante saber que para a realização deste tratamento (periodontal) o paciente será anestesiado. Em geral, uma gengiva inflamada é mais sensível do que uma gengiva saudável, por isso a importância da anestesia;'],
        ['A sensibilidade após as raspagens geralmente desaparece após alguns meses.'],
      ),
    ],
  }],
}

const aparelhoInvisivel: ContractTemplate = {
  id: 'orientacoes-aparelho-invisivel',
  group: EIXO,
  eyebrow: 'Instruções de uso de',
  title: 'APARELHO INVISÍVEL',
  fields: IDENT_ORIENTACAO,
  pages: [{
    blocks: [
      ul(
        ['Enxágue os alinhadores com ', { b: 'água fria' }, ' ao removê-los da embalagem pela primeira vez;'],
        ['Insira os seus alinhadores colocando-os sobre os dentes anteriores (frente) para depois encaixar nos dentes posteriores (atrás), aplicando uma ', { b: 'pressão suave' }, ' e uniforme sobre os molares até que o alinhador se encaixe no lugar;'],
        [{ b: 'Não' }, ' encaixe os alinhadores ', { b: 'mordendo-os' }, ';'],
        ['É normal que os alinhadores novos encaixem de forma mais justa e apliquem pressão sobre os dentes. Essa pressão deve diminuir à medida que o tratamento for avançando nas etapas planejadas;'],
        ['Para remover os alinhadores, comece usando a ponta dos dedos no molar (dente posterior) de um lado e puxe cuidadosamente o aparelho invisível, afastando-o do dente. Repita este movimento do outro lado antes de tentar remover o alinhador por completo. Assim que ambos os lados estiverem soltos, será possível desencaixar o alinhador de trás para frente;'],
        [{ b: 'Não' }, ' use ', { b: 'força excessiva' }, ' para dobrar ou torcer o alinhador, no intuito de removê-lo;'],
        [{ b: 'Não' }, ' tente usar um ', { b: 'objeto afiado' }, ' para remover os seus alinhadores;'],
        ['Se você achar que seus alinhadores são extremamente difíceis de remover, informe o seu dentista;'],
        ['Durante o tratamento, use os seus alinhadores por pelo menos ', { b: '22 horas todos os dias' }, ';'],
        ['Sempre que colocar os alinhadores, observe se há trincas ou deformidades. Se encontrar algo, comunique o seu dentista;'],
        ['Certifique-se de estar usando o aparelho que o seu dentista instruiu usar. Os conjuntos vêm assinalados com o número da etapa, além de um "U" para os dentes superiores e um "L" para os inferiores;'],
        ['Você pode ter uma leve alteração de fala enquanto a sua língua se ajusta aos alinhadores. Isso geralmente desaparece em alguns dias;'],
        ['Se sentir a boca seca, beba um pouco de água;'],
        ['Retire os alinhadores para comer. Enxágue e guarde-os em um local seguro;'],
        ['Escove os dentes e use o fio dental após cada refeição para evitar que os alimentos e bebidas fiquem retidos no alinhador;'],
        ['Não deixe que os alinhadores entrem em contato com álcool, líquidos quentes, doces ou coloridos;'],
        ['Não permita que animais domésticos e crianças tenham acesso aos seus alinhadores;'],
        ['Não jogue fora os alinhadores antigos até a liberação do seu dentista.'],
      ),
    ],
  }],
}

export const ORIENTACOES_ODONTOLOGICAS: ContractTemplate[] = [
  extracao,
  canal,
  implante,
  protese,
  restauracao,
  periodontal,
  clareamentoCaseiro,
  aparelhoDentario,
  aparelhoInvisivel,
]
