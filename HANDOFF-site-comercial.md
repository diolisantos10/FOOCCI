# HANDOFF — Site comercial da Foocci (briefing para web designer)

> **Repositório:** `diolisantos10/FOOCCI` (confirmado via `git remote -v`).
> **Branch onde este documento foi commitado:** `claude/eloquent-brahmagupta-vZZjs`.
> **Data:** 2026-08-01 · **Autor:** PM (Claude) desta sessão.
> **Assunto desta sessão:** produção do *briefing completo* do **site comercial B2B** da Foocci, para enviar a um web designer externo. Não houve mudança de código de produto.

---

## 0. Aviso de segredos (repo PÚBLICO)

- Este documento não contém chave, token, senha, string de conexão, telefone, e-mail ou nome de cliente real. Onde uma credencial precisaria ser citada, use `<credencial em variável de ambiente>`.
- **Nenhum segredo foi colado nesta sessão.** Não li `.env` nem imprimi variáveis. Nada a rotacionar por causa desta conversa.

---

## 1. O que é o projeto + STACK REAL

**Foocci** é um **sistema operacional para restaurantes** (SaaS multi-restaurante), com duas superfícies — painel do lojista (marca Foocci, laranja) e loja white-label do cliente final — cobrindo cardápio → pedido → pagamento → comanda → nota, mais CRM, marketing e atendimento por IA. O mesmo repositório abriga um **segundo produto**: a esteira de agência (`/agencia`, `/api/agency`).

**Stack real — lida de `package.json` nesta sessão (não de memória):**

| Camada | O que está no `package.json` |
|---|---|
| Framework | **Next.js 14.2.35** (App Router) · React 18.3 |
| Linguagem | **TypeScript 5.5** |
| Banco/ORM | **Prisma 5.16** (`@prisma/client` + `prisma`) → PostgreSQL |
| IA | **`openai` ^6.29.0** |
| Auth | **NextAuth 4.24** + `bcryptjs` |
| Estilo | **Tailwind CSS 3.4.6** (+ `autoprefixer`, `postcss`) |
| Arquivos/imagem | **`@aws-sdk/client-s3` 3.x**, **`sharp` 0.34**, `qrcode` 1.5, `xlsx` 0.18, `pdf-parse` 2.4 |
| Validação | `zod` 3.23 |
| UI utils | `@dnd-kit/*`, `date-fns` + `date-fns-tz` |
| Testes | **Vitest 2.1** (unit) · **Playwright 1.49** (e2e) |
| Deploy | Railway (Nixpacks, Node 18) — conforme `nixpacks.toml`/`railway.toml` e `FICHA_TECNICA.md` |

**Serviços externos (fora do `package.json`, chamados via HTTP/webhook):** Evolution API (WhatsApp, self-hosted), MercadoPago e Stone (pagamento), Saipos (PDV). Confirmados pela existência das rotas em `src/app/api/` (`payments/mercadopago`, `payments/stone`, `integrations/saipos`, `webhooks/evolution`).

> ⚠️ O campo `name` do `package.json` é **`crm-restaurante`**, não "foocci". É legado de nome — ver Armadilhas §6.

---

## 2. O que esta sessão produziu, e ONDE ele vive

- Um **briefing completo do site comercial** (posicionamento, dores, 3 pilares, funcionalidades, planos, tom de marca, direção visual, estrutura de páginas, wireframe da home seção a seção com copy de partida, SEO, requisitos técnicos, entregáveis do designer, e lista de `[PREENCHER]`).
- **Onde vive:** somente no transcript desta sessão de chat. **Não foi salvo como arquivo no repositório**, por decisão explícita do CEO (ver Decisão D2). Se esta sessão morrer sem o texto ter sido enviado ao designer, **o briefing se perde** (ver Aberto §5.1).

---

## 3. DECISÕES (com data e PORQUÊ)

**D1 · 2026-08-01 — Público do site é B2B: donos de restaurante.**
Por quê: o modelo de receita é assinatura SaaS por restaurante; posicionar como B2C (consumidor que pede comida) ou como site de agência quebraria o funil e a mensagem. O ângulo emocional escolhido é "pare de pagar comissão de marketplace e seja dono dos seus clientes". *Sem esse porquê, alguém "melhora" o site para o consumidor final e destrói a conversão B2B.*

**D2 · 2026-08-01 — Briefing entregue só no chat, sem arquivo no repo.**
Por quê: escolha do CEO — ele mesmo vai enviar ao web designer e não quis versionar o texto. Consequência aceita: o briefing não está no git. *Não insista em salvar como arquivo sem pedir; foi vetado de propósito. (Este HANDOFF preserva as decisões, não o texto integral.)*

**D3 · 2026-08-01 — Preços, planos detalhados, depoimentos, métricas, logos e contatos ficam como `[PREENCHER]`.**
Por quê: produto em fase piloto (primeiro restaurante real). Número/depoimento inventado no site é passivo comercial e fere o guardrail "nunca vender como pronto o que está em piloto". *Se o próximo preencher com dado fictício "só para ver o layout", precisa marcar como exemplo — nunca deixar vazar como real.*

**D4 · 2026-08-01 — Narrativa em 3 pilares: Venda mais · Fidelize e reative · Decida com dados.**
Por quê: mapeia os módulos reais (IA vendedora + canal próprio de pedido; CRM/campanhas/fidelidade; analytics/atribuição) numa história que o dono de restaurante entende sem jargão. *É a espinha da home; mudar os pilares muda todo o site.*

---

## 4. O que foi TENTADO e não funcionou (correções pegas nesta sessão)

Estas são as ciladas que já paguei — o próximo não precisa repetir:

1. **Chamei o 3º plano de "PREMIUM" (de memória, via grep amplo). ERRADO.** O enum real é `Plan { STARTER, GROWTH, PRO }` — `prisma/schema.prisma:155-159` **e** a migração inicial (`20260314000000_initial_schema/migration.sql:12`) batem. O "PREMIUM" que apareceu no grep pertence a **outro** enum (`CRMMessageStyle`), não a planos. → **Na página de preços, o 3º plano é `PRO`.**

2. **Minha 1ª leitura do `tailwind.config.ts` veio incompleta** e sugeria que só existiam as cores `brand` + a fonte. Ao reler o arquivo inteiro (44 linhas), ele **também** define os tokens do Brand Book (`ink/paper/canvas/line/line2/muted/ink2`) e declara a filosofia **"minimalismo premium — 90% neutro + 10% laranja"**. → Direção visual do site **não** é "laranja protagonista"; é **neutro dominante com laranja de acento**. *Lição: reler o arquivo inteiro antes de afirmar o que ele contém.*

3. **Cogitei salvar o briefing como arquivo no repo** (reflexo do padrão "implementação → commit"). O CEO vetou (D2). Não reabrir sem pedido.

---

## 5. O que ficou ABERTO (com "o que quebra se ninguém mexer")

**5.1 · O site comercial ainda não existe — só o briefing foi feito.**
O que quebra: nada em produção. Mas o briefing é *chat-only* (D2); se ninguém enviar ao designer nem persistir, **o trabalho desta sessão desaparece** quando a sessão encerrar. Ação: enviar ao web designer, ou pedir ao PM para persistir como arquivo.

**5.2 · Lista de `[PREENCHER]` pendente com o CEO.**
Itens: preço e escopo dos 3 planos (STARTER/GROWTH/PRO); definição do CTA principal (demo × teste grátis × WhatsApp); URL de login/app; domínio; depoimentos/casos reais; logos de clientes; contato comercial; CNPJ/razão social; IDs de Analytics/Pixel; arquivos de logotipo.
O que quebra: sem isso o designer **não fecha** o site — vai inventar dado (risco de D3) ou travar na página de preços e no rodapé legal.

**5.3 · Nome do 3º plano na comunicação.**
O que quebra: se a página de preços usar "PREMIUM", **não bate com o banco** (`PRO`). Cliente escolheria um rótulo que o sistema não reconhece. Manter `PRO` no material.

---

## 6. ARMADILHAS deste repositório (o que parece certo e não é)

1. **`FICHA_TECNICA.md` e `HANDOFF_PARA_IA.md` estão DESATUALIZADOS.** Eles (a) chamam o repo de `diolisantos10/CRM_RESTURANTE` e o diretório de `/home/user/CRM_RESTURANTE`; (b) apontam branch `claude/remove-legacy-runner-q8iXa`; (c) descrevem o produto como "CRM de WhatsApp com agente de IA" — escopo **muito mais estreito** que a realidade (ver §7.1). O repo real é `diolisantos10/FOOCCI`. **Não use esses dois arquivos para descobrir repo, branch ou escopo atual.**

2. **`package.json name = crm-restaurante`.** Parece outro projeto; é o mesmo (nome legado). Não renomeie por impulso — pode afetar deploy.

3. **Três nomes de branch circulando.** `CLAUDE.md` diz que a padrão é `claude/remove-legacy-runner-q8iXa` e a de trabalho é `claude/foocci-brain-vaamrx`; esta sessão foi designada para `claude/eloquent-brahmagupta-vZZjs` (onde commitei). **Qual é a branch padrão viva hoje: não confirmado.** Confirme antes de abrir PR.

4. **Existem DOIS sistemas de IA, não um.** (a) `WaiterBrainV2` — motor `decide()` puro/stateless para web/QR (`docs/waiter-web-final-handoff.md`); (b) o pipeline WhatsApp `AIOrderService` descrito em `FICHA_TECNICA.md`. Não trate "o agente" como peça única.

5. **Ponteiros para armadilhas de produção já documentadas** (relevantes para quem mexer em deploy/integração, não no site) — em `docs/PILOT_OPERATING_PLAYBOOK.md`:
   - `STONE_CLIENT_ID` ausente → sistema devolve **URLs de teste fictícias** em vez de bloquear (falha silenciosa).
   - `WEBHOOK_GLOBAL_SECRET` (Evolution) ≠ `webhookSecret` (Foocci) → Foocci responde **200 mas descarta o evento**; mensagens somem de `/atendimento` sem erro visível.
   - `NEXT_PUBLIC_APP_URL` errada → links de delivery/QR saem vazios/quebrados.

---

## 7. O que EU SEI e não está escrito em lugar nenhum

**7.1 · A superfície real do produto — enumerada das rotas em `src/app`, não de um doc.**
Nenhum documento consolida isto (a `FICHA_TECNICA.md` cobre só a fatia de IA). O que de fato existe hoje:
- **Canais do cliente final:** `/pedido/[slug]` (delivery), `/qr/[slug]` (cardápio de mesa), `/l/...` e `/r/[code]` (links rastreáveis/curto).
- **Painel do lojista:** dashboard/cockpit; `menu` (com upload/import, variantes, opcionais, extras, promoções, imagens); `orders` (com impressão, pagamento, pedido manual); **CRM** (clientes, audiência, campanhas, automações, níveis/fidelidade, atribuição, import, action-center, review-request, recuperação de carrinho); **analytics** (overview/agent/operations/retention/menu-sources); `atendimento` (inbox WhatsApp + handoff); `agente-ia`/`waiter-lab`/`chat-sim`/`ai-simulator`; `marca`; `marketing`/`promotions`; `canais`; `integracoes` (WhatsApp/Saipos); `settings` (store, operation, delivery, payments, whatsapp, ai, agent, crm, team, policies, impressoras, marca, experience); `onboarding`.
- **Admin global:** `restaurants`, `preflight`, `agentes` (waiter/crm + testes), `build-os`, `diagnostics`, `manual-operacional`.
- **2º produto:** esteira de agência (`/agencia`, `/api/agency`).
→ **Conclusão para o marketing:** a Foocci é um *sistema operacional de restaurante*, não um "chatbot de WhatsApp". Vender só a IA subvende o produto.

**7.2 · Identidade visual factual para o site (reunida daqui):**
- Laranja Foocci **`#F97316`** (accent) · hover **`#EA580C`** — `tailwind.config.ts:19-20`, comentado como "Laranja Foocci".
- Filosofia do Brand Book embutida no config: **"minimalismo premium — 90% neutro + 10% laranja"** (`tailwind.config.ts:26`).
- Tokens semânticos: `ink #0B0B0B` (títulos), `ink2 #5C5C58` (corpo), `paper #FFFFFF`, `canvas #F6F6F4` (fundo off-white quente), `line #E9E9E6` / `line2 #E5E5E5` (bordas), `muted #8A8A86` (texto secundário) — `tailwind.config.ts:27-33`.
- Fonte **Inter** (`tailwind.config.ts:35-37`). Raios (do `CLAUDE.md`): card `rounded-2xl`, botão/input `rounded-xl`; pesos 400/600.
- Referências estéticas declaradas (`CLAUDE.md`/`DESIGN.md`): **Linear/Stripe/Vercel** no painel, **iFood/Rappi** na loja.
→ Isto dá ao designer a paleta e a filosofia **reais** do produto para o site não destoar do app.

**7.3 · As decisões do briefing (D1–D4) e o 3º plano correto (`PRO`)** — registrados aqui pela primeira vez.

---

## 8. Fatos e o grau de confiança

| Fato | Confiança | Fonte |
|---|---|---|
| Repo real = `diolisantos10/FOOCCI` | Confirmado | `git remote -v` |
| Enum `Plan` = STARTER/GROWTH/PRO | Confirmado | `schema.prisma:155-159` + migração inicial |
| Cores/tokens/fonte da marca | Confirmado | `tailwind.config.ts` (relido inteiro) |
| Stack (versões) | Confirmado | `package.json` |
| Pagamentos/WhatsApp/PDV externos | Confirmado | rotas em `src/app/api` |
| Deploy Railway/Nixpacks/Node 18 | Provável | `nixpacks.toml`/`railway.toml` + `FICHA_TECNICA.md` (não reexecutei o deploy) |
| Qual a branch **padrão** viva hoje | **Não confirmado** | 3 nomes divergentes (§6.3) |
| `FICHA_TECNICA.md`/`HANDOFF_PARA_IA.md` refletirem o estado atual | **Falso** | apontam repo/branch/escopo antigos (§6.1) |

---

## 9. Próximo passo sugerido

1. Enviar o briefing (que está no chat) ao web designer **ou** pedir ao PM para persisti-lo como arquivo, resolvendo o risco 5.1.
2. CEO preencher a lista `[PREENCHER]` (5.2), com atenção ao rótulo `PRO` do 3º plano (5.3).
3. Quando houver design de volta, o trabalho de tela passa pelo especialista `interface` (dono do `DESIGN.md`), respeitando "90% neutro + 10% laranja".
