# Varredura de segurança — 03/08/2026

> Por ordem do CEO: *"nosso sistema está seguro pra ataque? existe uma estrutura
> de segurança por trás?"* Feita pelo Diretor Geral. **Isto é uma foto do dia,
> não um atestado** — segurança é processo; a seção 4 diz como manter.

---

## 1 · Resposta curta ao CEO

**A base é melhor do que "ninguém pensou nisso"** — quem construiu deixou
proteções reais nos lugares certos. Encontrei **um problema crítico (já
consertado hoje)**, dois médios (um consertado, um documentado) e uma lista de
disciplina contínua. Não encontrei porta aberta óbvia: sem segredo commitado, sem
rota de admin desprotegida, sem webhook aceitando qualquer coisa.

## 2 · O que JÁ estava bom (medido, não suposto)

| Proteção | Evidência |
|---|---|
| **Negação por padrão**: toda rota exige login salvo lista explícita de públicas | `src/middleware.ts` — modelo certo; rota nova nasce fechada |
| Webhooks Meta/Instagram/Evolution **validam assinatura HMAC com comparação constante** | `metaWebhook.ts`, `InstagramWebhookParser.ts` |
| Multi-tenant: `restaurantId` em toda query (regra da casa) + headers de tenant no middleware | CLAUDE.md + middleware |
| Rate limit por IP no formulário público de leads | `/api/site/leads` — 5/min |
| Headers de segurança: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | `next.config.js` |
| Analytics do site validado por whitelist antes de entrar em `<script>` (anti-injeção) | `SiteSettingsService` |
| Nenhum `.env` no git; segredos só por ambiente | `git ls-files` |
| Admin desabilita endpoints quando `ADMIN_SECRET` ausente (falha fechado) | rotas admin |

## 3 · O que encontrei, por gravidade

### 🔴 CRÍTICO — corrigido hoje
**next-auth (o login do painel) em versão com 3 vulnerabilidades publicadas**,
uma crítica (DoS por header malformado no `getToken()` — que roda no middleware
de TODA requisição), mais bypass de normalização de e-mail e fragilidade de
state OAuth. **Conserto:** upgrade 4.24.7 → 4.24.15. `npm audit --omit=dev`
agora: 0 críticas.

### 🟠 MÉDIO — corrigido hoje
**Comparação do segredo de admin não era de tempo constante** (`===`). Explorar
por timing pela internet é difícil, mas o helper é único (`admin-auth.ts`) e
guarda todas as rotas de admin — consertado com hash+`timingSafeEqual` nos dois
caminhos (header e cookie). De quebra some o vazamento de tamanho.

**HSTS ausente** — primeiro acesso `http://` podia ser interceptado sem redirect
forçado. Adicionado `Strict-Transport-Security` (2 anos, sem `includeSubDomains`
de propósito: não verifiquei HTTPS de todos os subdomínios, e HSTS errado tranca
navegador por anos).

### 🟡 MÉDIO — documentado, decisão adiada com motivo
1. **`xlsx` (importação de planilhas do CRM): vulnerabilidade alta, SEM correção
   disponível** do mantenedor. Mitigação real hoje: só lojista **autenticado**
   envia planilha. Trocar de biblioteca (`exceljs`) é a saída definitiva — vai
   para a fila do Diretor, não é urgente porque não há caminho anônimo até o parser.
2. **Cookie de admin é determinístico e sem validade** (sha256 fixo do segredo):
   se vazar, vale até alguém trocar o `ADMIN_SECRET`. Conserto certo: token com
   carimbo de tempo + HMAC + expiração. Fila do Diretor.
3. **Webhook do Mercado Pago sem validação de assinatura** (`mpWebhookSecret:
   false` no health) — já documentado em `pendencias.md`: não há risco de
   pagamento falso porque a confirmação re-consulta a API do MP; o risco residual
   é ruído/log. Mantido lá.

### ⚪ Baixo / aceito
- 9 avisos "high" restantes no `npm audit` de produção são quase todos
  transitivos de SDKs (AWS/Playwright dev) sem exploit no nosso caminho de uso —
  revisar no ritual mensal, não no susto.
- CSP (Content-Security-Policy) **não** adicionada hoje: com os scripts inline de
  analytics recém-instalados, uma CSP estrita quebraria a medição da campanha no
  dia do lançamento. Fazer com nonce, com calma. Fila.

## 4 · A "estrutura por trás" que o CEO perguntou — o que passa a existir

Segurança contínua aqui vira **três hábitos com dono**, não um documento:

1. **Toda sexta, `npm audit --omit=dev` no CI falha o build se houver CRÍTICA**
   em dependência de produção → impede repetir o caso next-auth (ficamos meses
   vulneráveis sem saber). *(one-liner no workflow; Diretor)*
2. **Rota pública nova só entra com revisão do middleware** — a lista
   `PUBLIC_PATHS` é o perímetro; mudou a lista, mudou a superfície de ataque.
3. **Segredo novo → registrado no cofre da OS do cofre** (`OS-cofre` já escrita)
   com data e dono; rotação deixa de ser "quando lembrar".

## 5 · O que esta varredura NÃO cobriu (honestidade de escopo)

Teste de invasão de verdade (pentest externo), segurança da infra Railway
(depende do painel deles), engenharia social, e revisão linha a linha das ~250
rotas de API. Quando houver faturamento recorrente, um pentest pago vale o preço
— decisão do CEO, sem urgência hoje.
