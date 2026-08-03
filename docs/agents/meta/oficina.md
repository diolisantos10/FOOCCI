# Oficina — aplicativo Meta

> Append-only. O especialista escreve; o Diretor promove para a vitrine.

---

## 2026-08-03 — Token curto do Instagram: a troca já era correta; o buraco era a INVISIBILIDADE

**Contexto:** Sushi Cazza (Pedro Coelho) fora do ar desde 25/07, token morto
(erro 190). Reconexão iminente por `/integracoes/instagram` → "Entrar com Instagram".
Missão: garantir reconexão durável (60 dias) e que a próxima morte seja avisada.

**Qual fluxo a tela usa:** `instagramLoginOAuth.ts` (Instagram Business Login direto,
sem Facebook) — `INSTAGRAM_LOGIN_PLATFORM`. Confirmado por `docs/pendencias.md:632-633`
+ `instagramLoginRedirectUri` → `/api/integrations/instagram/login/callback`.

**Causa-raiz do token curto (com prova, sem inferir):**
- A troca short→long JÁ existe e está CORRETA: `instagramLoginOAuth.ts:142`
  (`grant_type=ig_exchange_token`), com **3 tentativas** (`:148`) e, se todas falharem,
  grava o token curto registrando expiração de ~1h (`:166`), sem fingir 60 dias.
- O outro fluxo (Facebook Login, `metaOAuth.ts:106`) usa `fb_exchange_token` —
  também correto. Endpoints/campos certos nos dois. Hipóteses (a)/(b)/(c) da ordem
  **NÃO** se confirmam no código atual.
- Logo, o token curto de 25/07 foi **ou** o fix ainda não deployado, **ou** as 3
  tentativas falharam transitoriamente. Não dá para provar qual pelo código — não
  inferi (guardrail 1).

**O buraco REAL que sobrava, e que consertei:** quando a troca cai no fallback curto,
a conexão **se forma mesmo assim** e o callback retornava `ok:true` sem marcar nada.
Resultado: selo verde "conectado" + token que morre em ~1h + silêncio na UI. Só o
`console.error` e o cron do dia seguinte pegavam. Era exatamente a morte silenciosa
de 25/07 ainda destravada no nível da tela.

E o `graph-check` — a ferramenta que a vitrine manda usar para "conferir a validade
do token novo" — **não expunha validade nenhuma**: só `tokenValid` (booleano de /me),
que responde igual para token de 1h e de 60 dias. A remediação documentada era
impossível de executar.

**O que mudei (arquivo:linha):**
- `instagramLoginOAuth.ts:241-259` — `CallbackResult` ganha `tokenExpiresInSeconds` +
  `shortLived`; const `DURABLE_TOKEN_MIN_SECONDS` (7 dias).
- `instagramLoginOAuth.ts` callback — detecta short-lived, grava `lastError` com a
  evidência (Diagnóstico + alerta diário passam a mostrar) e **limpa** `lastError` na
  reconexão durável (bug lateral: erro velho não era limpo em reconexão saudável).
- `InstagramConfigService.ts` — `lastError` no `InstagramConfigPatch` (mecanismo).
- `graph-check/route.ts` — passa a devolver `tokenExpiresAt`, `expiresInDays`,
  `tokenLooksShortLived`, `lastError`.
- `login/callback/route.ts` — `ig=connected_shortlived` quando o token nasce curto.
- Teste novo `InstagramLoginOAuth.exchange.test.ts` (4 casos): trava a troca
  short→long real (fetch mockado) E o portão de durabilidade. `tsc` limpo, 4694 verdes.

**Estado do alerta de morte:** o sweep diário (`instagramTokenRefresh.ts` +
`instagram-token-refresh.yml`) JÁ falha com `needsAttention`/`attention[]` carregando
a evidência (corrigido em 02/08, na vitrine). O que faltava era o **aviso no ATO da
conexão** — agora coberto pelo `lastError` + `graph-check`.

**Pendências para humano (CEO):**
1. Confirmar ao vivo, após a reconexão do Pedro, que `graph-check` mostra
   `expiresInDays ≈ 60` e `tokenLooksShortLived:false`. Se vier curto, a troca
   `ig_exchange_token` está falhando em produção — investigar credencial
   `INSTAGRAM_APP_SECRET` no Railway (fallback para `META_APP_SECRET` mascara isso).
2. Confirmar se o workflow `instagram-token-refresh` está na branch DEFAULT (o
   `on: schedule` só dispara de lá — o próprio YAML avisa nas linhas 8-9).
3. A UI (`interface`) precisa tratar `ig=connected_shortlived` com um aviso âmbar —
   proposto, não executado (fora do meu domínio).
