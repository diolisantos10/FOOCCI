# Cronograma — CRM da Foocci + SDR (aprovado pelo CEO, 05/08/2026)

> Estrutura aprovada integralmente pelo CEO. O **número de WhatsApp de vendas
> chega esta semana** — o que estava bloqueado por ele passa a ter data.
>
> A grande virada de desenho veio do CEO: **o cliente é quem manda o "oi"**.
> O formulário salva o lead e leva a pessoa ao WhatsApp com a mensagem pronta.
> Consequência: acaba o risco de banimento, o consentimento fica evidente, e a
> IA pode responder com texto livre (a janela de 24h abre quando o cliente
> escreve primeiro). **O SDR deixa de ser "o que aborda" e vira "o que responde"** —
> mais seguro e muito mais rápido de entregar.

---

## FASE 0 — o que já está no ar (05/08)
- Site comercial refeito, checkout self-service, página Experimente com a padaria
  jogável, agente de suporte com cérebro fundido e barra única no painel.
- Lead do formulário **salvo e verificado em produção** (teste ponta a ponta).

## FASE 1 — ✅ NO AR desde a madrugada de 05/08 (PR #94)
| # | O quê | Estado |
|---|---|---|
| 1.1 | **CRM da Foocci no admin** — a base de todos os contatos capturados, com etapa do funil (novo → contatado → qualificado → proposta → fechado/perdido), origem da campanha, histórico de contato e taxa de conversão honesta. É a base de trabalho do SDR. | ✅ no ar |
| 1.2 | **Formulário → WhatsApp** — salva o lead SEMPRE primeiro, depois leva a pessoa ao WhatsApp com a mensagem pronta e um **código de ligação** (`#A7K2M`) que amarra o "oi" ao formulário preenchido. Sem número configurado, o fluxo atual continua idêntico. | ✅ no ar, desligado esperando o número |

## FASE 2 — assim que o número existir (esta semana)
| # | O quê | Depende de |
|---|---|---|
| 2.1 | Preencher `WHATSAPP_SALES_NUMBER` — o caminho do WhatsApp **acende sozinho** no site (a infra já existe e está desligada esperando). | CEO |
| 2.2 | Decidir o canal: **Meta oficial** (mais seguro, mais lento) × **Evolution** (mais rápido, risco de banimento). Com o cliente iniciando, o oficial fica muito mais viável. | CEO |
| 2.3 | Caixa de entrada desse número — hoje todo envio do produto é **por restaurante**; um número da Foocci sem restaurante precisa de casa própria. | engenharia |
| 2.4 | **Anúncio "Click to WhatsApp"** no Facebook apontando direto para o número — o cliente sai do anúncio já conversando. | CEO + mídia |

## FASE 3 — o SDR, degrau a degrau (a régua da casa)
| Degrau | O quê | Prazo |
|---|---|---|
| **0** | **Decisões do CEO:** o número (2.1/2.2) e **a resposta sobre preço**. Na 2ª mensagem o dono pergunta "quanto custa?" — hoje não há resposta aprovada (faixas em stand by). Ou decide, ou o SDR escala a pergunta ao CEO. **Nada de código antes disso.** | CEO |
| **1** | Agente registrado com **nome próprio** (⚠️ `sdr` já é da agência), perfil, verdade da Foocci e portão de qualidade com casos adversariais de venda. **Redige e não envia.** | 1 bloco |
| **2** | **Freios em código:** teto de tentativas por lead, janela 9h–19h em dia útil (mais rígida que a do CRM — lá é cliente, aqui é estranho), opt-out do lead, registro de consentimento (aceite + data + versão da política), teto de 90 dias. Cada trava com **as duas metades** de teste. | 1 bloco |
| **3** | **Sombra com leads reais** — o agente redige, ninguém recebe. Meta: 20 mensagens / 70% de coerência (mesmo molde do CRM). O CEO lê uma amostra e responde: *"você mandaria essa mensagem com seu nome?"* | dias |
| **4** | ❌ **CANCELADO em 05/08 pelo CEO.** Era "primeira mensagem real para o próprio time". **Substituído por esteira de treino** (ver quadro abaixo). | — |
| **5** | **Leads reais**, com o botão de desligar já testado. Promoção é ato do CEO. | após o 3 + esteira |

### O degrau 4 caiu — e por quê (decisão do CEO, 05/08/2026)

Textual: *"Eu não vou passar telefone nenhum pra IA ficar mandando teste. Esquece
essa fase, tira isso do programa. Ele precisa adquirir conhecimento pra
trabalhar. O que a gente precisa construir é ambiente de teste."*

O motivo é bom e vale registrar: **feedback humano artesanal não escala e, pior,
não chega**. Ninguém tem tempo de ler mensagem de IA no celular e dar nota — o
degrau ficou parado desde 03/08 esperando uma lista de telefones que nunca veio.

**No lugar dele: esteira de treino.** Roda de madrugada, sozinha. Monta casos a
partir de comportamento REAL de clientes, com **destinatário sintético** (nenhum
telefone real entra no caso, em caminho nenhum), pede ao agente que componha,
julga com portão determinístico e grava a amostra com origem `TRAINING`.

| | Degrau 4 antigo | Esteira de treino |
|---|---|---|
| Quem avalia | uma pessoa lendo no celular | portão determinístico + crítico do Brain |
| Volume | 3–5 mensagens, quando alguém lembrava | dezenas por noite, todas as noites |
| Depende de | lista de telefones do time | nada — roda no cron |
| Quem recebe | o time | **ninguém** |

**O que NÃO mudou, e é inegociável:** o agente continua sem falar com cliente ou
lead real enquanto não houver evidência suficiente. Mudou **de onde a evidência
vem**, não a régua. E amostra de esteira é contada **separada** da de produção:
treino destrava o primeiro degrau, abrir para todos os clientes reais continua
exigindo vida real.

**Vale igual para o SDR quando ele existir** — ele nasce com esteira, não com
"manda pro meu celular pra eu ver".

Construído para o CRM em 05/08: `src/services/crm/training/` +
`.github/workflows/crm-shadow-training.yml` + coluna `sampleOrigin` em
`brain_shadow_logs`.

---

## Travas que NÃO podem ser esquecidas (achados da investigação)
1. 🔴 **`ContactSafetyService` aprova por OMISSÃO fora do CRM** (`:420`): sem
   `customerId`, os contadores ficam em zero e ele libera. Um lead do site não tem
   `customerId`. **O SDR precisa de portão próprio que REPROVA quando não sabe.**
2. 🔴 **`BuildNotifier` envia sem freio nenhum** (`:24-45`) — é a função mais
   parecida com o que o SDR precisa e a mais perigosa. **Nasce proibida.**
3. 🟠 **A proteção não pode ser pior que o problema** (lição do incidente da
   Nicole): se o SDR travar no meio de conversa quente, entrega ao CEO com o
   histórico — não some.

## Pendências do CEO, consolidadas
| # | O quê | Impacto |
|---|---|---|
| 1 | ✅ **`MP_PLATFORM_ACCESS_TOKEN` no Railway** — o CEO colocou em 05/08. A variável está presente (`/api/health` → `mpPlatformToken`). Se a CHAVE responde é outra pergunta, e agora a tela de Assinaturas do admin responde sozinha, sem criar cobrança para descobrir. | destravado |
| 2 | 📱 **Número de WhatsApp de vendas** | destrava as fases 2 e 3 — *chega esta semana* |
| 3 | 💰 **Resposta sobre preço** | o SDR não passa da 2ª mensagem sem ela |
| 4 | 🟡 E-mail (`RESEND_API_KEY`) | **rebaixado**: com o CRM no admin, o e-mail vira conveniência |

---

## Frente paralela — **finalizar o site com o CEO**
Trabalho ao vivo, página por página. É a frente que só anda com ele do lado, e é
a próxima da fila.
