# Quality Audit Cron — configuração

Auditoria automática diária do Controle de Qualidade. Roda os auditores
read-only (SafeMode) de madrugada e salva o resultado como `source: "CRON"`,
para o painel `/admin/quality` já mostrar a última auditoria de manhã.

## Endpoint

`POST /api/cron/quality/run`

- Autenticação: `Authorization: Bearer ${CRON_SECRET}` (o mesmo segredo dos
  outros crons do projeto).
- Apenas `POST` — não existe handler `GET`.
- Sem `CRON_SECRET` no ambiente → `503` e **não roda**.
- Segredo ausente/ inválido → `401`.
- Resposta: `{ ok, runId, globalStatus, counts: { bySeverity, byStatus }, durationMs, findingsCount }`.

É 100% read-only/SafeMode: nunca envia WhatsApp, cria pedido, gera Pix, chama
Mercado Pago/Evolution ou toca runtime. Roda os auditores contra fixtures
sintéticas e grava só nas tabelas `quality_audit_*`.

## Agendamento (GitHub Actions)

Workflow: `.github/workflows/quality-audit-cron.yml`

- Schedule: `30 6 * * *` → **06:30 UTC = 03:30 BRT**.
- `workflow_dispatch` disponível para rodar manualmente.

### Secrets necessários (Settings → Secrets and variables → Actions)

Reusa os secrets que o CRM cron já usa — **nenhuma config nova é necessária**:

| Secret            | Valor                                                        |
| ----------------- | ------------------------------------------------------------ |
| `FOOCCI_BASE_URL` | URL de produção sem barra final (ex.: `https://…railway.app`) |
| `CRON_SECRET`     | Mesmo valor configurado no Railway (`CRON_SECRET`)            |

> Alternativa: se preferir uma variável dedicada para a URL, defina
> `QUALITY_AUDIT_URL` — o workflow usa `FOOCCI_BASE_URL` e cai para
> `QUALITY_AUDIT_URL` quando o primeiro estiver vazio.

## Railway (alternativa ao GitHub Actions)

O cron nativo do Railway envia apenas `GET` sem headers, e este endpoint exige
`POST` + `Authorization: Bearer`. Por isso o agendamento usa GitHub Actions
(igual ao CRM cron). Para usar Railway, configure um job que faça o mesmo
`curl -X POST` com o header `Authorization: Bearer ${CRON_SECRET}`.

## Verificação manual

```bash
curl -X POST "$FOOCCI_BASE_URL/api/cron/quality/run" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" -d '{}'
```
