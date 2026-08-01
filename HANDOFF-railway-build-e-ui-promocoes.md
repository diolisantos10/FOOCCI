# HANDOFF — Railway build + UI Promoções / Automações

> Sessão: `claude/init-saas-project-aQpEZ`  
> Data: 2026-08-01  
> Branch de push: `claude/init-saas-project-aQpEZ` (local branch `main`)  
> Repositório: `diolisantos10/CRM_RESTURANTE` (público)

---

## O que é o projeto e a stack real

Sistema operacional para restaurantes (Foocci). Stack confirmada em `package.json`:

- **Next.js 14.2.35** (App Router, `"use client"` / Server Components)
- **Tailwind CSS 3.4** + PostCSS + Autoprefixer
- **Prisma 5.16** / PostgreSQL
- **NextAuth 4.24** (JWT, tenant via headers `x-restaurant-id` / `x-user-id`)
- **OpenAI SDK** + **Anthropic SDK** (ambos em `dependencies`)
- **Railway** como plataforma de deploy (nixpacks v1.41.0 → Docker)
- Build: `prisma generate && next build` | Start: `bash scripts/start-production.sh`

---

## Decisões tomadas nesta sessão

### 1. `tailwindcss`, `postcss`, `autoprefixer` movidos para `dependencies`
**Data:** 2026-08-01  
**Porquê:** Railway/nixpacks roda `npm ci` com `NODE_ENV=production`, o que omite `devDependencies`. Sem Tailwind no build, o Next.js falhava com `Cannot find module 'tailwindcss'`. Mover para `dependencies` garante presença no container de produção. A evidência foi a contagem de pacotes saltar de 206 → 283 após a mudança.

### 2. `prisma` CLI movido de `devDependencies` para `dependencies`
**Data:** 2026-08-01  
**Porquê:** A CLI do Prisma é usada em dois momentos de produção:
- Build: `prisma generate && next build` (gera o client)
- Runtime: `scripts/start-production.sh` chama `npx prisma migrate deploy`

Com `NPM_CONFIG_PRODUCTION=true`, a CLI não estava disponível. Além disso, `@prisma/client` (o runtime) já estava em `dependencies` — ter a CLI separada era inconsistente.

### 3. `nixpacks.toml` criado com `npm ci --include=dev`
**Data:** 2026-08-01  
**Porquê:** Mesmo com Tailwind e Prisma em `dependencies`, o Railway ainda omitia ferramentas de build como `eslint-config-next` e `typescript`. O `nixpacks.toml` força a fase de install a incluir devDependencies, resolvendo isso de forma definitiva sem depender de mover pacote por pacote.

**⚠️ Atenção:** O `nixpacks.toml` também tem um bloco `[start]` com `cmd = "bash scripts/start-production.sh"`. O comentário diz "Emergency P3009 recovery — remove after confirmed stable". Isso foi adicionado por outra sessão (não esta). **Não remover sem confirmar que a migração `20260518000001_add_distance_min_fee_km` está estabilizada em produção.**

### 4. Aba "Automações" removida do CRM
**Data:** 2026-08-01  
**Porquê:** O CEO pediu para mover as automações para dentro da seção de Promoções. A aba foi removida do `CRMClient.tsx`, o fetch de automações foi removido do `crm/page.tsx` (economia de uma query por carregamento de página), e o link "configure na aba Automações" na aba Agente IA foi trocado por link para `/promotions`.

### 5. Drawer "Nova Promoção" refatorado — ocupa toda a área de conteúdo
**Data:** 2026-08-01  
**Porquê:** O drawer original era `fixed right-0 max-w-lg` — um painel lateral estreito. O CEO queria que ocupasse toda a área de conteúdo (ao lado do sidebar), como se fosse uma página inteira.

**Implementação:**
- `fixed inset-y-0 left-0 lg:left-56 right-0 z-50` — cobre do limite do sidebar (`w-56` = `224px`) até a borda direita
- Backdrop também limitado à mesma área (`left-0 lg:left-56`)
- Duas abas no header: "Nova promoção" / "🤖 Automações WhatsApp"
- Conteúdo centrado com `max-w-3xl mx-auto` dentro do form

### 6. Automações integradas como aba dentro do drawer de Promoções
**Data:** 2026-08-01  
**Porquê:** As automações (Reativação, Aniversário, Pós-pedido) não cabem semanticamente dentro do formulário de "criar promoção individual", mas o CEO queria que ficassem dentro da mesma área. A solução foi um drawer com duas abas, onde a aba "Automações WhatsApp" renderiza o `AutomationsSection` que busca dados de `/api/crm/automations` via `useEffect` no `PromotionsClient`.

---

## O que foi tentado e não funcionou

### Railway "Module not found" para arquivos-fonte — causa raiz nunca reproduzida
**O erro:** Railway reportava `Module not found: Can't resolve '@/validators/brand-config'` (e mais 4 arquivos: `@/validators/whatsapp-agent`, `@/lib/qa/scenarios`, `@/lib/qa/critical-scenarios`, `@/lib/crm-messages`) durante o webpack do `next build`.

**O que foi verificado:**
- Todos os 5 arquivos existem em `git ls-tree HEAD` com SHAs válidos ✓
- `git ls-files --eol` mostra LF correto em todos ✓
- `tsconfig.json` tem `"@/*": ["./src/*"]` correto ✓
- `next.config.js` não tem override de webpack que quebre ✓
- `NPM_CONFIG_PRODUCTION=true npm run build` — passa localmente ✓
- `NODE_ENV=production npm run build` — passa localmente ✓
- `npx tsc --noEmit` — zero erros ✓
- Sem `.dockerignore` que pudesse excluir os arquivos ✓
- Sem edge runtime nos arquivos importadores ✓

**O que NÃO foi testado:** reproduzir dentro de um container Docker real idêntico ao Railway.

**Hipóteses não confirmadas:**
1. Railway tinha uma build cache de `.next/` de antes desses arquivos existirem (compilação incremental confusa)
2. O `prisma generate` falhava silenciosamente por algum motivo, corrompendo o estado antes do webpack
3. Versão do Node.js no Railway divergia da local (v22.22.2 local, Railway não confirmado)

**Estado ao encerrar:** O `nixpacks.toml` com `npm ci --include=dev` foi pushado como tentativa de fix. **A próxima sessão precisa confirmar se o Railway buildou com sucesso depois desse push.** O link da Railway para o deploy pode mostrar se o build passou.

---

## O que ficou aberto

| Item | O que quebra se ninguém mexer |
|---|---|
| **Railway build não confirmado** | Não sabemos se os erros de "Module not found" sumiram com o `nixpacks.toml`. Se o build ainda falha, produção está parada. Checar o dashboard da Railway. |
| **Bloco `[start]` no `nixpacks.toml` — "remove after confirmed stable"** | Está marcado como recuperação de emergência P3009. Se a migração `20260518000001` estiver estabilizada, o bloco pode ser removido. Se não remover, não há problema — é idempotente. |
| **WhatsApp QRPanel — comportamento com pairingCode não testado na UI** | A rota `/api/evolution/qr` agora retorna `{ pairingCode, code }` quando a Evolution responde com código de pareamento em vez de imagem QR. O `WhatsAppQRPanel` no `IntegrationsCenterClient.tsx` só trata `base64` — o pairing code cai no branch "connected" (errado). Não causa crash, mas mostra o estado errado. |
| **Automações no drawer — estado inicial sem dados visíveis até o fetch completar** | `PromotionsClient` faz `useEffect(() => fetch('/api/crm/automations'))` que não tem loading state. Na aba Automações do drawer, as 3 cards aparecem com valores default (toggle off, campos vazios) até o fetch terminar. Pode parecer que as configurações foram perdidas. |

---

## Armadilhas deste repositório

### A branch local é `main` mas o push vai para `claude/init-saas-project-aQpEZ`
O comando certo é `git push origin main:claude/init-saas-project-aQpEZ`. Usar `git push -u origin claude/init-saas-project-aQpEZ` falha com "non-fast-forward" porque a branch remota rastreia um histórico diferente do HEAD local. **Não crie uma branch local chamada `claude/init-saas-project-aQpEZ` — vai partir o estado.**

### `nixpacks.toml` tem dois responsáveis diferentes
A seção `[phases.install]` foi adicionada nesta sessão. A seção `[start]` foi adicionada por outra sessão (emergência P3009). São peças independentes. Remover uma não deve afetar a outra. O comentário "Remove after confirmed stable" aplica-se **apenas** ao bloco `[start]`.

### `railway.toml` tem `startCommand` redundante com `nixpacks.toml`
Ambos apontam para `bash scripts/start-production.sh`. O Railway usa o `nixpacks.toml` como prioridade. O `startCommand` no `railway.toml` funciona como fallback se o `nixpacks.toml` for removido. Não é bug — é camada dupla intencional segundo comentário do arquivo.

### A rota `/api/evolution/qr` evoluiu além do que esta sessão criou
O arquivo atual tem lógica de `extractQr`, `pairingCode`, restart handling e `qrDiagnosticMeta` que não estava no design inicial desta sessão. Essa lógica foi adicionada por sessão anterior. Se a próxima sessão precisar mexer na rota, ler o arquivo inteiro — não assumir que é simples.

### O drawer de Promoções agora tem z-index que conflita com o sidebar no mobile
Em mobile, o sidebar usa `z-50` (quando aberto). O backdrop do drawer usa `z-40`. Se alguém abrir o drawer de promoções com o sidebar mobile aberto, os dois se sobrepõem de forma estranha. Em desktop isso não acontece porque o sidebar é `lg:static` (fora do z-index stack).

### `WhatsAppQRPanel` não usa `isActive` — e isso é intencional
Em algum momento o painel foi refatorado para sempre renderizar independente do estado da integração. Se você ver `WhatsAppQRPanel({ isActive })` em algum branch antigo, a remoção da prop foi deliberada: o painel precisa aparecer justamente quando a integração está "Não configurado" para o usuário conseguir conectar.

---

## O que eu sei e não está escrito em lugar nenhum

### O build local passa mas não nos diz que o Railway vai passar
O Railway tem alguma diferença de ambiente que faz alguns arquivos-fonte não serem encontrados pelo webpack — mesmo com os arquivos no git, os imports corretos, e o tsconfig certo. Essa diferença **não foi reproduzida localmente** em nenhuma combinação de flags testadas (`NODE_ENV=production`, `NPM_CONFIG_PRODUCTION=true`, etc.). A aposta atual é que o `nixpacks.toml` resolva forçando devDeps. Se não resolver, o próximo passo é gerar o Dockerfile que o nixpacks produziria e rodar localmente com `docker build`.

### A `AutomationsSection` em `PromotionsClient` guarda estado local — salvar em uma aba não afeta a outra
O componente inicializa a partir de `initialAutomations` (prop) que vem do fetch no mount. Se o usuário salvar uma automação na aba, o estado local atualiza, mas o `PromotionsClient` não sabe disso. Se o drawer for fechado e reaberto, o `useEffect` roda de novo e sobrescreve com o que vier da API — o que deve ser correto (os dados salvos). Mas há uma janela de race condition se o fetch for lento.

### O sidebar tem `w-56` (224px) e isso está hard-coded no drawer
O drawer usa `lg:left-56` para começar depois do sidebar. Se o sidebar mudar de tamanho (ex: ser expandido para `w-64`), o drawer vai sobreponer parte dele. O valor `56` (224px) não está em variável CSS — está duplicado em dois lugares: `Sidebar.tsx` e `PromotionDrawer` em `PromotionsClient.tsx`.

### A query de automações foi removida do CRM sem documentar onde ela foi
`crm/page.tsx` antes fazia `prisma.cRMAutomation.findMany(...)` na carga da página. Agora a página de Promoções busca esse dado via fetch client-side (`useEffect`). Se alguém olhar o `crm/page.tsx` e estranhar a ausência, não é esquecimento — é intencional. O dado agora vive em `/api/crm/automations` e é puxado pela UI de Promoções.

---

## Commits desta sessão (em ordem)

```
234e625  fix(build): move tailwindcss/postcss/autoprefixer to dependencies for Railway
edf8b86  fix(whatsapp): show QR panel regardless of integration active status
b904bfa  feat(whatsapp): add QR code connection panel in integrations dashboard
b03e52c  fix(build): install devDependencies on Railway + move prisma to dependencies
f3f580f  feat(ui): move automações from CRM to Promoções + widen Nova Promoção drawer
4d43511  fix(promotions): drawer ocupa área de conteúdo completa + automações como aba interna
```

Branch de push: **`claude/init-saas-project-aQpEZ`** (remoto em `diolisantos10/CRM_RESTURANTE`)
