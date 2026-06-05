# Foocci — Site em Prévia Privada (Private Staging)

> Versão 1 · 2026-06-05 · Aplica-se a `/site` e `/site/*`.
> Status: **pré-lançamento (piloto).** O site é real, mas **privado** até o lançamento (~julho).

## 1. Propósito

O site de marketing da Foocci deve ser **real, polido e navegável** agora — para o
fundador abrir uma URL de verdade, navegar, revisar design, testar no mobile e pedir
ajustes — **sem** estar publicamente lançado para vendas. A revisão acontece no **site
privado ao vivo**, não por screenshots.

Para isso, todo o `/site` fica atrás de um **gate de senha** (prévia privada) e
permanece **`noindex`**.

## 2. Rota atual

- O site vive em **`/site`** (e `/site/<slug>`). **Não** foi movido para `/`.
- A raiz `/` continua sendo o gateway de produto (redireciona para `/dashboard` ou
  `/login`) — intocada.

## 3. Domínio de revisão recomendado

- **`preview.fute.com.br`** (preferido) — subdomínio privado de revisão.
- Alternativa: `site.fute.com.br`.
- A prévia é acessada em **`https://preview.fute.com.br/site`**.

## 4. Por que NÃO usar a raiz `fute.com.br` ainda

- A raiz pública não está aprovada para ir ao ar (lançamento comercial é ~julho).
- Em `fute.com.br/`, a aplicação mostra o **gateway de produto** (`/login`), não o
  marketing — a vitrine vive em `/site`.
- Manter a raiz "parqueada"/não-pública evita expor o produto e a marca antes da hora.

## 5. Estratégia de proteção de acesso (implementada)

**Gate de senha único e compartilhado** (Opção A), escopo **estrito a `/site`**:

| Camada | O que faz |
|---|---|
| **Middleware** (`src/middleware.ts`) | Gate primário. Para páginas `/site` (exceto `/site/entrar`, `/site/acesso`, `/site/sair`), sem cookie válido → **redireciona para `/site/entrar` ANTES de renderizar** (nada de conteúdo vaza). Escopo estrito a `/site`; rotas de produto **não** são afetadas. |
| **Route group `(gated)`** | Páginas de marketing ficam em `src/app/site/(gated)/` com `layout.tsx` que provê header/footer e uma checagem secundária (defense-in-depth). URLs **não mudam**. |
| **Gate page** `/site/entrar` | Tela de senha premium (branca, texto preto, CTA laranja). Fora do grupo gated, então é acessível sem cookie. |
| **Login** `POST /site/acesso` | Valida a senha (constant-time) e seta o cookie httpOnly. |
| **Logout** `GET /site/sair` | Limpa o cookie e volta para `/site` (mostra o gate). Link discreto "Prévia privada · Sair" no rodapé. |

**Cookie:** `foocci_preview` = `sha256(senha)` (a senha nunca vai ao cliente nem ao
cookie). `httpOnly`, `secure` em produção, `sameSite=lax`, `path=/site`, 30 dias.

**Fail-closed:** sem `MARKETING_PREVIEW_PASSWORD`, ninguém entra (nem com cookie
forjado) e o gate mostra "ainda não configurada".

**Por que middleware?** Em App Router, layout e página renderizam em paralelo —
um `redirect()` no layout **não** impede o streaming do conteúdo da página (vaza no
payload RSC). Só o middleware roda **antes** da renderização. Por isso o gate primário
é no middleware, mas **estritamente escopado a `/site`** (todo path fora de `/site`
sai cedo, sem efeito). Produto, auth, APIs e webhooks: inalterados.

## 6. Variável de ambiente necessária

```
MARKETING_PREVIEW_PASSWORD=<uma senha forte para a prévia>
```

- **Nunca** versionada/commitada (sem hardcode).
- Definir em **Railway** (Variables) no serviço da app.
- Para dev local: adicionar em `.env.local`.
- Trocar a senha **invalida** todos os cookies antigos automaticamente.

## 7. Setup de DNS / Railway (passo a passo)

1. **Railway → serviço da app → Settings → Networking → Custom Domain** → adicionar
   `preview.fute.com.br`. O Railway exibirá um alvo CNAME (algo como
   `xxxxx.up.railway.app`).
2. **DNS (provedor de `fute.com.br`)** → criar registro:
   - Tipo: **CNAME**
   - Nome/Host: **`preview`**
   - Valor/Target: **o alvo fornecido pelo Railway**
   - TTL: padrão.
   - (Não usar A/AAAA fixos — o Railway pode mudar IPs.)
3. Aguardar a propagação + emissão de TLS (Railway provisiona o certificado).
4. Definir `MARKETING_PREVIEW_PASSWORD` nas Variables do Railway (se ainda não).
5. Acessar **`https://preview.fute.com.br/site`** → tela de prévia → entrar com a senha.

**Observações de domínio:**
- O gate funciona **em qualquer host** (URL padrão do Railway **e** o subdomínio),
  porque o cookie é `path=/site` e o login é same-origin (route handler) — sem
  dependência de `serverActions.allowedOrigins`.
- **`NEXTAUTH_URL`**: manter o domínio de produto atual. **Não** repontar para a
  prévia (o produto continua funcionando no mesmo serviço).
- **Redirect de `/` → `/site` no host de prévia** (para `preview.fute.com.br/` cair na
  vitrine): exigiria **roteamento por host no middleware** (lógica baseada em
  `req.headers.host`). **Não implementado** — seria mais arriscado no middleware
  compartilhado. Por ora, usar o caminho `/site` explicitamente. Avaliar no lançamento.

## 8. O que está intencionalmente DESLIGADO

| Item | Estado |
|---|---|
| Indexação | ❌ `noindex, follow` (gate + páginas) |
| WhatsApp de vendas | ❌ Sem link `wa.me` (helper reservado, `WHATSAPP_SALES_NUMBER=null`) |
| Captação de leads | ❌ `DemoForm` reservado, não renderizado; sem endpoint de lead |
| Agendamento de demonstração | ❌ Não disponível |
| Preços reais | ❌ "Em definição para o lançamento" |
| Troca `/site` → `/` | ❌ Não feita |
| Acesso público | ❌ Gate de senha em todo o `/site` |

O **formulário de senha** em `/site/entrar` é um gate de **acesso** (não é venda nem
captação de lead) e posta para `/site/acesso` (login da prévia).

## 9. Antes do lançamento (julho)

- [ ] Aprovação visual final (390/768/1440) — `visual-signoff-checklist-v1.md`.
- [ ] Assets reais (logo/favicon/marca).
- [ ] Screenshots reais do produto (se substituir mockups).
- [ ] Revisão jurídica das páginas legais.
- [ ] Ativar CTAs de vendas (pré-lançamento → comercial).
- [ ] Ativar captação de leads (`DemoForm` + backend real).
- [ ] Ativar WhatsApp (`WHATSAPP_SALES_NUMBER`).
- [ ] Analytics/tracking de conversão.
- [ ] Trocar indexação `noindex,follow` → `index,follow` (1 linha em `site/layout.tsx`).
- [ ] **Remover o gate de prévia** (middleware + route group) e mover `/site` → `/`
      com matriz de rotas validada.
