# Pendências — o que está aberto

> Última atualização: 02/08/2026.

---

## 📋 ORDEM DE SERVIÇO do Diretor Geral — cofre de acesso do Diretor (02/08)

**Para o Diretor do Foocci.** Escrita, não executada: a execução aqui é sua.
Padrão completo em `dioli-brain-kit/docs/12-cofre-de-credencial.md`.

### O problema

O `/admin/meta` resolveu a credencial da Meta. **Falta o acesso do próprio
Diretor ao admin** — hoje, sessão nova não entra, e volta a depender do CEO para
qualquer coisa que exija o painel.

Isso já custou: numa sessão, o caminho encontrado foi **colar um Railway Project
Token na conversa** para destravar o trabalho.

> ⚠️ **E a leitura disso mudou por decisão do CEO em 02/08:** colar credencial no
> chat é **autorização**, não descuido. Não avise, não cobre rotação. O trabalho
> é **tirar a fricção**, e a fricção aqui é não existir cofre.

### O que construir

Os cinco requisitos do padrão, sem exceção:

1. Criptografado em repouso
2. **Nunca devolve o valor** — a tela mostra `••••` e a data em que foi preenchido
3. Botão que **testa de verdade** e mostra a resposta do serviço
4. **Banco primeiro, ambiente depois** — quem usa variável hoje não quebra
5. Registra **quando** foi preenchido

### O que NÃO fazer

- **Não avisar para rotacionar.** Encerrado por decisão do CEO.
- **Não bloquear** funcionamento por credencial velha (guardrail 5).

### Como saber que ficou bom

O CEO usa **sem ser convencido** — foi o que aconteceu com o `/admin/meta` no dia
em que ele existiu. Se precisar de explicação, a tela não está pronta.

---

## 🤝 ENTREGA DO DIRETOR GERAL AO DIRETOR DO FOOCCI (02/08)

O CEO me corrigiu, e ele está certo: **eu passei o dia executando dentro deste
repositório enquanto você estava ativo nele.** Isso inverte a estrutura que eu
mesmo escrevi — a execução do Foocci é sua. Estou saindo. Isto é o que fica na
sua mão.

### 🎁 Existe um site comercial pronto que NÃO está mergeado

**Branch `claude/lancamento-site`.** O site (`/site`, 7 páginas) sai da prévia
privada e vira site público. Verificado: `tsc` 0, build 0, testes verdes,
screenshots em 390/768/1440.

**Não mergeei porque merge = no ar na hora, e o CEO marcou o lançamento para
segunda.** Ele decide o momento; a decisão não é minha nem sua.

O que essa branch faz, e a armadilha dentro dela:

> ⛔ **Apagar `MARKETING_PREVIEW_PASSWORD` no Railway NÃO abre o site — fecha de
> vez.** O portão falha fechado, e estava em **dois** lugares (`middleware.ts` e
> `site/(gated)/layout.tsx`). Liberar sempre foi mudança de código, nunca de
> variável. Quem tentar pelo Railway some com o site sem erro nenhum.

Também nela: raiz `/` passa a abrir o site; formulário de demonstração que
**grava o lead antes de notificar**; lista em `/admin/leads`; `robots.txt` e
`sitemap.xml` (não existiam — e `/robots.txt` respondia **307 para /login**).
Detalhe completo em `docs/foocci-site/lancamento-v1.md`.

### 🔨 Etapa 0b — a última das seis, e é sua

A Etapa 0a está em produção (`fbdc11e9`): opt-out, atribuição de CRM, resgate de
carrinho e a política de IA agora valem na Meta.

**Falta o pedido por texto.** É a maior porque muda **qual agente** responde, não
só se ele pode: precisa da árvore `getMessageAwareRoutingDecision` →
`handleInboundForOrdering` com o mesmo contrato de fallback do caminho antigo — um
`handled=true` sem resposta enviada **não** pode bloquear o agente antigo.

### 📋 O que eu fiz aqui e por que você não deve refazer

| O quê | Onde |
|---|---|
| Guardas de entrada da Meta (Etapa 0a) | `services/whatsapp/inbound/InboundGuardsService.ts` — em produção |
| Painel de QR que dizia "Conectado" sem estar | `IntegrationsCenterClient.tsx` — em produção |
| Decisão "só Meta" com os números medidos | `docs/decisoes.md` |
| Canal de escalada | `docs/perguntas-ao-diretor-geral.md` |

### 📣 E a regra que eu furei, agora escrita

**O Diretor Geral não executa dentro de projeto que tem Diretor ativo.** Ele
decide doutrina, coerência entre projetos, e prioridade *entre* projetos. Se ele
achar um defeito aqui, ele **escreve a ordem de serviço** — não abre o editor.

Está registrada em `dioli-brain-kit/docs/11-backlog-do-diretor-geral.md`. Se eu
voltar a furar, me cobre pelo arquivo.

---

## 🚀 A CAMINHO DO LANÇAMENTO (segunda-feira) — leia isto primeiro

Sessão do Diretor de 02/08, com o CEO fora. Ordem recebida: *"passe um raio-x em
tudo e resolva o que tiver pra resolver"*.

### O que foi resolvido e já está em produção

| Item | Por que era grave |
|---|---|
| **Importador de planilha apagava o cardápio** | Coluna "custo" virava preço de venda. Silencioso, irreversível, **feito pelo próprio cliente**. Era o pior defeito em aberto para receber lojista novo |
| **P1 dietético do Garçom** | Item sem ingredientes cadastrados passava como **seguro** para quem declarou restrição. O único defeito da lista que custa saúde |
| **Analytics negava o CMV** | Respondia *"não temos CMV cadastrado"* a quem tinha acabado de cadastrar |
| **Credenciais da Meta cruzadas** | O `configId` e o `igAppId` estavam com o número do App ID, encobrindo os valores certos do Railway. Corrigido em produção |

Os três primeiros estão **travados por teste** — reintroduzir qualquer um derruba
o CI.

### O que só o CEO pode fazer, em ordem de urgência

1. 🔴 **Reconectar o Instagram do sushi** — dez dias sem receber DM. Exige login
   pessoal; não existe caminho por API. *(CEO vai falar com o dono do restaurante.)*
2. 🔴 **Preços e planos** — o site já está público mostrando "Em definição".
3. 🔴 **Token da Focus NFe** — nenhuma nota fiscal é emitida sem ele.
4. ~~`MERCADO_PAGO_WEBHOOK_SECRET`~~ — **não é o que parecia.** Ver a seção do
   Mercado Pago abaixo: o segredo global **não cabe** neste modelo de negócio, e o
   risco de "pagamento falso" **não existe**.

> ✅ **Resolvido em 02/08:** os campos de App Review da Meta (Termos, Domínios) —
> o CEO liberou a escrita por API e o Diretor corrigiu.
>
> 🔓 **Decisão do CEO (02/08): o Railway Project Token NÃO será revogado.** Ele
> autorizou o Diretor a usá-lo. O risco segue registrado — o token está em texto
> num chat e dá escrita nas variáveis do projeto inteiro — mas a decisão é dele e
> está tomada. **Não reabrir.**

### O que continua aberto e pesa no lançamento

- **Nenhuma nota fiscal é emitida** (#29 — falta o token da Focus NFe). A máquina
  inteira está pronta e desligada.
- **`mpWebhookSecret` ausente** — webhook do Mercado Pago sem assinatura verificada.
- **Impressão física nunca confirmada numa loja de verdade.**
- **Faixas de preço e bloqueio por plano** — é o que o CEO fecha amanhã.
- **Um teste da suíte é instável** (detalhe abaixo). Antes de lançar, isso ensina a
  equipe a ignorar CI vermelho.
- **3 P1 do Garçom** da mesma varredura do dietético seguem abertos, não
  reavaliados.

### 🎨 Site comercial — revisado em 02/08, com screenshots

**Veredito: o site está bem construído. O problema é comprimento, não qualidade.**

| O que | Estado |
|---|---|
| Rolagem horizontal no celular | ✅ **zero** nas três páginas |
| Acessibilidade (alt, nome de botão/link) | ✅ **limpa** |
| Uso da marca (90% neutro + 10% laranja) | ✅ correto |
| **Altura da home no celular** | 🔴 **15.509px ≈ 19 telas de rolagem** |

**A recomendação, e ela depende do CEO porque é conteúdo de marketing:** cortar a
home de 12 seções para 6–8. Hoje há **11 `h2`** e vários blocos repetindo a mesma
estrutura de cards brancos — a hierarquia achata e o visitante não chega nos planos
nem no CTA final.

Corte proposto, sem tocar nos quatro pilares do briefing (D1–D4):
1. Fundir *"Por trás de cada experiência"* com *"Mais que tecnologia"* — dizem a
   mesma coisa com cards diferentes.
2. Fundir *"O problema"* com a comparação *"não é um chatbot"* — são o mesmo
   argumento, separados por sete telas.
3. Levar o grid de 8 soluções para `/site/como-funciona`, deixando 3 na home.

**Não executei.** Reordenar a home é decisão de marketing do CEO, e ele revisa
amanhã. O diagnóstico está pronto para a decisão sair em minutos.

> Os planos aparecem como *"Em definição para o lançamento"* — é o `[PREENCHER]`
> que o CEO fecha amanhã junto com a precificação.

---

## 🔓 Railway Project Token — o CEO decidiu manter (02/08)

Um Railway Project Token foi colado em texto na conversa. O Diretor recomendou
revogar; **o CEO decidiu manter e autorizou o uso**. Decisão registrada, não
reaberta.

O que fica valendo, para quem ler isto depois:

- O token dá **escrita nas variáveis de ambiente do projeto inteiro**, não só do
  serviço Foocci.
- Ele está em texto num histórico de conversa. Quem tiver aquele histórico, tem o
  token.
- **PIN de 2FA do WhatsApp** e **client secret do Google** foram expostos do mesmo
  jeito antes, e nenhum dos dois tem rotação confirmada.

> A causa raiz não é descuido: **não existe lugar seguro para a credencial de
> acesso do próprio Diretor.** Para a Meta isso foi resolvido com `/admin/meta`.
> Para o acesso do Diretor, ainda não.

---

## 💳 Mercado Pago — a pendência do `mpWebhookSecret` estava mal descrita (02/08)

`/api/health` mostra `mpWebhookSecret: false` desde sempre, e isso vinha sendo
tratado como *"confirmação de pagamento sem validação de origem"*. **Está errado, e
a leitura do código inteiro desmente.**

### Não existe risco de pagamento falso

O webhook **não confia no corpo da notificação**. Ele extrai apenas o **ID do
pagamento** e vai **buscar o status na API do Mercado Pago**, autenticado com o
token daquele restaurante
(`api.mercadopago.com/v1/payments/{id}`, `webhook/route.ts` §Step 5).

Só confirma se **a própria API do MP** responder aprovado. Um aviso forjado não
carrega status nenhum que o sistema aceite — no máximo faz o Foocci perguntar ao
Mercado Pago sobre um ID, e a resposta vem do Mercado Pago.

### O segredo global não cabe neste modelo

**Regra de negócio confirmada pelo CEO em 02/08:** *"cada restaurante conecta a
forma de pagamento que quiser; nós apenas disponibilizamos as integrações."*

O `accessToken` do MP é **por restaurante**, criptografado em
`integrationConfig` (`provider: "mercadopago"`). Cada restaurante usa a **própria
aplicação** no Mercado Pago — e portanto a **própria assinatura secreta**.

**Uma variável de ambiente global só funcionaria se todos os webhooks viessem de
uma aplicação da Foocci.** Não vêm. Preencher `MERCADO_PAGO_WEBHOOK_SECRET` com o
segredo de *alguém* faria o webhook **rejeitar os avisos de todos os outros
restaurantes** — uma proteção que quebra mais do que protege (guardrail 5).

### O risco que sobra é real, mas é outro

Sem assinatura, qualquer um que descubra a URL pode **disparar processamento**: o
caminho lento varre **todos** os `integrationConfig` ativos chamando a API do MP em
cada um. Um atacante com IDs aleatórios gera muita chamada externa. É **custo e
ruído**, não fraude.

### O conserto certo, quando for a hora

Guardar a assinatura **junto do token de cada restaurante** (mesmo `configBlob`, já
criptografado) e verificar contra a do restaurante resolvido. Enquanto não houver
segredo cadastrado, seguir aceitando — quem não configurou não pode parar de
receber confirmação de pagamento.

> **A lição, e ela vale além deste caso:** `false` num health check diz que **um
> valor não está setado** — não diz que existe um buraco. A gravidade veio de
> alguém supor o que a ausência significava, e a suposição atravessou várias
> sessões sem que ninguém lesse o webhook.

---

## 🔴 ACONTECENDO AGORA — cliente perdendo mensagem em silêncio

### O Instagram do restaurante de sushi está fora do ar desde 23/07
`tokenValid: false` (erro 190, *"Session expired 25-Jul"*), e o
`lastWebhookAt` parado em 23/07. **O cliente perde 100% das DMs do Instagram** — e
não há aviso nenhum.

**A tela mente:** a UI de integração mostra **"Conectado / Ativo"** com o token
morto. O sinal real está no card **Diagnóstico**: *"Conta conectada: pendente"* e o
"Último Direct recebido" parado.

**Só o dono resolve** — exige login pessoal do Instagram:
`/integracoes/instagram` → **Desconectar** → **"Entrar com Instagram"** → login.

> ⚠️ **E logo depois, confira uma coisa.** A conexão de 25/07 nasceu com token
> **curto** (~1h40 em vez de 60 dias). Ao reconectar, rode `graph-check` e veja a
> validade do novo token: se vier ~60 dias, ótimo. **Se vier curto de novo, o bug
> real é a troca para long-lived falhando em produção** — não a expiração. É aí
> que se deve investigar.

---

## 🔴 Prioridade — erro aqui chega no cliente

### ✅ 1. Garçom: o P1 dietético — RESOLVIDO em 02/08

**A causa concreta, achada no código:** `isBlockedByDietary` casava a restrição
contra **nome + ingredientes**. Item **sem ingredientes cadastrados** não casava com
nada — e "não casou" voltava como **seguro**. Um *"Risoto do Chef"* de lista vazia ia
para quem declarou "sem lactose".

Agora existe um terceiro estado, `unknown`, que **também exclui** o item: não dá para
provar que conflita, nem que é seguro. Cliente sem restrição declarada continua vendo
o cardápio inteiro (guardrail 5). Travado por 9 testes.

> **Os outros 3 P1 da mesma varredura seguem abertos** — eram descritos como menos
> graves e não foram reavaliados nesta sessão.

### 🟠 Um teste da suíte é INSTÁVEL — e isso é perigoso perto do lançamento

Em 02/08, `npx vitest run` reprovou **1 de 4633** e, nas **duas** rodadas seguintes,
passou inteiro sem nenhuma mudança de código.

O suspeito é `src/services/whatsapp/ordering/tests/WhatsAppOrderingW9.test.ts`: ele
avalia cenários **por score** (*"0 FAILs e score ≥ 95"*) e dispara chamadas de Prisma
sem `DATABASE_URL`, engolidas por `.catch()`.

**Por que importa agora:** teste que às vezes reprova ensina a equipe a ignorar o CI
vermelho. Aí o dia em que ele reprovar de verdade, ninguém olha — e o portão que
existe para segurar defeito vira ruído (guardrail 6).

*Não reproduzido de propósito nesta sessão — registrado com a evidência para quem
pegar.*

### ~~2. O painel de WhatsApp em Integrações escreve "Conectado" quando NÃO está~~ ✅ RESOLVIDO em 02/08

Corrigido em `IntegrationsCenterClient.tsx`. A investigação achou **mais** do que
o relato original dizia: a rota `/api/evolution/qr` tem **oito** formatos de
resposta, não três — e **dois deles significam "espere, ainda estou gerando"**.
Esses também caíam no `else` e viravam "Conectado".

Agora cada formato tem tratamento próprio, **só a flag explícita `connected: true`
pode dizer conectado**, e o que não for reconhecido vira estado honesto de
*desconhecido* — com o aviso de que **não** quer dizer que conectou.

Travado por `src/app/api/evolution/qr/route.contract.test.ts`, que prova inclusive
que um campo novo no futuro cai em desconhecido, nunca em sucesso.

> Este painel é da **Evolution** e é transitório — a Meta não usa QR. Foi
> corrigido para ninguém se perder durante a migração, não para investir nele.

---

## 📱 Aplicativo Meta — o número novo do WhatsApp está travado

**Dono:** `meta` — especialista criado em 01/08 por decisão do CEO. O aplicativo é
**um só** (`Foocci Whats`) e serve WhatsApp *e* Instagram: o que quebra nele
derruba os dois canais juntos.

Minerado de `HANDOFF-canais-meta.md` (commit `18a5ed7`), em 01/08/2026.

### ✅ Existe tela para as credenciais: `/admin/meta` (02/08)

As credenciais do aplicativo saíram do "só o Railway sabe". Estão em **Admin →
Sistema → 🔑 Aplicativo Meta**, criptografadas, com **"Testar conexão com a Meta"**
que devolve a resposta da própria Meta.

**Falta o CEO colar os valores lá** — enquanto não colar, tudo continua lendo o
Railway exatamente como antes (a resolução é banco primeiro, ambiente depois).

> ⚠️ **Ao colar, não passe a Chave Secreta por conversa, documento ou mensagem.**
> Ela é chave mestra. Vai direto do painel da Meta para o campo da tela.

### ✅ RESOLVIDO (02/08) — os três campos que reprovavam App Review

O CEO ligou a chave em *Meta → Configurações do app → Avançado*, e o Diretor
corrigiu **por API**:

| Campo | Antes | Agora |
|---|---|---|
| Termos de Serviço | `https://www.facebook.com/` | `https://foocci.com.br/termos` |
| Domínios do aplicativo | vazio | `foocci.com.br` |
| Política de Privacidade | já correto | `https://foocci.com.br/privacidade` |

Conferido pelo diagnóstico do admin: **0 avisos de App Review**.

> A partir de agora, campo de configuração do app é conserto do Diretor, não
> tarefa manual do CEO. ⚠️ Em troca, quem tiver o `META_APP_SECRET` **altera** a
> configuração, não só lê.

| Ainda aberto na mesma tela | Situação |
|---|---|
| **Aba "Ações necessárias"** | É onde a Meta lista o que está pendente ou bloqueando. *Nunca foi lida nesta casa.* |
| **Nome do app: "Foocci Whats"** | O app serve WhatsApp **e** Instagram. Cosmético, mas induz ao erro de achar que existe um segundo app para o IG — não existe |

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Número novo preso no `request-code` (erro `136024`)** | O número nunca verifica, nunca registra, e o CRM não atende por ele |
| **Cron de refresh do token do IG — não confirmado se roda** | Todo token de IG expira em ~60 dias **sem aviso**, e a queda de julho se repete |
| **PIN de 2FA do WhatsApp foi colado em texto num chat** | Rotacionar depois do registro |

> **A mensagem do `136024` mente.** Ela diz *"servidores temporariamente
> indisponíveis, espere 1 hora"*, mas vem com `is_transient: false` — ou seja,
> **é permanente**. Repetir não resolve; foram várias tentativas idênticas.
> A causa mais provável é o **chip ainda ter uma conta WhatsApp ativa**:
> Config → Conta → Apagar minha conta, e esperar ~1h. *Não confirmado.*
> Método `VOICE` em vez de `SMS` **nunca foi testado**.

> 🚫 **NÃO mexer no número que está no ar hoje** enquanto o novo não estiver
> funcionando. É o número que está atendendo o restaurante agora.

---

## 🔌 Sair da Evolution e ficar só na Meta — DECIDIDO, é migração



> ✅ **O CEO fechou a direção em 02/08: o provedor é a Meta, e a Evolution sai.**
> A decisão está no corredor (`docs/decisoes.md`). O que segue abaixo é o **como**,
> e continua valendo: **é migração, não delete.**
>
> Medido em 02/08 — **239 arquivos** citam Evolution, e o padrão do banco
> (`Restaurant.whatsappProvider`) é **`EVOLUTION`**, então **todo restaurante
> existente está nela** até ser trocado um a um.

### ✅ A pergunta que travava foi respondida (02/08)

> **CEO:** *"hoje temos a integração nativa do WhatsApp da Meta — todos serão assim."*

A integração nativa da Meta **existe e está em uso hoje**. O destino é todos os
restaurantes nela.

⚠️ **Atenção ao tempo verbal: "serão", não "estão".** O padrão do banco continua
`EVOLUTION`. Ninguém deve assumir que um restaurante já migrou — **confira o
`whatsappProvider` dele** antes de qualquer conclusão.

Segue aberta a segunda pergunta: **BuildOS** — migrar para a Meta, manter só na
Evolution, ou aposentar?

### O buraco medido: seis coisas que SÓ a Evolution faz hoje

Levantado em 02/08 comparando `webhooks/evolution/route.ts` +
`WebhookProcessorService.ts` contra `webhooks/meta/whatsapp/route.ts`.

| O que falta na Meta | Quem faz na Evolution | O que se perde |
|---|---|---|
| ✅ **Opt-out de entrada** | `ContactSafetyService.applyInboundOptOut` | ~~Cliente responde "PARAR" e continua recebendo~~ — **portado em 02/08** |
| ✅ **Atribuição de receita do CRM** | `markCrmReplyIfApplicable` | ~~Campanha vira venda e o sistema não sabe~~ — **portado em 02/08** |
| ✅ **Passar para humano** | `markConversationNeedsHuman` | ~~Conversa de resgate presa com a IA~~ — **portado em 02/08** |
| ✅ **Política de quando a IA responde** | `shouldAiRespond` | ~~Trava de Staff/Fornecedor ignorada~~ — **portado em 02/08** |
| 🔨 **Pedido por texto** | `handleInboundForOrdering` + `WhatsAppTextOrderingConfigService` | Cliente pede por mensagem e ninguém atende. **Etapa 0b — em aberto** |
| ⛔ **Comandos do BuildOS** | `handleBuildCommand` | **Não será portado.** Ver decisão abaixo |

O webhook da Meta importa hoje **só** o Cérebro e o suporte. O comentário no código
dele diz *"feed the same agent pipeline"* — **e não alimenta.** É a frase mais
perigosa do arquivo, porque descreve intenção como se fosse fato.

### ✅ Etapa 0a — as quatro guardas de segurança, FEITAS em 02/08

`src/services/whatsapp/inbound/InboundGuardsService.ts`, ligado no webhook da Meta.
Aditivo: **não altera uma linha do caminho da Evolution**, que segue atendendo
todos os restaurantes.

Travado por 11 testes, e o mais importante deles prova que **falha inesperada
nega** — nunca libera a IA por omissão.

> **Achado no caminho, e é mais grave do que a migração:** a trava de
> Staff/Fornecedor (P0-A) **nunca valeu na Meta**. Quem já estava na Meta tinha a
> IA respondendo em conversa marcada como não-cliente. Agora vale.

### 🔨 Etapa 0b — pedido por texto (em aberto)

É a única das seis que falta, e é a maior: muda **qual agente** responde, não só
se ele pode. Precisa da árvore de roteamento (`getMessageAwareRoutingDecision` →
`handleInboundForOrdering`) com o mesmo contrato de fallback do caminho antigo.

### ⛔ BuildOS não será portado — decisão de 02/08

Perguntado ao CEO, a resposta foi *"não sei o que que é isso"*. São comandos
internos por WhatsApp; se o dono não sabe que existem, ninguém os usa.

**Fica na Evolution e morre junto com ela.** Se alguém sentir falta, reabrimos —
mas não se gasta migração com função que não tem usuário.

---

## 📣 CRM — a campanha "Almoço" não dispara, e falta um clique

Minerado de `HANDOFF-crm.md` (commit `3693a509`), em 01/08/2026.

**A causa não é bug de campanha.** É contactabilidade: a base importada entra com
`crmContactable=false` (fila de enriquecimento), a audiência fica **0** e nada sai
— sem erro nenhum aparecendo. Os clientes **têm** telefone; a primeira hipótese
("base sem telefone") estava errada e foi corrigida pelo dono.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **"Ativar base" — clique manual do dono** | Clientes → *Saúde da base de contatos* → **"Ativar base"**. Enquanto ninguém clicar, a campanha fica com audiência 0 **e nunca dispara** |
| **Redeploy dos merges #41 e #43** | Sem ele o painel mostra o cálculo velho (Frios 96%, "Mais de 60 dias"). **Sinal de que pegou:** o card "Frios" passa a dizer **"61–120 dias"** |
| **Número Meta oficial** | O teto de 900 só vale com `metaCrmEnabled=true` **e** `connectionStatus="CONNECTED"`. Sem os dois vale a rampa de aquecimento (máx 250) — e a expectativa de volume fica errada |

**O diagnóstico que decide a discussão antes dela começar** (auth admin):
`GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id>` → compare
`noPhone` × `notContactable` × `eligible`.

> **Regra de negócio do dono, que não estava no código:** a campanha "Almoço" é
> **perene, 1× por cliente**, pegando cliente novo automaticamente. **Isso já é
> suportado** pelo dedupe de "já recebeu esta campanha". Não reprojete — só ative
> a base.

---

## 📚 Manual e treinamentos

Minerado de `HANDOFF-manual.md` (commit `5b1c885c`), em 01/08/2026.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **Export de produção nunca rodado** | Se existir capítulo digitado à mão no admin com slug `guia-*`, **cada deploy o sobrescreve** pelo código. *Não confirmado* se há conteúdo em risco — rodar `GET /api/admin/manual/export` antes de assumir que não há |
| **Bíblia interna no assistente — decisão de produto** | Os 14 capítulos internos têm `agentVisibility=false`. Se ninguém decidir, **nada quebra**: o assistente segue respondendo só pelos guias |
| **`Carteiro-Manual.txt` é estático** | Fica em `public/downloads/`, e **o robô noturno não cobre `public/`**. Se a tela de Impressoras mudar, esse arquivo precisa ser atualizado na mão |

**Dono:** `manual` — o especialista foi criado em 01/08. Até então esta seção
**não tinha responsável**, e a sala já existia sem agente.

### 🌿 Branches órfãs — veredito por branch

| Branch | Veredito |
|---|---|
| `eloquent-franklin` · `cmv-pricing-page` | **Ocas** — trabalho já re-landado. Reverificar antes de apagar |
| **`food-manager-kickoff`** | ⛔ **NÃO APAGAR** — 1.374 commits únicos do produto paralelo "Foocci Manager" |
| `sons-background-topbar` · `sound-topbar-chip` | Surgiram ~01/08, **conteúdo não avaliado** |

> **Como provar que uma branch é oca antes de apagar:** trabalho re-landado tem
> hash diferente, então `git cherry` **engana**. Compare os patches (`git show <a>`
> vs `git show <b>`) e os `--stat`.

---

## 🧮 CMV e precificação

Minerado de `HANDOFF-cmv-precificacao.md` (commits `36a36597` e `e8f01e90`), em
01/08/2026.

### ✅ RESOLVIDO (02/08) — o importador de planilha não apaga mais o cardápio

`PRECO_PREFIXES` continha `"custo"` e `"cost"`, então planilha com coluna "custo"
sobrescrevia o **preço de venda** do cardápio inteiro.

**O que mudou:**
- Custo saiu da lista de preço e ganhou detecção própria (`CUSTO_PREFIXES`),
  **testada antes** do preço — assim `"valor de custo"` não é engolido por `"valor"`.
- O custo agora é gravado em `MenuItem.cost`, alimentando o CMV de verdade.
- Planilha **só com custo** passa a acusar *"falta a coluna Preço"* em vez de
  destruir dado.
- Custo ilegível **não invalida a linha** — o cardápio precisa do preço para
  funcionar; custo ruim só deixa o CMV em branco.

Travado por `src/app/api/menu/import/route.test.ts` (5 testes, com planilhas
`.xlsx` de verdade). Reintroduzir "custo" na lista de preço derruba o CI.

> Gravar `cost` no importador é seguro **porque este caminho só CRIA item** — nome
> repetido é pulado como duplicata. Mudar custo de item **existente** continua
> obrigado a passar por `updateCostsWithReprice` (ver vitrine do `operacao`).

| Aberto | O que quebra se ninguém mexer |
|---|---|
| ~~Analytics nega que existe CMV~~ | ✅ **RESOLVIDO 02/08.** A limitação disparava em toda pergunta de margem, sem olhar o dado. Agora conta os itens com custo (escopado por categoria — `MenuItem` não tem `restaurantId`) e só nega quando é zero. Havendo custo, avisa que o CMV é **parcial** e sobre quantos itens — guardrail 7. Travado por teste |
| **Variações não têm custo** | A precificação usa só o custo base. Cardápio muito baseado em variação mostra CMV incompleto — **o número mente por omissão**, sem quebrar nada |
| **Leitura de nota nunca testada com nota real** | Sem chave de IA no ambiente daquela sessão. Se o primeiro teste em produção falhar com cupom amassado, o ajuste é `INVOICE_EXTRACT_MODEL=gpt-4o` (o default é o modelo do Brain, `gpt-4o-mini`) |
| **Imagem só funciona no piloto OPENAI** | Se o roteamento do Brain mover o `invoice-reader` para Claude ou Gemini, a leitura de nota falha — **com erro claro, de propósito** |
| **CMV do período é digitado à mão** | Estoque inicial, compras e estoque final. Sem integração com compras, o termômetro só vale quando o lojista atualiza. Risco de leitura velha, não de quebra |

---

## 🔵 Integração Google — funciona, mas o token morre a cada 7 dias

Minerado de `HANDOFF-google.md` (commit `06bfaf3`), em 01/08/2026. O OAuth, o GA4
e o Meu Negócio **já estavam construídos de verdade** — não eram mock. O CEO
confirmou o GA4 funcionando.

| Aberto | O que quebra se ninguém mexer |
|---|---|
| **⏳ Tela de consentimento OAuth ainda em "Testing"** | Só e-mails cadastrados como teste conseguem conectar, e **o token expira em 7 dias**. Todo restaurante real vai reconectar **toda semana**. Publicar dispara a verificação do Google para o escopo restrito `business.manage` — pode levar dias ou semanas, então **começar cedo** |
| **API v4 do Meu Negócio não liberada** | O código de ler e responder avaliação **não tem efeito nenhum** até a liberação. A tela mostra aviso âmbar e para aí. *Não confirmado se o pedido de acesso foi enviado.* |
| **`GOOGLE_INTEGRATION_ENABLED` não foi setada** | Hoje não importa (cai no fallback, que já é `true`). Mas se alguém setar como `"false"` por engano, o botão volta a "Em breve" **sem pista nenhuma do porquê** — essa variável tem prioridade sobre a presença das credenciais |

> **Presuma que as fases de publicar/verificar o app e liberar a API v4 estão do
> zero.** A última interação foi o CEO pedindo o passo a passo de novo — sinal de
> que ainda não executou.

### 🔑 Dois segredos ainda sem confirmação de rotação

| Credencial | Situação |
|---|---|
| **Client secret do Google** (`GOCSPX-…`) | Colado em texto no chat. *Não confirmado se foi rotacionado.* ⚠️ **Se rotacionar e não atualizar o Railway, o OAuth quebra em silêncio na próxima renovação** — sem log óbvio do porquê |
| **Railway Project Token** | O CEO disse que ia revogar. *Não confirmado.* Enquanto não revogar, dá **acesso de escrita às variáveis de ambiente do projeto inteiro** — não só do serviço Foocci |

---

## ⛔ NÃO MERGEAR a branch `claude/fresh-debug-session-C3qhF` como está

Minerado de `HANDOFF-garcom-consolidacao-pipeline.md` (commit `8fb194f4`), em
01/08/2026. **Conferido pelo Diretor, não aceito por relato.**

Aquela sessão apagou **12 arquivos do pipeline legado** (−2.371 linhas), criou
`WebOrderService.ts` (+1.205) e concluiu: *"nenhum erro novo foi introduzido"*.

**Está errado.** O `tsc` roda naquela branch e **falha**:

```
src/services/ai/WebOrderService.ts(477,7):
  error TS2322: Type 'string | null' is not assignable to type 'string'.
```

O erro está **no arquivo que a própria sessão escreveu** — não é infraestrutura, e
não é pré-existente. A sessão viu erros de tipo, atribuiu todos ao ambiente e
seguiu.

✅ **Produção está limpa.** `tsc` na branch padrão sai com código 0, e
`WebOrderService.ts` **não existe lá** — a branch nunca foi mergeada. Nada quebrou.

**O que fazer antes de aproveitar aquele trabalho:**
1. Corrigir a linha 477
2. Rodar `npx tsc --noEmit` e `npx vitest run` — **os dois verdes**
3. Só então mergear

> **A lição, e ela vale além deste caso:** o kit registra que erro de tipo súbito
> costuma ser o `node_modules` sumindo no sandbox. **Isso é verdade e virou
> desculpa.** A regra correta é a que já estava escrita: rode
> `npm install && npx prisma generate` e **veja se o erro some**. Se não sumir, é
> real — mesmo que "pareça" ambiente.

### O que aquele trabalho descobriu, e vale guardar

- **O `runner.ts` era letra morta há vários commits.** A rota
  `/api/pedido/[slug]` já usava `AIOrderService.runWebTurn()` (WaiterBrainV2).
- **`WebOrderService.ts` não é chamado por ninguém.** Nasceu como backup limpo do
  pipeline stateless — **é código morto novo criado enquanto se apagava código
  morto velho**. Decidir se fica ou vai.
- **`OrderStage` mudou de casa** para dentro do `WebOrderService.ts`, e dois
  arquivos dependem disso. Cuidado antes de apagar.
- Substituir o `runner.ts` pelo `AIOrderService` direto **falhou**: as APIs são
  incompatíveis (stateful × stateless). Não repita.

---

## 🧍 Dependem do Dioli — ninguém mais consegue

| Item | O que quebra |
|---|---|
| **#36 · `MERCADO_PAGO_WEBHOOK_SECRET` não está no Railway** | `/api/health` mostra `mpWebhookSecret: false`. O webhook do Mercado Pago **não tem assinatura verificada** — confirmação de pagamento sem validação de origem |
| **#29 · Token + homologação fiscal (NFC-e via Focus NFe)** | **Nenhuma nota fiscal real é emitida.** A máquina inteira (etapas 0–5b) está pronta e desligada, esperando o token |
| **Lista `[PREENCHER]` do site comercial** | O web designer **não fecha o site** sem ela. Ver a seção do site comercial abaixo |

---

## 🌐 Site comercial — o briefing existe e não está em lugar nenhum

### ⚠️ RISCO IMEDIATO: o briefing só existe na conversa

A sessão que produziu o briefing do site **não salvou o texto no repositório** — foi
veto explícito do CEO na hora (ele quis mandar direto ao designer, sem versionar).

**A consequência mudou de tamanho quando esse chat entrou na fila de arquivamento:**
enquanto ele estava aberto, o texto estava a um scroll de distância. Fechado, some.

**Antes de arquivar aquele chat:** mandar o briefing ao designer **ou** colar o texto
aqui para virar arquivo. É a regra do `docs/arquivo/README.md` — nenhum chat é
fechado antes de minerado, e o entregável daquele chat é justamente o que não
desceu.

### O que o CEO precisa preencher

Preço e escopo dos 3 planos · CTA principal (demo × teste grátis × WhatsApp) ·
URL de login · domínio · depoimentos e casos reais · logos de clientes · contato
comercial · CNPJ/razão social · IDs de Analytics/Pixel · arquivos de logotipo.

Nada disso pode ser preenchido com número de exemplo que vaze como real — o
produto está em piloto (guardrail 7).

### As quatro decisões do briefing, que ninguém deve desfazer sem falar com o CEO

| # | Decisão | Por que existe |
|---|---|---|
| D1 | O site é **B2B**, para donos de restaurante | O ângulo é *"pare de pagar comissão de marketplace e seja dono dos seus clientes"*. Virar B2C quebra o funil |
| D2 | O briefing não é versionado | Escolha do CEO. Não reabrir sem pedido — mas ver o risco acima |
| D3 | Preço, depoimento e métrica ficam `[PREENCHER]` | Número inventado em site é passivo comercial |
| D4 | Três pilares: **Venda mais · Fidelize e reative · Decida com dados** | É a espinha da home. Mudar os pilares muda o site inteiro |

### ⛔ O 3º plano chama `PRO`, não "PREMIUM"

`prisma/schema.prisma:155-159` → `enum Plan { STARTER, GROWTH, PRO }`. Confirmado
também na migração inicial.

O "PREMIUM" que aparece numa busca ampla é de **outro** enum (`CRMMessageStyle`).
Se a página de preços disser PREMIUM, o cliente escolhe um rótulo que o sistema
não reconhece.

### A Foocci não é um "chatbot de WhatsApp" — e o material antigo diz que é

Vender só a IA subvende o produto. A superfície real, levantada das rotas: loja de
delivery e cardápio de mesa, painel com cardápio/pedidos/impressão, CRM inteiro
(campanhas, fidelidade, atribuição, carrinho abandonado), analytics, inbox de
atendimento, marca, canais, integrações, admin global — **mais** a esteira de
agência como segundo produto.

Origem: `HANDOFF-site-comercial.md` (commit `79943f5`) · verificado em 01/08

---

## 🟡 Fila normal

| O que | Por que importa |
|---|---|
| Garçom: "tem lasanha?" casa com yakisoba | O matcher difuso aproxima demais e o cliente recebe outro prato |
| Garçom: ponto cego do simulador | Quando cai na IA, resposta vazia passa batida — o simulador aprova o silêncio |
| Foocci: saudação com nome + menu colado por código | Hoje depende do modelo lembrar; tem que ser garantido por código |
| Brain Fase 5 (parcial) | Falta consolidar as 6 filas, avaliar candidato e o LLM-judge online |
| **O drawer de Promoções cobre 16px do menu lateral** | Já está acontecendo em produção, no desktop. Ver abaixo |
| Aba Automações do drawer abre com os campos zerados | Os dados chegam por busca no navegador, sem estado de carregando. Por um instante parecem configurações perdidas |

### O drawer de Promoções cobre 16px do menu lateral (desktop)

O menu lateral tem **240px** (`Sidebar.tsx:102`, `w-60`). O drawer de Promoções
começa em **224px** (`PromotionsClient.tsx:521,526,1012,1015`, `lg:left-56`).

Os dois números foram escritos à mão, em arquivos diferentes, e **já divergiram**:
o drawer entra 16px por cima da borda do menu. O handoff que registrou isso ainda
descrevia como risco futuro — não é, já aconteceu.

O conserto certo não é trocar `56` por `60`: é a largura virar **um valor só**,
lido dos dois lados. Enquanto forem dois números soltos, eles divergem de novo.

**Dono:** `interface`.

---

## 🚚 Mudou de casa — eram daqui e não eram

Três pendências estavam listadas aqui como "Agência" e **pertencem ao Dioli
Digital**, não ao Foocci. Verificado em 01/08: o Foocci não tem nenhuma ocorrência
de `autoCheckable` no código; as 31 checagens com 28 desligadas estão em
`diolidigital/lib/dioli-brain/quality-gates.ts`.

| O que | Foi para |
|---|---|
| 28 de 31 portões são decoração (**P0**) | pendências do Dioli Digital |
| Verdade do cliente montada no cliente | pendências do Dioli Digital |
| Escada por departamento | pendências do Dioli Digital |

O Foocci tem a sua própria esteira de agência (`src/services/brain/sdr`,
`src/services/brain/oficina`) — o que confundiu. São coisas diferentes com nome
parecido, e é exatamente o tipo de erro que a camada de Diretor existe para pegar.

---

## 🅿️ Stand by — por decisão do dono (31/07)

### Custo por restaurante
Adiado. **O achado não pode se perder:** `AIInteractionLog` já tem
`restaurantId`, contagem de tokens e `estimatedCostUsd` — mas **só o
`AIOrderService` escreve nela**. Ficam de fora o Cérebro
(`OpenAIEngineAdapter`), o recepcionista de WhatsApp, o `helpAssistant`, os
embeddings, o `imageEnhancement`, o suporte e **os crons noturnos** — estes
últimos são custo que cresce a cada restaurante novo sem nenhum cliente
conversando. Além disso, `PRICING_USD_PER_1K` só conhece `gpt-4o` e
`gpt-4o-mini`, e modelo desconhecido cai no preço do `gpt-4o` em silêncio.

Quando voltar: ligar o logger em todos os caminhos, atualizar a tabela de
preços e fazer modelo desconhecido gritar, marcar origem (conversa × cron),
endpoint de soma mensal, e **uma semana de coleta em produção** antes de ler
qualquer número.

Isso bloqueia a definição das faixas de preço e o bloqueio por plano.

---

## 🧍 Fora do código — depende de gente, não de commit

- **Impressão física nunca confirmada numa loja.** Foi corrigida no servidor e
  ninguém ainda viu papel sair com alguém presente. Até isso acontecer, é
  conserto no papel.
- **Faixas de preço + bloqueio por plano.** O campo de plano existe e não
  bloqueia nada. Bloqueador comercial, travado no stand by acima.
- **`mpWebhookSecret` não configurado.** Aparece como `false` em `/api/health`.
  Se um pagamento por Mercado Pago não confirmar sozinho, é o primeiro lugar
  para olhar.

---

## ✅ Fechado recentemente

- **Auditoria de coerência da casa** (01/08, primeira sessão do Diretor). Três
  incoerências corrigidas, todas em arquivos que os agentes leem como verdade:
  1. **O corredor mentia sobre o fluxo de trabalho.** Dizia *"trunk-based, não usa
     PR, não crie branch de feature"* — os PRs **#44–#53** provam o contrário, cada
     um saindo da sua branch de bloco. As travas de escrita concorrente
     (`--force-with-lease`, rebase por pipe) **continuam valendo** e foram
     preservadas.
  2. **`claude/foocci-brain-vaamrx` estava fixada no `CLAUDE.md` como "a" branch de
     trabalho e está esgotada** (39 commits atrás, zero à frente). A convenção
     agora é uma branch por bloco.
  3. **`claude/inspiring-bardeen-hsx9wk` não é "branch misteriosa"** — o trabalho
     dela já está na padrão (`d4eac6f`). O falso alarme fica desarmado no corredor,
     com o comando de uma linha que o desarma.

- **B1 — chave `ANTHROPIC_API_KEY`** (30/07). O robô noturno do manual saiu do
  papel: manual de 30/07 verde, agendada de 31/07 idem, com o passo da IA
  levando 4min07s. Toda agendada anterior falhava.
- **Os dois consertos do incidente da Nicole** (31/07, PR #40, em produção). A
  queda do Cérebro parou de apagar a conversa no meio do pedido, e o agente
  parou de prometer pedido que não pode criar.
- **A branch de trabalho estava 42 commits atrás** da padrão, e as duas travas
  acima estavam paradas nela sem chegar em produção. Resolvido no mesmo PR.
- **O build do Railway (01/08)** — uma sessão encerrou sem saber se o deploy
  tinha voltado, deixando aberto *"se o build ainda falha, produção está parada"*.
  **Está no ar.** `/api/health` responde com o `commitSha` do merge mais recente e
  `db: ok`. O `nixpacks.toml` com `npm ci --include=dev` está na branch padrão, e
  `tailwindcss`, `postcss`, `autoprefixer` e o CLI do `prisma` estão todos em
  `dependencies`. Nenhuma ação pendente.
- **As automações de WhatsApp saíram do CRM** e viraram a aba
  *🤖 Automações WhatsApp* dentro de Promoções. Está em produção, o manual já
  descreve o caminho novo (`howToGuidesContent.ts:599`), e o motor antigo está
  aposentado **por teste** (`AutomationRetired.test.ts`), não por combinado.
