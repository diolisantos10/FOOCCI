# Registrar o número do Sushi Cazza na Cloud API — comando pronto

> Escrito em 23/08/2026 pelo Diretor do Foocci. Nada aqui foi disparado por mim:
> as duas peças que faltam são **posse do CEO** e eu não as tenho nem devo ter.

## O que falta preencher (só isto)

| Campo | O que é | Onde o CEO acha |
|---|---|---|
| `SEU_ADMIN_SECRET` | senha de administrador da Foocci | é a mesma com que ele entra em `foocci.com.br/admin`. Está no Railway, serviço `FOOCCI`, variável `ADMIN_SECRET` |
| `SEU_PIN` | PIN de **6 dígitos** da verificação em duas etapas do número no WhatsApp | Meta Business → WhatsApp → Configurações → **Verificação em duas etapas**. Se ele não lembra, dá para **redefinir** ali mesmo; não existe como recuperar o antigo |
| `ID_DO_RESTAURANTE` | id do Sushi Cazza | sai do **passo 1** abaixo |

---

## Passo 1 — descobrir o id do restaurante (e ver o estado de hoje)

```bash
curl -s -H "x-admin-secret: SEU_ADMIN_SECRET" \
  https://foocci.com.br/api/admin/meta/diag
```

Na resposta, procure o bloco cujo `displayPhoneNumber` é **+55 11 97244-0131**:

- `restaurantId` → é o `ID_DO_RESTAURANTE` do passo 2;
- `phone.platform_type` → **hoje deve dizer `NOT_APPLICABLE`**. É a prova do problema;
- `coexistence` → guarde se está `true` (importa no passo 3).

## Passo 2 — registrar

```bash
curl -s -X POST https://foocci.com.br/api/admin/meta/register \
  -H "x-admin-secret: SEU_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"ID_DO_RESTAURANTE","pin":"SEU_PIN"}'
```

Resposta boa: `"registered": true` e `"resubscribed": true`.

## Passo 3 — só se a resposta vier `skipped: "coexistence…"`

Isso **não** significa que o número está num celular — significa que a flag
`coexistence` ficou ligada no cadastro. Como o CEO confirmou que o chip **não está
em aparelho nenhum**, forçar é seguro hoje:

```bash
curl -s -X POST https://foocci.com.br/api/admin/meta/register \
  -H "x-admin-secret: SEU_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"ID_DO_RESTAURANTE","pin":"SEU_PIN","force":true}'
```

> Se o chip voltar para um celular algum dia, **não repita este passo 3** sem
> avisar: aí ele expulsa o número do aparelho de verdade.

---

## Como confirmar que voltou — um passo, sem mandar mensagem para cliente

Rode o **passo 1 de novo** e olhe o mesmo campo:

```
phone.platform_type:  NOT_APPLICABLE   →   CLOUD_API
```

Mudou para `CLOUD_API` = o número está registrado e a Meta volta a entregar
webhook de entrada. Confirmação secundária, se ele quiser: no log do Railway
(serviço `FOOCCI`, ambiente `production`) o `META_133010` **para de aparecer** nas
rodadas seguintes do `[CampaignRunner]`.

**Não dispare mensagem de teste para cliente.** Se quiser tráfego real de
verificação, o caminho é mandar mensagem **do próprio celular do CEO para o número
do Sushi Cazza** — aí a entrada aparece no log como `[webhook/meta/whatsapp]`.
