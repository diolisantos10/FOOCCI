# SDR do Foocci — o que foi ligado nesta rodada (23/08/2026)

> Bloco `claude/sdr-foocci-liga`. **Nenhuma mensagem sai para ninguém.**
> `FOOCCI_SDR_SEND_ENABLED` continua desligado e nenhuma variável foi criada.

## 1. O diário do SDR — construído primeiro, de propósito

`src/services/brain/sdr/DiarioDoSdr.ts` + `GET /api/sdr/diario`.

Sem ele, se a IA errar com um dono de restaurante ninguém fica sabendo. O
`SdrDiagnostic` prova que as **regras** seguram; o diário conta o que **aconteceu**.

Por turno, ele registra:
- a IA respondeu ou não — e **por quê**: `sem_chave`, `timeout`, `erro_de_rede`,
  `json_invalido`, `cortado_por_limite`, `sem_conteudo`, `desconhecido`;
- quantos (e quais) campos o **motor de regras** preencheu no lugar da IA;
- se a conversa **travou** (havia pergunta no ar e nada foi entendido);
- cobertura da sondagem e se já pode propor.

Contrato, copiado do diário da casa irmã:
**somente leitura · fail-closed com segredo próprio (`SDR_DIARIO_SECRET`) ·
contagens antes das listas · `cegueiras` declaradas no próprio corpo da resposta.**

**Nunca guarda conteúdo de mensagem de cliente** — nem pergunta, nem resposta, nem
valor de campo. A identidade da conversa vai como impressão digital (hash), porque
o `clienteId` pode ser um telefone. Há teste provando que nada disso vaza.

### Para ele ser lido de fora, falta uma coisa que não é minha
A rota está fechada por **duas** portas: o segredo próprio (que só o CEO pode
criar no Railway) e o `middleware.ts`, que exige sessão para tudo que não é
caminho público. Enquanto `/api/sdr/diario` não estiver na lista de caminhos
públicos do middleware, ele só é legível de dentro de uma sessão autenticada.
**Não encostei em `src/middleware.ts`** — outro Diretor está nele nesta mesma
janela (PR #137). Isso é uma linha, para a rodada seguinte.

## 2. As cegueiras que a auditoria achou — fechadas

| Cegueira | O que passou a acontecer |
|---|---|
| `extrairLeitura` fazia `JSON.parse` e devolvia `null` no `catch`, **sem registrar nada** | o motivo sai nomeado (`json_invalido`), com log e sem o texto do cliente |
| o adapter não olhava `finish_reason` | `finish_reason: "length"` vira `cortado_por_limite` — não se confunde mais com erro de rede nem com "a IA não entendeu" |
| a queda para o motor de regras era invisível | todo campo entendido carrega `origem: "motor" \| "ia"`, e a queda vai para o log e para o diário |
| sem chave, a chamada ia à rede para voltar 401 genérico | `sem_chave` é detectado antes da chamada |

Peça nova: `src/services/brain/engines/FalhaDeMotor.ts` — serve a qualquer
consumidor do Brain, não só ao SDR.

## 3. O lead do site chega ao SDR

`src/services/foocci-sdr/LeadParaSondagem.ts`, chamado por `SiteLeadService.capture`.

O que a pessoa digitou no formulário vira a entrevista inicial:
`restaurante` + `tipo` → `o_que_vende`; `cidade` → `regiao`;
`desafio` → `objetivo`. Cada valor sai com a fonte colada ("informado no
formulário do site").

O que **não** se deduz:
- **`quem_decide` fica em branco.** Quem preencheu o formulário pode ser o dono,
  o gerente ou o filho do dono — o formulário não pergunta isso. Chutar aqui
  produz proposta aprovada por quem não aprova nada.
- campo vazio não vira campo preenchido, e **só é declarado "perguntado" o campo
  que veio com valor** (o campo "principal desafio" nem sempre aparece no
  formulário — `includeChallenge` no `DemoForm`).
- reenvio de formulário **não sobrescreve** entrevista em andamento.

⚠️ **Vale para lead novo, a partir do deploy.** Os leads que já estão na base —
inclusive o que está esperando — não foram tocados: não altero dado de produção.
Semear os antigos é um script de uma passada, quando o CEO mandar.

## 4. Conhecimento do produto — o que existe e o que falta

**Existe, e é bom:**
- **Preço, e é fonte única e aprovada** — `src/lib/billing/pricing.ts`
  (`PLAN_CYCLE_CENTS`, "Tabela aprovada pelo CEO", 04/08): Essencial 179 /
  Crescimento 429 / Performance 899 no mensal, com trimestral e anual embutidos,
  e o único desconto existente = **50% do primeiro mês**.
- **Planos, limites e a regra do estouro** — `src/app/site/(gated)/precos/page.tsx`
  (300 / 1.200 / 4.000 pedidos por mês; mensal sem fidelidade, cancela avisando 30 dias).
- **A verdade sobre o produto e as proibições de discurso**, já aprovadas —
  `BriefingFoocci.ts` (`RESPOSTAS.o_que_vende`, `.diferencial`, `.proibicoes`).
- **FAQ pública** — `src/components/marketing/FAQSection.tsx` (9 perguntas).
- **Tom, palavras proibidas e claims** — `docs/foocci-site/copy-decisions-v1.md`.
- **Maturidade honesta, recurso por recurso** — `docs/foocci-resumo-executivo.md` §23.

**Falta — e é decisão do CEO, não minha:**
1. **O SDR fala o preço de tabela ou desvia para a demonstração?** Hoje a casa se
   contradiz: `/site/precos` publica os três valores e a FAQ responde *"o valor
   depende do tamanho da operação, peça uma demonstração"*. O SDR precisa de UMA
   resposta.
2. **Ele pode fechar sozinho, ou só levar até a proposta?** "Fechar a mensalidade"
   pode significar mandar o link de contratação ou entregar a conversa ao CEO.
3. **Existe alguma margem de negociação?** Hoje só existe 50% no primeiro mês. Se
   o dono pedir desconto, o SDR responde o quê? (Sem resposta, a regra é escalar.)
4. **Fidelidade e cancelamento além do mensal** — o trimestral e o anual são pagos
   à vista; o que o SDR responde sobre devolução se o cliente sair no meio?
5. **Prazo de implantação** — em quanto tempo o restaurante está no ar? Não achei
   número que se possa provar.
6. **Formas de pagamento aceitas na mensalidade** (cartão, Pix, boleto?).
7. **O que ele pode citar como prova.** Existe restaurante-piloto real, mas o nome
   só entra com autorização — o CEO autoriza citar algum caso?

Enquanto essas sete não voltarem, **o SDR não tem o que dizer quando a conversa
chega no dinheiro** — e é exatamente aí que ela chega.

## 5. O caminho do WhatsApp de vendas — levantado, e PARADO aqui

Para o canal funcionar faltam, exatamente:

1. **Um número dedicado**, novo, com chip próprio. Ele precisa **esquentar**: o
   próprio sistema sabe que número novo aguenta ~20 mensagens/dia na primeira
   semana (`crm-safety.ts`).
2. **`FOOCCI_SALES_PHONE_NUMBER_ID`** e **`FOOCCI_SALES_ACCESS_TOKEN`** no Railway.
   Faltando qualquer um dos dois, o canal não existe — nem recebe, nem envia.
   (`FOOCCI_SALES_PROVIDER` é opcional; o padrão é `META_CLOUD_API`.)
3. **`NEXT_PUBLIC_WHATSAPP_SALES_NUMBER`** para o site mostrar o botão. ⚠️ É
   `NEXT_PUBLIC_*`: **congela no build** — salvar no Railway sem refazer o build
   não muda nada, sem erro e sem log.
4. **`FOOCCI_SDR_SEND_ENABLED=true`** — a última chave, e **não é desta rodada**.
5. **Aviso do lead por e-mail**: `RESEND_API_KEY` e `LEADS_NOTIFY_EMAIL` continuam
   ausentes em produção. Hoje o visitante vê "recebemos" e ninguém é avisado.

**Sobre a WABA — o que é fato e o que preciso confirmar:**
- **Fato:** o webhook da Meta é **um só** e valida a assinatura com o **app secret
  de um único aplicativo Meta**. Então o número de vendas tem de estar numa WABA
  ligada **ao mesmo aplicativo Meta** do Foocci, senão a mensagem simplesmente não
  chega. Não exige conta separada.
- **Fato:** o canal de vendas **não guarda `wabaId`** — só `phone_number_id` e
  token. Nada a cadastrar no banco.
- **Fato:** o desvio de vendas no webhook já existe e vem **antes** do fluxo de
  restaurante; ele não cria `Customer`, `Conversation` nem `Message`. Prospecto
  não entra na Central de Conversas de lojista nenhum.
- **Preciso confirmar com o CEO:** de **quem** é a WABA em que o número do Sushi
  Cazza está hoje (do cliente ou da Foocci). Uma WABA comporta mais de um número —
  mas se ela for do cliente, pendurar o número de vendas ali é inaceitável pelo
  mesmo motivo pelo qual o número dele está proibido.
- **Um número de WABA própria não conversa com o número do cliente**, e é assim
  que tem de ser.

**A trava da primeira mensagem, que independe de tudo acima:** no WhatsApp oficial,
abrir conversa com quem nunca escreveu exige **modelo aprovado pela Meta** — ou
seja, **a primeira mensagem não pode ser escrita por IA**; é texto fixo com
variáveis. A IA só entra a partir da resposta.

## 6. O que continua sem cobertura

- **Ninguém chama `/api/sdr/entrevista`.** O motor continua montado e desligado do
  mundo: nenhuma tela, nenhum webhook, nenhum cron. O diário só enxerga turno que
  passe pelo `SdrService`.
- **`FoocciSalesInbound` continua sem redigir e sem enviar** — por decisão, não por
  falta.
- **O diário vive na memória do processo**: deploy ou segunda instância zeram.
  Turno que não está lá **não significa** turno que não aconteceu.
- **Os leads antigos não foram semeados** (item 3).
- **O diário não julga qualidade**: campo preenchido pela IA aparece como
  preenchido mesmo que tenha sido mal interpretado.
- **Nada prova que a mensagem chegou à pessoa** — o envio está desligado.
