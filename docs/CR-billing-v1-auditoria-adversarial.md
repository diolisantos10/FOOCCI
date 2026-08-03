# CR — Auditoria adversarial do billing V1: consertar antes de ligar o Mercado Pago

> **Aberta em:** 03/08/2026 · Diretor Geral, via agente `qualidade` (só leitura).
> **Para:** Diretor do Foocci. **Prioridade: P0 — é código que cobra cartão.**
> **Veredito da auditoria:** ❌ **NÃO pode cobrar cliente real com o gateway MP
> ligado.** ✅ **Modo manual (MEI) é liberável com 2 correções + a decisão do
> termo.** Detalhe por gravidade abaixo. A base tem coisas certas (webhook
> re-consulta a API do MP, dedupe por `mpPaymentId` com UNIQUE, gate fiscal
> desligado com fila que não descarta, admin auth constant-time).

---

## 🔴 GRAVE — todos no caminho Mercado Pago. Bloqueiam ligar o gateway.

### G1 · Cancelar no Foocci não cancela no MP, e o webhook ressuscita a assinatura
`PlanSubscriptionService.ts:122-127` + `mp-webhook/route.ts:64`
Cancelar do nosso lado não chama o cancelamento do preapproval no MP → o MP
segue cobrando o cartão. A cobrança seguinte chega no webhook, `approved`
executa `if (sub.status !== "ATIVA") activate(...)` e a assinatura **CANCELADA
volta a ATIVA** (`activate` limpa `canceledAt`). Cobrança indevida recorrente e
eterna. **Conserto:** cancelar o preapproval no MP dentro de `cancel()`, e o
webhook nunca reativar uma sub `CANCELADA` (ver G-estado).

### G2 · Gerar link novo cria segunda recorrência cobrando em dobro
`.../subscriptions/[id]/action/route.ts:45-49`
`mp-link` cria um preapproval novo sem cancelar o anterior nem checar
`sub.mpPreapprovalId`. Cliente autoriza os dois → **duas recorrências ativas**,
ambas resolvem para a mesma sub via `external_reference`, sistema não percebe.
**Conserto:** cancelar/rejeitar o preapproval anterior antes de criar, ou
recusar se já houver um ativo.

### G3 · Parse de preço reduz o valor 1000× em silêncio
`AssinaturasClient.tsx:103` — `parseFloat("1.074".replace(",","."))` = 1.074 →
`priceCents = 107` → MP cobra **R$ 1,07/ano** no lugar de R$ 1.074. Sem piso no
servidor (`route.ts:31` aceita qualquer inteiro positivo). **Conserto:** parser
pt-BR correto (remover separador de milhar) **e** validação de piso no servidor
contra a tabela de planos — cliente nunca define preço, mas o admin erra.

### G4 · Assinatura ativa e cobrada sem aceite do Termo
`subscriptions/route.ts:52-58` + `AssinaturasClient.tsx:278-284` + `mp-webhook:45,64`
O link MP nasce na criação (pula `AGUARDANDO_ACEITE`), o admin tem "Copiar link
de pagamento", o cliente paga e o webhook ativa com `termsAcceptedAt = null`.
**Cobrado sem contrato registrado** — o próprio termo diz que o aceite é a
assinatura. **Conserto:** o link de pagamento só existe depois do aceite; o
webhook recusa ativar sem `termsAcceptedAt`.

---

## 🟠 MÉDIO

- **Pagamento de qualquer valor ativa e fatura** (`mp-webhook:53-64`): `amountCents`
  nunca é comparado a `sub.priceCents`; fallback `amount || priceCents` faz um
  aprovado de R$ 0 gerar invoice pelo preço cheio (NFS-e de valor não recebido).
- **Máquina de estados sem guarda** (`PlanSubscriptionService.ts:87-116`): toda
  transição inválida listada é alcançável — aceite regride estado, `mp-link`
  ressuscita cancelada, replay de webhook reativa. **Conserto raiz que mata G1
  e metade dos outros: uma função única de transição com whitelist de
  (de→para).**
- **`record-charge` manual sem idempotência** (`action/route.ts:57-65`): sem
  `mpPaymentId`, duplo POST → duas cobranças e **duas NFS-e reais**. Vale para o
  modo manual — conferir antes de liberar.
- **Trilha do termo grava só a string da versão** (`terms.ts:14`), não hash do
  texto; o próprio arquivo admite que editar sem bump quebra os aceites. Guardrail
  4: é aviso, não trava. **Conserto:** snapshot/hash do texto no aceite.
- **IP da trilha forjável** (`rate-limit.ts:63-69`): confia no 1º `x-forwarded-for`.
  Enfraquece a prova jurídica do aceite e o rate limit. **Conferir na infra do
  Railway** se o header é normalizado antes de confiar nele.

## ⚪ BAIXO
- Token de aceite nunca expira, mas a mensagem promete "expirado" (`accept:30`).
- `recordAcceptance` responde `ok` com `paymentUrl` de sub já cancelada.
- `refresh-invoice` não valida que o invoice pertence à sub do path.

---

## O que a auditoria NÃO cobriu (e devia virar teste)
O único teste de billing (`PlanNfseService.test.ts`) cobre bem a NFS-e e o gate
fiscal — e **nada** do resto: aceite, idempotência de webhook, transições de
estado, conversão reais→centavos, `MercadoPagoPlatformBilling`. O verde do
vitest não prova o fluxo de dinheiro. **Cada GRAVE acima merece um teste que
falha hoje.**

## Decisão que é do CEO, não do código
O termo está em **`v1-minuta`** com decisões ⬜ abertas. **Não colher aceite real
sobre minuta não confirmada** — o próprio `terms.ts` admite. Fechar as ⬜ e
bumpar a versão antes do primeiro cliente.

## Proposta de vitrine (promoção é do Diretor do Foocci)
> "Em billing com gateway recorrente, cancelar/recriar do nosso lado sem
> cancelar/verificar do lado do gateway é o defeito default — auditar sempre o
> par local↔remoto de cada transição de estado."
> Origem: esta auditoria, PRs #70/#71, 03/08/2026.
