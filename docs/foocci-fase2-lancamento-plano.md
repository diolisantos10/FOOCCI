# Foocci — Fase 2 do lançamento (brief do CEO, 04/08)

> Captura da conversa com o CEO. O site JÁ está aberto ao mercado: campanhas de
> Facebook Ads no ar, donas de restaurante já acessando. Urgência real. Estas
> quatro frentes precisam sair o mais rápido possível, em paralelo, enquanto o
> CEO revisa o site (copy + páginas) ao vivo com o Diretor.

## Frente 1 — Finalização do cliente (checkout self-service) 🔴 a maior
Fluxo completo: cliente entra no site → decide pagar → **clica no valor do plano**
→ é **direcionado ao checkout** → paga → **já começa a rodar**. Inclui:
- Escolha de plano/ciclo levando direto ao checkout.
- Pagamento (Mercado Pago).
- **Assinatura do contrato** (aceite de termos).
- **Tela de direcionamento depois de pagar** (pós-pagamento → onde o cliente cai).
- Criação da conta e início do uso — sem passo manual.
> O CEO: "não tenho a menor ideia de como faz isso — é você que vai desenhar."
> Dono: **Diretor scopa → plano → esquadrão constrói** (operacao + interface +
> onboarding). Depende do onboarding (ver Frente 2, que faz a config).

## Frente 2 — Agente de suporte 🔴
Substitui o balãozinho atual (insuficiente). **Referência de INTERFACE: o HostGator
("Gator 2.0")** — prints enviados pelo CEO em 04/08. O padrão a copiar:
- **Barra de chat/busca no TOPO do painel** ("Como posso te ajudar?") — não um
  balãozinho no canto. Fica sempre à mão, com ícone de microfone (voz) e enviar.
- **Botões de ação rápida** ao lado/abaixo da barra (no HostGator: "Suporte",
  "Criar site", "Criar e-mail"…). No Foocci seriam as ações do lojista.
- **Sugestões clicáveis** listadas ao abrir ("Como aumentar a segurança do meu
  site" etc.) — atalhos para as dúvidas mais comuns.
- Ao entrar na conversa, **chat em tela cheia/expansível** (minimizar, expandir,
  fechar), com **saudação usando o nome do cliente**, histórico, botão de copiar
  resposta e o aviso honesto "está sempre aprendendo e pode cometer erros".
- **Exigência do CEO: UX e UI de altíssimo nível.**
O **backend não existe e é o que vamos construir**. É um agente de IA; o CEO quer
**fundir com o agente `manual`** que já existe no sistema.
O que ele faz, dentro da plataforma do lojista:
- Tira TODA dúvida, ensina o que o lojista não sabe, responde qualquer pergunta.
- **Suporte de verdade** ao sistema inteiro do Foocci — hardware E software.
  (Ex. real: o restaurante-piloto vai pedir ajuda sobre impressão saindo errada.)
- **Onboarding / integração do novo restaurante**: "como subo meu cardápio?" →
  sobe tudo por ele. Configuração, absolutamente tudo.
- É o **braço direito do dono** dentro da plataforma — faz tudo pra ajudar.
- **Último caso:** se não resolver, **abre um chamado e manda por e-mail** pro
  time de suporte humano. Mas o normal é ele resolver — expertise pra tudo.
> Dono: **cerebro (raciocínio do agente) + manual (fusão) + canais (chamado/e-mail)**.
> Entra depois que o CEO mandar os prints.

## Frente 3 — Restaurante fictício jogável 🟠
- Abrir um restaurante novo no admin: uma **padaria chamada "Foocci Bakery"**.
- Alguém preenche **todo o cardápio** com opções realistas de padaria (não milhões,
  mas um cardápio de altíssimo nível), **com imagens** criadas.
- Quando estiver pronto, abrir uma **aba/página dentro do site de vendas** onde o
  cliente **degusta**: o cardápio de **mesa**, o cardápio **sem IA**, e o cardápio
  **com IA** — experimenta as tecnologias de atendimento antes de fechar.
> Dono: **operacao (semear a padaria + cardápio + imagens) + interface (a aba de
> degustação no site)**. Pode reusar semente de "piloto fictício" se já existir.

## Frente paralela — Redesenho do site (copy + páginas) 🟢 ao vivo
As páginas "não estão legais". O CEO + mais alguém vão **repassar o site aqui**,
página por página, copy por copy. Interativo — precisa do gosto do CEO.
> Dono: **Diretor (este chat) + especialista `interface`**, ao vivo com o CEO.

---

## Sequência recomendada
1. **Agora, ao vivo:** redesenho do site com o CEO (só anda com ele).
2. **Em paralelo, no fundo:** Diretor scopa a Frente 1 (checkout) e traz o plano;
   começa a Frente 3 (padaria) que não depende de input externo; e a Frente 2
   (suporte) arranca quando o CEO mandar os prints do "Ross Gator".

---

# Levantamento de terreno (04/08) — o que já existe

## Frente 1 — Checkout: ~50% pronto, falta a ponta pública e a costura
**Já existe:** assinatura recorrente no Mercado Pago (`createPreapproval`), aceite de
contrato com trilha (versão/data/IP/nome, `src/lib/billing/terms.ts`), página
`/contratar/[token]`, webhook que ativa/cancela, criação de restaurante+dono
atômica (`RestaurantService.register`), e onboarding de 7 passos.
**NÃO existe (construir):** botão de comprar no site; endpoint público que cria a
assinatura; **página pós-pagamento** (`/contratar/obrigado` é referenciada e dá 404);
**a costura pagamento → conta criada** (`PlanSubscription.restaurantId` nunca é
preenchido — é o buraco central); mapa plano-do-site → enum; senha/primeiro login;
**e-mail transacional (zero infra)**.
**Riscos:** (1) dupla cobrança — `createPreapproval` sem checar se já existe;
(2) ativa sem aceite — `activate()` não verifica `termsAcceptedAt`; (3) webhook de
billing não verifica assinatura HMAC (piora quando ele criar contas);
(4) **COMERCIAL: os descontos anunciados no site (anual R$149, 1º mês 50%, fundador)
não existem no motor de preço** — risco de cobrar diferente do anunciado.

## Frente 2 — Agente de suporte: ~70% pronto
**Já existe:** um agente `suporte-tecnico` REGISTRADO no Brain, com perfil,
quality gate, mapa de modos de falha (incluindo **impressora**, com runbook de 6
passos em linguagem de lojista), probe read-only do sistema e escada de remediação;
37 guias do lojista; retrieval; widget com sugestões contextuais e trilha de
onboarding; consulta de estado real da impressora (`lastSeenAt`).
**NÃO existe (construir):** a UI padrão Gator 2.0 (barra no topo, tela cheia);
**capacidade de AGIR** (hoje o Brain só fala — a Regra de Ouro `runtimeTouched:false`);
**chamado + e-mail** (não há model de ticket nem infra de e-mail; a escalação atual
só muda um status e ninguém é notificado); fusão dos dois cérebros (a aba "Ajuda"
chama a OpenAI direto, fora do Brain).
**Decisão do Diretor:** primeira ação real = **subir cardápio** via `/api/menu/import`,
que já é 2 etapas (preview → o lojista confirma) — o agente propõe, o humano
confirma, a Regra de Ouro fica intacta. Sem bypass.

---

## DECISÃO DO CEO (04/08) — regra de preço do checkout
**Os valores da tabela SÃO os valores cobrados.** O preço de cada ciclo (mensal,
trimestral, anual) já é o preço final — o anual já embute os 2 meses grátis, não
há desconto adicional a calcular. Não existe "preço fundador" separado no motor.

**A única regra de desconto: 50% no PRIMEIRO MÊS, para todo cliente novo, em
qualquer plano e qualquer ciclo.** A partir do segundo mês, valor cheio da tabela.

> Nota de implementação do Diretor: no mensal e trimestral o desconto é direto na
> primeira cobrança. No anual (pago à vista), aplica-se abatimento equivalente a
> meio mês sobre o total — é a leitura fiel de "50% só no primeiro mês" para um
> ciclo pago de uma vez. A implantação nunca entra no desconto.
