# The Brain — Arquitetura de Referência para Agentes de IA

**Versão 2** · 31/07/2026

**Documento de transferência.** Modelo genérico, extraído de um sistema em
produção com clientes reais. Escrito para ser lido por um agente de IA que vai
implementá-lo em outro projeto.

> **O que mudou da v1:** ficou explícito que existem **duas camadas de agente**
> (§1) — as regras são as mesmas, a maquinaria não. Entraram os princípios de
> **memória** (§5), o princípio **trava vs. aviso** (§2.4) e a regra de que
> **precedência exige correção** (§5.4). Changelog completo no fim.

---

## 0. Como ler este documento

Você é um agente. Este documento é para você, não para um humano. Quatro coisas
sobre como usá-lo:

**Primeiro: leia a §1 antes de tudo.** Ela separa duas coisas que a palavra
"agente" confunde. Aplicar a maquinaria errada na camada errada é o modo de falha
mais provável deste documento, e o mais caro.

**Segundo: cada regra vem com a história do incidente que a produziu.** Isso não
é enfeite. Regra sem história parece arbitrária, e a primeira coisa que um agente
competente faz com uma regra que parece arbitrária é removê-la em nome da
simplicidade. Todas as regras aqui custaram um cliente real tendo uma experiência
ruim. Leia a história antes de decidir que a regra é excessiva.

**Terceiro: os invariantes da §2 não são negociáveis.** Eles são o que separa "um
chatbot" de "um sistema que pode falar com cliente pagante". Se o seu projeto não
precisa deles, você provavelmente não precisa desta arquitetura inteira — use uma
chamada de LLM direta e seja feliz.

**Quarto: construa na ordem da §8.** A ordem não é estética. Cada peça depende de
a anterior existir, e várias só fazem sentido depois que você tem evidência do
mundo real. Construir governança antes de ter o que governar produz cerimônia
vazia.

---

## 1. As duas camadas de agente ⭐ *novo na v2*

Antes de qualquer coisa: **"agente" significa duas coisas neste mundo, e elas não
têm a mesma maquinaria.**

| | **Agente de produto** | **Agente de desenvolvimento** |
|---|---|---|
| Com quem fala | o **cliente final** do negócio | **você**, ou o Diretor humano |
| Exemplos | atendente, vendedor, agente de relacionamento | especialista de dados, de UI, de conformidade |
| Onde vive | no runtime da aplicação | em `.claude/agents/` ou equivalente |
| Custo de errar | cliente vai embora, dinheiro, processo | retrabalho |
| Erro é visível? | **quase nunca** — ninguém está olhando às 21h | sim, você lê a saída |
| Precisa de | **tudo** deste documento | §2, §5 e §6 |

**Os princípios são os mesmos. A maquinaria não é.**

Um agente de desenvolvimento **não** precisa de base de conhecimento estruturada,
de crítico de coerência ou de escada de liberação. Ele precisa de memória
disciplinada (§5), de menor privilégio (§2.4) e de saber que nunca muda as
próprias regras (§6).

Um agente de produto precisa **de tudo isso e mais o resto**, porque o erro dele
chega no cliente sem ninguém ver.

> **O modo de falha a evitar:** achar que porque você já tem `CLAUDE.md`,
> memória em arquivo e um humano revisando, o agente que fala com o cliente
> também está coberto. **Não está.** O humano revisa o que ele lê. Ninguém lê a
> conversa das 21h de sábado.

Daqui em diante, quando a regra vale só para uma camada, está dito.

---

## 2. Os princípios que valem para as duas camadas

### 2.1 A tese

> **A IA não é o produto. A arquitetura em volta dela é o produto.**

O modelo é intercambiável — é o *piloto*. Troca a cada seis meses, fica mais
barato, muda de fornecedor. O que não troca é: **de onde vem a verdade** que ele
usa; **quem verifica** o que ele disse; **o que acontece** quando ele erra; e
**como uma melhoria vira produção**.

| Peça | Papel |
|---|---|
| **Motor (Engine)** | O LLM. Intercambiável. Não sabe nada sobre o negócio. |
| **Brain** | A arquitetura. Orquestra verdade, raciocínio, verificação. |
| **Base de Conhecimento** | A verdade. Única fonte do que é fato. |
| **Agentes** | Executores com escopo declarado. Sem identidade hardcoded. |
| **Críticos** | Verificam a resposta ANTES do cliente ver. |
| **Portões** | Barram mudança que piora. |
| **Diretor** | Governa mudança estrutural. Exige humano. |
| **Escada** | Move um agente de sombra para produção, com prova. |

### 2.2 Os invariantes de segurança

Implemente como objeto congelado, verificado por teste. Não como documentação —
como código que quebra a build.

```ts
export const BRAIN_SAFETY = Object.freeze({
  touchesRuntime: false,                     // nunca muta o runtime vivo
  sendsMessages: false,                      // nunca envia por conta própria
  createsOrdersOrPayments: false,            // nunca cria pedido ou cobrança
  acceptsRawPII: false,                      // só recebe texto sanitizado
  agentsCanMutateBrain: false,               // agente nunca muda as próprias regras
  productionChangeRequiresQualityGate: true, // produção exige portão P0 = 0
} as const);

export function assertBrainSafety(): void { /* verifica campo a campo; um teste chama isto */ }
```

**Por que cada um existe:**

- **`touchesRuntime: false`** — Um Brain que se automodifica em produção é um
  Brain que você não depura. Quando algo dá errado às 21h de sábado, você precisa
  saber que o comportamento de agora é exatamente o aprovado. Separar "raciocinar"
  de "aplicar" é o que dá essa garantia.
- **`sendsMessages: false`** — O Brain *produz* uma resposta candidata. Quem
  decide enviar é o runtime, depois dos críticos. Se o Brain pudesse enviar, os
  críticos seriam opcionais na prática.
- **`acceptsRawPII: false`** — Sanitize na entrada, não na saída. Um Brain que
  nunca viu o telefone do cliente não pode vazar o telefone do cliente. Isso
  também torna log, replay e treino seguros por construção.
- **`agentsCanMutateBrain: false`** — Um agente que pode mudar as próprias regras
  vai, eventualmente, remover a regra que o incomoda. É o ponto inteiro da
  governança — e vale para as **duas** camadas (§5.3).

### 2.3 Ausência de informação não é informação

A regra mais importante deste documento inteiro.

> **O agente nunca infere uma negação do silêncio da base. Sem fato explícito, a
> resposta é "preciso confirmar", nunca "não temos".**

A assimetria: afirmar o que não se sabe é ruim; **negar o que não se sabe é
pior**, porque soa autoritativo e o cliente vai embora sem perguntar de novo.

História completa em §7.1. É o incidente mais caro que tivemos.

### 2.4 Trava vs. aviso ⭐ *novo na v2*

> **Para o que causa dano real, prompt é aviso — não trava.**

Escrever "não faça X" no prompt de um agente é uma sugestão forte, não uma
garantia. Se o custo de ele fazer X é alto, você precisa de um **mecanismo**:

| Em vez de… | Use… |
|---|---|
| "não invente preço" no prompt | verificador que compara valor contra a base |
| "não prometa pedido" no prompt | verbo proibido barrado pelo crítico |
| "não mexa em arquivo" no prompt | **não dar a ferramenta de escrita ao agente** |
| "seja rigoroso na autoavaliação" | mostrar o resultado para um humano ver |

O caso mais comum e mais subestimado é o último da tabela: **um modelo avaliando
o próprio trabalho é generoso**. Pedir rigor não conserta isso. O que conserta é
outro avaliador, ou olho humano no resultado.

Aplicação direta na camada de desenvolvimento: **dar todas as ferramentas a todo
agente é conforto, não desenho.** Um agente de análise que não pode escrever
arquivo não apaga nada por engano — e isso é uma trava, não um pedido.

### 2.5 Sem portão = reprovado

```ts
export async function runGateForBrain(agentId: string): Promise<GateResult> {
  const runner = gateRegistry.get(agentId);
  if (!runner) {
    return { passed: false, p0Count: -1, reason: `Nenhum portão registrado para "${agentId}".` };
    //       ↑ ISTO
  }
  try { return await runner(agentId); }
  catch (err) { return { passed: false, p0Count: -1, reason: `Portão falhou: ${err}` }; }
}
```

> **Verificação não registrada = REPROVADO por construção.
> Nunca "passa por não existir".**

O caminho natural é `if (!runner) return { passed: true }` — "não tem teste, então
não tem problema". Isso transforma **"esqueci de escrever o portão"** em
**"liberado para produção"**. Inverta o default e o esquecimento vira bloqueio,
que é o lado seguro de errar.

O mesmo padrão vale no crítico de comando: **sem manual do domínio = reprovado**,
não "aprovado por falta de regra".

### 2.6 O alerta carrega a própria evidência

Durante semanas o nosso alerta noturno dizia:

```
p0Count=1 — encontrou um problema crítico
```

E nada mais. Cada disparo custava uma investigação inteira. Depois que ele passou
a trazer **o que o cliente pediu, o que o agente respondeu e a violação exata**, o
mesmo problema passou a ser diagnosticado em minutos.

Vale para alerta, para log, para o retorno de um subagente e — como você vai ver
em §5.2 — para memória.

---

## 3. O fluxo cognitivo (camada de produto)

**Regra de Ouro: existe UMA porta de entrada.** Todo agente raciocina chamando a
mesma função. Se existirem duas, uma delas vai pular um crítico.

```
reasonAsAgent(request) → outcome

  1. ESCOPO     carrega o PERFIL declarado do agente (nunca identidade hardcoded)
  2. VERDADE    carrega o snapshot da base de conhecimento
  3. PILOTO     roteia o pensamento para o motor selecionado
  4. COERÊNCIA  verifica o resultado contra a verdade ANTES de devolver
```

```ts
export interface BrainReasoningRequest {
  businessId: string;
  businessType: BusinessType;      // aberto: qualquer string vale
  agentId: string;                 // resolve o PERFIL
  agentRole: string;
  sourceType: "REAL_CONVERSATION" | "SIMULATION" | "MANUAL_TEST" | "SYSTEM_EVENT";
  sanitizedInput: string;          // SEMPRE sanitizado
  sanitizedHistory?: SanitizedTurn[];
  customerMemory?: string;         // durável, comportamental, sem PII
  contextHints?: string[];
}

export interface BrainReasoningOutcome {
  result: BrainReasoningResult;
  engine: AIEngineSelection;       // qual piloto pensou — proveniência
  reasoningMode: "LLM" | "FALLBACK";
  snapshot: Pick<BusinessKnowledgeSnapshot, "truthSources" | "missingContext">;
}
```

Duas decisões que valem copiar:

**O `snapshot` volta no outcome.** Um crítico externo precisa julgar a resposta
*contra a mesma verdade* que foi usada. Se ele reconsultar, pode pegar verdade
diferente e o veredito vira loteria.

**`reasoningMode` é explícito.** Você precisa saber se aquilo veio de raciocínio
real ou de um caminho de queda. Um dos portões usa isso: resposta em FALLBACK não
tem permissão de ir ao vivo.

---

## 4. A verdade — Base de Conhecimento (camada de produto)

> **O agente raciocina APENAS sobre um snapshot da verdade. O que não está no
> snapshot vai para `missingContext`, e o agente diz "preciso confirmar".**

```ts
export interface BusinessKnowledgeSnapshot {
  businessId: string;
  businessType: BusinessType;
  truthSources: {
    products?: unknown[]; prices?: unknown[]; hours?: unknown;
    policies?: unknown[]; materials?: unknown[];
    // … o que o seu domínio tiver
  };
  /** O que o agente NÃO sabe. Tão importante quanto o que ele sabe. */
  missingContext: string[];
  safetyNotes: string[];
  /** Quando foi montada — auditável: "o que ele sabia quando respondeu". */
  snapshotAsOf?: string;
  /** 0–1: quanto da verdade essencial existe. Vira portão de promoção. */
  completenessScore?: number;
}

export interface BusinessKnowledgeAdapter {
  businessType: BusinessType;
  getSnapshot(businessId: string, opts?: KnowledgeSnapshotOptions): Promise<BusinessKnowledgeSnapshot>;
}
```

**Use um registry, não um `if`.** A primeira versão terá `if (type ===
"RESTAURANT")`. A segunda vertical vira `else if`. A quinta é impossível de
manter. E cada `if` no núcleo é um convite a alguém mexer onde moram os
invariantes.

```ts
registerKnowledgeAdapter(restaurantAdapter);
const adapter = resolveKnowledgeAdapter(businessType);
```

**Deixe o tipo aberto:** `type BusinessType = "RESTAURANT" | "CLINIC" | (string & {})`.
Mantém autocomplete e aceita qualquer string — vertical nova registra o adaptador
dela sem editar o núcleo.

**`completenessScore` separa "o agente pode falar" de "ainda não".** Se a verdade
está 30% preenchida, ele vai viver em `missingContext`. Melhor não deixar falar.

**`missingContext` não é campo de log.** É o insumo do "preciso confirmar". Se
ninguém lê, o agente inventa.

---

## 5. A memória ⭐ *novo na v2 — vale para as duas camadas*

A v1 tratava só da verdade do produto. Mas **agente também acumula aprendizado
sobre o próprio trabalho**, e isso precisa de disciplina — senão ele se envenena.

### 5.1 O problema

Um agente de desenvolvimento nasce e morre a cada chamada: recebe a tarefa, faz,
devolve, esquece tudo. Sem memória externa, na semana 8 alguém está re-explicando
ao especialista o que o próprio especialista descobriu na semana 3.

Um agente de produto tem o problema espelhado: se ele **escrever** o que aprendeu
sem controle, ele grava "aprendi que X" sobre algo errado, lê aquilo como verdade
na semana seguinte e constrói em cima. Três meses depois você tem um agente
confiantemente errado e ninguém sabe de onde veio.

### 5.2 A solução: separe a verdade do diário

```
<memória do agente>/
  ├── vitrine.md     ← curto, curado. Outros leem. O AGENTE NÃO ESCREVE.
  ├── oficina.md     ← append-only. O agente escreve. Corrente.
  └── oficina/
      └── 2026-07.md ← mês fechado. Perícia, não leitura.
```

**A vitrine** é o que vale: decisões firmadas, regras que não se discutem mais,
estado atual. **Duas telas no máximo.** Se não cabe, não é vitrine — é oficina mal
classificada. E ela come justamente o contexto que a memória externa existia para
economizar.

**Toda entrada de vitrine carrega proveniência:**

```markdown
## <O fato ou a regra, em uma linha>
<2–5 linhas. Tem que ser compreensível por um agente que NUNCA viu a
conversa em que isso foi descoberto.>

— promovido em 2026-07-31 por <quem> · origem: oficina/2026-07.md#<âncora> (commit a1b2c3d)
```

Sem proveniência, o "confiantemente errado" volta por outra porta: o fato está lá,
ninguém rastreia de onde veio, ninguém audita se a promoção foi boa. É a §2.6
aplicada à memória.

**A oficina** é rascunho: o que tentou, o que quebrou, o log do dia. Rotaciona por
mês. A assimetria é intencional — **vitrine tem teto de tamanho, oficina tem teto
de idade.**

**O arquivo morto é para perícia, não para leitura.** Serve para reconstruir o
raciocínio de uma decisão que deu errado. **O agente lê apenas a oficina
corrente.** Sem isso escrito, alguém vai tentar fazer o agente ler oito meses de
diário e reintroduz exatamente o problema que a rotação resolvia.

### 5.3 O agente propõe; quem promove é outro

> **O agente escreve na oficina, nunca na vitrine.**

Ele *propõe* a entrada de vitrine como parte da saída dele; quem promove é o Diretor,
o humano, ou o processo de aprovação. É o `agentsCanMutateBrain: false` da §2.2
aplicado à memória.

**Isso é barato se estiver no fluxo.** Se todo bloco de trabalho termina em
commit, quem revisa vê o diff da vitrine no mesmo gesto. Custo quase zero,
proteção alta. Não transforme em ritual separado — ritual separado é pulado.

### 5.4 Precedência exige correção ⭐

Quando existem várias fontes (regras globais, decisões transversais, vitrine de
cada agente), defina a hierarquia:

```
guardrails globais  >  decisões transversais  >  camadas de referência  >  vitrine
```

Mas **precedência sozinha não basta.**

> **Conflito detectado → o item de menor precedência é CORRIGIDO na mesma
> sessão.**

Dizer "a vitrine está errada por definição" resolve a discussão e deixa uma
mentira conhecida num arquivo que os agentes leem como verdade. E vale a lição
geral, que aparece em várias formas neste documento:

> **Um verificador que dispara e não conserta nada treina a equipe a ignorar o
> verificador.**

### 5.5 Duas regras práticas

**Cada agente escreve só na própria memória.** Precisa de algo na memória de
outro? Pede. Nunca entra e edita.

**Memória nasce sob demanda.** Não crie a estrutura de memória de todos os
agentes no dia 1 — pasta vazia é cerimônia. A primeira nasce quando um agente
acumular aprendizado real entre sessões. *(É a §8 aplicada a si mesma: não
construa governança antes de ter o que governar.)*

---

## 6. Os críticos e os portões (camada de produto)

### 6.1 Crítico determinístico — o piso, nunca sai

Roda em microssegundos, custa zero, dá o mesmo veredito sempre. Verifica
*afirmação contra snapshot*.

```ts
export interface SnapshotClaimCheck {
  inventedPrices: string[];    // valores citados que NÃO existem na base
  serviceDenials: string[];    // negações detectadas
  doesNotInventFacts: boolean;
  needsReview: boolean;
  reason: string;
}
```

Duas classes de falha, as duas vindas de incidente real:

**1. Valor inventado.** Todo número de dinheiro citado tem que existir na verdade.
Compare em **inteiros de centavo**, nunca em ponto flutuante — `32.90 * 3` dá
`98.69999999999999`, e um verificador que erra por dízima é pior que nenhum.

**2. Negação de serviço.** §2.3. Negação sem respaldo vira `NEEDS_REVIEW`.

### 6.2 Crítico LLM-judge — a segunda camada

Um segundo modelo julga a resposta contra o mesmo snapshot.

- **Reprovação explícita bloqueia. Indisponibilidade do juiz não bloqueia** — o
  piso determinístico já passou. Se o juiz cair, você não pode parar de atender.
- Ele recebe o snapshot do outcome, não reconsulta.
- É perfil `JUDGE` no roteamento — modelo forte, é onde vale gastar.

### 6.3 O portão por mensagem, e a queda

```ts
const criticOk =
  outcome.reasoningMode === "LLM" &&
  outcome.result.coherenceCheck.verdict === "PASS" &&
  outcome.result.confidence >= minConfidence;

if (!criticOk) { /* cai para o caminho determinístico */ }
```

> **A queda tem que PRESERVAR o contexto.** "Desculpa, não peguei essa — pode
> repetir?" é queda. A tela de entrada não é queda: é apagar a memória na frente
> do cliente.

Leia §7.3 antes de implementar isso. Foi onde erramos feio.

### 6.4 Severidade

Separe **quantos problemas críticos** de **quão boa está a peça**. Duas contas.

| Nível | Significado | Efeito |
|---|---|---|
| **P0** | O agente mentiu para o cliente | Reprova sozinho. Nota alta não compra passagem. |
| **P1** | Comportamento proibido | Reprova, não é crítico |
| **P2** | Comportamento esperado não atendido | Aviso |
| **INFO** | Tudo certo | Passa |

### 6.5 O piloto — motores intercambiáveis

```ts
export type EngineCall = (input: StructuredCallInput) => Promise<string>;
export type EngineTaskProfile = "CLASSIFY" | "REASON" | "JUDGE" | "GENERATE";
```

- **Nenhum consumidor do Brain conhece SDK de provider.** Se aparecer `import
  OpenAI` fora da pasta de adapters, você já perdeu. Ponha uma regra de lint que
  quebra a build — nós pusemos.
- **Roteie por natureza da tarefa, não só por agente.** Classificar é barato e
  frequente → modelo pequeno. Julgar precisa ser bom → modelo forte. É a maior
  alavanca de custo do sistema, e só existe se for por perfil desde o começo.
- **Sempre tenha um provider MOCK**, sem chave, disponível em qualquer ambiente.
  É o que torna a suíte hermética e faz o sistema rodar na máquina de um dev novo.
- **Mudar roteamento é mudança governada**, não commit.

### 6.6 O perfil do agente

O agente **não tem identidade hardcoded**. Ele tem perfil que o Brain carrega:

```ts
interface AgentProfileDefinition {
  slug: string; name: string; mission?: string;
  responsibilities: string[];
  allowedActions:   string[];
  forbiddenActions: string[];   // INTERNO — nunca visível ao usuário do produto
  safetyRules:      string[];   // INTERNO
}
```

É o que faz **um único Brain operar todos os agentes**: o prompt de sistema é
montado do perfil, não de uma constante.

`forbiddenActions` e `safetyRules` são internos. Se o cliente pudesse editar as
regras de segurança do agente dele, elas não seriam regras de segurança.

---

## 7. As histórias

Esta seção é o valor real do documento. Cada uma custou um cliente real.

### 7.1 O rodízio — ausência de informação não é informação

Cliente perguntou se o restaurante tinha rodízio. Não estava na base. O agente
disse **"não temos rodízio"**. O restaurante tinha.

Ele não alucinou um fato — **inferiu uma negação a partir de um silêncio**. É um
modo de falha diferente e mais difícil de ver, porque a resposta *parece*
responsável ("não vou inventar que temos").

**Regra:** negação de serviço nunca passa direto. Teste de regressão obrigatório
no conjunto dourado.

### 7.2 "Não temos VOCES no cardápio"

Cliente escreveu *"vocês têm pizza?"*. O agente respondeu:

> *"Não temos **voces** no cardápio."*

A busca filtrava palavras sem significado, e o pronome no plural não estava na
lista. Virou termo de busca e, pior, virou o produto na frase. O mesmo com
*"vende açaí?"* → "Não encontrei **vende**".

Três lições:

**1. Conserte na raiz, não no rótulo.** A correção óbvia trata o texto que
aparece. A certa foi tirar as palavras-de-pergunta da busca inteira — arrumou o
rótulo *e* parou de gerar negações falsas.

**2. Rótulo lê a mensagem CRUA.** O texto normalizado tira acento. Devolver
"hamburguer" para quem escreveu "hambúrguer" faz a resposta parecer defeito.

**3. Ficou escondido por sorteio.** O teste noturno amostrava 12 cenários. O
defeito estava lá havia semanas e só apareceu quando o sorteio calhou de pegar
aquela frase. → §7.5.

### 7.3 A Nicole — o incidente mais importante deste documento

Conversa real, cliente real, 20 minutos. Duas falhas empilhadas.

**Falha 1: o agente prometeu o que não podia cumprir.**

O caminho não tinha carrinho. Nenhuma capacidade de criar pedido. Mesmo assim:

- *"Vou adicionar tare ao seu pedido"* — não adicionou em lugar nenhum
- *"Posso confirmar o seu pedido?"* — não havia pedido

A cliente respondeu **"Sim"** duas vezes. As duas caíram no vazio.

> **Regra: a capacidade que o agente NÃO tem precisa de TRAVA, não de prompt**
> (§2.4). Verbo de transação em agente que só conversa é violação barrada pelo
> crítico, não pedido no system prompt.

**Falha 2: a queda apagava a conversa.**

O runtime tinha cinco portões. Todo portão que reprovava delegava ao caminho
determinístico — que, sem intent que casasse, respondia com a **mensagem de
boas-vindas**.

No meio de um pedido, cinco vezes, a cliente recebeu *"Olá! Tudo bem? 😊 O que
você deseja?"*. Do ponto de vista dela, o robô teve amnésia cinco vezes.

A arquitetura estava certa (nunca deixar o modelo inventar). **O modo de falha é
que estava errado.**

> **Proteção que dispara não pode ser mais destrutiva que o problema que ela
> evita.**

**Corolário não óbvio:** havia um plano de tornar a saudação mais calorosa e
variada. Se isso tivesse entrado antes do conserto da queda, a cliente teria
recebido cinco saudações *diferentes e lindas* no meio do pedido — o que é
**pior**, porque parece que o agente tem amnésia *e* finge te conhecer pela
primeira vez toda vez. **Conserte o modo de falha antes de melhorar a mensagem
que o modo de falha emite.**

### 7.4 O checador que reprovava o acerto

Um verificador marcava como crítico *qualquer* alternativa oferecida quando o
item pedido não existia. Mas o comportamento esperado era literalmente "negar e
oferecer alternativa real".

**O agente fazia a coisa certa e era reprovado por isso.**

> **Verificador com régua curta demais pune a resposta certa. Isso é pior que não
> ter verificador, porque gera alarme falso recorrente — e alarme falso recorrente
> treina a equipe a ignorar alarme.**

Ao escrever um verificador, escreva metade dos testes provando que **o legítimo
passa**. Sem essa metade, o conserto vira carimbo.

### 7.5 Os testes verdes que não viram nada

Um dia real: 6 portões verdes com P0 = 0; simulador noturno 30 rodadas, 30
verdes; auditoria automática 30/30. E uma cliente real quebrou o sistema em 20
minutos (§7.3).

**Por quê:** todos os testes eram **herméticos** — cada motor isolado, cenários
fixos e bem-comportados. Ninguém testava a **costura entre os motores** com
conversa real: bagunçada, com erro de digitação, mudança de ideia no meio,
mensagens fora de ordem.

> **Teste hermético prova que a lógica está certa. Não prova que o sistema
> funciona.** Você precisa dos dois: hermético por peça (rápido, no CI) e **de
> costura**, com conversas reais inteiras atravessando todas as camadas.

**Corolário sobre amostragem:** se o teste noturno sorteia N cenários, o espaço
não amostrado é seu ponto cego. Quando o espaço é pequeno e fechado, **varra ele
inteiro no CI** — em milissegundos — e deixe o sorteio para o que é grande demais.

### 7.6 Dinheiro em ponto flutuante

`32.90 + 32.90 + 32.90` dá `98.69999999999999`. Converta para **centavos
inteiros** na fronteira. Tolerância de 1 centavo para arredondamento de exibição —
um centavo é formatação, não mentira.

---

## 8. Ordem de construção

Não pule. Cada fase depende da anterior existir de verdade.

### Fase 1 — O piso
1. `BRAIN_SAFETY` congelado + teste dos invariantes
2. Contrato de snapshot + **um** adaptador real
3. `EngineAdapter` + provider MOCK + **um** provider real
4. A porta única de raciocínio
5. Perfil de agente carregado de config, nunca hardcoded

**Não construa** governança, escada nem memória ainda. Não há o que governar.

### Fase 2 — Os críticos
6. Crítico determinístico: valor inventado + negação de serviço
7. Conjunto dourado com **os casos que já te machucaram**
8. Portão com registry — **sem portão = reprovado**
9. Portão por mensagem — **e a queda que preserva contexto**

### Fase 3 — A evidência
10. Modo sombra: raciocina, grava, não responde
11. Persistência da evidência + estatística de aprovação
12. Simulação: clientes artificiais contra o motor real, com severidade
13. **Teste de costura** com conversas reais inteiras (§7.5)

### Fase 4 — A promoção
14. Escada de liberação com portões numéricos
15. Pedido de mudança + risco + aprovação humana
16. Rollback rápido

### Fase 5 — A memória e a melhoria
17. Memória por agente (§5) — **quando o primeiro precisar**, não antes
18. Captação de caso real → cenário de treino

---

## 9. A escada de liberação (camada de produto)

Como um agente sai de "existe no código" para "fala com cliente pagante".

```
SOMBRA        →      ALLOWLIST      →      PRODUÇÃO
(observa,          (time/pilotos)         (clientes reais)
 não responde)                                  ↓
                                        rollback rápido → volta para SOMBRA
```

Cada promoção exige portões com **números auditáveis, não achismo**:

```ts
export const SHADOW_EVIDENCE = {
  ALLOWLIST: { minSamples:  20, minPassRate: 0.70 },
  PRODUCAO:  { minSamples: 100, minPassRate: 0.85 },
} as const;
export const KNOWLEDGE_COMPLETENESS_FLOOR = 0.6;
```

Detalhes que importam:

- **Promoção para produção exige reconhecimento explícito de que são clientes
  reais** — um campo que o humano marca. Fricção deliberada.
- **O rollback volta para SOMBRA, não para desligado.** A sombra continua colhendo
  evidência enquanto o problema é consertado. Você quer que o incidente vire dado.
- **Toda transição muda só configuração.** Nunca toca runtime.

---

## 10. Armadilhas — "você vai ser tentado a…"

**…achar que as duas camadas são a mesma coisa.** §1. O erro perigoso é
concluir que o agente que fala com o cliente já está coberto porque existe um
humano revisando. Ninguém revisa a conversa das 21h de sábado.

**…fazer o portão retornar `passed: true` quando não há portão.** Transforma
esquecimento em liberação.

**…deixar o agente enviar a mensagem que ele mesmo produziu.** Parece indireção
boba. É o que torna os críticos obrigatórios em vez de opcionais.

**…usar `if (businessType === …)` no núcleo.** Funciona para dois. Morre no quinto.

**…comparar dinheiro em float.** §7.6.

**…pedir criatividade no prompt.** O modelo volta para a média. Variedade vem de
fora, em código, com memória do que já foi usado.

**…mandar a tela de entrada quando o agente não entende.** §7.3. É a coisa mais
destrutiva deste documento e é *exatamente* o que o código "limpo" faz
naturalmente.

**…confiar que teste verde significa sistema funcionando.** §7.5.

**…dar todas as ferramentas a todo agente.** §2.4. Conforto, não desenho.

**…deixar o agente escrever direto na própria vitrine.** §5.3. Ele se envenena.

**…construir auto-aprovação de mudança na v1.** Você não tem histórico para saber
o que é seguro aprovar sozinho.

**…tratar `missingContext` como campo de log.** É o insumo do "preciso confirmar".

**…escrever o motivo da reprovação como relatório.** Escreva como **ordem de
reescrita** — ele vai literalmente para quem vai corrigir. `"o tom está
inadequado"` não conserta nada; `"troque 'parceiro' por 'você'; corte o
superlativo"` conserta.

---

## 11. O que NÃO copiar

**Os números dos portões (20/70%, 100/85%, completude 0.6) são nossos.** Pontos de
partida defensáveis. Calibre com o seu dado.

**A escada tem três degraus porque nosso domínio tinha esse formato.** O que
transfere é *ter degraus com portões numéricos*, não os nomes.

**A taxonomia de risco precisa de revisão.** Roteamento de motor é ALTO para nós
porque troca de modelo mexe em tudo. No seu projeto pode ser diferente.

**Este modelo pressupõe que errar com o cliente é caro.** Se você está
construindo ferramenta interna onde uma resposta errada faz alguém rir, esta
arquitetura inteira é excesso. Use uma chamada direta.

---

## 12. Resumo em uma página

- **Existem duas camadas de agente** (produto e desenvolvimento). Mesmos
  princípios, maquinaria diferente. O de produto precisa de tudo.
- A IA é o piloto, intercambiável. **O Brain é o produto.**
- **Uma porta de entrada:** escopo → verdade → piloto → coerência.
- **A base de conhecimento é a verdade.** O que não está nela vira "preciso
  confirmar", não invenção.
- **Ausência de informação não é informação.** Negar exige verdade explícita.
- **Prompt é aviso; trava é trava.** Para dano real, exija mecanismo.
- **Dois críticos:** determinístico (piso, sempre) e juiz (camada, pode cair).
- **Sem portão = reprovado.** Nunca "passa por não existir".
- **P0 reprova sozinho.** Nota alta não compra passagem.
- **A queda preserva o contexto.** Nunca a tela de entrada no meio da conversa.
- **Proteção que dispara não pode ser mais destrutiva que o problema.**
- **Memória: vitrine curada + oficina append-only.** O agente propõe, outro promove.
- **Precedência exige correção**, não só ordem.
- **Escada com prova numérica.** Rollback volta para sombra, não para desligado.
- **Teste hermético não prova que o sistema funciona.** Teste a costura.
- **O alerta carrega a evidência.**
- **Variedade vem de fora, em código, com memória.**

---

## 13. Changelog

**v2 — 31/07/2026**

Adicionado:
- **§1 As duas camadas de agente** — produto vs. desenvolvimento. Princípios
  compartilhados, maquinaria distinta. Era o risco de leitura mais grave da v1.
- **§2.4 Trava vs. aviso** — promovido a princípio de primeira classe. Inclui o
  caso do modelo que avalia o próprio trabalho e menor privilégio de ferramenta.
- **§5 A memória** — vitrine/oficina, proveniência na promoção, rotação por idade,
  arquivo para perícia, agente propõe e outro promove, memória sob demanda.
- **§5.4 Precedência exige correção** — e a lição geral: verificador que dispara e
  não conserta treina a equipe a ignorar o verificador.
- **§8** ganhou "teste de costura" como item explícito da Fase 3.

Reorganizado:
- Os princípios comuns às duas camadas subiram para §2; o que é exclusivo da
  camada de produto ficou em §3, §4, §6 e §9, com a camada marcada no título.

Origem: arquitetura de Brain em produção com clientes reais, revisada em conversa
cruzada entre duas instâncias de Diretor. Cada regra existe porque a ausência dela
custou alguma coisa.

---

*Se você for remover uma regra, leia primeiro a história que a produziu.*
