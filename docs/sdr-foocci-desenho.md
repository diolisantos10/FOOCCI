# SDR do Foocci — desenho (05/08/2026)

> O agente que aborda no WhatsApp o dono de restaurante que pediu demonstração
> no site, qualifica e entrega a conversa pronta para o CEO fechar.
> Investigação do especialista `cerebro`. **Nada implementado ainda.**

## A dependência que manda em tudo
**A Foocci não tem número de WhatsApp para vender.**
- O site já reserva o botão, mas o número é `null` (`src/components/marketing/config.ts:24`).
- Todo o encanamento de envio é **por restaurante** (`schema.prisma:1355,1378`;
  `WhatsAppMessagingService.ts:42`) — exige um restaurante no banco.
- O único canal da Foocci sem restaurante é o **canal administrativo do Build OS**
  (`schema.prisma:3290`), que é a linha interna de comando do CEO. Usá-lo para
  vender mistura prospecto com comando de sistema. Não é opção.
→ **Precisa de chip novo, dedicado, e ele precisa esquentar** (o próprio sistema
sabe: número novo aguenta 20 msg/dia na primeira semana — `crm-safety.ts:200`).

## O que já existe e serve inteiro
- **Portão único do Cérebro** (`BrainReasoner.ts:226`) com três travas prontas:
  só fala do que está na base, não inventa preço (`:352`), e **não promete o que
  não executou** (`:358` + `CapabilityCoherenceVerifier`) — esta última nasceu do
  incidente do agente que prometeu pedido que não podia criar.
- **A régua de liberação do CRM**, copiável sem adaptação: 20 amostras / 70% para
  o 1º degrau, 100 / 85% para o 2º (`crmAgentGovernance.ts:25`).
- **`CrmAgentReasoner`** — o exemplo mais próximo: compõe mensagem proativa
  ancorada em verdade e **nunca envia** (`sent: false`).
- **Proteções anti-bloqueio** (`ContactSafetyService.ts:181`) e o atraso aleatório.
- **A verdade sobre a Foocci já escrita**, com as proibições de discurso já
  aprovadas (`BriefingFoocci.ts:123-133`).

## O que NÃO serve
**O SDR da agência não é base.** Fala de outro produto, e — decisivo — chama a IA
por atalho, fora do portão (`Entrevistador.ts:332`): sem base de verdade, sem
crítico, sem verificador de promessa. Aceitável para entrevistador interno;
**inaceitável para quem fala com estranho em nome da empresa.**

## Riscos, com as travas necessárias

### 🔴 P0 de desenho — o portão aprova por OMISSÃO fora do CRM
`ContactSafetyService.ts:420`: sem `customerId`, o bloco que conta mensagens
recentes **não roda**; os contadores ficam em zero e o avaliador entende
"nunca mandei nada" → **libera**. Um lead do site não tem `customerId`.
Chamar esse portão com um lead = **permissão silenciosa para mandar quantas
mensagens quiser, sem descanso**. Não é bug ativo (ninguém chama assim), é a
armadilha exata em que o primeiro código do SDR cairia.
→ O SDR precisa de **portão próprio que REPROVA quando não sabe**.

### 🔴 Existe um caminho de envio sem nenhum freio
`BuildNotifier.ts:24-45` envia pelo canal da Foocci **sem portão nenhum** — sem
horário, sem teto, sem opt-out. Seguro hoje (só responde a quem falou primeiro),
e é a função mais parecida com o que o SDR precisa. **Nasce explicitamente proibida.**

### 🟠 O WhatsApp oficial não deixa abrir conversa com texto livre
Se o número for Meta oficial, abrir conversa com quem nunca falou exige **modelo
aprovado pela Meta** (`metaSendPolicy.ts:35`). Consequência: **a primeira
mensagem não pode ser escrita por IA** — é texto fixo com variáveis. A IA só
entra a partir da resposta. Isso reduz risco e reduz escopo da fase 1.
Se for Evolution: sem essa exigência, mas o risco vira **banimento do número**.

### Os três modos de falha
| Falha | Trava em código |
|---|---|
| **Insistir** | contador de tentativas **por lead**, persistido, teto duro (1 abertura + 1 lembrete). Reprova se não conseguir ler o contador |
| **Fora de hora** | janela **mais rígida** que a do CRM: 9h–19h, dias úteis (o CRM fala com quem já é cliente; o SDR fala com estranho) |
| **Prometer** | verificador de promessa + a lista de proibições comerciais. ⚠️ **Preço deixou de ser escalada em 08/08/2026** — o CEO decidiu que o SDR responde o valor na hora. O que continua sendo escalada: negociar desconto fora da tabela, prazo de implantação e recurso sem lastro. Trava em código: `auditarFalaDePreco` em `src/services/brain/sdr-foocci/RespostaDePreco.ts` |

E a regra da casa: **a proteção não pode ser pior que o problema** — se o SDR
travar no meio de conversa quente, entrega ao CEO com histórico, não some.

## LGPD
Preencher o formulário **basta juridicamente** e a política já declara a
finalidade (`politica-de-privacidade/page.tsx:83`). O que falta é **prova e freio**:
1. **Consentimento não é registrado** — o lead (`schema.prisma:4833`) não guarda
   aceite, data nem versão da política.
2. **Não existe opt-out para lead** — o detector de "PARE" existe mas grava na
   tabela de cliente de restaurante, que o lead não tem.
3. Opt-out é **para sempre e todos os canais**, registrado em silêncio.
4. **Prazo:** lead de 8 meses não é consentimento vivo → teto de 90 dias em código.

## O caminho até a primeira mensagem
- **Degrau 0 — só o CEO:** qual número (Meta oficial × Evolution) e **qual a
  resposta sobre preço**. Nada de código antes disso.
  - ✅ **Preço — RESPONDIDO em 08/08/2026:** *"Ele passa o valor dos planos."*
    Os três planos com o valor real e os 50% do primeiro mês, lidos da mesma
    fonte que o site publica (`src/lib/billing/pricing.ts`). Construído em
    `src/services/brain/sdr-foocci/RespostaDePreco.ts`, com portão próprio.
  - ⬜ **Número — ainda aberto.** Decidido que o canal é o **WhatsApp oficial da
    Meta** (a Evolution está fora, nem como plano B), mas o chip dedicado não
    existe. Continua sendo a dependência que manda em tudo.
- **Degrau 1 (um bloco):** agente registrado com nome próprio (⚠️ `sdr` já é da
  agência — `BrainQualityGate.ts:130`), perfil, verdade da Foocci, portão de
  qualidade com casos adversariais de venda. **Redige e não envia.**
- **Degrau 2 (um bloco):** freios de contato (janela, tetos, opt-out,
  consentimento), cada trava com as **duas metades** de teste.
- **Degrau 3 (dias):** sombra com leads reais, 20 mensagens / 70% coerência. O
  CEO lê uma amostra e responde: *"você mandaria essa mensagem com seu nome?"*
- **Degrau 4 — ❌ CANCELADO em 05/08/2026 por decisão do CEO.** Era *"primeira
  mensagem real — para o próprio time"*. **Substituído por esteira de treino.**
  Motivo, textual: *"eu não vou passar telefone nenhum pra IA ficar mandando
  teste; ele precisa adquirir conhecimento pra trabalhar — o que a gente precisa
  construir é ambiente de teste"*. Feedback humano artesanal **não escala e não
  chega**: o degrau ficou parado desde 03/08 esperando uma lista de telefones que
  nunca veio, e ninguém tem tempo de ler mensagem de IA no celular e dar nota.
  - **O que entra no lugar:** uma esteira que roda sozinha de madrugada, monta
    casos a partir de dado REAL com **destinatário sintético** (nunca um
    telefone), pede ao agente que componha, julga com portão determinístico e
    grava a amostra com origem `TRAINING`. A referência construída é a do CRM:
    `src/services/crm/training/CrmShadowTrainingService.ts` +
    `.github/workflows/crm-shadow-training.yml`.
  - **A troca vale igual para o SDR quando ele existir.** Nada de "manda pro meu
    celular pra eu ver": o SDR nasce com esteira, no mesmo molde.
  - **O que NÃO muda:** o agente continua sem falar com lead real enquanto não
    houver evidência suficiente. Mudou de onde a evidência vem, não a régua.
  - **A trava contra afrouxar:** amostra de esteira é contada **separada** da de
    produção (`sampleOrigin` em `brain_shadow_logs`). Simulação destrava o
    primeiro degrau; o degrau que abre para todo mundo continua exigindo vida
    real (`crmAgentGovernance.ts`, `CRM_SHADOW_EVIDENCE`).
- **Degrau 5:** leads reais, com o botão de desligar testado.

## Pergunta de doutrina para o Diretor Geral
A régua de liberação hoje é sempre **por restaurante**
(`BrainFreeFormConfig.restaurantId @unique`). Um agente da Foocci não tem
restaurante. Precisa de inquilino fictício ou de régua por agente sem dono?
