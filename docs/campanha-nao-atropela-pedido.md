# O CRM não fala por cima de um pedido — o caso Wellington

> Bloco `claude/crm-pedido-ativo` · 29/08/2026 · Sushi Cazza

## O que aconteceu

| Hora | O quê |
|---|---|
| 18:51 | Wellington confirma 1× Yakissoba Especial, **R$ 74,00**. Status "Em preparo". |
| 18:52 | O CRM dispara nele a campanha **"Converter 1º pedido"**: *"Você já deu uma olhadinha no nosso cardápio? (…) você ganhou 10% de desconto"*. |
| 18:57 | Ele responde: *"Boa noite fiz um pedido"* e *"Mas é entrega"*. |
| depois | **Silêncio.** |

## A causa — medida, não presumida

**Não havia regra errada. Não havia regra.** Nenhum caminho do CRM olhava para os
pedidos do cliente:

- `resolveAudience` (`CrmCampaignService.ts`) montava o público com
  `isGuest`, `isActive`, `hasOptedOut`, `crmContactable` e telefone. **Nada sobre
  pedidos.** O segmento `SEM_PEDIDOS` da campanha filtra `totalOrders: 0`, e o
  contador do Wellington ainda era 0 no instante em que o lote foi resolvido.
- `ContactSafetyService` — o portão por onde **todo** envio de CRM passa — tinha
  onze travas (opt-out, telefone, canal, silêncio, cap diário, teto de contatos,
  cooldown, teto semanal, dedup…). **Nenhuma sobre pedidos.**

Não havia o que afrouxar; havia o que criar.

### E o silêncio, que era o pior dos três

`markConversationCrmContext` prometia, em comentário, proteger a conversa de um
pedido em andamento: *"it never overwrites an ORDER_SUPPORT context, so an active
Waiter order conversation is left untouched"*.

**Nada no repositório escreve `ORDER_SUPPORT`.** A constante existe, o crachá
aparece na Central de Conversas, a cláusula o protege — e nenhum caminho o define.
A guarda defendia um estado que nunca acontece.

Então: a conversa do pedido ficou com `contextType` nulo; a campanha reusou essa
mesma conversa (`findOrCreateCrmConversation` pega a conversa OPEN mais recente) e
a carimbou `CRM_CAMPAIGN` — o `not: ORDER_SUPPORT` deixou passar, porque `not`
inclui nulo. Às 18:57 o `shouldAiRespond` devolveu `CRM_CONTEXT`: **a IA está
proibida de responder em conversa de campanha.** Ninguém respondeu.

Guardrail 4 na veia: o comentário prometia a trava; a trava não existia.

## O conserto

Uma regra, num módulo só (`src/services/crm/activeOrderGuard.ts`), aplicada em
três portas.

**A regra.** O cliente está OCUPADO para o CRM quando:

1. tem **pedido em voo** — `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`; ou
2. fez um pedido nas últimas **6 horas**.

**Por que 6 horas**, escrito no código: é a duração de uma refeição do começo ao
fim — pedir, esperar, receber, comer. Dentro dela o cliente ainda está *dentro
daquela refeição*, e "vem conhecer nosso cardápio" é falar com quem acabou de
comer. Seis horas também mantêm almoço e jantar do mesmo dia como eventos
separados; 24 horas apagariam essa diferença.

**As três portas:**

| Porta | Arquivo | O que faz |
|---|---|---|
| Público | `CrmCampaignService.resolveAudience` | quem está ocupado não entra na fila — poupa orçamento e faz a prévia do lojista contar a verdade |
| Envio | `ContactSafetyService` | **a trava que vale**: por destinatário, no instante do disparo, porque o público é resolvido antes do lote e um pedido pode entrar no meio dele |
| Conversa | `markConversationCrmContext` | a conversa de quem tem pedido em voo **não** vira conversa de campanha — logo a IA não é calada |

**O bloqueio por pedido em voo é incondicional.** `isBirthday`,
`allowWeeklyCapOverride`, `enforceFrequency` e `enforceDailyCap` não o desligam:
não existe campanha importante o bastante para falar por cima de um pedido em
preparo.

**A janela de 6h vale só para ABORDAGEM** (`enforceFrequency`). Recuperação de
carrinho é *resposta a um ato do cliente*: quem acabou de montar um carrinho novo
está pedindo de novo, e calar isso porque ele almoçou às 13h seria proteção mais
destrutiva que o problema (guardrail 5). Ela segue exenta da janela — **e não do
pedido em voo**.

## E o cupom de 10%?

Ele vem do cartão da campanha (`cadastro-sem-compra` → `defaultCoupon:
PERCENTAGE 10`), não de regra de recompra. **Não precisou de trava própria:** no
runner, o `continue` do portão de segurança acontece antes do
`CustomerCouponService.grant`. Bloqueou, não cunha. Está provado em teste, não
suposto — `CampanhaNaoAtropelaPedidoRunner.test.ts` assere que um bloqueio por
`CUSTOMER_HAS_ACTIVE_ORDER` não envia nada **e** não credita cupom, com um teste
de controle mostrando que o cliente livre recebe os dois.

## Como isto foi provado

23 testes em dois arquivos, reproduzindo o minuto exato (pedido `CONFIRMED` às
18:51, disparo às 18:52). Cada trava foi **afrouxada de propósito** e o teste ficou
vermelho:

| Mutação | Resultado |
|---|---|
| remover o portão do avaliador | 4 vermelhos |
| portão vira regra de frequência (aniversário fura) | 2 vermelhos |
| tirar a exclusão do público | 2 vermelhos |
| devolver o sequestro da conversa | 1 vermelho |
| janela de silêncio = 0h | 2 vermelhos |
| "não sei" passa a liberar | 1 vermelho |
| janela nunca se aplica | 2 vermelhos |
| pedido em voo vira opcional | 1 vermelho |

Suíte inteira: **7611 verdes**, `npx tsc --noEmit` limpo.

## O que NÃO foi provado — declarado

- **Não foi reproduzido em banco real.** Os testes usam dublês de Prisma: eles
  provam a REGRA e as chamadas, não o plano de execução do Postgres. O
  `orders: { none: … }` de `resolveAudience` é conferido pelo `where` que sai, não
  por linhas devolvidas.
- **A campanha exata que atingiu o Wellington foi inferida**, não lida do banco de
  produção: a redação recebida ("já deu uma olhadinha no cardápio" + 10%) não
  existe literal no repositório — bate com a família `cadastro-sem-compra`, cujo
  cupom padrão é `PERCENTAGE 10`. O conserto **não depende dessa inferência**: a
  trava vale para toda campanha, qualquer segmento.
- **`ORDER_SUPPORT` continua órfão.** Este bloco parou de depender dele, mas não
  criou quem o escreva. A Central de Conversas segue com um crachá "Pós-venda"
  que nunca acende. Fica em `docs/pendencias.md`.
