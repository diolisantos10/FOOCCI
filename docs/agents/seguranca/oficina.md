# Oficina — segurança

> Append-only. O agente escreve aqui; **quem promove para a vitrine é o Diretor**.
> Constituição: `dioli-brain-kit/docs/23-constituicao-dos-essenciais.md` (SEGURANÇA).

---

## 2026-08-08 — Primeiro bloco. Os quatro furos herdados.

Sala nascida hoje. Registro só o que mudou o que eu sei fazer, não o que fiz.

### 1. A sonda que descobre se um segredo existe em produção sem saber o valor dele

O maior risco deste bloco não era achar o furo — era **fechar a porta com a chave
do lado de fora**. Ligar exigência de segredo onde o segredo não está configurado
derruba o canal (guardrail 5). Eu não tenho acesso ao Railway.

A saída: **a própria rota já distingue os dois estados no código de status**, e
isso é observável de fora sem nenhuma credencial.

| Sonda | Não configurado | Configurado |
|---|---|---|
| `POST /api/cron/quality/run` sem cabeçalho | **503** "CRON_SECRET is not configured" | **401** |
| `POST /api/admin/reset-owner` sem cabeçalho | **403** "endpoint is disabled" | **401** |
| `POST /api/payments/stone/webhook` com assinatura lixo + `event_type` inexistente | **200** `{ok:true}` (aceitou!) | **401** "Invalid signature" |

Resultado em 08/08/2026: `CRON_SECRET` **existe**, `ADMIN_SECRET` **existe**,
`STONE_WEBHOOK_SECRET` **não existe**.

**Por que a sonda da Stone é segura:** o `event_type` inventado cai no early-return
antes de qualquer escrita no banco, nos dois ramos. A sonda distingue o estado sem
poder confirmar pagamento nenhum.

**A generalização que vale para o próximo bloco:** rota que *falha fechada direito*
devolve códigos diferentes para "sem segredo" e "segredo errado" — e essa diferença
é um **oráculo gratuito do estado da configuração de produção**. Antes de propor
qualquer trava, procure a rota irmã que já falha fechada e pergunte a ela.
Isso substitui "presumir que existe" e "presumir que falta", que eram as duas
respostas erradas disponíveis.

### 2. O conserto certo quase sempre já está no repositório, na rota irmã

Não inventei padrão em nenhum dos dois consertos:

- `expire-wa-ordering-sessions` tinha `if (secret)`. O padrão correto — 503 sem
  segredo, 401 com segredo errado — já existia em `cron/quality/run`, escrito por
  outra pessoa, na mesma pasta. O defeito era **um outlier, não a norma**: a
  varredura achou `if (secret)` **uma única vez** no repositório inteiro.
- `/api/recover` não pedia credencial. O irmão `/api/admin/reset-owner` faz a
  operação equivalente (recuperação de emergência) e **já exigia `ADMIN_SECRET`
  falhando fechado**. Copiei o portão do vizinho.

Procurar a rota irmã antes de desenhar a trava evita duas coisas: inventar um
segredo novo que ninguém vai configurar, e divergir do padrão que a casa já segue.

### 3. "Id não provado" e "escolha arbitrária" são o mesmo defeito

`/api/recover` usava `findFirst({ where: { isActive: true } })` — "o primeiro
restaurante ativo". Eu tinha catalogado isso como parente de "id aceito sem
conferir". Estava errado: **é pior**. Id não provado ao menos é escolhido pelo
atacante e dá para negar. "O primeiro ativo" é escolhido **pelo banco**, sem
ordenação definida, e tem um segundo efeito que eu não tinha visto:

> prende a recuperação a um único restaurante. Se o primeiro tinha OWNER, nenhum
> outro podia ser recuperado. Se não tinha, era **ele** que era entregue.

Ou seja, o mesmo `findFirst` era simultaneamente um furo de segurança e um defeito
funcional. Conserto: o restaurante é **nomeado** pelo chamador e conferido; a
omissão só é tolerada quando existe exatamente **um** ativo — caso em que não há o
que adivinhar. Nunca "o primeiro".

O mesmo `findFirst({isActive:true})` continua em `/api/admin/reset-owner` (linha
~38). Lá está contido por `ADMIN_SECRET`, mas é a mesma escolha arbitrária.
**Item aberto, não consertado.**

### 4. Reprovar não é portão. O par é que é.

Rodei a sabotagem em **cada metade separadamente**, e foi isso que provou que os
testes valem:

| Sabotagem aplicada (confirmada por `diff`/`grep` no arquivo) | Resultado |
|---|---|
| `if (!secret)` → `if (secret)` no cron | 3 reprovam, todas nos casos de falha fechada |
| `checkAdminSecret` vira `return {ok:true}` | 5 reprovam |
| credencial volta, alvo volta a ser "o primeiro ativo" | **1 reprova** — e só essa |

A terceira é a que importa: com a credencial no lugar, **apenas o teste do alvo**
reprovou. Se eu tivesse escrito só a metade "nega sem credencial", o furo do
"primeiro ativo" teria passado verde. As duas metades pegam coisas diferentes e
nenhuma cobre a outra.

**Regra que levo daqui:** sabotar as duas metades juntas não prova nada — prova
que *alguma* trava existe. Sabotar uma de cada vez é o que prova que **cada** trava
existe.

### 5. Detector novo só vale depois de plantar o defeito que ele deveria achar

Escrevi `src/services/seguranca/portasFechadas.test.ts` e ele passou 7/7 de
primeira. Isso não queria dizer nada. Plantei uma rota falsa com os quatro padrões
e os quatro detectores dispararam, **com o número de linha certo**.

Dois defeitos que só apareceram nessa checagem:

- eu removia comentários antes de procurar (senão o cabeçalho que **explica** um
  furo era acusado como o furo) e isso **deslocava a numeração das linhas**. O
  detector mandava olhar uma linha que não existia. Corrigido preservando a
  contagem. Detector que aponta linha errada queima a confiança em todos os outros.
- faltava o caso que garante que o detector não está olhando para o vazio
  (`webhooks.length >= 5`). Varredura quebrada passa em silêncio, e silêncio de
  varredura é indistinguível de "está tudo limpo".

O detector achou a Stone **sozinho**, sem eu ter dito onde ela estava. Foi o
primeiro sinal real de que ele funciona.

### 6. Lista de exceção precisa de teste contra entrada morta

Não pude consertar Stone e Saipos (pagamento e parceiro — trava humana). Registrei
como dívida nomeada dentro do próprio detector. O risco óbvio: a lista virar
cemitério e silenciar a regressão seguinte. Por isso cada lista tem um teste que
**reprova quando a exceção não corresponde mais a um defeito real** — se a rota for
consertada, a entrada é obrigada a sair.

---

## Itens abertos que eu não podia fechar

| # | O quê | Por que não fechei |
|---|---|---|
| 1 | Webhook Saipos sem autenticação nenhuma | integração de parceiro — trava humana |
| 2 | Webhook Stone aceita evento não assinado; `STONE_WEBHOOK_SECRET` ausente em produção | pagamento — trava humana |
| 3 | `findFirst({isActive:true})` em `/api/admin/reset-owner` | mesma escolha arbitrária do `/api/recover`; contida por `ADMIN_SECRET`, mas de pé |
| 4 | `/api/pedido/payment-status` e `/api/pedido/pix-payment` aceitam `orderId` sem prova | baixo impacto; enumeração e leitura de estado. Não inflar |

## O que eu ainda não consigo fazer, e isso limita o que eu afirmo

- **Não leio variável de ambiente de produção.** Só infiro presença/ausência pelas
  sondas acima. Onde não há rota irmã que falhe fechada, eu **não sei** — e digo
  que não sei.
- **Não consulto o banco de produção.** Se algum restaurante está sem OWNER ativo
  agora, eu só sei do que o `GET /api/recover` respondia (`owner_exists`, um único
  restaurante visível). Não sei o estado dos demais.
- **Não existe ambiente de teste sem dado real** (degrau declarado na constituição).
  Toda sonda minha foi contra produção, o que me obriga a escolher só sonda sem
  efeito — e isso me impede de testar o caminho de sucesso de qualquer trava.
