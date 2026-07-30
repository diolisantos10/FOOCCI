# Dioli — briefing da Foocci (cliente fixo)

> Primeiro cliente real da esteira da Dioli. Sondagem preenchida em 30/07/2026,
> a quatro dias do lançamento comercial da Foocci (segunda, **03/08/2026**).
>
> Conteúdo: [`src/services/brain/sdr/pilotos/BriefingFoocci.ts`](../src/services/brain/sdr/pilotos/BriefingFoocci.ts)
> · Trava: `BriefingFoocci.test.ts` · Gravação: `npm run dioli:briefing`

---

## 1. A regra que mandou no preenchimento

O briefing foi preenchido a partir do que existe no repositório e das falas do
dono — **nada foi deduzido**. Cada resposta carrega a fonte que a sustenta; o
que não tinha fonte não virou resposta, virou **pergunta registrada**.

É a mesma regra que a `Sondagem` defende no código: falta de resposta não trava
proposta, falta de pergunta trava. Onze campos respondidos com fonte, seis
perguntados e aguardando o dono.

| | |
|---|---|
| Pode propor | **SIM** |
| Cobertura do essencial | **71%** (5 de 7 respondidos) |
| Motivo | Pode propor. 6 respostas pendentes do cliente — declaradas na proposta. |

---

## 2. O que a Foocci já respondeu

| Campo | Resposta (resumo) | Fonte |
|---|---|---|
| `quem_decide` | Dioli Santos, fundador. Decide e aprova. | dono do produto/repositório |
| `o_que_vende` | Assinatura de um sistema de vendas, relacionamento e fidelização para restaurantes: agente de WhatsApp, cardápio/pedido direto e CRM. Planos em definição. | `copy-decisions-v1.md`, `/site/precos`, `FICHA_TECNICA.md` |
| `publico` | Dono de restaurante pequeno/médio que já vende por WhatsApp, depende de marketplace e não tem relacionamento próprio. Piloto real rodando em produção — nome só com autorização. | `copy-decisions-v1.md`; piloto em produção |
| `regiao` | Brasil inteiro; produto digital, sem raio de entrega. | pt-BR, Pix/cartão, NFC-e via SEFAZ |
| `diferencial` | "Chatbot responde. Foocci vende, relaciona e ajuda o cliente a voltar." Provável em tela: agente travado contra afirmar o que não está cadastrado, pedido direto na cozinha, CRM que reativa sozinho. | `copy-decisions-v1.md`; guardrail de entrega no Brain |
| `site_e_canais` | `foocci.com.br`. Site comercial em `/site` atrás de senha, vai para a raiz indexável no lançamento. **WhatsApp de vendas não existe ainda.** | `pre-launch-mode-v1.md`, `WHATSAPP_SALES_NUMBER = null` |
| `identidade_visual` | Fechada: brand book, laranja `#F97316` só em CTA, ~90% neutro, pesos 400/600, raios 2xl/xl. | `DESIGN.md`, `brand-implementation-v1.md` |
| `objetivo` | Lançar dia 03/08 e fechar os primeiros restaurantes pagantes em 90 dias. | fala do dono; `pre-launch-mode-v1.md` |
| `datas` | 03/08/2026 — lançamento comercial; é quando o site sai do gate e passa a ser indexável. | fala do dono |
| `proibicoes` | Sem "chatbot" como posicionamento, sem "substitui seu atendente", sem % de aumento prometido, sem depoimento/métrica/caso inventado, sem atacar marketplace, sem jargão. Verbos de segurança quando houver dúvida. | `copy-decisions-v1.md` |
| `data_inicio` | 03/08/2026 | fala do dono |

---

## 3. As seis perguntas que seguem em aberto

Registradas como **perguntadas**. É por isso que o plano sai liberado, com elas
impressas no rodapé em vez de escondidas.

| Campo | Pergunta | Por que não preenchi |
|---|---|---|
| `redes_sociais` | Quais redes você tem? Me passa os @. | Não existe um único @ da Foocci no repositório. Inventar perfil é o pior chute possível. |
| `acesso_contas` | A Dioli conecta e publica, ou você recebe pronto e posta? | Decisão operacional sua. Muda entrega, aprovação e relatório. |
| `como_mede` | Como você vai perceber que valeu a pena? | Supor "restaurantes pagantes" geraria cobrança por métrica que ninguém combinou. |
| `metricas_atuais` | Quantos seguidores e quanto engaja hoje? | Sem a conta não há ponto de partida para mostrar evolução. |
| `historico` | O que já funcionou e o que não funcionou? | Não há histórico de publicação registrado. |
| `concorrentes` | Quem faz bem? Com quem não quer se parecer? | Os docs dizem o que a Foocci **não é**, mas nunca nomeiam concorrente. |

---

## 4. Os serviços do ciclo de lançamento

Proposta da Dioli, à espera do aceite.

| Serviço | Volume | De onde vem o material |
|---|---|---|
| Reels | 8/mês | **Agência.** Tela do produto, motion da marca, recortes do site — sem gravação presencial e sem fundador na câmera neste ciclo. |
| Carrossel | 8/mês | **Agência.** |
| Stories | 5/semana | **Misto.** A Dioli produz a partir do produto e da marca; bastidor de lançamento é o Dioli que manda. |
| Legendas | contínuo | **Agência.** Tom humano e comercial, fala com o dono do restaurante, zero jargão. |

Tudo que entrou é produzível a partir do que **já existe**: produto no ar, brand
book e site. Nenhuma peça depende de material não combinado.

### Fora do primeiro ciclo — de propósito

| Serviço | O que falta |
|---|---|
| Tráfego pago | verba mensal e destino (WhatsApp, site ou perfil) |
| Gestão de comentários/direct | tempo de resposta esperado |
| Relatório | periodicidade — e depende da resposta sobre conectar as contas |

Não é desimportância: cada um exige um dado que só o dono tem. Entrar com eles
em aberto travaria a proposta inteira, porque a `Sondagem` reprova serviço sem
definição. Entram no segundo ciclo assim que ele responder.

---

## 5. O plano gerado

`03/08/2026 → 30/08/2026`, 4 semanas, **36 peças** + legendas ao longo de todo o
período.

- 8 reels, 8 carrosséis, 20 stories.
- **20 das 36 peças dependem de material do cliente** (os stories) — o plano
  avisa: combine o prazo de envio, senão o calendário para.
- As 6 perguntas em aberto vão impressas no rodapé.

Ver o calendário completo:

```bash
npm run dioli:briefing -- --dry
```

---

## 6. Como gravar

O conteúdo vive no código; o script só o coloca onde o SDR lê, pela mesma porta
de memória da entrevista ao vivo (`resolverMemoriaDaEntrevista`). Grava e relê
para confirmar — seed que grava calado é seed que ninguém confere.

```bash
# conferir sem gravar (não precisa de banco)
npm run dioli:briefing -- --dry

# gravar (precisa de DATABASE_URL e do Restaurant.id da Dioli)
npm run dioli:briefing -- --agencia=<restaurantId-da-dioli>
```

A chave final é `<agenciaId>::foocci`, na tabela `sdr_entrevistas`. Depois disso
o briefing responde por `GET /api/sdr/entrevista?clienteId=foocci` e o plano por
`/api/sdr/plano`.

---

## 7. O que muda quando o dono responder

Cada resposta é uma linha em `BriefingFoocci.ts` — sai de `PENDENTES`, entra em
`RESPOSTAS` com a fonte "fala do dono". O teste garante que ninguém consegue
mover um campo para os dois lados ao mesmo tempo.

Com `acesso_contas` e a verba respondidos, tráfego, comunidade e relatório saem
do segundo ciclo e entram no calendário.
