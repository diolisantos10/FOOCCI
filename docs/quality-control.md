# Controle de Qualidade — Runbook

Departamento interno de auditoria do Foocci/Fute. Audita o sistema em modo
**read-only / SafeMode** (dry-run, sem efeitos colaterais) antes da operação.

## 1. O que é

Um conjunto de **auditores** que rodam checks reais contra fixtures sintéticas,
classificam findings (PASS/WARNING/FAIL · P0/P1/P2/INFO) e salvam histórico. Não
envia WhatsApp, não cria pedido, não gera Pix, não chama provedor externo, não
altera dados de negócio. A única escrita é nas tabelas `quality_audit_*`.

## 2. Onde acessar

- Painel: **`/admin/quality`** (menu lateral → "Controle de Qualidade").

## 3. Auditores

| Auditor | Área | Modo seguro | Cenários |
| --- | --- | --- | --- |
| **Waiter** | IA / Vendas | catálogo sintético, sem DB/OpenAI | 37 |
| **CRM** | CRM | dry-run, `useLiveLLM=false`, sem disparo | 46 |
| **Analytics** | Analytics | data fixa, `includeLiveData=false` | 25 |
| **WhatsApp** | WhatsApp | `DRY_RUN_ONLY`, `allowSideEffects=false`, menu+entrega injetados | 21 |

### O que cada auditor valida
- **Waiter:** anti-alucinação, cards reais, recomendação, restrições, categoria/
  porção, grupo/família, leve, orçamento, venda consultiva, fechamento, checkout
  guidance. Suítes legadas viram WARNING/INFO (drift), nunca P0 automático.
- **CRM:** contact-safety/segurança de disparo, segmentação, campanhas, templates,
  janelas, públicos vazios, atribuição, review — sempre dry-run.
- **Analytics:** diagnóstico, métricas/vendas/upsell, retenção/cohort, operação,
  analista, dashboard cockpit — read-only com data fixa; crash de cálculo → P0.
- **WhatsApp:** roteamento, parsing, multi-turn, handoff, **pix_safety/payment**
  (com fixture injetada, sem DB), prevenção de vazamento de comando interno/Build
  OS. Envio/Evolution/pedido/Pix real → P0.

## 4. Como rodar manualmente

- No painel: **"Rodar agora"** (todos) ou **"Rodar"** num auditor específico.
- Via API (auth admin — `x-admin-secret` ou cookie `foocci-admin-token`):

```bash
curl -X POST "$BASE/api/admin/quality/run" \
  -H "Content-Type: application/json" -H "x-admin-secret: $ADMIN_SECRET" -d '{}'
# um auditor: -d '{"auditorId":"crm"}'
```

## 5. Como funciona o cron

- Endpoint: **`POST /api/cron/quality/run`** (apenas POST; `Authorization: Bearer
  $CRON_SECRET`). Persiste `source="CRON"`, `triggeredBy="cron"`.
- Workflow: `.github/workflows/quality-audit-cron.yml` — schedule **`30 6 * * *`**
  (06:30 UTC = **03:30 BRT**) + `workflow_dispatch` para rodar manualmente.
- Detalhes: ver `docs/quality-audit-cron.md`.

## 6. Secrets necessários

| Onde | Secret | Valor |
| --- | --- | --- |
| Railway | `CRON_SECRET` | segredo do cron |
| GitHub Actions | `CRON_SECRET` | **mesmo** valor do Railway |
| GitHub Actions | `FOOCCI_BASE_URL` | URL de produção sem barra final |

> Alternativa: `QUALITY_AUDIT_URL` (fallback de URL) se preferir variável dedicada.

## 7. Como aplicar a migration

```bash
npx prisma migrate deploy   # aplica 20260608000000_quality_audit_history (additive)
```

## 8. Como validar produção

1. `npx prisma migrate deploy` no ambiente.
2. Configurar `CRON_SECRET` (Railway + GitHub) e `FOOCCI_BASE_URL` (GitHub).
3. GitHub → Actions → "Quality Audit Cron" → **Run workflow** (`workflow_dispatch`).
4. Conferir resposta **200** e `QualityAuditRun` no banco.
5. Abrir `/admin/quality` → deve aparecer um run com **fonte = cron**.

## 9. Como interpretar

- **PASS / INFO** — saudável, nenhuma ação.
- **WARNING / P1 / P2** — pontos de atenção (gaps de cobertura, drift), sem bloqueio.
- **FAIL / P0** — falha crítica (alucinação, envio/pedido/Pix real, crash, vazamento).
- O painel mostra o **pior auditor**, a **recomendação principal**, a **tendência** e
  **alertas internos** (novo P0 / regressão / P0 resolvido) — todos **visuais, sem
  envio externo**.

## 10. O que fazer se aparecer P0

1. Abrir `/admin/quality`, ler o banner vermelho + alerta interno.
2. Clicar na rodada (drill-down) e ler o finding P0 (auditor, título, resumo).
3. Reproduzir local: `npx vitest run src/services/quality` (e a suíte da área).
4. Corrigir a causa (nunca o auditor para "ficar verde"); rodar de novo.

## 11. Backlog futuro

- **P1:** alerta interno por e-mail/WhatsApp do operador (opt-in); comparação lado a
  lado de rodadas; limpar 1 WARNING funcional do WhatsApp (cenário `full-add-item`,
  add de 2º item — exige tocar o matcher do runtime WhatsApp).
- **P2:** novos auditores (Cardápio, Pedidos, Pagamento, Segurança/Admin,
  Integrações); evidências visuais (screenshots/Playwright); Change Request
  automático; alertas externos; auto-fix.

## Checklist produção

- [ ] migration aplicada (`prisma migrate deploy`)
- [ ] `CRON_SECRET` no Railway
- [ ] `CRON_SECRET` no GitHub
- [ ] `FOOCCI_BASE_URL` no GitHub
- [ ] `workflow_dispatch` rodou (200)
- [ ] cron agendado (03:30 BRT)
- [ ] run CRON apareceu no painel
- [ ] `/admin/quality` abre
- [ ] drill-down funciona
- [ ] sem P0 aberto
