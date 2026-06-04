# Foocci — Implementation Roadmap V1

> Roadmap de implementação do site público, em 6 fases.
> Versão 1 · 2026-06-04 · Branch: `claude/remove-legacy-runner-q8iXa`.
> Legenda: ✅ concluída · 🔜 próxima · ⏳ futura.

**Regra transversal (todas as fases):** não modificar `/pedido`, `/qr`, admin,
dashboard, checkout, webhooks de WhatsApp, comportamento de API, schema Prisma ou
migrações. Liberação de rota pública é sempre **aditiva** no `middleware.ts`.

---

## Fase 1 — Base segura do site ✅

**Meta:** criar a rota de marketing `/site` isolada, sem tocar fluxos de produto.

- **Escopo:** rota `/site`, layout/page, liberação pública no middleware.
- **Arquivos afetados:** `src/app/site/layout.tsx`, `src/app/site/page.tsx`,
  `src/middleware.ts` (1 linha aditiva).
- **Riscos:** expor rota protegida; colidir com `/`. → Mitigado: `/site` é novo,
  `/` intocado, middleware apenas adiciona allowlist.
- **Critérios de aceite:** `/site` = 200 público; `/` redireciona como antes;
  `/dashboard` = 307; `/api/*` = 401.
- **Validação:**
  ```bash
  npx tsc --noEmit
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/site        # 200
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/             # 307
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/dashboard    # 307
  ```

---

## Fase 2 — Home premium v1 ✅

**Meta:** construir a home pública com narrativa comercial completa.

- **Escopo:** 13 seções (hero → CTA final), header/footer, CTA fixo mobile,
  mockups em CSS, ícones SVG inline, metadata SEO.
- **Arquivos afetados:** `src/components/marketing/*` (20 arquivos),
  `src/app/site/page.tsx` (composição + metadata).
- **Riscos:** dependências novas; dados falsos; mobile ruim. → Mitigado: zero
  dependências; sem preço/métrica/depoimento falso; mobile-first validado.
- **Critérios de aceite:** todas as seções renderizam; `robots:index`; lint limpo;
  sem overflow horizontal.
- **Validação:**
  ```bash
  npx tsc --noEmit
  npx next lint --dir src/components/marketing --dir src/app/site
  # render: GET /site = 200 com conteúdo e <meta robots="index, follow">
  ```

---

## Fase 3 — Camada de conversão 🔜

**Meta:** melhorar CTA, WhatsApp, formulário de demonstração, captura de lead e
CTA fixo mobile.

- **Escopo:** número de WhatsApp oficial; backend de captura de lead (ou
  integração com CRM existente, **sem** criar endpoint falso); eventos de
  conversão; refinos de CTA.
- **Arquivos prováveis:** `src/components/marketing/config.ts` (número),
  `src/components/marketing/DemoForm.tsx` (submit real), possível nova rota de API
  **de marketing** isolada (ex.: `src/app/api/site-lead/route.ts`) — somente se
  aprovado; deve ser pública e isolada do produto.
- **Riscos:** criar endpoint que toque dados de produto; lead falso; vazar PII.
  → Mitigar: endpoint de lead isolado, validado, com consentimento LGPD.
- **Critérios de aceite:** WhatsApp abre com número real; form envia para destino
  real (ou WhatsApp pré-preenchido); nenhum fluxo de produto afetado.
- **Validação:**
  ```bash
  npx tsc --noEmit
  npx next lint --dir src/components/marketing --dir src/app/site
  # testar submit do form e link de WhatsApp manualmente
  ```
- **Pré-requisitos:** número de WhatsApp de vendas; definição do destino do lead;
  páginas legais (Fase 4) antes de captar PII em produção.

---

## Fase 4 — Páginas internas ⏳

**Meta:** criar `/como-funciona`, `/precos`, `/demonstracao`, `/sobre` e as páginas
legais.

- **Escopo:** páginas dedicadas (ver `backlog-v1.md` → P2) + liberação pública de
  cada rota no middleware.
- **Arquivos prováveis:** `src/app/site/como-funciona/page.tsx` (e equivalentes),
  novos componentes em `src/components/marketing/`, `src/middleware.ts` (allowlist
  aditivo, ou já coberto por `^/site` se as páginas ficarem sob `/site/*`).
- **Riscos:** páginas legais ausentes ao captar dados; conteúdo fino; links
  quebrados no footer. → Mitigar: publicar legais antes de captar PII; substituir
  os `href="#"` por rotas reais.
- **Critérios de aceite:** cada página = 200, indexável (exceto legais), com CTA e
  SEO próprios; footer sem `#` para páginas já existentes.
- **Validação:**
  ```bash
  npx tsc --noEmit
  npx next lint --dir src/app/site --dir src/components/marketing
  # GET de cada nova rota = 200
  ```

---

## Fase 5 — SEO e aquisição ⏳

**Meta:** criar blog, páginas de solução (V2), páginas de segmento (V3) e estratégia
de conteúdo (V4).

- **Escopo:** `/solucoes/*`, `/para-restaurantes/*`, `/blog/*`, `/casos`, `/guias`,
  `/comparativos`; `sitemap.xml` e `robots.txt`; provável CMS.
- **Arquivos prováveis:** novas rotas sob `src/app/site/` (ou `/` após Fase 6),
  `src/app/sitemap.ts`, `src/app/robots.ts`, camada de conteúdo/CMS.
- **Riscos:** conteúdo duplicado/raso; casos/depoimentos falsos; acoplar conteúdo
  ao produto. → Mitigar: conteúdo único e útil; apenas casos reais; CMS desacoplado.
- **Critérios de aceite:** páginas indexáveis com conteúdo único; `sitemap.xml`
  válido; Core Web Vitals saudáveis.
- **Validação:**
  ```bash
  npx tsc --noEmit
  # validar sitemap/robots e Rich Results quando aplicável
  ```

---

## Fase 6 — Virada de produção ⏳

**Meta:** após aprovação, mover o site de marketing de `/site` para `/` com
segurança.

- **Escopo:** transformar `/` na home de marketing **preservando** o acesso ao
  produto (ex.: usuário logado vai ao painel via botão “Login/Entrar”, não por
  redirect automático na raiz).
- **Arquivos prováveis:** `src/app/page.tsx` (hoje redirect), `src/app/layout.tsx`
  (metadata `robots`), `src/middleware.ts`, possível mover `src/app/site/*` → raiz.
- **Riscos (altos):** quebrar o ponto de entrada do produto; perder o redirect de
  login; indexar o que era privado. → Mitigar: manter `/login` e `/dashboard`
  intactos; decidir o destino de usuários logados; testar exaustivamente.
- **Critérios de aceite:** `/` serve o marketing público e indexável; `/login`,
  `/dashboard`, `/pedido`, `/qr`, `/admin`, `/api` 100% intactos; sem regressão de
  auth.
- **Validação:**
  ```bash
  npx tsc --noEmit
  npx next lint
  # matriz de rotas: / = 200 público; /dashboard = 307; /api/* = 401; /pedido,/qr ok
  ```
- **Gate:** só executar com **aprovação explícita** do dono.

---

## Resumo de progresso

| Fase | Estado |
|---|---|
| 1 — Base segura | ✅ |
| 2 — Home premium v1 | ✅ |
| 3 — Conversão | 🔜 (precisa: número WhatsApp + destino do lead) |
| 4 — Páginas internas | ⏳ |
| 5 — SEO e aquisição | ⏳ |
| 6 — Virada para `/` | ⏳ (gate de aprovação) |
