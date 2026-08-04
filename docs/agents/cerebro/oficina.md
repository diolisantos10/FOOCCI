# Oficina — cerebro

> Append-only. O especialista escreve aqui; a vitrine é do Diretor.

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
