# CR — Auditoria de segurança cibernética do Foocci (03/08/2026)

> **Aberta em:** 03/08/2026 · Diretor Geral, por pedido direto do CEO ("avaliação de
> segurança cibernética do Foocci"), às portas de faturar de verdade.
> **Método:** 4 auditores adversariais **só de leitura** (agente `qualidade`), em
> paralelo, cada um numa frente. Cada achado com prova em `arquivo:linha`.
> **Para:** Diretor do Foocci executar, na ordem abaixo. **Prioridade: P0 no 🔴.**

---

## Conclusão de negócio

O **núcleo está bem construído**: o isolamento entre restaurantes é sólido, os
segredos são bem guardados (criptografia forte, nada vaza para navegador/log/git),
não há injeção de SQL, a API externa é robusta, e **o medo nº1 — "qualquer um forja
um pagamento aprovado e ativa sem pagar" — foi REFUTADO** (o "aprovado" vem de uma
reconsulta ao Mercado Pago, não do aviso que dá para forjar).

**Um buraco trava o faturamento e precisa ser fechado antes de vender:** na loja
pública, **com o telefone da pessoa + o link do restaurante, dá para puxar o
endereço residencial completo dela, sem login nenhum.** É vazamento de dado pessoal
(LGPD, Foocci como Operadora). Não é cross-restaurante — é exposição de PII do
cliente final. E vem acompanhado de poder de **editar/apagar** os endereços da
vítima.

Fora isso: um bug de cobrança que **ressuscita assinatura cancelada** (cliente segue
sendo cobrado depois de cancelar), o segredo do webhook ausente no Railway, e uma
rota-fantasma com bypass de autenticação. Nada é sangramento aberto; tudo tem
correção clara.

---

## 🔴 CRÍTICO — trava o faturamento

### C1 · Telefone → endereço residencial completo, sem autenticação (vazamento de PII / LGPD)

A "área do cliente" da loja pública autoriza por **nível-tenant** ("este cliente é
deste restaurante") onde precisaria autorizar por **nível-cliente** ("você É este
cliente"). A cadeia:

1. `POST /api/pedido/[slug]/identify-customer` — dado o telefone, devolve o
   `customerId` + nome + total gasto + histórico. `identify-customer/route.ts:74-81`.
2. `GET /api/pedido/[slug]/customer-profile?customerId=…` — dado o `customerId`,
   devolve nome, telefone, e-mail e **todos os endereços salvos** (rua, número,
   complemento, bairro, cidade, CEP). `customer-profile/route.ts:33-46`.
3. `POST/PATCH/DELETE .../customer-address` — com o `customerId`, **cria/edita/apaga**
   endereços da vítima e troca o endereço padrão. `customer-address/[addressId]/route.ts:43`.

**Ataque (entrada → resultado):** o atacante tem o telefone da vítima e o slug da
loja → passo 1 devolve o `customerId` → passo 2 devolve o endereço de casa + e-mail.
O `customerId` opaco **não protege**, porque o passo 1 o entrega a partir do telefone.

**Confirmado por duas frentes independentes** (LGPD e isolamento). A frente de
isolamento classificou 🟡 por ser intra-tenant; a de LGPD classificou 🔴 por ser
vazamento de PII. **A síntese correta é 🔴**: sob LGPD, vazar o endereço de um
cliente é grave mesmo dentro do mesmo restaurante.

**Mismatch código × comentário:** `customer-profile/route.ts:8-9` afirma "no
cross-restaurant/customer leakage" — o código impede cross-restaurant, **não**
cross-customer. O comentário descreve uma proteção que não existe.

**Correção (com cuidado — guardrail 5: a trava não pode ser mais destrutiva que o
problema, não pode quebrar o fluxo de pedido do cliente que volta):**
- O `customerId` deixa de ser credencial de leitura. A leitura de perfil/endereço
  passa a exigir **prova de posse do telefone** — um código (OTP) enviado ao número,
  ou um token de sessão emitido só após essa verificação, atrelado ao fluxo de
  pedido.
- `identify-customer` **não devolve `customerId`** cru nem histórico/valor antes da
  verificação.
- **Dono:** especialista `operacao` (é o fluxo `/pedido`), com o `canais` no envio do
  OTP. Conferir que o cliente recorrente ainda tem uma experiência fluida.

---

## 🟠 ALTO

### A1 · Cancelar não cancela no Mercado Pago; o webhook ressuscita a assinatura cancelada
Cliente cancela → o admin só marca `CANCELADA` local, **não cancela o preapproval no
MP** (`PlanSubscriptionService.ts:122-127`) → o MP cobra no mês seguinte → o webhook
chega com "approved" e **reativa a assinatura cancelada** (`mp-webhook/route.ts:64` +
`activate()` limpando `canceledAt`, `:111-116`). Cobrança indevida recorrente e
eterna. **Correção:** `cancel()` cancela o preapproval no MP antes do update local; o
webhook nunca chama `activate` sobre uma sub `CANCELADA` (whitelist de transições).
**Dono:** `operacao`/billing. (É o G1 do CR #72 — segue vivo.)

### A2 · Rota-fantasma com bypass de autenticação por spoof de header
`/api/admin/delivery-quote` está em `PUBLIC_PATHS`, o middleware não sobrescreve os
headers de tenant nesse caminho, e o handler confia neles
(`delivery-quote/route.ts:29`). Um atacante sem sessão manda `x-restaurant-id: <vítima>`
+ `x-user-role: OWNER` e lê/escreve a config de frete de outro restaurante. Dado de
baixo valor e a rota é **órfã** (já substituída por `/api/orders/delivery-quote`,
essa segura). **Correção:** **apagar** a rota morta. **Dono:** `operacao`.

---

## 🟡 MÉDIO

- **M1 · Segredo do webhook MP ausente em produção** (`mpWebhookSecret:false`). Sem
  ele, a verificação de assinatura é **pulada** e a notificação é processada
  (`webhook/route.ts:199-210`, viola guardrail 2 na letra). Mitigado pela reconsulta,
  mas o certo é **setar o segredo no Railway** (fecha na hora) e trocar o
  fall-through por `return 401` (falha fechada). **Depende do CEO** (env) + `operacao`.
- **M2 · Parse de preço reduz o valor ~1000×.** `parseFloat("1.074") → R$ 1,07`
  (`AssinaturasClient.tsx:103`), ignorando o parser pt-BR que já existe
  (`price.ts:64-73`); servidor sem piso. Erro de operador, dinheiro real. **Correção:**
  usar `parsePrice` + validar piso no servidor. (G3 do CR #72.)
- **M3 · Assinatura ativa/fatura sem aceite do Termo** e cobra preço cheio mesmo se o
  valor pago for menor (`subscriptions/route.ts:52-55`, `mp-webhook/route.ts:59,64`).
  **Correção:** link de pagamento só após aceite; webhook recusa ativar sem
  `termsAcceptedAt`; comparar valor pago com o contratado. (G4 do CR #72.)
- **M4 · `/api/health` público expõe a postura de segurança** (inclusive que o webhook
  está sem verificação — `health/route.ts:62-68`). Só booleano, não vaza valor, mas
  entrega a fraqueza. **Correção:** mover `checks` para trás de auth de admin.
- **M5 · Admin global** lê PII de todos os tenants atrás de um único `ADMIN_SECRET`
  estático, com token de sessão determinístico e sem expiração (`admin-auth.ts:34`) e
  aceitando o segredo cru no header. Bem-feito no constant-time, mas concentração de
  risco. **Correção:** sessão com expiração/rotação; descontinuar o header cru.
- **M6 · `saipos/debug-auth`** pode ecoar um token vivo num campo rotulado "seguro
  para compartilhar" (`route.ts:150,254`). **Correção:** omitir o preview quando a
  resposta é 200 com token.
- **M7 · Fallback `INSTAGRAM_APP_SECRET → META_APP_SECRET`** mascara credencial
  ausente no status de prontidão (falso "configurado") (`instagramLoginOAuth.ts:45,65`).
  **Correção:** distinguir secret dedicado de fallback no status.
- **M8 · XSS em IDs de analytics** validado no render mas não na gravação
  (`SiteAnalytics.tsx` / `SiteSettingsService.ts:127-131`). Input é do staff, por isso
  🟡. **Correção:** validar também na gravação (defense-in-depth).

---

## Travas estruturais (guardrail 4 — código é trava, não prompt)

A disciplina hoje é mantida por **hábito**, não por trava. Dois gates de CI que
impedem a classe inteira de reentrar:
1. **Nenhuma rota em `PUBLIC_PATHS` pode importar `getTenantContext`/`getTenantId`** —
   caminho público + header de tenant = furo por construção (a raiz da A2).
2. **Toda rota sob `/api/admin/**` precisa chamar uma guarda de admin conhecida** —
   falha o build se faltar (senão uma rota nova "esquece" e nasce aberta).

---

## O que PASSOU (a parte boa, com prova)

- Isolamento entre restaurantes: `restaurantId` sempre da sessão, scoping consistente
  em pedidos/clientes/campanhas/dinheiro. Sem IDOR cross-tenant.
- Segredos/tokens: AES-256-GCM sem fallback para texto puro; nada vaza para
  navegador/log/git; gate admin constant-time.
- Pagamento: "forjar aprovado" não funciona (decisão vem de reconsulta ao MP);
  idempotência sólida (replay não cobra duas vezes); valor sempre server-side.
- API externa `/api/v1`: chave com hash + escopo + filtro por tenant; respeita opt-out
  LGPD.
- SQL injection: nenhuma — todas as raw queries são parametrizadas.

---

## Divisão de responsabilidade

| Bucket | Itens |
|---|---|
| **Trava o faturamento (P0)** | C1 |
| **Diretor do Foocci corrige** | C1, A1, A2, M2, M3, M4, M6, M7, M8 + os 2 gates de CI |
| **Depende do CEO (Railway/env)** | Setar `MERCADO_PAGO_WEBHOOK_SECRET` (M1); confirmar se `MP_PLATFORM_ACCESS_TOKEN` está setado (define se A1/M3 estão armados); confirmar força do `ADMIN_SECRET` (M5) |

---

## O que a auditoria NÃO cobriu (não inferir do silêncio)

- Valores reais no Railway (env) — auditoria é estática, não vê o ambiente.
- As ~200 rotas linha a linha — varredura sistemática + leitura profunda das
  sensíveis; risco residual baixo, não zero.
- Matriz completa de papéis intra-tenant (OWNER × MANAGER × atendente).
- SSRF em "webhook configurável" pelo lojista (se existir) — ponta solta.
- Execução real dos ataques (mandato de só-leitura) — explorabilidade provada por
  código.

---

*Proveniência: 4 auditorias `qualidade` só-leitura, 2026-08-03, sob a branch de
trabalho. Vitrines propostas nas oficinas de `qualidade`/`meta` — promoção é do
Diretor.*
