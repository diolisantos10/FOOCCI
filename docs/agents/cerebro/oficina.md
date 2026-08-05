# Oficina — cerebro

> Append-only. O especialista escreve aqui; a vitrine é do Diretor.

---

## 2026-08-05 — Raio-X noturno: a metade determinística da coleta

**Pedido:** construir a coleta que roda toda madrugada e produz evidência para
uma sessão de leitura escrever o relatório ao CEO. Só a coleta — sem IA, barata,
reproduzível. No meio do bloco chegou complemento do campo: adotar **cinco
padrões nomeados** que pescaram desperdício real em outro projeto da casa.

### O que tentei e o que descobri

**1. O pedido genérico e o pedido com padrão nomeado produzem coletas diferentes.**
Meu desenho inicial era todo de runtime: custo de IA, mensagens presas, fila de
impressão, assinaturas. Boa metade do valor, mas cega para o tipo de sangria que
o complemento descreveu — *aquilo que nunca falha em voz alta*. Os cinco padrões
me empurraram para uma segunda coleta, **estática, sobre o código-fonte**. E aí
veio o efeito colateral bom: essa metade eu consegui **rodar de verdade neste
ambiente**, porque não precisa de Postgres (que não existe aqui — `localhost:5432`
não responde). A metade de runtime foi entregue testada contra amostra, não
contra banco. Está dito no relatório; não vendi como medido o que não medi.

**2. A separação amostra ↔ julgamento foi o que tornou tudo testável.**
`collect/` produz um `RaioXSample` JSON-serializável; as sondas são funções puras
sobre ele. Sem banco, consigo as duas metades de teste de cada sonda. O custo é
um tipo a mais; o ganho é que o raio-x inteiro roda em 1,3 s num teste.

**3. Onde os guardrails viraram tipo, e não comentário.**
`Block<T> = {ok:true,data} | {ok:false,reason}` (`types.ts:56`) e `requireBlock`
(`types.ts:84`): a sonda **não consegue** ver zero no lugar de "não consegui
ler" — ela nem roda, o orquestrador emite UNKNOWN no lugar dela
(`RaioXService.ts:139-160`). E sonda que devolve lista vazia também vira UNKNOWN
(`RaioXService.ts:162-171`), com `computeGlobalStatus` recusando PASS na presença
de qualquer UNKNOWN. Teste que trava isso: "com o banco todo indisponível,
NENHUMA sonda devolve PASS".

**4. A calibração foi o trabalho de verdade — e cada falso positivo virou teste.**
Quatro rodadas contra o repositório inteiro (1.462 arquivos):
- **`parsePublicPaths` devolveu ZERO** na primeira rodada: o corpo dos literais
  (`/^\/api\/qr(\/.*)?$/`) tem `\/`, e minha classe `[^/\n]` cortava no primeiro.
  Zero rota pública teria sido uma **mentira tranquila** — nenhum achado
  apareceria e o relatório diria "tudo bem". Foi o que me fez transformar o
  "não consegui parsear" em bloco indisponível, em vez de lista vazia.
- **79 rotas "abertas com custo pago"**, quase todas `/api/admin/*` e
  `/api/cron/*` — que estão em `PUBLIC_PATHS` mas autenticam por-rota. A prova
  morava num helper importado (`_guard.ts`, `getTenantContext`). Passei a olhar
  também os imports diretos da rota: 79 candidatos viraram **0 sem nenhuma prova**.
- **`coherence: true` dentro de `select` do Prisma** entrava como "veredito
  escrito à mão". Três dos nove candidatos eram isso.
- **`AIInteractionLog.totalTokens` "escrito" no MEU arquivo de tipos**: declaração
  de interface parece atribuição. Resolvido classificando pelo bloco Prisma mais
  próximo acima (`data:` = escrita, `where:`/`select:` = leitura). Junto caiu
  outro erro grosseiro: campo lido num `where` estava contando como morto — a
  fila de impressão inteira aparecia como estado morto.
- **`while (true)` do simulador** reprovava mesmo tendo `callAttempt <=
  MAX_SCENARIO_RETRIES`: meu `\battempt` não casa dentro de `callAttempt`.
  *Alarme falso por acidente de regex* — primo do `\b` ASCII que me mordeu no
  bloco do verificador de capacidade. Escrevi no código.
- **O scanner se autodenunciou**: um comentário meu que fala de `while (true)`
  virou achado. Detector precisa distinguir código de prosa sobre código.

**5. A metade que deixa passar continua sendo a mais cara.** Todo detector
estático nasceu com o "não acusa" ao lado, e cada um desses testes cita o falso
positivo real que o gerou (`SourceScanner.test.ts`). Sem isso, um detector com
31 achados de estado morto vira carimbo em duas semanas.

**6. Recusei fabricar precisão onde não tinha.** Nomes de campo repetidos entre
modelos (`activatedAt` em dois modelos) faziam a escrita de um contar como
leitura do outro. Sem AST, o honesto era **não julgar** esses campos: 1.245 →
786 avaliados, com o número exposto na própria sonda. Perder cobertura declarada
é melhor que apontar o arquivo errado.

**7. O que a coleta achou de verdade (varredura estática, agora):**
- `/api/pedido/pix-payment` e `/api/pedido/payment-status` recebem `orderId` de
  qualquer um e devolvem dado de pagamento — **sem a decisão escrita**. O irmão
  `/api/pedido/order-status:6-10` tem a justificativa ("o cuid age como bearer
  token"); os dois que devolvem **chave Pix** não têm. Não é catástrofe (cuid é
  imprevisível), mas é o padrão 2 com o dado mais sensível dos três.
  **Achado lateral, fora do meu escopo:** `pix-payment/route.ts:41` faz
  `prisma.payment.update` — é rota pública que **escreve**.
- `Payment.cardLast4` é gravado em dois lugares
  (`card/charge/route.ts:80`, `confirmCardPayment.ts:90`) e **nenhum leitor
  consome**. Dado de cartão guardado sem uso é risco puro.
- `Conversation.aiLockedAt` / `aiLockedByUserId`: a trilha de quem travou a IA é
  gravada e ninguém lê.
- `BrainCoherenceCritic.ts:98` foi listado como "veredito literal" — **e a
  leitura humana absolveu**: é o SEGUNDO crítico, fail-open declarado, com o
  piso determinístico já aplicado antes (`WhatsAppBrainRuntimeService.ts:313`).
  Registro porque é o comportamento correto do instrumento: ele lista candidato,
  gente confirma. Se eu tivesse deixado a sonda dar veredito, teria criado um
  P0 falso na primeira noite.

### O que quebrou

- 34 erros de `tsc` de uma vez por `noUncheckedIndexedAccess`: o scanner é feito
  de acesso por índice. Corrigi um a um em vez de afrouxar o tipo.
- Primeira versão do detector de laço tinha teto próprio de visitados no BFS mas
  não reconhecia teto alheio — a ironia está anotada no código.

### Achados fora do meu escopo (para o Diretor)

- A rota pública `/api/pedido/pix-payment` escreve no banco (auto-expira o
  pagamento). É do `operacao`.
- `src/services/quality/noSideEffects.test.ts` passou nesta rodada; a suíte
  inteira ficou verde (417 arquivos, 5.349 testes).
- A metade de runtime do raio-x **nunca rodou contra um banco real** — não há
  Postgres neste ambiente. A primeira execução em produção é também a primeira
  medição das consultas; o teto de tempo por bloco (20 s) existe para que uma
  consulta lenta vire "não sei" em vez de derrubar a noite.

---

## 2026-08-04 — Fusão dos dois cérebros da Ajuda + chamado com e-mail

**Pedido:** passos 1 e 2 de 4 da Frente 2 (agente de suporte). Fundir a aba
"Ajuda" (que chamava a OpenAI direto) com o agente `suporte-tecnico` já
registrado no Brain, e construir chamado + notificação por e-mail.

### O que tentei e o que descobri

**1. A justificativa da exceção congelada era falsa.**
`architecture.test.ts` listava `services/help/helpAssistant.ts` como dívida
congelada com o motivo: *"usa histórico multi-turn (mais de 2 mensagens) — o
dispatcher callStructuredJson só suporta system+user; migrar exige evoluir o
contrato."* Fui evoluir o contrato e descobri que ele **já tinha** o campo:
`BrainReasoningRequest.sanitizedHistory` (`core/BrainTypes.ts:38`), serializado
em `BrainReasoner.ts:176-180`. A exceção sobreviveu não por impedimento técnico,
mas por um motivo que envelheceu e ninguém releu. Lição: **comentário que
justifica uma exceção precisa de data de validade** — a lista congelada deve ser
relida quando o contrato que ela cita muda.

**2. O comentário mentiroso do manualRetrieval custou o retrieval do manual.**
`manualRetrieval.ts:6` afirmava *"There are no embeddings in the project"*. Era
falso desde o `KnowledgeEmbeddingService`. O manual ficou em keyword puro por
uma decisão tomada sobre um fato inexistente. Corrigido, com o registro do erro
no próprio cabeçalho para não voltar. **Comentário errado é pior que comentário
ausente** — o ausente faz você ir olhar.

**3. Onde a verdade do manual devia entrar — e por que não no `customerMemory`.**
O `SupportIncidentReasoner` injeta os sinais do sistema via `customerMemory`
(`SupportIncidentReasoner.ts:141`), um campo cuja etiqueta no prompt é *"MEMÓRIA
DO CLIENTE (comportamental, sem dados pessoais)"*. Funciona, mas mente sobre o
que é: o conteúdo não entra em `truthSources`, então o
`SnapshotCoherenceVerifier` fica **cego** para ele — um preço citado do runbook
seria classificado como inventado. Preferi abrir `extraTruthSources` no contrato
genérico (`BrainTypes.ts`) e mesclar no snapshot (`BrainReasoner.withExtraTruth`).
Assim manual e sinais viram verdade de fato, verificável.
**Dívida deixada:** o `SupportIncidentReasoner` continua usando `customerMemory`
para os sinais. Não migrei junto (fora do escopo, risco de mexer no caminho da
aba técnica no mesmo bloco), mas é migração de uma linha e deve entrar na fila.

**4. Onde o freio precisou ser explícito.**
`extraTruthSources` é uma porta para o chamador escrever verdade. Se alguém
passar o texto do usuário por ali, o usuário passa a escrever a própria verdade e
o verificador de fato fica cego — exatamente o buraco que o snapshot existe para
tapar. Escrevi a regra no doc do campo. **É aviso, não trava** — e aviso já
falhou neste projeto. Anotado como candidato a lint/teste arquitetural.

**5. As duas perguntas separadas (mentir sobre o mundo × sobre si).**
O portão de saída do `helpAssistant` barra **preço inventado** (mentira sobre o
mundo) — é o que o `SnapshotCoherenceVerifier` sabe fazer. Ele **não pega** o
agente prometendo fazer algo que não pode ("já subi seu cardápio"), que é mentira
sobre si mesmo. Hoje isso está segurado só por escopo declarado
(`SUPPORT_CANNOT_DO`), ou seja, por prompt. Enquanto o agente não age, o dano é
baixo; **no passo 3 (tool-calling) isso vira P0** e precisa de verificador de
capacidade, não de fato.

### O que quebrou

- `probeSystem()` em toda pergunta era desperdício e ruído: uma dúvida de "como
  cadastro um produto" sondava o sistema e o modelo tendia a citar sinal de fundo
  sem relação. Passou a rodar **só quando um modo de falha casa com o relato**.
- Primeira versão devolvia a fala da IA mesmo em `reasoningMode: FALLBACK`. O
  fallback tem `idealResponse` genérico ("Deixa eu confirmar isso pra você") que,
  numa aba de ajuda, parece resposta. Agora FALLBACK vira texto honesto + oferta
  de chamado.

### Achados fora do meu escopo (para o Diretor)

- `src/services/billing/PlanSubscriptionService.test.ts` está **vermelho na
  árvore** (`PlanSubscriptionService.ts:248` chama `planSubscription.findUnique`
  que o mock do teste não tem). Passa no commit `4a6a7e12` e falha depois do WIP
  `ab057699` — é da Frente 1 (checkout), não desta.
- `src/services/quality/noSideEffects.test.ts` estoura timeout **também no
  commit base**: os auditores tentam Postgres e o sandbox não tem credencial.
  Ambiental, pré-existente.
- `npx tsc --noEmit` acusa erros em `src/app/contratar/novo/CheckoutClient.tsx` e
  `src/app/site/(gated)/precos/page.tsx` — ambos da Frente 1, arquivos que outro
  agente estava editando no mesmo worktree durante este bloco.

---

## 2026-08-04 — Passo 3: o agente PROPÕE (e a trava de mentir sobre si mesmo)

**Pedido:** fazer o agente de suporte AGIR sem quebrar a Regra de Ouro. Primeira
ação real: subir o cardápio. Antes de qualquer ação, construir o verificador de
capacidade — a dívida que eu mesmo registrei na entrada anterior (item 5).

### O que tentei e o que descobri

**1. Onde a chave de ação tinha que morar: no contrato genérico, não no suporte.**
Cogitei devolver a chave por um campo do `HelpAnswer` e deixar o Brain intacto.
Rejeitei: aí o *mapeamento* pergunta→ação viraria código do chamador — regex ou
if/else — e isso é cérebro paralelo (Lei 1). Quem escolhe a ação tem que ser o
raciocínio. Então `proposableActions` entrou em `BrainReasoningRequest`
(`BrainTypes.ts:93`) e `proposedActionKey` em `BrainReasoningResult`
(`BrainTypes.ts:139`). A IA escolhe entre chaves; o Brain valida contra a lista
(`BrainReasoner.ts:210`) e descarta o que não casar **exatamente** — sem
normalizar, sem trim criativo, sem "quase certo". Chave descartada vira nota de
segurança, não silêncio.

**2. `runtimeTouched: false` não protege de nada sozinho — e eu quase confiei nele.**
A invariante diz que o Brain não mexe no runtime. Ela não diz nada sobre o Brain
*afirmar* que mexeu. As duas perguntas são mesmo separadas: o
`SnapshotCoherenceVerifier` olha "R$ 89,90 existe na base?"; "já subi seu
cardápio" não tem número nenhum e passa liso pelo verificador de fato inteiro.

**3. O lastro precisou ser por VERBO, não por "algo rodou".**
Primeira versão do `CapabilityCoherenceVerifier`: se a lista de execuções está
vazia, qualquer pretérito reprova; se tem alguma coisa, libera. Furo óbvio — o
executor prepara a *prévia* e o agente diz "já publiquei na loja". Passei a
exigir casamento por lema: cada execução declara `backsClaims` (o que ELA
autoriza afirmar) e a afirmação só passa se o verbo canônico estiver lá.
`menu_import_preview` autoriza "preparar/gerar/processar" e **não** autoriza
"publicar" nem "subir" — está no catálogo, com teste
(`CapabilityCoherenceVerifier.test.ts`, "afirmação FORA do que a execução dá
lastro").

**4. O `\b` do JavaScript é ASCII — e isso ia matar o detector em silêncio.**
`\bexcluí\b` **nunca** casa, porque "í" não é caractere de palavra para o motor
de regex. O detector teria um buraco por acidente de codificação, e ninguém
notaria: teste verde, agente mentindo. Troquei por lookarounds acentuadas
(`CapabilityCoherenceVerifier.ts:111-112`), com um teste que usa "Excluí" de
propósito. **Detector que falha calado é pior que detector nenhum.**

**5. A metade que deixa passar deu mais trabalho que a que barra.**
Verbo de LEITURA não podia entrar: o exemplo canônico do próprio perfil é
"Verifiquei a conexão do WhatsApp…", e barrar isso quebraria o diagnóstico
inteiro. Decidi cobrir só MUTAÇÃO, e escrevi o limite no cabeçalho como escolha,
não como esquecimento. Negação também precisou de tratamento por oração — "Não
apaguei nada, mas cadastrei o produto" tem uma frase honesta e uma afirmação; por
isso a quebra é em vírgula/"mas", não só em ponto final.

**6. Onde o portão reprova por omissão — de propósito.**
`helpAssistant.ts:206` exige `doesNotClaimUnexecutedAction === true`. Não
`!== false`. Se o campo não vier (portão que não rodou), reprova. Tem teste que
apaga o campo do objeto para provar isso ("BARRA POR OMISSÃO"). Mesmo tratamento
em `SupportIncidentReasoner.ts:154`, onde a consequência é mais suave e melhor:
cai na explicação determinística em vez de emudecer.

**7. Achado no caminho: a aba técnica usava a fala da IA sem olhar coerência NENHUMA.**
`SupportIncidentReasoner` copiava `idealResponse` para `explanation` checando só
`reasoningMode === "LLM"` — nem o veredito de fato inventado era consultado.
Coloquei o portão de capacidade; **o portão de FATO continua não sendo aplicado
ali** e isso é dívida real, não minha de escopo hoje: fica registrado.

### O que quebrou

- Fixture antiga do `SupportIncidentReasoner.test.ts` não declarava o veredito de
  capacidade → o gate estrito reprovou e o teste caiu. Foi o gate funcionando: um
  fixture que não declara o veredito É um portão que não registrou resultado.
- `WaiterBrainReasoningAdapter` parou de compilar quando o campo virou
  obrigatório. Resisti à tentação de preencher `true` fixo (seria aprovar por
  omissão com cara de código): passei a calcular o veredito ali também
  (`WaiterBrainReasoningAdapter.ts:27`).
- Primeira tentativa de "provar que em sombra nada executa" era um teste vazio: o
  runner nunca é chamado em lugar nenhum, então `not.toHaveBeenCalled()` não
  provava nada. Abri `SupportActionLadder.test.ts` com o catálogo simulado para
  mostrar que o caminho de execução EXISTE e que é a escada que o segura.

### Achados fora do meu escopo (para o Diretor)

- `src/services/quality/noSideEffects.test.ts` continua estourando timeout — os
  auditores tentam Postgres e o sandbox não tem credencial. Pré-existente,
  ambiental, já reportado na entrada anterior.
- Outro agente commitou arquivos meus em `91f84e51` ("A padaria de vitrine nasce
  sozinha em todo deploy") — `BrainTypes.ts` e o `CapabilityCoherenceVerifier`
  entraram numa mensagem de commit que não fala deles. Worktree compartilhado com
  `git add -A`. O conteúdo está íntegro; a trilha é que ficou mentirosa.

---

## 2026-08-04 — P0 de confiança: o agente que nunca dizia "não sei"

**Pedido:** consertar cinco defeitos medidos pela auditoria do `qualidade` no
agente de suporte do lojista. O grave: retrieval sem limiar, portanto sempre
"fundamentado"; o teste que provava o caminho honesto era carimbo; o casador de
sintomas transformava dúvida em incidente.

### O que tentei e o que descobri

**1. O bug não era o retrieval errar — era ele não ter como não achar.**
`rankDocumentsByEmbedding` ORDENA e nunca CORTA; `rankChapters` cortava em
`score > 0`, que sempre passa. Como o chamador pegava os 4 primeiros,
`grounded = chapters.length > 0` era tautologia e o ramo honesto era código
morto. Reproduzi o baseline rodando o `rankChapters` do `HEAD` contra os 36 guias
reais: **30 de 31 perguntas voltavam com guia** — e em produção, com
`OPENAI_API_KEY`, o degrau de embedding levava isso a 31/31, porque ele devolve
os 4 melhores de 36 mesmo quando os 36 são irrelevantes. *Sistema que não tem
como devolver vazio não tem como dizer "não sei" — e nenhum portão de saída
conserta isso, porque o portão olha a fala, não a fonte.*

**2. Score absoluto NÃO separa relevante de irrelevante — cobertura por IDF separa.**
Primeira tentativa: piso só no score. Furou na hora — "como emito nota fiscal do
pedido" pontuava **10** (casando só "pedido", termo que aparece em 21 dos 36
guias) enquanto "como adiciono um funcionário na equipe" pontuava **9** com o
guia certo. Passei a medir a **fatia da INFORMAÇÃO da pergunta** que o guia
cobre, com os termos pesados por IDF sobre o próprio corpus. Aí "nota fiscal"
cai para 0,11 e a pergunta legítima fica em 0,60. Os dois pisos são
**conjunção**, e cada um pega um caso que o outro deixa passar: a cobertura barra
"estorno do pix" (0,36) e o score barra "esqueci a senha do painel", que tem
cobertura ALTA (0,63) por casar 2 de 3 termos numa menção de passagem única.

**3. Calibrei por varredura, e a primeira margem que anunciei estava errada.**
Cheguei a escrever no código "maior cobertura entre os errados = 0,36". Estava
errado: meu script de calibração cortava os 3 primeiros **por score** antes de
aplicar o portão, e escondia o `guia-configurar-pagamentos` (score 6, cobertura
**0,44**) em "cliente quer estorno do pix". O teste de corpus caiu e me mostrou.
*A lição é chata e velha: instrumento de medida com filtro embutido mede o
filtro.* Refiz com varredura completa de 64 combinações (T1 0,35–0,70 × T2 4–12).
Ótimo em `T1=0,40 / T2=8`: 0 vazamentos, 0 guias errados, 1 pergunta legítima
perdida. Faixas que separam as duas classes: score em (6 · 9], cobertura em
(0,36 · 0,42].

**4. Stemming: medido, e recusado.** Prefixo de 6 caracteres recuperava as duas
perguntas que o piso derrubou ("acompanho"×"acompanhar", "ensino"×"ensinar") —
mas fazia "ensino a IA" passar a devolver o guia de **campanha de CRM**, e
prefixo de 5 quebrava dois dos nove bloqueios ("entregadores"→"entre" colide com
"entrega"). Troca recall por precisão na direção errada: um "não sei" é honesto,
um guia errado rotulado como verdade é a mentira que estamos consertando.
Ficou registrado no teste de corpus, com o custo medido explícito.

**5. Embeddings: o número que EU não podia calibrar, e disse isso.**
O piso de cosseno precisa da API real para ser medido, e o ambiente não tem
chave. Recusei chutar um valor e vendê-lo como calibrado. Inverti a arquitetura:
**a admissão é lexical (calibrada, offline, testável) e os embeddings só
reordenam o que já entrou**, com um piso de cosseno deliberadamente baixo e
marcado no código como NÃO calibrado. Custa os casamentos puramente semânticos
(zero sobreposição de palavras) — assumido por escrito, com o caminho para
destravar. *Ausência de informação não é informação vale para o código que eu
escrevo, não só para o agente em produção.*

**6. A terceira mentira, que nenhum dos dois portões existentes via.**
Separando as duas perguntas do método: mentir sobre o mundo (preço) tem
verificador; mentir sobre si (execução) tem verificador desde ontem. Mas o dano
medido aqui é uma **terceira**: ensinar `Configurações → Fiscal → Emitir NFC-e`
para uma tela que não existe. Não tem número (o verificador de fato passa liso) e
não tem verbo no pretérito (o de capacidade passa liso). Abri o portão 3: sem
NENHUMA verdade recuperada, resposta que descreve navegação não chega ao lojista.
O `contextHint` já pedia isso — e pedir não é travar.

**7. O casador de sintomas classificava por sobreposição de palavras.**
`MIN_MATCH_SCORE = 2` com duas palavras quaisquer do texto do sintoma. Rodei o
código do `HEAD` e reproduzi os cinco falsos positivos exatamente como a
auditoria descreveu — "papel de parede" → impressora HIGH, "erro ao abrir a tela"
→ banco CRITICAL. Regra nova: **gatilho curado é obrigatório e a sobreposição só
desempata**. Junto veio a regra de curadoria que faltava: *gatilho é expressão de
FALHA, não palavra de assunto* — "comanda" é assunto, "comanda não sai" é falha.
Mais escopo (o canal precisa estar no relato) e exclusões para a fronteira
Instagram × WhatsApp.

### O que quebrou

- Os testes de `rankChapters` com capítulos de brinquedo caíram: corpo de uma
  frase não alcança um piso calibrado em guias de verdade. **Resisti a afrouxar o
  piso para o teste passar** — seria calibrar pelo fixture. Separei
  `scoreChapters` (mecânica, sem corte) de `rankChapters` (portão), e os testes
  de ordenação foram para o primeiro.
- O teste do caminho honesto no `helpAssistant` continua existindo, mas com o
  aviso de que ele NÃO prova que o vazio existe — a prova mudou de endereço para
  `manualRetrievalCorpus.test.ts`, com os 36 guias reais e sem mock de retrieval.
- `tsc` reclamou de `suspected?.subsystem` dentro do portão 3: o compilador já
  sabia que `!grounded` implica `suspected === null`. O tipo estava mais atento
  que eu.

### Achados fora do meu escopo (para o Diretor)

- **O mesmo defeito de "ordena e não corta" está vivo no caminho do garçom.**
  `RestaurantKnowledgeAdapter.ts:84-85` chama `rankByEmbedding` e pega
  `slice(0, MAX_KNOWLEDGE_ITEMS)` sem piso nenhum: o conhecimento curado do
  restaurante entra no snapshot do garçom mesmo quando nada casa. O
  `minScore` que abri em `rankDocumentsByEmbedding` já serve; falta calibrar
  para aquele corpus (que é por restaurante, não fixo) e ligar. **Não mexi** — é
  o cliente final, e mudar retrieval do garçom sem corpus de calibração seria
  repetir o erro que vim consertar.
- `src/services/ai/BrandConfigService.ts:123` acusa erro de `tsc` **no commit
  base** (`waiterUpsellCategories` faltando). Pré-existente, não é deste bloco.
- A dívida do `SupportIncidentReasoner` continua: ele usa `customerMemory` para
  os sinais em vez de `extraTruthSources`, e o portão de FATO segue não aplicado
  ali. Registrado pela terceira entrada seguida.
