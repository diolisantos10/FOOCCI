# HANDOFF — Visibilidade de Categorias e Estado da Sessão

**Data:** 2026-08-01
**Branch de trabalho:** `claude/fix-category-visibility-hhBQY`
**Branch de produção:** `claude/remove-legacy-runner-q8iXa`
**Repositório:** `diolisantos10/CRM_RESTURANTE`
**Escrito por:** PM (Claude) ao encerrar sessão onde o CEO retomou o projeto num chat novo.

---

## A. O que é o projeto e a stack REAL

**Foocci** — sistema operacional para restaurantes. Duas superfícies:
- **Painel do lojista** (marca Foocci, laranja) — gerencia cardápio, pedidos, impressão, CRM, WhatsApp
- **Loja do cliente final** (white-label, cor por restaurante) — `/pedido`, `/qr`

**Stack (lida do `package.json`):**

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | 14.2.35 (App Router) |
| UI | React + Tailwind CSS | 18.3.1 / 3.4.6 |
| ORM | Prisma | 5.16.1 |
| Banco | PostgreSQL | via Railway |
| Auth | NextAuth.js | 4.24.7 (JWT, 30d) |
| IA — garçom | OpenAI SDK | `openai ^6.29.0` |
| IA — cérebro/PM | Anthropic SDK | `@anthropic-ai/sdk ^0.111.0` |
| WhatsApp | Evolution API | cliente próprio em `src/lib/evolution/` |
| Pagamento | Stone | cliente próprio em `src/lib/stone.ts` |
| Armazenamento | AWS S3 | `@aws-sdk/client-s3` |
| Deploy | Railway | Nixpacks, Node 18 (avisos EBADENGINE do `@aws-sdk` e `pdf-parse` são conhecidos e não bloqueiam) |
| Testes E2E | Playwright | 1.49 |
| Testes unitários | Vitest | presente no `vitest.config.ts` |

**Dois produtos no mesmo repositório:** além do Foocci, há a **esteira de agência** (SDR → PM de mídia → Oficina de peças). São domínios distintos — não misture código ou agentes entre eles.

---

## B. Decisões tomadas, com data e porquê

### 2026-08-01 — Modelo CEO → PM → especialistas adotado
**O quê:** cada sessão tem um Claude atuando como PM. O CEO (Dioli) não lê código — recebe resultados em linguagem de negócio. O PM despacha para agentes em `.claude/agents/`.
**Por quê:** antes havia chats separados por assunto. O conhecimento morria com a sessão. O repositório agora é a memória da empresa.
**O que muda:** toda decisão tomada em conversa vira registro no repositório na mesma sessão. Se a sessão morrer sem commit, o trabalho morreu.

### 2026-07-31 — "Proteção decide pelo estado, não por reflexo" (incidente da Nicole)
**O quê:** um portão de proteção não pode responder com a saudação inicial quando a conversa já está em andamento.
**Por quê:** a tela de entrada apareceu cinco vezes para uma cliente no meio de um pedido porque o Cérebro caiu e o fallback não verificou o estado.
**Arquivado em:** `docs/decisoes.md` e guardrail #5 do `CLAUDE.md`.

### 2026-07-31 — "Prompt é aviso; código é trava"
**O quê:** regra comportamental só no prompt do agente não é suficiente para o que causa dano real.
**Por quê:** o agente prometia criar pedido mesmo quando a condição não estava satisfeita — o prompt dizia "não prometa" e o agente prometia mesmo assim.
**O que muda:** todo guardrail crítico precisa de validação server-side em `AITools.ts`, não apenas instrução no system prompt.

### 2026-07 — Branch padrão e branch de trabalho separados
**O quê:** `claude/remove-legacy-runner-q8iXa` é a branch de produção (deploy Railway). `claude/foocci-brain-vaamrx` é a branch de trabalho.
**Por quê:** já aconteceu de duas correções P0 ficarem 42 commits presas na branch de trabalho sem chegar em produção. A separação força o PR consciente.
**Atenção:** após um PR mergeado, reiniciar a branch de trabalho a partir da padrão — não empilhar em cima de histórico já mergeado.

---

## C. O que foi tentado e não funcionou

### Confusão de branches nesta sessão
A sessão começou com o repositório em estado vazio (só `.git`, branch `master` sem commits). O clone não veio pré-populado como esperado. O branch `claude/fix-category-visibility-hhBQY` que o CEO indicou **não existia no remoto** na abertura desta sessão.

**O que aconteceu:** criei o branch localmente a partir de `origin/claude/foocci-brain-vaamrx` (a branch de trabalho correta, conforme `CLAUDE.md`). Os commits de visibilidade de categorias (`0486b65e`, `2e20a51d`, `4858b9e0`) já estão nessa base — ou seja, **o trabalho de fix-category-visibility já foi feito e está em produção**. O nome do branch sugeria trabalho pendente, mas os commits existem na branch de produção.

**Lição:** ao receber um nome de branch que não existe no remoto, verificar antes se o trabalho já foi mergeado em `claude/remove-legacy-runner-q8iXa`.

### Exploração inicial no branch errado
Ao iniciar a sessão, tentei carregar arquivos antes de ter o repositório clonado corretamente — o diretório tinha só `.git`. A exploração inicial foi feita via agente (subagente `Explore`) que teve acesso ao estado certo do repo. Só depois que fiz o checkout do branch correto os arquivos ficaram disponíveis localmente.

---

## D. O que ficou aberto — com o que quebra se ninguém mexer

### P1: Restrição alimentar no Garçom
**O quê:** o Garçom pode dar informação errada sobre alérgeno ou restrição alimentar.
**O que quebra:** cliente com restrição séria (alergia, intolerância) recebe item incompatível. Único item desta lista onde o defeito não é de dinheiro — é de saúde.
**Fonte:** `docs/pendencias.md` §1. Não há prazo definido.

### Fila normal — matcher difuso demais
**O quê:** o matcher que identifica item pelo nome aproxima demais. "Tem lasanha?" pode casar com yakisoba.
**O que quebra:** cliente recebe confirmação de item errado no carrinho. Experiência ruim, possível devolução.

### Fila normal — ponto cego do simulador
**O quê:** quando o Garçom retorna resposta vazia (silêncio), o simulador não detecta o problema e aprova o turno.
**O que quebra:** bugs de silêncio passam nos testes E2E sem serem capturados.

### Fila normal — saudação por código, não por memória do modelo
**O quê:** a saudação com nome + menu ainda depende do modelo lembrar. Não é garantido por código.
**O que quebra:** o modelo esquece e o cliente recebe saudação genérica.

### Brain Fase 5 (parcial)
**O quê:** faltam as 6 filas, o avaliador de candidato e o LLM-judge online.
**O que quebra:** o Cérebro não consegue escalar o ciclo de aprendizado de forma autônoma.

### Stand by por decisão do dono: custo por restaurante
**O quê:** o `AIInteractionLog` registra custo apenas para o `AIOrderService`. O Cérebro, os crons noturnos, os embeddings e o suporte ficam de fora.
**O que quebra:** sem visibilidade de custo real por restaurante, não é possível definir faixas de preço nem bloquear por plano. O campo de plano (`STARTER`/`GROWTH`/`PRO`) existe no banco mas não bloqueia nada.
**Detalhe importante:** modelo desconhecido cai no preço do `gpt-4o` em silêncio. Quando voltar a esse item: atualizar tabela de preços, gritar em modelo desconhecido, e coletar uma semana em produção antes de ler qualquer número.

### Fora do código — depende de gente
- **Impressão física** nunca confirmada com papel saindo numa loja real com alguém presente.
- **`mpWebhookSecret`** aparece como `false` em `/api/health`. Se um pagamento por Mercado Pago não confirmar sozinho, é o primeiro lugar para olhar.

---

## E. Armadilhas deste repositório

### 1. "O comentário diz que tem retry" — o servidor não implementa
Decisão registrada em `docs/decisoes.md`: documentação não é evidência. O Carteiro tinha comentário descrevendo retry que nunca existiu no código. Antes de afirmar que algo funciona, verifique `arquivo:linha`.

### 2. Duas branches parecem ativas — só uma é produção
`claude/foocci-brain-vaamrx` é trabalho; `claude/remove-legacy-runner-q8iXa` é o que Railway faz deploy. Já aconteceu de trabalho ficar 42 commits preso sem chegar em produção. Sempre fechar o PR antes de declarar "está em produção".

### 3. `ToolContext` tem três inicializadores
Se adicionar campo ao `ToolContext`, atualizar os três arquivos: `AIOrderService.ts`, `AISimulatorService.ts` (~linha 716) e `ChatSimService.ts` (~linha 117). Esquecer um quebra o build ou silencia um bug.

### 4. O simulador nunca chama Evolution API — e isso é intencional
`ChatSimService` e `AISimulatorService` são sandbox. Não adicione chamadas reais de WhatsApp neles. A separação é trava de segurança.

### 5. Preços vêm sempre do banco
`execAddItem` e `execSuggestUpsell` buscam preço do banco. A IA nunca define preço. Mudar isso quebra a integridade de pedidos.

### 6. IDs de menu são `cuid()` — a IA não inventa
A IA valida todo ID contra o cardápio no prompt. Se um ID não existir no cardápio, ela não pode chamar `add_item`. Isso é guardrail, não bug.

### 7. O agente `qualidade` não tem permissão de escrita — de propósito
Ver `docs/decisoes.md`: "Prompt é aviso; código é trava". O agente de qualidade não escrever é a trava; se ele pudesse aprovar os próprios portões, o portão deixaria de existir.

### 8. A sessão pode abrir com repositório vazio
Em ambiente remoto (Claude Code web), o repositório é clonado fresh. Se o checkout falhar ou o branch não existir, o diretório fica com só `.git`. Verificar com `ls -la` antes de qualquer trabalho. Fazer `git fetch origin` e confirmar a branch antes de codar.

### 9. Dois projetos no mesmo repo têm nomes parecidos
`src/services/brain/sdr` e `src/services/brain/oficina` são da **esteira de agência** (Dioli Digital), não do Foocci. Os portões com `autoCheckable` e as "28 de 31 checagens desligadas" pertencem ao Dioli Digital (`diolidigital/lib/dioli-brain/`), não ao Foocci. Confundir os dois causou uma pendência errada ficar listada no `docs/pendencias.md` do Foocci por um tempo.

---

## F. O que sei e não está escrito em lugar nenhum

### O branch `claude/fix-category-visibility-hhBQY` não existe no remoto ainda
Esta sessão criou esse branch localmente a partir de `origin/claude/foocci-brain-vaamrx`. **Nenhum commit novo foi feito nele.** O próximo PM que abrir uma sessão com esse nome de branch precisa saber: ou o branch chegou ao remoto via push feito ao encerrar esta sessão, ou precisa recriá-lo da mesma base (`origin/claude/foocci-brain-vaamrx`).

### O fix de visibilidade de categorias já está feito
Commits `0486b65e` (salão/QR), `2e20a51d` (pedido — só produtos da categoria, ordem por mais vendidos 7d, scroll reseta) e `4858b9e0` ("Comprar novamente" — pool independente de categoria) estão em `origin/claude/remove-legacy-runner-q8iXa`, ou seja, **em produção**. O nome do branch desta sessão pode induzir o próximo PM a achar que o trabalho está pendente — não está.

### A sessão que este handoff encerra foi de onboarding, não de código
O CEO abriu um chat novo porque o anterior ficou lento. Nenhuma feature nova foi implementada. O trabalho desta sessão foi: orientar o PM novo no contexto do projeto, confirmar o branch correto, e escrever este documento. O próximo passo é o CEO indicar a próxima tarefa.

### O `HANDOFF_PARA_IA.md` na raiz descreve um estado mais antigo
Aquele arquivo fala da branch `claude/remove-legacy-runner-q8iXa` como branch de trabalho e lista features de IA (Final Intent Lock, Drink Priority Engine etc.) que já foram mergeadas. Leia-o como histórico de implementação da IA do Garçom, não como estado atual.

### A verificação de saúde mais confiável
```
curl -s https://foocci.com.br/api/health
```
Deve retornar o `commitSha` do último merge em produção. Se não responder ou o SHA não bater com o último merge, o deploy não chegou.

### `mpWebhookSecret` está `false` em produção (não confirmado se já foi corrigido)
Aparece como pendência em `docs/pendencias.md`. Nenhum pagamento por Mercado Pago foi testado em produção após isso. Se um pagamento MP não confirmar automaticamente, verificar a variável de ambiente antes de qualquer outra coisa.

---

## G. Para começar a próxima sessão

1. `git fetch origin && git checkout claude/fix-category-visibility-hhBQY` (ou recriar de `origin/claude/foocci-brain-vaamrx` se o branch não existir no remoto)
2. Ler `CLAUDE.md` — contém guardrails inegociáveis e o modelo CEO → PM → especialistas
3. Ler `docs/pendencias.md` — lista viva do que está aberto com o impacto de cada item
4. Ler `docs/decisoes.md` — decisões que atravessam domínios (não mudar sem registrar aqui)
5. Confirmar que a branch de trabalho não está atrás da padrão: `git log --oneline origin/claude/remove-legacy-runner-q8iXa..HEAD`
6. Aguardar o próximo pedido do CEO
