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

mais o QR do lote à esquerda (opcional, nos ajustes). É o que o art. 81 pede:
data, lote/ciclo, responsável e identificação do equipamento.

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
| Texto deitado ou de cabeça para baixo | Giro na impressora (0/90/180/270°) |
| Etiqueta cortada nas laterais | Comprimento e largura útil em mm |
| Muito clara ou borrada | Densidade (1 a 5) |
| Saiu só uma etiqueta em vez de 20 | Marque "reenviar o desenho a cada cópia" |

A quantidade vai num comando só e a impressora repete o desenho sozinha — 20
etiquetas não são 20 envios por Bluetooth, que levariam minutos.

Se o Bluetooth não colaborar, **Baixar PNG** salva a etiqueta no tamanho exato
para imprimir pelo app da Niimbot. Nesse caminho o ciclo não é registrado — o
registro nasce da impressão pelo VitallCam.

## Reimpressão

Clicar num cartão reabre aquele lote para imprimir mais etiquetas. Não abre
ciclo novo e não muda o número: as etiquetas extras pertencem ao mesmo ciclo,
que é justamente o que mantém a rastreabilidade de pé.
