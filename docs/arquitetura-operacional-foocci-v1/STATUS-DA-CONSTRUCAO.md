# Status da construção — Sistema Operacional Foocci

_Atualizado em 25/08/2026. Este arquivo é o índice de progresso do programa. Uma fase só muda de coluna quando o gate do documento 07 for cumprido — não quando o código existir._

---

## Feito

### Fase 0 — Raio-X e mapa de reaproveitamento

- Os 10 documentos da fonte canônica lidos na ordem de `00-LEIA-PRIMEIRO.md`.
- Repositório auditado: 143 models, 37 páginas de admin, ~190 rotas de API, 45 serviços.
- Mapa `EXISTE / PARCIAL / A CONSTRUIR / N/A` publicado em `10-RAIO-X-E-MAPA-DE-REAPROVEITAMENTO.md`.
- Catálogo de 37 fichas de agente publicado em `11-FICHAS-DOS-AGENTES.md`. (A Fase 0 publicou "32" — a soma estava errada; corrigida na Fase 1 e agora contada por teste.)
- Quatro ADRs registrados.
- Baseline: `tsc --noEmit` **limpo**; suíte Vitest e `next build` no PR.
- Produção intocada. Nenhuma migração aplicada.

---

### Fase 1 · PR 1.1 — Identidade interna, departamentos e RBAC

Construído em 24/08/2026, com o proprietário ausente e sob autorização dele. Cada decisão tomada no lugar dele está em **ADR-005**, uma a uma, para poder ser revertida sabendo o quê e por quê.

- **5 tabelas novas**, aditivas: `departments`, `positions`, `internal_users`, `department_memberships`, `internal_audit_events`. Migração gerada por diferença de schema e **aplicada num Postgres limpo para provar que roda** — zero `DROP`, zero `ALTER` destrutivo.
- **Identidade interna** (`src/lib/internal-auth.ts`): sessão própria com cookie assinado por HMAC, senha em bcrypt como o resto da casa. Fora do NextAuth de propósito — colocar o pessoal da Foocci lá exigiria inventar um restaurante fictício para a própria empresa.
- **RBAC no servidor**, separando *pertencer* de *gerenciar*: membro de Vendas lê Vendas, só o gerente administra.
- **Convivência com `ADMIN_SECRET`** (ADR-003): rota nova não aceita a senha antiga, e todo acesso por ela entra na trilha como `LEGACY_ADMIN_SECRET`.
- **9 departamentos e 12 cargos** semeados. **Todos os cargos nascem vagos** — ninguém foi inventado.
- **Segredo de sessão é trava, não recomendação:** em produção, sem `INTERNAL_SESSION_SECRET`, o sistema recusa e explica em vez de sortear um segredo por instância — que derrubaria o login de forma intermitente, sem erro no log (ADR-005, decisão 6).
- **36 testes novos:** 12 do organograma, 14 do RBAC, 4 da trava do segredo e 6 de integração contra banco real.
- **O tipo do teste passa a ser conferido** no código deste programa (`npm run type-check:tests`) — o `type-check` da casa exclui teste, e foi assim que um teste meu com dois campos inexistentes ficou verde. Ver achado A-03.
- **Suíte inteira verde:** `tsc --noEmit` limpo, 6.588 testes passando em 506 arquivos. Nenhum teste da casa quebrou.

---

### Fase 1 · PR 1.2 — Fichas da empresa sobre `AgentProfile`

As 37 fichas do catálogo deixam de ser papel e viram linha de banco, com dono e com limite escrito. Decisões que emendam o ADR-002 estão no **ADR-006**.

- **O catálogo é o markdown — o código lê, não copia.** `fichasDaEmpresa.ts` lê `11-FICHAS-DOS-AGENTES.md`. O texto que o proprietário aprova é o texto que vai para o banco, sem transcrição no meio.
- **6 colunas novas** em `agent_profiles`, aditivas. Provado num banco com a forma da produção: uma linha criada ANTES da migração sai dela como PRODUTO/AI, sem departamento — exatamente o que sempre foi.
- **Três populações separadas por trava, não por convenção** (ADR-006). `getActiveAgentProfiles`, que alimenta o runtime do produto, filtrava só por `status: ACTIVE`: no dia em que o proprietário ativasse a ficha do Closer, ele entraria calado na lista de agentes que rodam dentro do restaurante do cliente. Agora filtra por população, e há teste espiando a consulta.
- **Dono é cargo, não pessoa.** Todas as 34 fichas de departamento têm dono; hoje todos os cargos estão vagos, e a tela diz "vago".
- **Nenhuma ficha nasce ligada.** 30 criadas, todas `DRAFT` com runtime desligado. E rodar o seed de novo não desliga o que o proprietário tiver ligado.
- **As 4 de produto não foram tocadas por dentro:** ganharam departamento e número de catálogo; `allowedActions` e `status` continuam como estavam.
- **Aba nova** em `/admin/sala-dos-agentes?aba=empresa`, por departamento, com "o que esta ficha NÃO pode fazer" a um toque.
- **52 testes novos.** A rota nova exige sessão interna (ADR-003) e o portão de segurança da casa foi ensinado a reconhecê-la como guarda de verdade.

---

### Fase 1 · PR 1.3 — O trabalho: OS, projeto, tarefa e handoff

O plano mestre descreve o trabalho da empresa em quatro objetos e uma regra dura: *"o item permanece com o emissor até o aceite do destino"*. Essa frase é o PR inteiro.

- **6 tabelas novas**, aditivas: ordens de serviço, projetos, tarefas, dependências, handoffs e a linha do tempo.
- **A linha do tempo é imutável de verdade.** `UPDATE` e `DELETE` são recusados por gatilho no Postgres, não por convenção de código. Verificado: `INSERT` passa, os outros dois erram com "não é permitido".
- **Assumir é atômico, e isso foi provado.** A condição de estado vai dentro da escrita, não num `if` antes dela. Dez pessoas clicando "aceitar" no mesmo handoff, ao mesmo tempo, contra Postgres de verdade: **um dono, um evento na linha do tempo, nove recusas explicadas**. Trocando por leitura-e-escrita, 4 dos 6 testes reprovam — foi conferido nas duas direções.
- **Toda tarefa nasce com responsável e com prazo.** Sem responsável, é a tarefa que ninguém pega; sem prazo, não existe atraso — e um painel que nunca fica vermelho não é o mesmo que estar tudo em dia.
- **Abrir OS é tudo ou nada.** Se uma tarefa falha no meio, nem a OS nem o projeto sobram. Verificado contra banco real.
- **Sem coluna "bloqueado"**, por ordem do plano mestre: impedimento vive dentro do item, não numa lista onde o trabalho se acumula sem dono.
- **52 testes novos**, 10 deles contra Postgres real.

**Para rodar os testes que precisam de banco** (eles pulam sozinhos, avisando alto, quando a variável não existe):

```bash
HANDOFF_TEST_DB=postgresql://... npx vitest run trabalho
INTERNAL_AUTH_TEST_DB=postgresql://... npx vitest run internal-auth.integracao
```

---

## Em andamento

Nada. Os PRs 1.1, 1.2 e 1.3 estão prontos para revisão; o 1.4 começa quando forem aceitos.

---

## Não iniciado

| Fase | Departamento / entrega | Depende de |
| --- | --- | --- |
| 1d | Aprovações, decisões e dashboard (PR 1.4) — a linha do tempo já existe, veio no 1.3 | PR 1.3 |
| 1e | Divisão do schema por domínio (PR 1.5, ADR-004) | PR 1.4 |
| 2 | Vendas e Receita — Sala de Vendas | Fase 1 |
| 3 | Marketing & Growth | Fase 1 |
| 4 | Implantação e Onboarding | Fase 2 |
| 5 | Sucesso do Cliente e Suporte | Fase 1 |
| 6 | Produto e Experiência | Fase 1 |
| 7 | Agentes e Inteligência do Produto | Fase 1 |
| 8 | Tecnologia, Operações e Integrações | Fase 1 |
| 9 | Qualidade, Segurança e Compliance | Fase 1 |
| 10 | Financeiro e Administrativo | Fase 1 |
| 11 | Integração ponta a ponta e governança | todas |

---

## Decisões do CEO

_Em 25/08/2026 o CEO respondeu D-02 e D-05. Restam D-01 (confirmação retroativa), D-03 e D-04 — nenhuma trava o PR 1.4._

### D-01 · Os quatro ADRs da Fase 0 — confirma? ✅ *adotados sob autorização*

Segui os quatro como aprovados durante a ausência do proprietário (ADR-005). A confirmação continua devida — o custo de reverter é baixo, porque a Fase 1 é aditiva e nada foi ativado.

| ADR | O que decide | Recomendação |
| --- | --- | --- |
| 001 | Conversa de prospect ganha tabelas próprias; a doutrina será corrigida onde diz "reutilizar" algo que não existe como tabela | aprovar |
| 002 | A ficha de agente **estende** `AgentProfile`; não nasce uma segunda | aprovar |
| 003 | `ADMIN_SECRET` convive com o login novo por prazo, com rastro | aprovar |
| 004 | O schema passa a ser dividido por domínio, em PR isolado | aprovar |

### D-02 · Quem ocupa cada cargo? ✅ *respondido em 25/08/2026*

**O CEO é o Dioli.** Palavras dele: *"O CEO sou eu."*

Sobre o Diretor Geral, ele disse: *"está na Control One, como diretor geral"* — ou seja, o Diretor Geral da companhia é o agente da Control Room, e ele fica **acima** do Foocci, não dentro do organograma do Foocci.

**Leitura que adotei, sujeita a uma palavra dele:** o cargo `gerente-geral` do Foocci continua vago, porque o papel que ele nomeou não é esse — é o nível acima. O `diretor-foocci` é o Diretor deste produto.

A hierarquia continua construída sobre **cargos**, e cargo vago aparece como vago. Um comando preenche quando houver banco de produção migrado:

```bash
npx tsx scripts/criar-usuario-interno.ts --email <email> --nome "<nome>" --papel CEO --cargo ceo
```

Enquanto ninguém for cadastrado, o sistema funciona e diz a verdade: cargo vago aparece como vago.

### D-03 · Quando desligar o `ADMIN_SECRET`?

Não precisa ser agora. Precisa ter data, senão vira a porta que ninguém fecha. Sugestão: decidir quando o login próprio estiver funcionando e medido.

### D-04 · Teto de custo por lead e por campanha (Fase 3)

Sem teto, o gate humano de orçamento não tem contra o quê comparar.

### D-05 · Qual é a fonte financeira confiável? ✅ *respondida — e eu não devia ter perguntado*

O CEO disse: *"não sei do que que você está falando"*. Estava certo em não saber: a resposta estava no código, e eu perguntei em vez de olhar.

**O sistema tem dois "dinheiros", e confundi-los seria grave:**

| Fonte | Quem paga a quem | É receita da Foocci? |
| --- | --- | --- |
| `PlanInvoice` (assinatura, Mercado Pago) | o restaurante paga a Foocci | **sim** |
| `Order` (pedido no cardápio) | o cliente final paga o restaurante | **não** — é dinheiro do cliente |

**A fonte confiável é `PlanInvoice`, e ela já existe e funciona.** `PlanSubscriptionService.recordPaidCharge` grava uma fatura quando o Mercado Pago **confirma** a cobrança, com idempotência por `mpPaymentId` (o MP reenvia webhook, e cobrança duplicada viraria nota fiscal duplicada).

Isso é dinheiro cobrado de verdade, não promessa. `FECHADO` no funil continua **não** sendo receita, e `Order` continua sendo faturamento do cliente — somá-lo ao da Foocci inflaria o número da empresa com dinheiro que nunca passou por ela.

O painel executivo (PR 1.4) já tem de onde tirar faturamento. Não trava mais.

---

## Achados registrados (não são decisão do CEO — são fatos com dono a definir)

_Nenhum bloqueia a Fase 1. A-01 a A-03 são anteriores a este programa; A-04 é uma ambiguidade que ele encontrou. Nenhum foi consertado aqui: mexer em área alheia dentro do PR da organização interna é desvio de escopo, e some do radar depois._

### A-01 · A cadeia de migrações não replica do zero

`20250506000000_saipos_integration` falha num banco limpo. Não atrapalha hoje — produção existe e está adiante disso. Mas significa que **não dá para reconstruir o banco do zero**, o que atinge ambiente de teste novo, onboarding e recuperação de desastre.

### A-02 · Dois arquivos de teste diferem só na caixa da letra

`crmExecutionClassification.test.ts` e `CrmExecutionClassification.test.ts` são **dois arquivos diferentes**, os dois versionados. Em Mac ou Windows — sistemas indiferentes a maiúscula — um sobrescreve o outro no clone e **um dos testes some sem avisar**. Aqui em Linux os dois convivem, e é por isso que ninguém viu.

### A-04 · O `suporte-tecnico` encosta em duas fichas ao mesmo tempo

Ele se descreve como "engenheiro de plantão / assistência técnica 24h" e cabe tanto na ficha 4.2 (Suporte N1) quanto na 7.3 (Incidente e Runbook). **Não amarrei a nenhuma:** escolher no chute faria uma função da empresa herdar, calada, as permissões de um agente de produto em operação.

O CEO respondeu que não conhece nenhum dos dois — e com razão: os nomes são meus, do catálogo que escrevi. Em linguagem de negócio:

- **Suporte N1** (ficha 4.2) → quem responde o dono do restaurante quando ele reclama;
- **Incidente e Runbook** (ficha 7.3) → quem conserta o sistema quando ele quebra.

**Leitura adotada em 25/08/2026:** o `suporte-tecnico` que existe hoje é o **Suporte N1**, porque a constituição dele diz que ele "diagnostica incidentes **a partir do relato do lojista** e explica em linguagem clara" — ele fala com o lojista. A ficha 7.3 é papel interno, que ninguém de fora enxerga.

O vínculo **ainda não foi gravado**: só entra no seed quando o CEO confirmar, porque ligar as duas coisas faz uma função da empresa herdar as permissões de um agente de produto em operação.

### A-03 · ~750 erros de tipo em ~150 arquivos de teste antigos

O `type-check` da casa exclui teste de propósito, para o `next build` só olhar o que vai para produção. O efeito colateral é que o tipo do teste nunca é conferido — o Vitest apaga os tipos e roda assim mesmo.

Ligando a conferência no repositório inteiro aparecem ~750 erros, quase todos de índice não checado em código de teste. É dívida antiga, medida agora. **O número está aqui em vez de escondido atrás de uma lista de exclusões** que pareceria cobertura sem ser.

Fica valendo para o código deste programa, que nasce limpo: `npm run type-check:tests`. E `npm run type-check:scripts`, que já cobre `scripts/` inteiro e está verde.

---

## Duas pendências antigas que este programa não resolve sozinho

Já estavam registradas no backlog do Foocci e continuam de pé. Nenhuma é bloqueio da Fase 1, mas as duas bloqueiam a Fase 2 fechar o ciclo com envio real:

1. **O número de WhatsApp de vendas da Foocci não existe.** Sem ele, a Sala de Vendas é construída e testada, mas não fala com ninguém.
2. **Não há conta de teste isolada.** Sem ela não há como exercitar o fluxo ponta a ponta sem tocar em dado real.

Ambas são decisão do proprietário, não de engenharia.
