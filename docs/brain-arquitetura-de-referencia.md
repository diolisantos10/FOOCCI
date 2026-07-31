# The Brain — Arquitetura de Referência para Agentes de IA em Produção

**Documento de transferência.** Modelo genérico, extraído de um sistema em
produção com clientes reais. Escrito para ser lido por um agente de IA que vai
implementá-lo em outro projeto.

---

## 0. Como ler este documento

Você é um agente. Este documento é para você, não para um humano. Três coisas
sobre como usá-lo:

**Primeiro: cada regra aqui vem com a história do incidente que a produziu.**
Isso não é enfeite. Regra sem história parece arbitrária, e a primeira coisa que
um agente competente faz com uma regra que parece arbitrária é remover ela em
nome da simplicidade. Todas as regras deste documento custaram um cliente real
tendo uma experiência ruim. Leia a história antes de decidir que a regra é
excessiva.

**Segundo: os invariantes da Seção 2 não são negociáveis.** Eles são o que
separa "um chatbot" de "um sistema que pode falar com cliente pagante". Se o
projeto que você está construindo não precisa deles, você provavelmente não
precisa desta arquitetura inteira — use uma chamada de LLM direta e seja feliz.

**Terceiro: construa na ordem da Seção 6.** A ordem não é estética. Cada peça
depende de a anterior existir, e várias delas só fazem sentido depois que você
tem evidência do mundo real. Construir a governança antes de ter o que governar
produz cerimônia vazia.

---

## 1. A tese

> **A IA não é o produto. A arquitetura em volta dela é o produto.**

O modelo de linguagem é intercambiável — é o *piloto*. Ele troca a cada seis
meses, fica mais barato, muda de fornecedor. O que não troca é:

- **de onde vem a verdade** que ele usa para responder;
- **quem verifica** o que ele disse antes de chegar no cliente;
- **o que acontece** quando ele erra;
- **como uma melhoria é promovida** de ideia para produção.

Chame isso de Brain. Os papéis:

| Peça | Papel |
|---|---|
| **Motor (Engine)** | O LLM. Intercambiável. Não sabe nada sobre o negócio. |
| **Brain** | A arquitetura. Orquestra verdade, raciocínio, verificação. |
| **Base de Conhecimento** | A verdade do negócio. Única fonte do que é fato. |
| **Agentes** | Executores com escopo declarado. Não têm identidade hardcoded. |
| **Críticos** | Verificam a resposta ANTES do cliente ver. |
| **Portões de Qualidade** | Barram mudança que piora. |
| **Diretor** | Governa mudança estrutural. Exige humano. |
| **Escada de Liberação** | Move um agente de sombra para produção com prova. |

---

## 2. Os invariantes

Implemente isto como um objeto congelado, verificado por teste. Não como
documentação — como código que quebra a build se alguém violar.

```ts
export const BRAIN_SAFETY = Object.freeze({
  /** O Brain nunca muta o runtime vivo (prompt, versão, config de produção). */
  touchesRuntime: false,
  /** O Brain nunca envia mensagem por conta própria. */
  sendsMessages: false,
  /** O Brain nunca cria pedido, cobrança ou pagamento. */
  createsOrdersOrPayments: false,
  /** O Brain só recebe/armazena texto SANITIZADO — nunca PII crua. */
  acceptsRawPII: false,
  /** Agentes nunca mudam o Brain sozinhos. Só via pedido aprovado por humano. */
  agentsCanMutateBrain: false,
  /** Mudança que afeta produção exige o portão de qualidade (P0 = 0). */
  productionChangeRequiresQualityGate: true,
} as const);

export function assertBrainSafety(): void {
  // Verifica cada campo explicitamente. Um teste chama isto.
  // Se alguém "otimizar" um invariante, a build quebra.
}
```

### Por que cada um existe

**`touchesRuntime: false`** — Um Brain que pode mudar a si mesmo em produção é
um Brain que você não consegue depurar. Quando algo dá errado às 21h de um
sábado, você precisa saber que o comportamento de agora é exatamente o
comportamento que foi aprovado. Separar "raciocinar" de "aplicar" é o que dá
essa garantia.

**`sendsMessages: false`** — O Brain *produz* uma resposta candidata. Quem
decide enviar é a camada de runtime, depois dos críticos. Se o Brain pudesse
enviar, os críticos seriam opcionais na prática.

**`acceptsRawPII: false`** — Sanitize na entrada, não na saída. Um Brain que
nunca viu o telefone do cliente não pode vazar o telefone do cliente. Isso
também torna log, replay e treinamento seguros por construção.

**`agentsCanMutateBrain: false`** — Um agente que pode mudar as próprias regras
vai, eventualmente, remover a regra que o incomoda. Esse é o ponto inteiro da
governança.

---

## 3. O fluxo cognitivo

**Regra de Ouro: existe UMA porta de entrada.** Todo agente raciocina chamando a
mesma função. Se existirem duas, uma delas vai pular um crítico.

```
reasonAsAgent(request) → outcome

  1. ESCOPO     carrega o PERFIL declarado do agente (nunca identidade hardcoded)
  2. VERDADE    carrega o snapshot da base de conhecimento do negócio
  3. PILOTO     roteia o pensamento para o motor de IA selecionado
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
  customerMemory?: string;         // memória durável, comportamental, sem PII
  contextHints?: string[];
}

export interface BrainReasoningOutcome {
  result: BrainReasoningResult;
  engine: AIEngineSelection;       // qual piloto pensou — proveniência
  reasoningMode: "LLM" | "FALLBACK";
  snapshot: Pick<BusinessKnowledgeSnapshot, "truthSources" | "missingContext">;
}
```

Duas decisões de desenho que valem copiar:

**O `snapshot` volta no outcome.** Um crítico externo (LLM-judge) precisa julgar
a resposta *contra a mesma verdade* que foi usada. Se ele reconsultar, ele pode
pegar uma verdade diferente e o veredito vira loteria.

**`reasoningMode` é explícito.** Você precisa saber se aquela resposta veio de
raciocínio real ou de um caminho de queda. Um dos portões usa isso: resposta em
modo FALLBACK não tem permissão de ir ao vivo.

---

## 4. Os contratos

### 4.1 A verdade — Base de Conhecimento

Este é o conceito mais importante do documento inteiro.

> **O agente raciocina APENAS sobre um snapshot da verdade.
> O que não está no snapshot vai para `missingContext`, e o agente diz
> "preciso confirmar" — nunca inventa.**

```ts
export interface BusinessKnowledgeSnapshot {
  businessId: string;
  businessType: BusinessType;
  truthSources: {
    products?:  unknown[];
    prices?:    unknown[];
    hours?:     unknown;
    policies?:  unknown[];
    materials?: unknown[];
    // … o que o seu domínio tiver
  };
  /** O que o agente NÃO sabe. Isto é tão importante quanto o que ele sabe. */
  missingContext: string[];
  safetyNotes: string[];
  /** Quando esta verdade foi montada — auditável: "o que ele sabia quando respondeu". */
  snapshotAsOf?: string;
  /** 0–1: quanto da verdade essencial existe. Vira portão de promoção. */
  completenessScore?: number;
}

export interface BusinessKnowledgeAdapter {
  businessType: BusinessType;
  getSnapshot(businessId: string, opts?: KnowledgeSnapshotOptions): Promise<BusinessKnowledgeSnapshot>;
}
```

**Use um registry, não um `if`.** A primeira versão terá um `if (type ===
"RESTAURANT")`. A segunda vertical vira `else if`. A quinta é impossível de
manter. Registre adaptadores:

```ts
registerKnowledgeAdapter(restaurantAdapter);
registerKnowledgeAdapter(clinicAdapter);
const adapter = resolveKnowledgeAdapter(businessType);
```

E deixe `BusinessType` **aberto**:

```ts
export type BusinessType = "RESTAURANT" | "CLINIC" | "GENERIC" | (string & {});
```

O `(string & {})` mantém autocomplete e aceita qualquer string. Uma vertical nova
registra o adaptador dela sem editar o núcleo. Isso importa mais do que parece:
o núcleo é onde moram os invariantes, e todo `else if` no núcleo é um convite a
alguém mexer lá.

**`completenessScore` é o que separa "o agente pode falar" de "o agente ainda
não".** Se a verdade do negócio está 30% preenchida, o agente vai passar o tempo
todo em `missingContext`. Melhor não deixar ele falar ainda.

---

### 4.2 O piloto — motores intercambiáveis

```ts
export interface StructuredCallInput {
  selection: AIEngineSelection;
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json" | "text";
}

/** Cada provider implementa isto. Lança em erro — o caller decide a queda. */
export type EngineCall = (input: StructuredCallInput) => Promise<string>;
```

Regras:

**Nenhum consumidor do Brain conhece SDK de provider.** Se aparecer `import
OpenAI` fora da pasta de adapters, você já perdeu. Ponha uma regra de lint que
proíbe isso — literalmente uma regra de ESLint que quebra a build. Nós pusemos.

**Roteamento por natureza da tarefa, não só por agente.** Um mesmo agente pode
querer modelos diferentes para funções diferentes:

```ts
export type EngineTaskProfile = "CLASSIFY" | "REASON" | "JUDGE" | "GENERATE";
```

Classificar é barato e frequente → modelo pequeno. Julgar precisa ser bom →
modelo forte. Isso é a maior alavanca de custo que existe no sistema, e ela só
existe se o roteamento for por perfil desde o começo.

**Sempre tenha um provider MOCK.** Disponível em qualquer ambiente, sem chave.
É o que torna a suíte de testes hermética e o que faz o sistema rodar na máquina
de um dev novo sem credencial nenhuma.

**Mudar o roteamento é mudança governada, não commit.** Trocar o modelo de um
agente muda o comportamento de tudo que ele toca. Isso passa por pedido de
mudança (Seção 4.5), classificado como risco ALTO.

---

### 4.3 Os críticos

Você precisa de dois, em camadas. Eles têm custos e propósitos diferentes.

#### Crítico determinístico (o piso — nunca sai)

Roda em microssegundos, custa zero, dá o mesmo veredito sempre. Verifica
*afirmação contra snapshot*.

```ts
export interface SnapshotClaimCheck {
  /** Valores monetários citados que NÃO existem na base. */
  inventedPrices: string[];
  /** Frases de negação de serviço detectadas. */
  serviceDenials: string[];
  doesNotInventFacts: boolean;
  needsReview: boolean;
  reason: string;
}
```

Duas classes de falha que ele cobre, e as duas vieram de incidente real:

**1. Valor inventado.** Todo número de dinheiro citado na resposta tem que
existir na verdade. Compare em **inteiros de centavo**, nunca em ponto
flutuante — `32.90 * 3` dá `98.69999999999999` e um verificador que erra por
dízima é pior que nenhum.

**2. Negação de serviço.** Isto é sutil e é o incidente mais caro que tivemos.
Um cliente perguntou se o restaurante tinha rodízio. A informação não estava na
base. O agente respondeu **"não temos rodízio"** — e o restaurante tinha.

> **A regra que nasceu disso: ausência de informação não é informação.
> Negar exige verdade explícita. Uma negação sem respaldo vira `NEEDS_REVIEW`,
> nunca passa direto.**

Essa é a assimetria fundamental de um agente sobre conhecimento incompleto:
afirmar algo que não sabe é ruim; **negar algo que não sabe é pior**, porque
soa autoritativo e o cliente vai embora.

#### Crítico LLM-judge (a segunda camada)

Um segundo modelo julga a resposta contra o mesmo snapshot. Regras:

- **Reprovação explícita bloqueia.** Indisponibilidade do juiz **não** bloqueia —
  o piso determinístico já passou. Se o juiz cair, você não pode parar de
  atender.
- Ele recebe o snapshot do outcome, não reconsulta.
- Ele é `JUDGE` no roteamento — modelo forte, é onde vale gastar.

#### O portão por mensagem

No runtime, antes de usar a resposta do Brain:

```ts
const criticOk =
  outcome.reasoningMode === "LLM" &&
  outcome.result.coherenceCheck.verdict === "PASS" &&
  outcome.result.confidence >= minConfidence;

if (!criticOk) { /* cai para o caminho determinístico */ }
```

**Leia a Seção 5.3 antes de implementar essa queda.** O que você faz quando o
portão reprova é onde a gente errou feio.

---

### 4.4 Os portões de qualidade

```ts
export interface BrainQualityGateResult {
  passed: boolean;
  p0Count: number;
  reason: string;
  ranAt: string;
}

export type BrainQualityGateRunner = (agentId: string) => Promise<BrainQualityGateResult>;

const gateRegistry = new Map<string, BrainQualityGateRunner>();

export async function runGateForBrain(agentId: string): Promise<BrainQualityGateResult> {
  const runner = gateRegistry.get(agentId);
  if (!runner) {
    return {
      passed: false,          // ← ISTO
      p0Count: -1,
      reason: `Nenhum portão registrado para "${agentId}".`,
      ranAt: new Date().toISOString(),
    };
  }
  try { return await runner(agentId); }
  catch (err) { return { passed: false, p0Count: -1, reason: `Portão falhou: ${err}`, ranAt: … }; }
}
```

> **Agente sem portão registrado = REPROVADO por construção.
> Nunca "passa por não existir".**

Esta linha é a mais importante do arquivo. O caminho natural é `if (!runner)
return { passed: true }` — "não tem teste, então não tem problema". Isso
transforma "esqueci de escrever o portão" em "liberado para produção". Inverta o
default e o esquecimento vira bloqueio, que é o lado seguro de errar.

O mesmo padrão aparece no crítico de comando (Seção 4.7): **sem manual do
domínio = reprovado**, não "aprovado por falta de regra".

#### Severidade

Separe **quantos problemas críticos** de **quão boa está a peça**. Duas contas
diferentes:

| Nível | Significado | Efeito |
|---|---|---|
| **P0** | O agente mentiu para o cliente | Reprova sozinho. Nota alta não compra passagem. |
| **P1** | Comportamento proibido (comercial/fluxo) | Reprova, não é crítico |
| **P2** | Comportamento esperado não atendido | Aviso |
| **INFO** | Tudo certo | Passa |

Um único P0 reprova, independente da nota. É o mesmo princípio de "grave reprova
sozinho" do crítico de comando.

---

### 4.5 A governança

Toda mudança estrutural é um pedido, classificado por risco, decidido por humano.

```ts
export type BrainChangeTarget =
  | "REASONING_RULE" | "KNOWLEDGE_SCHEMA" | "AGENT_POLICY"
  | "QUALITY_GATE"   | "TRAINING_RULE"    | "AI_ENGINE_ROUTING";

export type BrainChangeRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BrainRuntimeImpact = "NONE" | "TEST_VERSION_ONLY" | "PRODUCTION";

export function classifyChangeRisk(input: BrainChangeRequestInput): BrainChangeRisk {
  if (input.runtimeImpact === "PRODUCTION") return "CRITICAL";
  if (input.target === "AI_ENGINE_ROUTING" || input.target === "QUALITY_GATE") return "HIGH";
  if (input.target === "KNOWLEDGE_SCHEMA" || input.target === "AGENT_POLICY") return "MEDIUM";
  if (input.requestedBy === "AGENT") return "MEDIUM";  // agente nunca produz mudança LOW
  return "LOW";
}

/** v1: TODA mudança exige humano. Não existe caminho de auto-aprovação. */
export function requiresHumanApproval(): boolean { return true; }
```

As regras de ferro:

- **Agente nunca produz mudança de risco baixo.** Um pedido vindo de agente é no
  mínimo MÉDIO e sempre precisa de humano.
- **Roteamento de motor e portão de qualidade são ALTOS por padrão** — eles
  moldam como todo o resto pensa e como todo o resto é aprovado.
- **Não construa auto-aprovação na v1.** Você vai querer. Não faça. Quando o
  sistema tiver histórico suficiente para você saber quais classes são seguras,
  aí você abre — com dado, não com otimismo.

---

### 4.6 A escada de liberação

Como um agente sai de "existe no código" para "fala com cliente pagante". Três
degraus, nunca pulados.

```
SHADOW_ONLY  →  ALLOWLIST  →  RESTAURANT_WIDE
   (observa)    (time/pilotos)   (clientes reais)
                                       ↓
                              rollback: kill de 30s
```

- **SHADOW_ONLY** — o agente raciocina, o resultado é gravado, **o cliente
  recebe a resposta determinística**. É aqui que você colhe evidência.
- **ALLOWLIST** — responde ao vivo, só para telefones/usuários listados.
- **WIDE** — clientes reais.

Cada promoção exige portões, com **números auditáveis, não achismo**:

```ts
export const SHADOW_EVIDENCE = {
  ALLOWLIST:       { minSamples: 20,  minPassRate: 0.70 },
  RESTAURANT_WIDE: { minSamples: 100, minPassRate: 0.85 },
} as const;

export const KNOWLEDGE_COMPLETENESS_FLOOR = 0.6;

export interface FreeFormGates {
  diagnosticPass:     boolean;  // conjunto dourado hermético, P0 = 0
  knowledgeComplete:  boolean;  // completenessScore ≥ piso
  shadowEvidence:     boolean;  // amostras + taxa de coerência ≥ mínimos
}
```

Detalhes que importam:

**A promoção para WIDE exige reconhecimento explícito de que são clientes
reais** — um campo `acknowledgeRealCustomers: true` no pedido. Fricção
deliberada.

**O rollback é um clique e volta para SHADOW_ONLY, não para desligado.** A
sombra continua colhendo evidência enquanto o problema é consertado. Você quer
que o incidente vire dado.

**Toda transição muda só configuração.** `runtimeTouched: false` por construção.

---

### 4.7 A Oficina — ficha em vez de prompt

Padrão separado, e o mais transferível de todos se o seu projeto gera conteúdo.

> **O ruído mora na ambiguidade. Um prompt em prosa é ambíguo. Uma ficha não é.**

Em vez de mandar "faz um post de dia dos pais" para o modelo, você monta um
formulário preenchido:

```ts
export interface Ficha {
  objetivo:    string;
  publico:     string;
  verdade:     Record<string, string | number | string[]>;  // fatos do banco
  tom:         string;
  formato:     string;
  proibicoes:  string[];   // sempre inclui as proibições padrão do domínio
  eixos:       Record<string, string>;  // a combinação sorteada pelo Variador
  assinatura:  string;     // identidade da combinação, para o anti-mesmice
}
```

Três peças em volta:

**1. O Manual da Casa (`HouseManual`)** — o vocabulário do domínio: lista negra
de jargão, proibições padrão, eixos disponíveis. **O Brain guarda o MÉTODO;
cada domínio traz o VOCABULÁRIO.** É isso que mantém o núcleo universal.

**2. O Variador (anti-mesmice)** — e aqui está a lição:

> **Pedir "seja criativo" para uma IA não funciona: ela volta para a média toda
> vez. A variedade tem que vir de fora, em código, e alguém tem que LEMBRAR o
> que já foi usado.**

```ts
export interface Eixo { nome: string; opcoes: string[] }

export interface Variacao {
  eixos: Record<string, string>;
  assinatura: string;   // "angulo:45°|luz:janela de manhã" — legível de propósito
  esgotado: boolean;    // todas as combinações usadas: hora de ampliar os eixos
}
```

Determinístico de propósito — mesma semente, mesma escolha — para dar teste,
replay e auditoria. A memória das assinaturas é uma **porta** (interface), com
implementação em processo por padrão e persistente plugável depois. Limite
honesto da versão em processo: **ela zera a cada deploy**. Documente isso.

**3. Os dois críticos** — o do COMANDO (antes de gastar IA) e o do RESULTADO
(depois). O do comando é determinístico e mata a maior parte do lixo sem
nenhuma chamada de modelo.

E cada motivo de reprovação é escrito como **ordem de reescrita, não como
relatório** — o texto do motivo vai literalmente para o reescritor:

```
❌ "o tom está inadequado"
✅ "troque 'parceiro' por 'você'; corte o superlativo 'o melhor'"
```

---

### 4.8 O perfil do agente

O agente **não tem identidade hardcoded**. Ele tem um perfil que o Brain carrega:

```ts
interface AgentProfileDefinition {
  slug: string;
  name: string;
  title?: string;
  mission?: string;
  responsibilities: string[];
  allowedActions:   string[];
  forbiddenActions: string[];   // INTERNO — nunca visível ao cliente do produto
  safetyRules:      string[];   // INTERNO
}
```

É isso que faz **um único Brain operar todos os agentes**. O prompt de sistema é
montado a partir do perfil, não de uma constante.

`forbiddenActions` e `safetyRules` são internos e nunca editáveis pelo usuário
final do produto. Se o cliente pudesse editar as regras de segurança do agente
dele, elas não seriam regras de segurança.

---

## 5. As histórias

Esta seção é o valor real do documento. Cada uma custou um cliente real.

### 5.1 O rodízio — ausência de informação não é informação

Cliente perguntou se tinha rodízio. Não estava na base. O agente disse **"não
temos rodízio"**. O restaurante tinha.

O agente não alucinou um fato — ele **inferiu uma negação a partir de um
silêncio**. É um modo de falha diferente e mais difícil de ver, porque a resposta
parece responsável ("não vou inventar que temos").

**Regra:** negação de serviço nunca passa direto. Vira `NEEDS_REVIEW`. Negar
exige verdade explícita.

**Teste de regressão obrigatório no conjunto dourado.**

---

### 5.2 "Não temos VOCES no cardápio"

Cliente escreveu *"vocês têm pizza?"*. O agente respondeu:

> *"Não temos **voces** no cardápio."*

A busca de cardápio filtrava palavras sem significado, e o pronome no plural não
estava na lista. Ele virou termo de busca e, pior, virou o produto na frase. O
mesmo acontecia com *"vende açaí?"* → "Não encontrei **vende**" e *"vocês servem
almoço?"* → "Não encontrei **voces**".

Três lições:

**1. Conserte na raiz, não no rótulo.** A correção óbvia é tratar o texto que
aparece. A correção certa foi tirar as palavras-de-pergunta da busca inteira —
isso arrumou o rótulo *e* parou de gerar negações falsas para mensagens que nem
nomeavam produto.

**2. Rótulo lê a mensagem CRUA.** O texto normalizado tira acento. Devolver
"hamburguer" para quem escreveu "hambúrguer" faz a resposta parecer defeito.

**3. Isso ficou escondido por sorteio.** O teste noturno amostrava 12 cenários
de um conjunto. O defeito estava lá havia semanas e só apareceu no dia em que o
sorteio calhou de pegar aquela frase. → Seção 5.5.

---

### 5.3 A Nicole — o incidente mais importante deste documento

Conversa real, cliente real, 20 minutos. Duas falhas empilhadas.

**Falha 1: o agente prometeu o que não podia cumprir.**

O caminho de conversa não tinha carrinho. Nenhuma capacidade de criar pedido.
Mesmo assim o agente escreveu:

- *"Vou adicionar tare ao seu pedido"* — não adicionou em lugar nenhum
- *"Posso confirmar o seu pedido?"* — não havia pedido

A cliente respondeu **"Sim"** duas vezes. As duas caíram no vazio.

> **Regra: a capacidade que o agente NÃO tem precisa estar em
> `forbiddenActions`, e precisa ter trava no crítico. Prompt não basta.**
> Um agente que só conversa não pode usar verbos de transação.

**Falha 2: a queda apagava a conversa.**

O runtime tinha cinco portões. Todo portão que reprovava delegava para o caminho
determinístico. E o caminho determinístico, sem intent que casasse, respondia com
a **mensagem de boas-vindas**.

Resultado: no meio de um pedido, cinco vezes, a cliente recebeu *"Olá! Tudo bem?
😊 O que você deseja?"*. Do ponto de vista dela, o robô teve amnésia cinco vezes.

> **Regra: a resposta de queda precisa PRESERVAR o contexto.
> "Desculpa, não peguei essa — pode repetir?" é queda.
> A tela de entrada não é queda: é apagar a memória na frente do cliente.**

A arquitetura estava certa (nunca deixar o modelo inventar). **O modo de falha é
que estava errado.** Proteção que dispara não pode ser mais destrutiva que o
problema que ela evita.

**Corolário não óbvio:** havia um plano de tornar a saudação mais calorosa e
variada. Se isso tivesse entrado antes do conserto da queda, a cliente teria
recebido cinco saudações *diferentes e lindas* no meio do pedido — o que é
**pior**, porque parece que o agente tem amnésia *e* finge te conhecer pela
primeira vez toda vez. **Conserte o modo de falha antes de melhorar a
mensagem que o modo de falha emite.**

---

### 5.4 O checador que reprovava o acerto

Um verificador marcava como crítico *qualquer* card mostrado quando o item pedido
não existia. Mas o comportamento esperado do cenário era literalmente "negar e
oferecer alternativa real".

Ou seja: **o agente fazia a coisa certa e era reprovado por isso.**

> **Regra: um verificador com régua curta demais pune a resposta certa. Isso é
> pior que não ter verificador, porque gera alarme falso recorrente — e alarme
> falso recorrente treina a equipe a ignorar alarme.**

Ao escrever um verificador, escreva metade dos testes provando que **o legítimo
passa**. Sem essa metade, o conserto vira carimbo.

---

### 5.5 Os testes verdes que não viram nada

Situação real de um dia:

- 6 portões de qualidade: todos verdes, P0 = 0
- Simulador noturno: 30 rodadas, 30 verdes
- Auditoria automática: 30 rodadas, 30 verdes

E uma cliente real quebrou o sistema em 20 minutos (Seção 5.3).

**Por quê:** todos os testes eram **herméticos** — testavam cada motor
isoladamente, com cenários fixos e bem-comportados. Ninguém testava a **costura
entre os motores** com uma conversa real: bagunçada, com erro de digitação,
mudança de ideia no meio, mensagens fora de ordem.

> **Regra: teste hermético prova que a lógica está certa. Ele não prova que o
> sistema funciona. Você precisa dos dois:**
> - **hermético** por peça (rápido, no CI, determinístico);
> - **de costura**, com conversas reais inteiras passando por todas as camadas.

**Corolário sobre amostragem:** se o teste noturno sorteia N cenários de um
conjunto, o espaço não amostrado é seu ponto cego. Quando o espaço é pequeno e
fechado, **varra ele inteiro no CI** — em milissegundos — e deixe o sorteio para
o que é grande demais para varrer.

---

### 5.6 Dinheiro em ponto flutuante

`32.90 + 32.90 + 32.90` dá `98.69999999999999`.

Um verificador de preço que compara float reprova um total correto. Converta para
**centavos inteiros** na fronteira e compare inteiros. Tolerância de 1 centavo
para arredondamento de exibição — um centavo é formatação, não mentira.

---

### 5.7 Alerta que não diz por quê

Durante semanas o alerta noturno dizia:

```
p0Count=1 — encontrou um problema crítico
```

E nada mais. Nem o cenário, nem a frase, nem o que o agente respondeu. Cada
disparo custava uma investigação inteira.

> **Regra: o alerta carrega a própria evidência.** O que o cliente pediu, o que o
> agente respondeu, e a violação exata. Sem PII quando roda sobre dado sintético.

Depois que o alerta passou a trazer a evidência, o mesmo P0 foi diagnosticado em
minutos em vez de horas.

---

## 6. Ordem de construção

Não pule. Cada fase depende da anterior existir de verdade.

### Fase 1 — O piso (sem isso nada mais importa)
1. `BRAIN_SAFETY` congelado + teste que verifica os invariantes
2. Contrato `BusinessKnowledgeSnapshot` + **um** adaptador real
3. `EngineAdapter` + provider MOCK + **um** provider real
4. `reasonAsAgent` — a porta única
5. Perfil de agente carregado do banco/config, nunca hardcoded

**Não construa** governança, escada nem oficina ainda. Você não tem o que
governar.

### Fase 2 — Os críticos
6. Crítico determinístico: valor inventado + negação de serviço
7. Conjunto dourado com **os casos que já te machucaram** (comece com o
   equivalente do rodízio no seu domínio)
8. Portão de qualidade com registry — **sem portão = reprovado**
9. Portão por mensagem no runtime — **e a queda que preserva contexto**

### Fase 3 — A evidência
10. Modo sombra: raciocina, grava, não responde
11. Persistência da evidência de sombra + estatística de aprovação
12. Simulação: clientes artificiais contra o motor real, com severidade

### Fase 4 — A promoção
13. Escada de liberação com portões numéricos
14. Pedido de mudança + classificação de risco + aprovação humana
15. Rollback de 30 segundos

### Fase 5 — A melhoria contínua
16. Oficina (se você gera conteúdo)
17. Captação de conversa real → cenário de treino
18. Cofre de experiência entre negócios (sem vazar dado)

---

## 7. Armadilhas — "você vai ser tentado a…"

**…fazer o portão retornar `passed: true` quando não há portão registrado.**
Parece razoável ("não tem teste, não tem problema"). Transforma esquecimento em
liberação. Inverta.

**…deixar o agente enviar a mensagem que ele mesmo produziu.** Parece uma
indireção boba. É o que torna os críticos obrigatórios em vez de opcionais.

**…usar `if (businessType === …)` no núcleo.** Funciona para dois. Morre no
quinto. E cada `if` no núcleo é um convite a alguém mexer onde moram os
invariantes.

**…comparar dinheiro em float.** Veja 5.6.

**…pedir criatividade no prompt.** O modelo volta para a média. Variedade vem de
fora, em código, com memória do que já foi usado.

**…mandar a tela de entrada quando o agente não entende.** Veja 5.3. É a coisa
mais destrutiva deste documento inteiro e é *exatamente* o que o código
"limpo" faz naturalmente.

**…confiar que teste verde significa sistema funcionando.** Veja 5.5.

**…construir auto-aprovação de mudança na v1.** Você não tem histórico para
saber o que é seguro aprovar sozinho.

**…tratar `missingContext` como campo de log.** Ele é o insumo de "preciso
confirmar". Se ninguém lê, o agente inventa.

**…escrever o motivo da reprovação como relatório.** Escreva como ordem de
reescrita — ele vai literalmente para o reescritor.

---

## 8. O que NÃO copiar deste modelo

Honestidade sobre os limites do que estamos entregando.

**A memória do anti-mesmice em processo zera a cada deploy.** Funciona dentro de
uma janela de execução, não entre elas. Se variedade importa de verdade no seu
projeto, comece persistente.

**A escada de liberação tem três degraus porque nosso domínio tinha esse
formato** (loja → time → clientes). Se o seu tem outro, mude os degraus — o que
transfere é *ter degraus com portões numéricos*, não os nomes.

**Os números dos portões (20 amostras / 70%, 100 / 85%, completude 0.6) são
nossos, não seus.** São pontos de partida defensáveis. Calibre com o seu dado.

**Não copie a taxonomia de risco sem revisar.** `AI_ENGINE_ROUTING` é ALTO para
nós porque troca de modelo mexe em tudo. No seu projeto pode ser diferente.

**Este modelo pressupõe que errar com o cliente é caro.** Se você está
construindo uma ferramenta interna onde o custo de uma resposta errada é alguém
dar risada, esta arquitetura inteira é excesso. Use uma chamada direta.

---

## 9. Resumo em uma página

- A IA é o piloto, intercambiável. **O Brain é o produto.**
- **Uma porta de entrada** para raciocinar: escopo → verdade → piloto → coerência.
- **A base de conhecimento é a verdade.** O que não está nela vira "preciso
  confirmar", não invenção.
- **Ausência de informação não é informação.** Negar exige verdade explícita.
- **Dois críticos:** determinístico (piso, sempre) e LLM-judge (camada, pode cair).
- **Sem portão = reprovado.** Nunca "passa por não existir".
- **P0 reprova sozinho.** Nota alta não compra passagem.
- **Escada com prova numérica:** sombra → allowlist → produção. Rollback em 30s.
- **Agente nunca muda o Brain.** Humano aprova mudança estrutural.
- **A queda preserva o contexto.** Nunca a tela de entrada no meio da conversa.
- **A capacidade que o agente não tem precisa de trava, não de prompt.**
- **Teste hermético não prova que o sistema funciona.** Teste a costura.
- **O alerta carrega a evidência.**
- **Variedade vem de fora, em código, com memória.**

---

*Extraído de um sistema em produção. Cada regra acima existe porque a ausência
dela custou alguma coisa. Se você for remover uma, leia primeiro a história que
a produziu.*
