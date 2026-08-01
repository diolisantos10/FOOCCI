# HANDOFF — Integração Google (Meu Negócio + GA4) e o que mais mexi nesta sessão

> Documento de transferência de UMA sessão que tocou três frentes: **integração
> Google** (o foco final e o motivo deste arquivo existir), o **P0 de segurança
> do WhatsApp** (o Brain respondendo pergunta livre errada) e uma leva de telas
> do **CRM**. Se você só quer a Google, vá direto na seção 3. Se herdou o
> WhatsApp ou o CRM, leia a 5 e a 7 também — têm armadilha registrada lá.

---

## 1. O que é este projeto (stack real, lida do `package.json`, não da memória)

`name: "crm-restaurante"` — é o **Foocci**: sistema operacional para
restaurantes (cardápio, pedido, pagamento, comanda, CRM, atendimento por IA).
Duas superfícies: painel do lojista e loja white-label do cliente final. O
mesmo repositório também hospeda a esteira de agência (SDR → PM de mídia →
Oficina) — domínio distinto, não tocado nesta sessão.

- **Next.js** 14.2.35 (App Router) · **React** 18.3.1 · **TypeScript** 5.5.3
- **Prisma** 5.16.1 / `@prisma/client` 5.16.1 · Postgres
- **Tailwind CSS** 3.4.6
- **Vitest** 2.1.9 (suíte de testes)
- `openai` ^6.29.0 e `@anthropic-ai/sdk` ^0.111.0 (dois provedores de LLM em uso)
- Deploy: **Railway**, projeto `positive-fascination`, serviço **FOOCCI**,
  domínio `https://foocci.com.br`. Build roda `prisma generate && next build`
  a cada deploy — **isso importa**, ver seção 6.

---

## 2. Repositório e branch (confirmado nesta sessão, não assumido)

- `git remote -v` → `origin` aponta para **`diolisantos10/FOOCCI`** (via proxy
  local do ambiente — a URL mostra `127.0.0.1:...`, mas o repo real é esse).
- **Branch em que este documento foi commitado:** `claude/remove-legacy-runner-q8iXa`
  — é o branch que o deploy do Railway acompanha (confirmado batendo o
  `commitSha` do `/api/health` contra o HEAD do branch, várias vezes nesta
  sessão).
- Existe também `claude/eloquent-franklin-zm50R`, mencionado no `CLAUDE.md`
  como "branch de trabalho" — **mas uma automação externa (não identificada)
  ficou dando force-push nele para um estado antigo**, sem o trabalho desta
  sessão. Ver armadilha na seção 6.

---

## 3. Integração Google — estado no fim da sessão

### O que já estava construído (raio-x confirmado por leitura de código, não por suposição)
- **Modelo de dados**: `GoogleIntegrationConfig` + `GoogleOAuthState` no
  schema, com migração própria. Tokens **criptografados em repouso**
  (AES-256-GCM, `src/lib/crypto.ts`), nunca devolvidos ao cliente
  (`GoogleConfigService.toView()` é a única projeção exposta).
- **OAuth completo e real**: start → consentimento Google → callback → troca
  de código → guarda tokens. CSRF via `GoogleOAuthState` (single-use, TTL de
  10 min). Refresh automático de access token (`getValidAccessToken`).
- **GA4 real**: chama a API de verdade (`analyticsdata.googleapis.com`,
  `runReport`) — usuários ativos, sessões, páginas mais vistas, série por dia.
  Não é mock.
- **Google Meu Negócio**: lista contas e locais de verdade. Avaliações usam a
  API v4 **legada**, que **degrada graciosamente** (`available:false` com
  mensagem) quando o projeto Google Cloud ainda não tem essa API liberada —
  nunca quebra a tela.

### O que eu construí nesta sessão
1. **Responder avaliação** (antes só lia). `replyToReview()` em
   `googleBusinessProfile.ts` faz o `PUT` real
   (`.../reviews/{id}/reply`). Nova rota `POST /api/integrations/google/business/reviews`
   (OWNER/MANAGER). UI: botão "Responder"/"Editar resposta" por avaliação em
   `GoogleIntegrationClient.tsx` (componente `ReviewRow`).
2. **Auto-desconectar em token revogado**. Antes, se o cliente revogava o
   acesso no Google, o Foocci ficava pedindo "reconecte" para sempre, com
   tokens mortos. Agora `refreshAccessToken()` detecta `invalid_grant` (o
   único caso que é permanente — falha 5xx/rede **não** desconecta) e chama
   `markRefreshRevoked()`, que limpa os tokens e marca `connected:false`.
3. **Configurei o Railway em produção** (via API do Railway, ver seção 4) com
   as 3 variáveis que faltavam: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, `FOOCCI_BASE_URL`. Confirmado: deploy novo
   subiu com `SUCCESS`, e o dono confirmou que o botão virou "Conectar" e que
   testou o GA4 (relato do próprio CEO no chat — **não verifiquei eu mesmo**
   os dados retornados, então marco como "conectado e testado pelo CEO, não
   re-confirmado tecnicamente por mim depois").

### O que ficou aberto — e o que quebra se ninguém mexer

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Tela de consentimento OAuth ainda em "Testing"** no Google Cloud (não publicada/verificada) | Só e-mails cadastrados como "usuários de teste" conseguem conectar, e o token expira em **7 dias** — todo restaurante real vai precisar reconectar toda semana até isso ser resolvido. Publicar dispara verificação do Google para o escopo restrito `business.manage`, que pode levar dias/semanas. |
| **API v4 do Meu Negócio (avaliações) não liberada** para o projeto Google Cloud | O código de ler/responder avaliação que construí **não tem efeito nenhum** até essa liberação — a tela mostra o aviso âmbar "requer aprovação do projeto" e para por aí. Pedido de acesso não confirmado se foi enviado. |
| **Secret do Google (`GOCSPX-...`) passou em texto pelo chat** (colado pelo CEO) | Risco de vazamento residual mesmo com o histórico "privado" — recomendei rotacionar. **Não confirmado se o CEO rotacionou.** Se rotacionar e não me avisar (ou avisar uma sessão futura), o Railway fica com o secret antigo e o OAuth quebra silenciosamente na próxima renovação de token — a integração para de funcionar sem nenhum log óbvio do porquê. |
| **Railway Project Token que o CEO gerou e colou no chat** | Ele mesmo disse que ia revogar. **Não confirmado se revogou.** Enquanto não revogar, esse token dá acesso de escrita às variáveis de ambiente do projeto inteiro (não só o serviço FOOCCI) para quem tiver o histórico da conversa. |
| `env.GOOGLE_INTEGRATION_ENABLED` **não** foi setada explicitamente | Hoje isso não importa (o flag cai no fallback `googleOAuthConfigured()`, que já está true). Mas se alguém um dia setar essa var como `"false"` por engano em outro contexto, o botão volta a "Em breve" sem nenhuma pista óbvia de por quê — ela tem prioridade sobre a presença das credenciais. |

---

## 4. O que foi tentado e não funcionou (para não repetir o mesmo beco)

1. **Tentei setar as env vars do Google via GitHub Actions `workflow_dispatch`
   com os valores como *input* da API.** O **secret scanning do GitHub bloqueou
   a chamada da API** (`mcp__github__actions_run_trigger`) com "high confidence
   secret" antes mesmo de rodar — é proteção de push/dispatch protection, não
   só de arquivo commitado. Pivei o workflow para ler `GOOGLE_OAUTH_CLIENT_ID` /
   `SECRET` de **GitHub Secrets** em vez de inputs. Esse workflow
   (`set-google-env.yml`) chegou a ser commitado e depois **removido** — porque
   no fim o CEO deu um Railway Project Token direto e foi mais rápido setar via
   API do Railway. Se um dia precisar de novo desse padrão (setar segredo via
   Action sem passar pela mão do agente), o esqueleto está no histórico do git
   (procure o commit que adiciona `.github/workflows/set-google-env.yml`).
2. **`railway redeploy --service FOOCCI --yes` crasha** quando rodado de forma
   não-interativa neste ambiente (stack trace nativo, `<unknown>` frames,
   `__libc_start_main`). **Não confie nesse comando em CI/headless.** Não
   precisa dele de qualquer forma: **mudar uma variável no Railway já dispara
   redeploy automático** — só espere e confira com
   `railway deployment list --service FOOCCI`.
3. **`npm install` no sandbox falhou várias vezes com `ECONNRESET`** (proxy de
   rede instável), e uma dessas falhas **corrompeu o `node_modules` local**
   (sumiu `@prisma/client`, `@types/node`, `vitest` — typecheck local
   despejava >20 mil erros de "Cannot find module"). Isso **não era código
   quebrado** — era ambiente. A prova real sempre foi o **build de produção**
   (`prisma generate && next build` roda fresco a cada deploy no Railway) — se
   ele sobe verde, o código está certo, mesmo com o `tsc` local gritando.
   Reinstalar (`npm install` de novo, às vezes 2-3 tentativas) resolve.
4. Cheguei a cogitar desligar o Brain do WhatsApp inteiro
   (`WHATSAPP_BRAIN_ENABLED=false`) como fix rápido do P0 — **não fiz**,
   porque o webhook do Meta manda **direto** pro Brain sem fallback pro
   recepcionista antigo; desligar teria deixado o WhatsApp mudo. O fix certo
   foi dentro do próprio Brain (seção 5).

---

## 5. WhatsApp — o P0 que motivou parte desta sessão (domínio: `canais`)

**O bug real:** cliente perguntou "Tem rodízio?" no WhatsApp e o agente
respondeu **"não temos rodízio"**, contradizendo o próprio menu do
restaurante (que lista "Rodízio presencial" como opção). Decisão do CEO:
o WhatsApp não deve responder pergunta livre com LLM — só o menu fixo; fora
disso, vai para atendente humano.

**Causa raiz (levou duas tentativas para achar):** o primeiro fix que eu fiz
foi no `WhatsAppReceptionistService.ts` (`ALLOW_FREE_FORM_REPLIES = false`).
**Não resolveu em produção** — porque o webhook real do WhatsApp
(`src/app/api/webhooks/meta/whatsapp/route.ts`) **não passa pelo
recepcionista**; ele chama `WhatsAppBrainRuntimeService` direto, que tinha seu
próprio caminho livre para o LLM. O fix de verdade foi um segundo commit,
dentro do Brain.

**⚠️ Atenção — outra sessão evoluiu esse fix depois do meu.** O que eu deixei
era um `const ALLOW_BRAIN_FREE_FORM = false` hardcoded. Hoje isso **não existe
mais** — foi substituído por `BrainFreeFormConfigService`
(`src/services/brain/runtime/BrainFreeFormConfigService.ts`), uma escada
governada por restaurante: `SHADOW_ONLY` (default, meu comportamento
pretendido) → `ALLOWLIST` → `RESTAURANT_WIDE`, com tabela própria
(`BrainFreeFormConfig` no schema). **Isso é uma evolução do meu fix, não uma
regressão** — o default (`SHADOW_ONLY`) preserva exatamente a garantia que o
CEO pediu (recepcionista responde, Brain só observa). Não desfaça isso achando
que é "voltar ao antigo".

O `ALLOW_FREE_FORM_REPLIES` que eu deixei no `WhatsAppReceptionistService.ts`
**ainda está lá e ainda vale** — é uma segunda camada de defesa: mesmo que o
gate do Brain tenha um bug, o recepcionista por si só também não chama GPT
livremente. Redundância proposital, não código morto.

**O que ficou aberto:** o CEO ainda não confirmou o reteste real
("Vocês tem rodízio?" no WhatsApp do Sushi Cazza) — a última vez que
perguntei, ele disse "não vou conseguir agora, só daqui a pouco". Se
ninguém testar isso ao vivo, ninguém tem certeza de que o fix se comporta
certo em produção com tráfego real (testes unitários cobrem a lógica, mas
não substituem o teste ao vivo que o próprio CEO pediu).

---

## 6. CRM — o que mudou nesta sessão (domínio: `crm`, risco baixo/já testado)

Resumo rápido (já em produção, testado, suíte verde na hora que subiu — mas
outras sessões mexeram depois, não re-confirmei o estado atual):
- Métrica "Conquistados pelo Foocci" corrigida (conta pedido real, não
  `sourceSystem` nulo — evitava contar linha de planilha importada como
  cliente novo).
- Visão Geral reordenada: números de clientes → filtro de período → gráfico
  de receita → top-5 campanhas (mesma tabela do painel de Campanhas,
  reaproveitada via prop `limit`/`onSeeAll` em `CampanhasAtivasSection`, não
  duplicada).
- Bug do gráfico de barras (barras não apareciam, só a linha) — era CSS: as
  barras eram filhas de uma coluna sem altura definida, então `height:%` não
  resolvia.
- Nova aba **Conversões** no CRM (prova social: mensagem enviada → tempo até
  converter → receita) e nova aba **Receita Incremental** no Analytics (prova
  social do upsell) — ambas com painel resumido + link para histórico
  completo, no mesmo padrão.
- Paginação server-side na lista de Clientes (10/20/50), filtro de Nível
  (tier) removido dessa lista (é do Programa de Relacionamento, não de
  Clientes).

**⚠️ Código órfão que eu deixei — verifique antes de reusar.** Construí um
botão "Apagar inúteis" (hard-delete de clientes sem telefone/e-mail) com rota
`POST /api/crm/cleanup-uncontactable`. **Outra sessão substituiu essa
funcionalidade** por algo mais gentil: "Ativar base" (ativar clientes
importados que têm telefone mas estão desligados de campanha, em vez de
apagar quem não tem telefone). Confirmei agora: **a rota
`cleanup-uncontactable` foi deletada**, mas o método
`CRMService.deleteUncontactable()` **continua no arquivo**, sem nenhum
chamador. É código morto — funcional se algum dia religarem uma rota para
ele, mas hoje não faz nada. Não assuma que ele está ativo.

---

## 7. Armadilhas deste repositório (o que parece certo e não é)

1. **Erro de TypeScript local ≠ código quebrado, quase sempre.** Este sandbox
   perdeu o `node_modules` (e portanto o `@prisma/client` gerado) **várias
   vezes** ao longo desta única sessão, sem eu ter feito nada de errado —
   parece ser uma característica do ambiente entre turnos/reset, não um bug
   meu. Antes de "corrigir" um erro de tipo que aparece do nada, rode
   `npm install && npx prisma generate` de novo e veja se some. Se não sumir
   e o **build de produção também falhar**, aí sim é real.
2. **`git log` neste branch não é uma timeline confiável.** O branch de
   deploy recebe push de múltiplas sessões em paralelo, com merges e (parece)
   rebases que **rescrevem commits** — tentei achar meus próprios commits por
   mensagem várias vezes ao fim desta sessão e não achei; o conteúdo estava
   lá, mas espremido dentro de commits com mensagem e data de outra pessoa.
   Não confie na data de um commit para saber "quando" algo foi realmente
   escrito.
3. **Existem DOIS branches candidatos e eles não são o mesmo.**
   `claude/eloquent-franklin-zm50R` (citado no `CLAUDE.md` como branch de
   trabalho) e `claude/remove-legacy-runner-q8iXa` (o que o deploy realmente
   acompanha). Nesta sessão, uma automação não identificada ficou dando
   force-push no primeiro para um estado **antigo**, sem nada do trabalho do
   dia. **Sempre confirme qual branch bate com o `commitSha` do
   `/api/health` antes de assumir "meu branch está atualizado".**
4. **`git push origin <nome-do-branch>` pode falhar silenciosamente em
   "non-fast-forward"** mesmo quando seu HEAD local está correto, se o branch
   local com aquele nome ficou para trás do remoto por causa do ponto 3. O
   que sempre funcionou nesta sessão foi `git push origin HEAD:<branch>` —
   empurra o commit atual, não o branch pelo nome.
5. **O card de avaliação do Google mostrando "disponível" não significa que
   os dados são reais.** Se a API v4 não estiver liberada pro projeto, o
   card mostra um aviso âmbar educado — mas isso é fácil de confundir com "só
   não tem avaliação ainda" se você não ler a mensagem com atenção.
6. **O verificador embutido em Integrações → Google → "Avançado" é a fonte
   de verdade**, mais confiável que eu tentando adivinhar o que está setado
   no Railway. Antes de investigar "por que não conecta", olhe ali primeiro.

---

## 8. O que eu sei e não está escrito em lugar nenhum

- **O CEO tem uma regra de ouro explícita: "não quero fazer nada manual".**
  Isso não está em nenhum doc, só nesta conversa. Na prática, isso empurra
  para: sempre que uma tarefa exigir configuração de infra (Railway, Google
  Cloud, etc.), **primeiro procure um caminho automatizável** (API, CLI,
  GitHub Actions) antes de pedir para ele clicar em algo — mesmo que ele
  acabe tendo que fazer 1-2 cliques inevitáveis (ex.: gerar um token, criar o
  OAuth Client no Google Cloud — essas partes **só ele** pode fazer, ninguém
  automatiza a criação de credencial nova). Descubra qual fatia é
  realmente inevitável antes de devolver a bola pra ele.
- **O CEO cola segredo em texto no chat sem se preocupar muito.** Já
  aconteceu duas vezes nesta sessão (o client secret do Google e o Railway
  Project Token). Isso não é malícia nem descuido grave dele — é o jeito
  dele operar rápido. Mas quem continuar esta sessão deve **assumir que
  qualquer credencial que apareceu em uma conversa com ele já deve ser
  tratada como potencialmente exposta**, e sugerir rotação sempre que fizer
  sentido, sem fazer disso um drama.
- **Ele preferiu a Opção B (agente resolve a infra) na hora que ficou claro
  que a Opção A (ele mesmo clicar) também levava ~2 minutos.** Ou seja: a
  "regra de ouro" pesa mais que a diferença de esforço entre as opções. Ao
  oferecer escolhas, **lidere com a opção que exige zero clique dele**, não
  com a "mais simples tecnicamente".
- **A Google Cloud Console mudou de interface** (agora é "Google Auth
  Platform" com menus: Visão geral / Branding / Público-alvo / Clientes /
  Acesso a dados / Central de verificação / Configurações) — isso não bate
  com tutoriais antigos que falam em "Tela de consentimento OAuth" como uma
  tela única. O campo de escopo fica **dentro** do painel "Adicionar ou
  remover escopos" (que abre ao lado, com um campo "adicionar manualmente"
  no fim) — **não** é a barra de busca do topo do console. O CEO já colou o
  escopo na busca errada uma vez; é um erro fácil de repetir.
- **O projeto Google Cloud do CEO já tinha `client_id`/`client_secret`
  gerados e as duas redirect URIs corretas configuradas** quando ele mandou
  o print — ele conseguiu fazer essa parte sozinho sem passo a passo prévio
  detalhado meu. Ou seja: para esse tipo de tela, ele lida bem sem
  microgerenciamento; o ponto onde ele trava é mais em *onde clicar dentro
  de telas com muito texto* (como o caso do escopo) do que em entender o
  conceito.
- **As Fases 5 e 6 do playbook do Google Cloud (publicar/verificar app +
  liberar API v4 de avaliações) ainda não foram confirmadas como iniciadas
  pelo CEO.** A última interação foi ele pedindo o passo a passo de novo
  (repetido, sinal de que ele ainda não executou nada das fases avançadas) —
  bom presumir, para a próxima sessão, que essas duas fases **ainda estão do
  zero**, mesmo que o resto (1-4) já esteja feito.
