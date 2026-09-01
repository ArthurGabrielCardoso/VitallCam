# Etiquetas de esterilização (RDC Anvisa 1.002/2025)

Rota nova na sidebar: **Esterilização** → `/patients/esterilizacao`.

Cartões horizontais agrupados por data, como as radiografias. Cada cartão é um
ciclo da autoclave. O botão **Novo ciclo** abre a etiqueta já preenchida — data
de hoje, validade em 3 meses, Autoclave 01, Jéssica Pádua e o número do ciclo do
dia (primeiro do dia = `01`, segundo = `02`). Só falta dizer quantas etiquetas.

Lote no formato **MMDD-NN**: em 31/08, o primeiro ciclo é `0831-01`.

## O que sai impresso

```
LOTE 0831-01
EST 31/08/2026  ·  VAL 30/11/2026
AUTOCLAVE 01 · JÉSSICA PÁDUA
```

com a marca da clínica à esquerda. É o que o art. 81 pede: data, lote/ciclo,
responsável e identificação do equipamento.

**O indicador químico tipo 1 não vem daqui.** Papel térmico não é reagente. Ele
continua vindo da borda do papel grau cirúrgico (a listra que muda de cor) ou da
fita zebrada. A etiqueta cuida da rastreabilidade; o pacote cuida do indicador.

## Antes de rodar

1. Rode a migration `supabase/migrations/20260831_add_esterilizacao_ciclos.sql`
   no Supabase. Sem ela a tela avisa e não grava ciclo nenhum.
2. Use rolos de etiqueta **resistentes à autoclave**. O papel térmico comum
   (cupom fiscal, etiqueta de correio) fica preto a 121 °C.
3. Para imprimir sem conectar, atualize o APK: a impressão nativa mora em
   `android-app/.../EtiquetaNiimbot.kt` e chega pela ponte `VitallCam`.
   Na primeira impressão o Android pede a permissão de Bluetooth — uma vez só.

## Impressão na Niimbot

**No app da clínica (APK): um toque.** O app guarda o endereço da Niimbot na
primeira vez que a encontra e mantém a conexão de pé enquanto estiver aberto.
Depois disso é abrir o ciclo, dizer 15 e apertar imprimir — sem seletor, sem
parear, sem conectar. A primeira impressão pode levar alguns segundos
procurando a impressora; da segunda em diante sai na hora. O chip no topo da
tela mostra qual impressora está salva, com um **trocar** para procurar de novo
quando a clínica trocar de aparelho.

**No navegador (Chrome/Edge, https): tem seletor.** É regra do Chrome, não
escolha nossa — nenhuma página fala com um aparelho Bluetooth que o usuário não
apontou naquela sessão. Serve para abrir a tela no notebook; na bancada, use o
app.

A Niimbot não tem driver de sistema nem SDK público: o protocolo aqui é o
mapeado pela comunidade (niimprint, NiimBlue), então a primeira etiqueta na
bancada é o teste de verdade. Os **Ajustes do rolo e da impressora**, dentro do
modal, existem para resolver o que aparecer, sem mexer no código:

| Sintoma na primeira etiqueta | Ajuste |
| --- | --- |
| **Andou em branco, sem nada impresso** | Família da impressora (D110 / B21 / B1) |
| Texto deitado ou de cabeça para baixo | Giro na impressora (0/90/180/270°) |
| Etiqueta cortada, ou andou duas para um pedido | Comprimento e largura útil em mm — meça o rolo |
| Muito clara ou borrada | Densidade (1 a 5) |
| Saiu só uma etiqueta em vez de 20 | Marque "reenviar o desenho a cada cópia" |

**Etiqueta em branco é quase sempre a família.** Cada geração de Niimbot espera
um comando de tamanho de página diferente (a D110 lê 2 bytes; a B21, 4; a B1,
6). Com o formato errado a impressora aceita o trabalho, anda o papel e descarta
o desenho — sai em branco, sem erro nenhum. O botão **Imprimir teste** manda
tarja preta e xadrez, sem texto, sem QR e sem gravar ciclo: se a tarja sai, os
dados chegam à cabeça térmica e o resto é ajuste de tamanho; se não sai, troque
a família e teste de novo. São três opções — no máximo três tentativas.

A quantidade vai num comando só e a impressora repete o desenho sozinha — 20
etiquetas não são 20 envios por Bluetooth, que levariam minutos.

### Quando o app não acha a impressora

Nesta ordem, que é a dos casos que realmente acontecem:

1. **Bluetooth do tablet ligado?** O app avisa se estiver desligado.
2. **Localização ligada?** Até o Android 11 o sistema exige a localização ativa
   para devolver qualquer resultado de varredura Bluetooth — sem ela a busca
   volta vazia mesmo com a impressora acesa ao lado. O app avisa também.
3. **A impressora está conectada em outro lugar?** App da Niimbot aberto, ou a
   mesma tela aberta no Chrome com a impressora conectada: ela aceita uma
   conexão por vez. Feche o outro e tente de novo.
4. **Permissão negada com "não perguntar de novo"?** Ajustes do Android → Apps →
   VitallCam → Permissões → Dispositivos por perto.

Se o Bluetooth não colaborar, **Baixar PNG** salva a etiqueta no tamanho exato
para imprimir pelo app da Niimbot. Nesse caminho o ciclo não é registrado — o
registro nasce da impressão pelo VitallCam.

## Cada pacote tem identidade própria

Um ciclo de dez etiquetas são **dez pacotes**, não dez cópias. O código impresso
é `LOTE-NN`: `0901-02-03` é o terceiro pacote do segundo ciclo do dia 1º de
setembro. Ao lado do lote vai um QR com esse mesmo código.

Isso existe por uma razão prática: se cinco pacotes foram para a Maria e cinco
para o João, saber que "o lote foi para os dois" não serve de nada. Com o pacote
identificado, um indicador biológico positivo três dias depois responde **quem
recebeu material daquele ciclo** — em vez de obrigar a ligar para todo mundo que
passou pela cadeira naquele dia.

Na ficha do paciente há uma seção **Esterilização**: a auxiliar lê o QR da
etiqueta ao abrir o pacote na cadeira (ou digita o código) e o pacote fica ligado
àquele paciente. Pacote de ciclo reprovado é recusado no ato — o momento de
descobrir que a carga não presta é antes de abrir, não na auditoria.

A leitura usa o detector de códigos do próprio navegador, sem biblioteca nova.
Onde ele não existir, a tela diz para digitar em vez de fingir que está lendo.

## O registro do ciclo (o que a fiscalização pede)

A etiqueta prova que o ciclo existiu. Ela não prova que ele **deu certo** — e é
isso que a inspeção verifica. O roteiro do fiscal é: pegar um pacote qualquer do
estoque, ler o lote na etiqueta e pedir o registro daquele dia e ciclo, para
conferir se o teste biológico foi feito e se deu negativo.

Por isso a tela tem, além das etiquetas:

- **Busca pelo lote.** Digite o número que está no pacote e o ciclo aparece
  inteiro — é o caminho do fiscal, na mesma ordem em que ele pergunta.
- **Resultado do ciclo.** Integrador químico classe 5 ou 6 (a norma pede em
  pacote-teste a cada ciclo) e indicador biológico. A carga só é marcada como
  **liberada** com integrador conforme e biológico negativo; reprovada, o app
  avisa para recolher e reprocessar.
- **Aviso do teste biológico.** A norma pede semanal, no primeiro ciclo do dia
  programado. Os dias desde o último ficam sempre à vista, em vermelho depois de
  sete — descobrir o atraso no dia da visita é tarde demais.
- **Resumo do dia.** Ciclos e pacotes de hoje e do mês, e quantos ciclos ainda
  estão sem conferência. Uma etiqueta é um pacote de grau cirúrgico, então
  "10 pacotes hoje" é literalmente o que saiu da autoclave.

Cada cartão mostra a hora do ciclo e o selo da situação: *Conferir*, *Liberado*
ou *Reprovado*.

### Validade dos pacotes

A norma admite **até seis meses** para a validade da esterilização, com a
embalagem íntegra, seca e bem guardada. A clínica usa três meses, que é mais
conservador e força a recirculação — o campo é editável ciclo a ciclo.

## Reimpressão

Clicar num cartão reabre aquele lote para imprimir mais etiquetas. Não abre
ciclo novo e não muda o número: as etiquetas extras pertencem ao mesmo ciclo,
que é justamente o que mantém a rastreabilidade de pé.
