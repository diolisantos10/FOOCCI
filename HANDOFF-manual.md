# HANDOFF — Manual, Treinamentos & Onboarding

> Documento de transferência da sessão dedicada a **Manual do lojista, Treinamentos
> e Onboarding**. Escrito em 2026-08-01, na branch `claude/remove-legacy-runner-q8iXa`
> (a branch única de trabalho deste repositório, por decisão do dono do produto).
> Leia junto: `docs/manual-sync-playbook.md` (COMO o robô trabalha),
> `docs/manual-backlog.md` (O QUE falta), `docs/manual-sync-log.md` (O QUE foi feito).
> Este arquivo é o POR QUÊ.

## 1. O projeto e a stack real (lida do package.json em 01/08)

Foocci (`name: crm-restaurante`) — SaaS para restaurantes: painel do lojista
(pedidos, cardápio, WhatsApp com IA, CRM, analytics) + área admin da equipe Foocci.

- Next.js **14.2.35** (App Router) · React **18.3.1** · Tailwind **3.4.6**
- Prisma **5.16.1** + Postgres · `openai` **6.29.0** (sempre via router interno, ver §3)
- Testes: vitest · Deploy: Railway (`scripts/start-production.sh`) · CI: GitHub Actions (30+ workflows)
- UI: seguir `DESIGN.md` na raiz (tokens `ink/paper/brand-*`; nunca `gray-*` cru)

## 2. O que esta área construiu (mapa das peças)

| Peça | Onde | O que faz |
|---|---|---|
| Widget de ajuda | `src/components/help/HelpWidget.tsx` | Balão flutuante em todo o painel: chat IA (RAG no manual), aba Avisos, escalação "Falar com a FOOD", checklist "🚀 Primeiros passos (n/8)", sugestão contextual "📍 Guia desta tela" |
| APIs do chat | `src/app/api/help/*` | thread, message (IA responde), escalate, reset |
| IA do chat | `src/services/help/HelpAssistant*.ts`, `ManualRetrieval*.ts` | RAG: busca capítulos `isPublished && agentVisibility` por sobreposição de tokens |
| Guias (fonte da verdade) | `src/services/manual/howToGuidesContent.ts` | **36 guias** code-defined (era 29; o robô criou mais — ex.: `guia-precificacao`) |
| Publicação | `POST /api/admin/manual/seed-howtos` + botão "📚 Atualizar guias de ajuda" | Upsert por slug → `isPublished=true` + `agentVisibility=true` |
| Auto-publicação | `scripts/start-production.sh` | No boot, chama o seed sozinho (background, 3 tentativas, nunca derruba o start) |
| Robô noturno | `.github/workflows/manual-sync-nightly.yml` | 03:07 BRT: reescreve guias das telas alteradas nas últimas 26h e commita |
| FAQ semanal | `src/services/help/FaqMiner.ts` + `POST /api/admin/support/mine-faq` + `help-faq-mine.yml` | Segundas 03:37 BRT: minera conversas de suporte RESOLVED → change-requests PENDENTES |
| Métricas | `GET /api/admin/support/metrics` + aba "📈 Perguntas" no `/admin/support-inbox` | Perguntas mais feitas + gaps (o assistente admitiu não saber) + botão "🧠 Gerar FAQ" |
| Inbox de suporte | `/admin/support-inbox` | Equipe responde threads escaladas |

## 3. Decisões, com data e porquê

1. **2026-07-08 — Guias vivem no CÓDIGO; o banco é espelho.** Porquê: versionado,
   o robô noturno consegue editar via git, e todo deploy republica sozinho.
   Custo aceito: edição manual pelo admin em slugs `guia-*` é sobrescrita (ver §6).
2. **2026-07-08 — Publicação automática no boot (não por botão).** Porquê: fecha o
   ciclo sem humano. O botão "📚" continua existindo, mas é opcional.
3. **2026-07-08 — Agendamento por GitHub Actions, não pelo agendador do chat.**
   Porquê: cron de sessão morre com a sessão (limite 7 dias, container efêmero).
   Detalhe crítico: `schedule` do Actions só dispara da branch **default** do repo —
   que é exatamente a `claude/remove-legacy-runner-q8iXa` (verificado em 08/07).
4. **2026-07-08 — Branch única de trabalho (Legacy).** Ordem explícita do dono do
   produto: nenhuma outra branch deve receber trabalho.
5. **2026-07-08 — FAQ minerado NUNCA publica sozinho.** Vira change-request
   PENDING (aprovação em `/admin/manual-operacional` → Solicitações). Porquê:
   conteúdo extraído de conversa real pode conter erro ou dado sensível.
6. **2026-07-21 — Workflow noturno ganhou fail-fast do segredo + `id-token: write`
   + `github_token` explícito.** Porquê: a 1ª execução real morreu num erro OIDC
   críptico cuja causa raiz era só "segredo ANTHROPIC_API_KEY vazio".
7. **~2026-07 (outra sessão) — FaqMiner migrado do client `openai` direto para o
   router da casa** (`selectEngineRouted("whatsapp", { taskProfile: "GENERATE" })`
   + `callStructuredJson`). Respeitar: chamadas de IA novas passam pelo router.
8. **2026-07-30 — Segredo `ANTHROPIC_API_KEY` cadastrado no GitHub.** Desde então o
   robô roda verde (runs de 30/07, 31/07 e 01/08; fonte: `docs/manual-backlog.md`
   e commits `chore(manual): sync noturno *`).

## 4. O que foi tentado e NÃO funcionou

- **Apagar branch alheia pela sessão** (`git push --delete`) → **403 sempre**. A
  credencial git de uma sessão web é escopada à própria branch. As tools do GitHub
  (MCP) também não têm delete-branch. Único caminho: lixeira na UI do GitHub.
- **Agendar o robô com o cron interno do chat** → abandonado antes de nascer:
  vive só enquanto a sessão existe (máx. 7 dias). Actions é o caminho.
- **Confiar no histórico da Legacy**: entre 08/07 e 19/07 o histórico foi
  reescrito (commits desta sessão sumiram; os arquivos foram re-adicionados
  dentro de um commit de CRM, `eb144ef4`). Motivo: não confirmado. Lição: confie
  no conteúdo do tip, não em `git blame`/hash antigo.
- **1ª execução do nightly (21/07, 08:41 UTC)** falhou: segredo vazio + permissão
  `id-token` ausente. Corrigido em `b11b23ed`; verde a partir de 30/07.

## 5. O que ficou aberto — e o que quebra se ninguém mexer

- **P6 — Resgate do conteúdo do banco** (`GET /api/admin/manual/export`, header
  `x-admin-secret` = `<credencial em variável de ambiente>`): se existir capítulo
  digitado à mão no admin usando slug `guia-*`, **cada deploy o sobrescreve** pelo
  código. Slugs fora de `guia-*` não são tocados pelo seed. Ninguém rodou o export
  em produção ainda (não confirmado se há conteúdo manual em risco).
- **P7 — Bíblia interna no chat?** Os 14 capítulos internos (Importar v0.1 na tela
  do manual) têm `agentVisibility=false`. Decisão de produto pendente. Se ninguém
  decidir: nada quebra; o assistente segue respondendo só pelos guias.
- **Branches órfãs**: `eloquent-franklin` e `cmv-pricing-page` estão **ocas**
  (trabalho já re-landado na Legacy; verificado por comparação de patch em 08/07 e
  21/07 — reverificar antes de apagar). `food-manager-kickoff` tem **1.374 commits
  únicos** (produto paralelo "FOOCCI Manager") — NÃO apagar sem decisão do dono.
  `sons-background-topbar` e `sound-topbar-chip` surgiram ~01/08, conteúdo não
  avaliado (não confirmado).
- **Tela Equipe** só lista e cria usuário (não tem editar/desativar/remover) — o
  `guia-equipe` diz isso honestamente. Se implementarem edição, o robô atualiza o
  guia na madrugada seguinte (o mapa do playbook já cobre a tela).
- **`public/downloads/Carteiro-Manual.txt` é estático** e o robô NÃO cobre
  `public/`. Se a tela de Impressoras mudar, atualizar esse .txt na mão.

## 6. Armadilhas deste repositório (o que parece certo e não é)

- **Editar guia pelo admin parece funcionar — e é perdido no próximo deploy**
  (o seed do boot sobrescreve slugs `guia-*`). Conteúdo duradouro → editar
  `howToGuidesContent.ts`.
- **`schedule` do Actions só roda da branch default.** Hoje default = Legacy. Se
  alguém mudar a default do repo, TODOS os crons param em silêncio.
- **Push na Legacy quase sempre é rejeitado na 1ª tentativa** — várias sessões
  commitam nela. Padrão obrigatório: loop `push → fetch → rebase → push`.
- **403 no push fora da sua branch é comportamento esperado** (credencial
  escopada), não erro de rede — não insista.
- **O self-seed do boot exige `ADMIN_SECRET` no ambiente do Railway**; sem ele,
  pula em silêncio (loga `[manual-sync] ADMIN_SECRET not set`). Se os guias não
  aparecerem no banco após deploy, comece por aí (valor atual: não confirmado).
- **Os "gaps" das métricas dependem das frases exatas do fallback** do assistente
  (`GAP_MARKERS` em `api/admin/support/metrics/route.ts`: "não tenho essa
  informação", "falar com a food", "não consegui acessar o assistente"). Mudar o
  texto do fallback no HelpAssistant zera os gaps artificialmente.
- **`npm run type-check` falha sem `npx prisma generate` antes** (o CI já faz).
- **O RAG é por sobreposição de palavras**: guia com título "técnico demais" não é
  encontrado pela pergunta do lojista. Título e corpo precisam do vocabulário dele.
- **O nome de branch exibido na UI do chat Claude é etiqueta da sessão** — só vira
  branch real se aquela sessão fizer push. Já causou 2 falsos alarmes de "branch
  misteriosa".
- **Checklist 🚀 e sugestão 📍 só aparecem antes da 1ª pergunta** do thread atual
  ("Nova conversa" no cabeçalho volta pro estado vazio).
- **3 listas gêmeas no HelpWidget.tsx**: `SUGGESTIONS`, `CONTEXT_GUIDES`,
  `ONBOARDING_STEPS` mapeiam pergunta→guia por vocabulário. Renomeou guia?
  Revise as três.

## 7. O que eu sabia e não estava escrito em lugar nenhum

- **Hierarquia dos documentos**: playbook = COMO o robô trabalha · backlog = O QUE
  falta · log = O QUE foi feito · este handoff = POR QUÊ é assim.
- **Canário de 10 segundos** pós-deploy: perguntar **"Como pauso os pedidos?"** no
  widget. Resposta certa cita o botão **"Pausar pedidos"** do topo. Se não citar,
  seed ou RAG quebraram.
- **Contagem de guias**: `grep -c 'slug: "guia-' src/services/manual/howToGuidesContent.ts`
  (36 em 01/08).
- **O robô mantém o próprio mapa**: quando cria guia de tela nova, adiciona a linha
  no playbook (fez isso com `guia-precificacao`).
- **Como provar que uma branch é "oca"** antes de apagar: mesmo autor/mensagem/data
  re-landados têm hash diferente — `git cherry` sozinho engana. Compare os patches
  (`git show <a>` vs `git show <b>`) e os `--stat`.
- **Perfil do mantenedor humano** (dono do produto): não-técnico; prefere PT-BR
  simples, uma instrução por vez, com os cliques exatos ("Settings → Secrets →
  New repository secret"). Explicações longas com jargão fazem ele se perder —
  já aconteceu nesta sessão e o custo foi retrabalho.
- **Runbook de saúde (2 min)**: 1) Actions → "Manual Sync Nightly" → última
  execução verde? (passo "Claude —" durando minutos = a IA rodou de verdade);
  2) topo de `docs/manual-sync-log.md` com data recente; 3) canário no widget;
  4) aba 📈 Perguntas: gap novo = próximo guia a escrever.
- **A execução agendada atrasa**: o cron é 06:07 UTC, mas o GitHub costuma rodar
  com atraso (a de 21/07 saiu 08:41 UTC). Atraso ≠ falha.

---
*Sessão encerrada em 2026-08-01. Área: Manual, Treinamentos & Onboarding.*
