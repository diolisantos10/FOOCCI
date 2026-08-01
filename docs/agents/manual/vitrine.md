# Vitrine — manual, treinamentos e onboarding

> Curada pelo Diretor. Qualquer agente lê; **só o Diretor escreve**.

---

## Os guias vivem no CÓDIGO. O banco é espelho.

Editar um guia pelo admin **parece funcionar e é perdido no próximo deploy** — o
seed do boot sobrescreve todo slug `guia-*`.

Conteúdo duradouro se escreve em **`src/services/manual/howToGuidesContent.ts`**.

Slugs **fora** do padrão `guia-*` não são tocados pelo seed.

**Contar os guias:**
```
grep -c 'slug: "guia-' src/services/manual/howToGuidesContent.ts   # 36 em 01/08
```

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §3 e §6 (commit `5b1c885c`)

---

## O canário de 10 segundos, depois de todo deploy

Pergunte no widget: **"Como pauso os pedidos?"**

A resposta certa cita o botão **"Pausar pedidos"** do topo. **Se não citar, o seed
ou o RAG quebraram** — e você descobre em dez segundos em vez de por reclamação de
lojista.

**Runbook de saúde completo, 2 minutos:**
1. Actions → *Manual Sync Nightly* → última execução verde? *(o passo "Claude —"
   durando minutos significa que a IA rodou de verdade)*
2. Topo de `docs/manual-sync-log.md` com data recente
3. O canário acima
4. Aba 📈 Perguntas: **gap novo = o próximo guia a escrever**

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §7 (commit `5b1c885c`)

---

## O RAG casa por sobreposição de palavras — escreva no vocabulário do lojista

Guia com título "técnico demais" **não é encontrado** pela pergunta de quem usa o
sistema. Título **e** corpo precisam usar as palavras dele, não as do código.

E há **três listas gêmeas** em `HelpWidget.tsx` que mapeiam pergunta → guia por
vocabulário: `SUGGESTIONS`, `CONTEXT_GUIDES`, `ONBOARDING_STEPS`.
**Renomeou um guia? Revise as três.**

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §6 e §7 (commit `5b1c885c`)

---

## As métricas de "gap" dependem de frases literais — mudar o texto zera o número

`GAP_MARKERS`, em `api/admin/support/metrics/route.ts`, procura as frases exatas do
fallback do assistente: *"não tenho essa informação"*, *"falar com a food"*, *"não
consegui acessar o assistente"*.

**Mudar o texto do fallback no HelpAssistant zera os gaps artificialmente** — o
painel mostra melhora onde não houve nenhuma.

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §6 (commit `5b1c885c`)

---

## Se os guias não aparecerem no banco depois do deploy, comece pelo `ADMIN_SECRET`

O self-seed do boot exige `ADMIN_SECRET` no ambiente do Railway. **Sem ele, pula em
silêncio** — só loga `[manual-sync] ADMIN_SECRET not set`.

*Valor atual em produção: não confirmado.*

E **atraso do cron não é falha**: o agendamento é 06:07 UTC, mas o GitHub costuma
rodar atrasado (a de 21/07 saiu às 08:41 UTC).

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §6 e §7 (commit `5b1c885c`)

---

## A hierarquia dos documentos desta área

| Documento | Responde |
|---|---|
| `docs/manual-sync-playbook.md` | **COMO** o robô trabalha |
| `docs/manual-backlog.md` | **O QUE** falta |
| `docs/manual-sync-log.md` | **O QUE** foi feito |
| `HANDOFF-manual.md` | **POR QUÊ** é assim |

**O robô mantém o próprio mapa:** quando cria guia de tela nova, ele adiciona a
linha no playbook sozinho (fez isso com `guia-precificacao`).

— promovido em 2026-08-01 pelo Diretor · origem: `HANDOFF-manual.md` §7 (commit `5b1c885c`)
