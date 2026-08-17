# Agente de suporte — até onde ele age sozinho

> **Status: PROPOSTA. Nada aqui está implementado, e nada será, antes do aceite
> do Diretor Geral.** Ordem expressa: *"não implemente ação nenhuma antes de eu
> ver essa lista."*
>
> Escrito pelo Diretor do Foocci em 15/08/2026, depois de consertar a cegueira da
> sonda (o item que vinha antes deste, e por bom motivo).

---

## O princípio, em uma frase

**O agente pode fazer sozinho aquilo cujo pior resultado é ele ter perdido o
próprio tempo.** Tudo cujo pior resultado aparece para o cliente do restaurante,
para o dinheiro, ou para um dado que não volta, tem humano no caminho — sempre,
em qualquer degrau da escada.

Essa é a linha, e ela não é sobre confiança no modelo: é sobre **quem paga o
erro**. Um agente que erra sozinho e o erro morre num log é um agente barato. Um
agente que erra sozinho e o erro chega no WhatsApp do cliente do lojista é uma
crise, e a Foocci não tem como desfazer mensagem enviada.

---

## O estado de hoje, para a proposta não ser lida no vácuo

O agente **não executa nada**, e isso é por construção, não por acaso:

| Peça | Onde | Estado |
|---|---|---|
| Escada de remediação ("engenheiro de plantão") | `SupportRemediationLadder.ts` | `SHADOW_ONLY`, hard-coded. Duas ações no catálogo, as duas `enabled: false` |
| Escada de ação ("braço direito do dono") | `SupportActionCatalog.ts` | `SHADOW_ONLY`, hard-coded. Uma ação, `enabled: false` |
| Portão que impede o agente de *dizer* que executou | `helpAssistant` + `SupportIncidentReasoner` | **ligado** — fala em pretérito sem execução registrada não chega ao lojista |

Ou seja: a lista abaixo não liga nada. Ela define **o que poderia ser ligado, e
em que ordem** — para o dia em que alguém for ligar não improvisar o critério.

---

## Nível 0 — sempre ligado, sem pedir licença

Já é assim hoje e não muda. São operações **de leitura ou de texto**: o pior
resultado é uma resposta ruim, que o lojista lê e ignora.

- diagnosticar e explicar;
- sondar o estado do sistema **daquele restaurante** (read-only, sem chamada
  externa) — o que foi consertado em 15/08;
- recuperar guias do manual e runbooks;
- **abrir chamado** e escalar para humano;
- dizer "não sei" e "não consigo verificar agora".

> **Nota que não é detalhe:** *escalar* é ação, e é a mais importante que ele
> tem. Um agente que nunca escala é mais perigoso que um que escala demais.

---

## Nível 1 — pode agir sozinho (a proposta de verdade)

Uma ação só entra aqui se cumprir **as seis condições, todas**:

1. **não toca o cliente final** — nenhuma mensagem, nenhum pedido, nenhum Pix;
2. **não move dinheiro** — nem cobrança, nem plano, nem estorno;
3. **não apaga nem sobrescreve dado** — só lê, ou só grava dado derivado que se
   recalcula sozinho;
4. **é idempotente** — rodar duas vezes é igual a rodar uma;
5. **é de UM restaurante** — nunca uma varredura que atravessa a base;
6. **deixa registro** — quem pediu, quando, o que devolveu.

**E aqui está o achado desconfortável: NENHUMA das três ações do catálogo de
hoje cumpre as seis.**

| Ação no catálogo | Falha em qual condição |
|---|---|
| `requeue_stuck_campaign` — reenfileirar campanha travada | **1 e 4.** Reenfileirar campanha **manda mensagem para o cliente do restaurante**. Se a execução travada já tinha saído, o cliente recebe duas vezes |
| `reprocess_meta_inbound` — reprocessar entrada travada | **1.** A entrada duplicada é barrada pelo `wamid` (a dedupe existe), mas o **reprocessamento redispara o agente**, e o cliente recebe resposta repetida |
| `menu_import_preview` — montar a prévia da planilha | Cumpre as seis **no passo de prévia** (ele é não-mutante por desenho). É a única candidata real |

Então a lista do Nível 1 que eu proponho é **curta de propósito**, e duas das
três entradas nem existem ainda:

| # | Ação | Existe? | Por que é segura |
|---|---|---|---|
| 1 | **Montar a prévia da planilha de cardápio** (`menu_import_preview`, só o passo de prévia) | sim, desligada | Não grava nada. Quem publica é o lojista, apertando *Confirmar importação* na tela dele |
| 2 | **Reperguntar à Meta se a credencial do restaurante está viva** | não (existe a varredura diária, falta o botão sob demanda) | Chamada externa **de leitura**. Hoje o lojista espera até o dia seguinte para o sistema descobrir que o token dele morreu |
| 3 | **Repetir a sonda e devolver o estado atualizado** | sim (é o Nível 0 rodando de novo) | Leitura pura |

Nada além disso. Um Nível 1 grande é um Nível 1 que ninguém revisou.

---

## Nível 2 — ele prepara, o humano confirma

O agente monta o trabalho inteiro e para no último centímetro. **O botão é de
gente.** É onde vive quase tudo que o lojista de fato quer que ele faça:

| Ação | Quem confirma | Por que não pode ser sozinho |
|---|---|---|
| Publicar a importação do cardápio | o lojista, em `/menu/upload` | Sobrescreve o cardápio. Já apagou cardápio de cliente uma vez, por planilha (registrado em `pendencias.md`) |
| Reprocessar a fila de entrada do WhatsApp | equipe Foocci | Redispara resposta ao cliente |
| Reenfileirar campanha travada | equipe Foocci | Manda mensagem em lote |
| Reconectar o WhatsApp/Instagram na Meta | **o dono do restaurante** | Exige login dele na Meta (OAuth). Não existe botão do nosso lado — e é por isso que essa ação **saiu** do catálogo em 04/08, em vez de virar uma que finge |
| Pausar ou despausar a loja | o lojista | Pausar a loja de alguém por diagnóstico errado é derrubar o faturamento da noite |

---

## O que ele NUNCA faz, em nenhum degrau, com nenhuma aprovação

Esta lista não tem "a não ser que". Se um dia parecer que tem, a conversa volta
ao Diretor Geral e ao CEO — não se resolve com uma flag.

1. **Falar com o cliente final do restaurante.** O interlocutor do agente de
   suporte é o dono. Nem uma mensagem, nem um "só avisando".
2. **Qualquer coisa que envolva dinheiro** — cobrança, assinatura, plano,
   estorno, cupom, preço.
3. **Apagar ou sobrescrever dado de cliente** — cadastro, pedido, histórico,
   conversa.
4. **Mexer em segredo ou variável de ambiente.** É do CEO, sempre.
5. **Tocar em mais de um restaurante numa ação.** Não existe "para todos".
6. **Desligar uma proteção** — portão, guarda de entrada, trava por plano, opt-out.
7. **Executar o que o lojista escrever.** Texto livre nunca vira comando: o
   agente escolhe uma **chave** de um catálogo fechado, ou nenhuma. É assim hoje
   e é a trava que segura tudo o resto.
8. **Dizer que fez.** Já é travado por portão; entra aqui porque é a mentira
   mais barata de contar e a mais cara de descobrir.

---

## As quatro condições antes de ligar qualquer coisa do Nível 1

Ligar sem isto é trocar um agente honesto por um agente rápido.

1. **Sombra com evidência.** A ação roda em sombra por um período combinado e o
   registro mostra o que ela *teria* feito, caso a caso. Sem amostra, não sobe.
2. **Botão de pânico que funciona, testado.** Um lugar que desliga tudo, e a
   prova de que foi apertado uma vez e funcionou.
3. **Registro por execução** — restaurante, gatilho, o que rodou, o que voltou.
4. **A ação é de um restaurante e o teste prova as duas metades:** que ela roda
   no caso certo, e que ela **não roda** no caso errado. A segunda metade é a
   que costuma faltar — foi exatamente o que faltava na sonda.

---

## O que eu recomendo — as duas saídas (regra de ouro do CEO)

**Saída A — só o Nível 0, e nada de execução por enquanto. (É a que eu
recomendo.)**
O agente continua sem executar nada e a próxima obra é subir a **qualidade do
diagnóstico** (~30% hoje) com a sonda que agora enxerga o cliente. Custa pouco,
não arrisca nada, e ataca o número que está realmente baixo.
*O que trava:* nada. *O que arrisca:* o lojista continua tendo de apertar tudo
sozinho — que é exatamente a situação de hoje, então não é piora.

**Saída B — ligar a prévia do cardápio (item 1 do Nível 1) em sombra, agora.**
É a única ação do catálogo que cumpre as seis condições, e é a que o lojista mais
pede ("sobe meu cardápio pra mim"). Em sombra ela nem roda — só registra que
teria rodado. Depois de amostra suficiente, vira execução real do **passo de
prévia**, com o Confirmar continuando na mão do lojista.
*O que custa:* uma obra pequena (executor + registro + botão de pânico).
*O que arrisca:* baixo por construção — a prévia não grava. O risco real é de
**expectativa**: o lojista que vê o agente "quase" subindo o cardápio vai querer
que ele suba de vez, e a resposta terá de ser não.

**Por que A e não B:** enquanto o agente diagnostica a ~30%, dar braço a ele é
dar braço a quem ainda não enxerga direito. A sonda consertada é a condição para
o diagnóstico melhorar; deixar o diagnóstico subir primeiro é o que torna a
execução defensável depois. B não está errada — está fora de ordem.

**A terceira saída que eu descartei:** ligar `reprocess_meta_inbound`, que era a
candidata óbvia por ser "técnica" e não tocar o cardápio. Descartei porque ela
**redispara a resposta ao cliente final** — cai direto no item 1 da lista do
nunca, e ninguém tinha notado, porque o catálogo a descreve como reprocessar
*entrada*.

---

## Decisão pendente

Aguardando o Diretor Geral escolher entre **A** e **B**. Enquanto não houver
escolha, o estado permanece: **escada em sombra, catálogo desligado, agente
propõe e escala.**
