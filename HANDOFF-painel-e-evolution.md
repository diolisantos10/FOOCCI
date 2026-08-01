# HANDOFF — Painel do lojista (Início + CRM) & descontinuação da Evolution

> Documento de transferência de **uma sessão de PM** (encerrada em 2026-08-01).
> Escrito para a próxima IA/PM que pegar este repositório. **Não é a verdade
> completa do projeto** — é o que esta sessão fez, decidiu e descobriu.
>
> **Repositório real:** `diolisantos10/FOOCCI` (confirmado com `git remote -v`).
> **Branch onde isto foi commitado:** `claude/remove-legacy-runner-q8iXa`.
> **Onde mora o resto do contexto:** `CLAUDE.md`, `docs/pendencias.md`,
> `docs/decisoes.md`, `docs/foocci-resumo-executivo.md`. Este arquivo **não
> repete** o que já está lá — complementa.

> ⚠️ **Repositório público. Nenhum segredo aqui.** Nesta sessão **não vi
> nenhuma chave/token/senha colada na conversa** — apenas *nomes* de variáveis
> (`MERCADO_PAGO_WEBHOOK_SECRET`, o token do Focus NFe, etc.). Se algo assim
> aparecer no futuro, use `<credencial em variável de ambiente>` e nunca o valor.

---

## a) O que é o projeto e a stack REAL

Sistema operacional para restaurantes (marca **Foocci**). Duas superfícies:
painel do lojista (laranja, marca Foocci) e loja white-label do cliente final.
Cobre cardápio → pedido → pagamento → comanda → nota fiscal → CRM → atendimento
por IA no WhatsApp. O mesmo repo abriga um **segundo produto**: a esteira de
agência (SDR → PM de mídia → Oficina). Não misture os dois.

**Stack real — lida de `package.json`, não de memória:**

| Camada | Versão real |
|---|---|
| Next.js | **14.2.35** (App Router) |
| React | 18.3.1 |
| TypeScript | 5.5.3 (strict — erro de tipo quebra o build no Railway) |
| Tailwind | 3.4.6 |
| Prisma / `@prisma/client` | 5.16.1 · Postgres |
| Auth | next-auth 4.24.7 |
| IA | **DUAS SDKs**: `openai` ^6.29.0 **e** `@anthropic-ai/sdk` ^0.111.0 |
| Storage | `@aws-sdk/client-s3` (espelho XML/PDF da NFC-e) |
| Datas | `date-fns` + `date-fns-tz` |
| Validação | `zod` |
| Testes | `vitest` 2.1.9 (unit) · `@playwright/test` 1.49 (e2e) |
| Deploy | Railway |

- ⚠️ **O `name` do `package.json` é `crm-restaurante`, não `foocci`.** O repo já
  foi `CRM_RESTURANTE` e virou `FOOCCI`; o `package.json` não acompanhou. O
  handoff antigo `HANDOFF_PARA_IA.md` ainda cita o nome/caminho velhos — está
  **desatualizado**; não confie nele para repo/branch.
- Verificação de um bloco (do `CLAUDE.md`): `npx tsc --noEmit` limpo **e**
  `npx vitest run` verde. Nada sobe sem os dois.
- Confirmar que chegou no ar: `curl -s https://foocci.com.br/api/health` →
  compara `commitSha` com o HEAD local.

---

## b) DECISÕES desta sessão (com data e PORQUÊ)

> O porquê importa mais que a decisão. Sem ele, o próximo desfaz sem saber o custo.

- **2026-08-01 — "Mês anterior" adicionado *aditivamente* às réguas de período,
  não unificando as réguas.**
  *Porquê:* existem **3+ réguas separadas** (ver armadilha `e`). Trocar todas por
  um componente único era refactor grande e arriscado num dia de polimento. A
  decisão foi **adicionar o mesmo preset em cada uma** e deixar cada tela manter
  os extras legítimos dela (Analytics: 90d/12 meses; CRM: Total/Semana passada).
  *Custo de desfazer:* unificar de verdade num só componente ainda está aberto —
  se alguém "consertar" removendo os extras, perde função que o CEO usa.

- **2026-08-01 — "Mês anterior" = mês-calendário fechado, ancorado à meia-noite
  BRT (03:00 UTC), comparado vs. mês retrasado.**
  *Porquê:* consistência com o resto do motor (`computePeriodRange`), que é todo
  ancorado a 03:00 UTC. "Mês anterior" que vazasse fuso mostraria número errado
  na virada do dia. Há teste cobrindo fevereiro e a virada de ano (janeiro →
  dezembro).

- **2026-08 — Origem do faturamento = 3 baldes: `espontanea` / `crm` / `garcom`.**
  *Porquê:* o CEO pediu explicitamente 3 variáveis (uma versão de 4 baldes foi
  rejeitada por ele). Regra de prioridade no `RevenueAttributionService`:
  `referral → garcom`, `crm → crm`, `upsell → garcom`, senão `espontanea`.
  *Cuidado:* a prioridade é a alma da métrica — mudar a ordem muda o número que o
  CEO lê como "quanto o CRM trouxe".

- **2026-08 — "Recado do agente" (CrmAgentPanel) removido de vez.**
  *Porquê:* o CEO apontou que continuava aparecendo mesmo depois de pedido pra
  sair; era redundante. O componente foi **deletado** (não escondido) e desmontado
  do `CRMClient`.

- **2026-08 — Regras de Segurança do CRM mostram info OFICIAL da Meta, não a da
  Evolution.** *Porquê:* a tela antes exibia o discurso de "número amadurece"
  (aquecimento da Evolution), que **não é** política oficial da Meta e confundia o
  lojista. Passou a mostrar limites reais (200/900), `qualityRating` e
  `messagingLimit`.

- **2026-08 — Logo OU anagrama, nunca os dois juntos.**
  *Porquê:* decisão de marca do CEO. A sidebar hoje mostra **só o wordmark,
  centralizado**. Se alguém "melhorar" colocando o símbolo do lado, está violando
  decisão explícita.

- **2026-08 — Som: opt-in de 1 clique, persistido, toca em aba de fundo.**
  *Porquê:* o navegador bloqueia áudio sem gesto do usuário. A escolha foi gravar
  o consentimento em `localStorage` (`foocci:audio-opted-in`) e o controle vive
  **dentro do TopBar branco** (não flutuando no meio da tela, como estava).

---

## c) O QUE FOI TENTADO E NÃO FUNCIONOU (leia antes de repetir)

- **LibreOffice para renderizar/converter (pptx→pdf, html→pdf, etc.): NÃO
  funciona neste ambiente.** Dá `source file could not be loaded` para
  **qualquer** arquivo, até um `.pptx` mínimo. Também não há `pdftoppm`,
  `convert`/ImageMagick nem `gs`. *Consequência:* não dá para fazer QA visual de
  um `.pptx` gerado aqui. Caminho que funcionou: `markitdown` para conferir
  **conteúdo** do pptx, e **HTML-mock + Playwright** para QA visual de UI React.
- **Playwright funciona** — mas o Chromium está em caminho fixo
  (`/opt/pw-browsers/...`; `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`). **Não
  rode `playwright install`.**
- **`pptxgenjs` não resolve a partir do scratchpad** — precisou `npm install`
  local ad-hoc. Não está no `package.json` (é ferramenta de sessão, não
  dependência do produto). O mesmo vale para `defusedxml`/`lxml`/`Pillow` no lado
  Python.
- **Apresentação "para um CEO" (versão técnica): rejeitada pelo CEO** por confusa
  e técnica demais. A versão que ele aceitou como caminho é a **"para o dono do
  restaurante"** (pitch de vendas, não spec técnica). Mesmo essa está **parada**
  como rascunho ("esse é o caminho, mas não é o foco agora"). Não retome sem ele
  pedir.
- **Editar o CrmAgentPanel deu conflito de merge** porque a branch de deploy tinha
  avançado (Merge #39 refatorou o painel). Tentar casar um patch antigo falhou;
  o certo foi `git merge --abort`, rebasear no atual e — como o painel já era só o
  bloco de recado — **deletar o componente inteiro** em vez de editá-lo.
- **Erro de tupla no `Promise.all` da atribuição de receita:** adicionei
  `revenueSources` na desestruturação mas esqueci de pôr a chamada
  `getRevenueSources()` no array → `tsc` reclamou de tupla. Lição: ao mexer num
  `Promise.all` destructurado, conte os dois lados.

---

## d) O QUE FICOU ABERTO (cada item: o que quebra se ninguém mexer)

- **#44 — Descontinuar a Evolution. BLOQUEADO em 2 respostas do CEO.**
  Isto **não é um `delete`, é uma migração de ~6 etapas** (a estimativa de "~216
  arquivos" da task é grosseira — trate como ordem de grandeza, *não confirmado*
  no número exato).
  - *O que quebra se alguém apagar a Evolution agora:* a Evolution é o **default e
    o fallback** do envio (ver `e`), e o **webhook de entrada da Meta é só-Brain**
    (ver `e`/`f`). Sumir com a Evolution hoje derruba, no WhatsApp: pedido por
    texto, opt-out, recuperação de carrinho, atribuição de receita do CRM e os
    comandos do **BuildOS** — tudo isso só existe no webhook da Evolution.
  - *As 2 perguntas travando:* (1) a Meta está **conectada e ativa para TODOS os
    restaurantes**, ou só alguns? (**desconhecido — é o dado que falta**). (2)
    BuildOS: migrar para Meta, manter só-Evolution, ou aposentar?
  - *Etapa 0 segura para começar já:* portar a paridade de entrada (o que o
    webhook da Evolution faz e o da Meta não faz) — é **aditivo**, não mexe em
    default de produção.

- **#36 — `MERCADO_PAGO_WEBHOOK_SECRET` não está no Railway.** O
  `/api/health` mostra **`mpWebhookSecret: false`** hoje. *O que quebra:* o
  webhook do Mercado Pago não tem assinatura verificada — confirmação de
  pagamento por webhook fica sem validação de origem. **Depende do Dioli** (só ele
  põe a env no Railway).

- **#29 — Homologação e go-live fiscal (NFC-e via Focus NFe).** *O que quebra:*
  enquanto não houver token + homologação ponta-a-ponta, **nenhuma nota fiscal
  real é emitida**. Depende do Dioli (token). Toda a máquina (etapas 0–5b) está
  pronta e desligada.

- **Régua de período ainda não é 100% unificada.** *O que quebra se ninguém
  mexer:* nada quebra — mas continuam sendo 3+ implementações. O risco é a
  próxima pessoa achar que "a régua" é um componente só e editar uma sem as
  outras (ver `e`).

- **Apresentação de preços (faixas/planos): rascunho parado.** *O que quebra:*
  nada técnico. É material comercial; retomar só sob pedido do CEO. A decisão de
  **faixa de preço / bloqueio por plano** segue pendente do CEO (o campo de plano
  existe e **não bloqueia nada** — ver `docs/pendencias.md`).

> Itens do Garçom/Brain/agência que ficaram abertos **não são desta sessão** —
> estão em `docs/pendencias.md` (mantido pelo sync noturno). Não dupliquei aqui.

---

## e) AS ARMADILHAS deste repositório

- **"A régua de período" não é um componente — são 3+ implementações
  independentes, cada uma com backend próprio.** Para adicionar um botão você tem
  que tocar TODAS:
  1. **Dashboard/Início** → `src/lib/dashboard-periods.ts` (`computePeriodRange`,
     o motor canônico) + `src/app/api/dashboard/route.ts` (array de validação) +
     `DashboardClient.tsx` (`PERIOD_OPTIONS`).
  2. **Analytics** → `AnalyticsClient.tsx` tem o **seu próprio** `presetRange`
     (não usa o motor canônico).
  3. **CRM** → tem **DUAS** réguas: `crmPeriodRange` **e** o
     `OverviewTab.DateFilterPreset` + `handleDateChange` no `CRMClient.tsx`.
     Detalhe traiçoeiro do `handleDateChange`: o default seta `toIso = now`, então
     um preset de mês fechado precisa **sobrescrever `from` E `to`**, senão o fim
     do período vaza para hoje.
- **A Evolution é o default E o fallback do envio.** Em
  `src/services/whatsapp/activeProvider.ts`: sem `whatsappProvider ===
  "META_CLOUD_API"` cai na Evolution, **e** qualquer erro de DB no lookup **também**
  cai na Evolution. Ou seja: ela não é só "o padrão", é a rede de segurança.
- **Os dois webhooks de entrada do WhatsApp NÃO são simétricos.** *Confirmado por
  leitura nesta sessão:* `api/webhooks/meta/whatsapp/route.ts` (~225 linhas)
  importa só `WhatsAppBrainRuntimeService` + suporte — é **só-Brain**.
  `api/webhooks/evolution/route.ts` (~274 linhas) é quem carrega pedido-por-texto,
  opt-out, carrinho, atribuição e BuildOS. O comentário do código da Meta diz
  "feed the same agent pipeline" — mas hoje "the same pipeline" = **só o Brain**.
- **Meta só é usada quando `metaCrmEnabled && connectionStatus ===
  "CONNECTED"`.** Fora disso, Evolution. Um restaurante "com Meta configurada" que
  não esteja `CONNECTED` continua na Evolution — não assuma pelo nome.
- **Tudo é ancorado à meia-noite de Brasília = 03:00 UTC** (`brtNow = now - 3h`).
  Qualquer cálculo de período feito em UTC puro erra "hoje" por 3 horas.
- **Warning pré-existente de `react-hooks/exhaustive-deps` em
  `CRMClient.tsx` (~linha 2078)** — **não foi introduzido** por trabalho recente.
  Não "conserte" às cegas: mexer na dep array desse `useEffect` pode reintroduzir
  bug de aba inicial.

---

## f) O QUE EU SEI E NÃO ESTÁ ESCRITO EM LUGAR NENHUM

- **Existem TRÊS nomes de branch em circulação e isso confunde toda sessão nova:**
  - `claude/remove-legacy-runner-q8iXa` — é a que **realmente auto-deploya no
    Railway** (→ foocci.com.br) e onde **toda esta sessão commitou**. O
    `CLAUDE.md` a chama de "branch padrão do repositório".
  - `claude/foocci-brain-vaamrx` — o `CLAUDE.md` chama de "branch de trabalho".
  - `claude/inspiring-bardeen-hsx9wk` — apareceu na instrução de abertura desta
    sessão.
  Na prática, **o que chega em produção é o que entra em
  `claude/remove-legacy-runner-q8iXa`.** Foi essa que usei o tempo todo, com o
  padrão: branch de feature → `merge --no-ff` na de deploy → push → conferir o
  `commitSha` no `/api/health`.
- **O `/api/health` é o oráculo de deploy** e diz mais do que "ok": ele devolve
  `commitSha`, `branch`, `db`, e um bloco `checks` com `mpWebhookSecret`,
  `encryptionKey`, `nextauthSecret`, `openaiKey`, `databaseUrl`. Hoje o único
  `false` ali é `mpWebhookSecret`. É o jeito mais rápido de saber o que falta de
  env em produção sem acessar o Railway.
- **O motor canônico de período (`computePeriodRange`) devolve `prevStart/prevEnd`
  e um `prevLabel` em português com gênero certo** ("vs. quinta passada", "vs.
  domingo passado"). Comparações "hoje/ontem" batem contra **o mesmo dia da
  semana anterior**, não contra ontem. Se você adicionar um período novo, tem que
  decidir conscientemente qual é o `prev`.
- **`RevenueAttributionService.getRevenueSources`** cruza cinco fontes
  (`campaignExecution`, `cRMActionLog`, `customerCoupon.sourceCampaignId`,
  `referral`, `orderItem.isUpsell`) para classificar cada pedido. Se a atribuição
  do CRM "sumir", suspeite de uma dessas cinco antes do gráfico.
- **BuildOS existe e é dirigido por scripts** (`buildos:bootstrap`,
  `buildos:verify`, `buildos:test-command` no `package.json`) **e por comandos que
  chegam pelo webhook da Evolution.** Não há caminho BuildOS pela Meta hoje — por
  isso ele entra na conta da descontinuação (#44).
- **O `CLAUDE.md` define um modelo CEO → PM → especialistas** e os agentes de
  `.claude/agents/` (`cerebro`, `garcom`, `canais`, `crm`, `operacao`,
  `interface`, `agencia`, `qualidade`). Regra de ouro do lugar: **decisão em
  conversa vira registro no repo na mesma sessão** (é por isso que este arquivo
  existe). E o guardrail que mais pega gente: **prompt é aviso, código é trava** —
  para dano real, exija o mecanismo, não confie no perfil do agente.
- **O CEO (Dioli) fala por voz-para-texto e o português vem embaralhado.** Leia
  pela intenção, não pela letra. Ele **não lê código** — resultado sobe em
  linguagem de negócio, conclusão primeiro, curto e em **português do Brasil**.
- **Incidente da Nicole (por que o guardrail 5 existe):** um portão reprovava
  certo, mas a queda apagou a conversa da cliente 5× no meio de um pedido. A lição
  virou regra: **uma proteção que dispara não pode ser mais destrutiva que o
  problema que ela evita.** Ao mexer em gate/rollback, lembre disso.

---

## Para começar (próxima IA)

1. Confirme a branch: `git checkout claude/remove-legacy-runner-q8iXa` e veja se
   não ficou pra trás (já houve P0 preso 42 commits sem chegar em produção).
2. Leia `CLAUDE.md`, `docs/pendencias.md`, `docs/decisoes.md`.
3. `curl -s https://foocci.com.br/api/health` — veja o que está no ar e o que
   falta de env.
4. Se for mexer em WhatsApp/Evolution, leia a seção `e`/`f` **antes** de tocar em
   qualquer default.
