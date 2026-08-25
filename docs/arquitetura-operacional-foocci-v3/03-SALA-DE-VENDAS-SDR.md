# Sala de Vendas — SDR (v3)

**Prioridade: máxima.** É a tela onde a receita da Foocci acontece.

Vive dentro do Admin, com **acesso isolado** para SDRs humanos e operação **compartilhada** com o Agente SDR IA.

## Quem entra

| Perfil | O que vê |
| --- | --- |
| SDR humano (`AGENTE_HUMANO`) | a Sala de Vendas, seus leads, suas conversas, sua agenda, suas tarefas e seus indicadores. **Nada mais do Admin** |
| Agente Gerente Comercial | o departamento inteiro: fila, distribuição, SLA, QA, produtividade |
| Diretor / CEO | tudo |
| Auditor QA | leitura e auditoria das conversas |

O isolamento do SDR humano é requisito do CEO e é o primeiro alvo dos testes de autorização: acesso direto por URL ou por API tem que bater em 403, não em "a tela não mostrou o botão".

## As listas

Cada uma responde a uma pergunta que o SDR faz de verdade durante o dia:

| Lista | Pergunta que responde |
| --- | --- |
| Sem responsável | o que está largado? |
| Meus leads | o que é meu? |
| Atendidos pela IA | o que está andando sozinho? |
| Aguardando humano | o que a IA parou e me espera? |
| Prioritários | o que não pode esperar? |
| Sem resposta | quem eu falei e não voltou? |
| Follow-ups vencidos | o que eu prometi e não fiz? |

**"Aguardando humano" é a fila mais importante da tela.** Um lead que a IA devolveu e que ninguém pegou é uma venda em queda livre, e ele é invisível em qualquer outra lista.

Duas visualizações: **Kanban** (para ver o funil) e **lista** (para trabalhar em volume). A mesma informação, dois jeitos de olhar.

## Ficha 360º do lead

Uma tela só, com tudo:

- histórico cronológico — IA e humano na **mesma** linha do tempo, sem duas abas;
- origem, campanha e UTM (vem da Dioli);
- qualificação e score, **com os fatores que produziram o score**;
- responsável atual, e desde quando;
- próxima melhor ação;
- tarefas, lembretes e agendamento;
- proposta, negociação, motivo de perda;
- notas internas — **invisíveis ao lead**, e a tela mostra isso o tempo todo.

### Score sem fator é número que ninguém deveria usar

Um score de 87 que ninguém consegue explicar não ajuda a decidir: ou o SDR confia cegamente, ou ignora. Os dois são ruins. O score sempre vem com os fatores.

### Nota interna é o risco silencioso

Uma nota interna que vaza para o canal externo é o pior defeito possível nesta tela. Por isso a nota é visualmente distinta, e a trava é no servidor — não na cor do campo.

## IA e humano na mesma sala

- respostas **sugeridas** pela IA, com aprovação humana quando exigida;
- transferência IA → humano e humano → IA, **sem perder contexto**;
- assumir é **atômico**: ao confirmar, o humano vira responsável e a IA silencia **antes do próximo envio**. Trava de banco, não boa intenção. Ver `06-HANDOFF-IA-HUMANO.md`.

## Supervisão e qualidade

O Agente Gerente Comercial vê SLA, conversão, produtividade e distribuição. O QA — automático e humano — audita conversa contra script e política, e registra não conformidade com evidência.

## WhatsApp

O canal usa a **integração oficial** prevista no projeto. Não se cria dependência estrutural de solução não oficial.

**Estado em 25/08/2026 — duas metades, e só uma está ligada:**

| | Estado | Do que depende |
|---|---|---|
| **Sair do site para o WhatsApp** — a pessoa preenche o formulário, o lead é gravado e ela é levada ao WhatsApp com a mensagem pronta e o `#código` | ✅ ligado | nada; o número `+55 11 94372-3316` está no código |
| **A recepção** — o "oi" ser reconhecido e virar registro na Sala sozinho | ⛔ desligado | cadastro do número na Meta (`FOOCCI_SALES_PHONE_NUMBER_ID` e `FOOCCI_SALES_ACCESS_TOKEN`) |
| **O envio** — a Foocci escrever primeiro | ⛔ desligado, e é deliberado | decisão do CEO, com o diário do SDR na mão |

Enquanto a segunda linha estiver desligada, **a mensagem chega num aparelho e quem responde é uma pessoa**. O caminho funciona; ele só não é automático — e chamar isso de automático seria vender piloto como pronto.

## O que a Sala NÃO faz nesta fase

- não envia mensagem real enquanto o envio estiver desligado;
- não submete template à Meta;
- não é mock: o que estiver na tela vem do banco, e o que não vier diz "não medido" com motivo.

## Duas pendências que não são de engenharia

1. ~~**O número de WhatsApp de vendas da Foocci não existe.**~~ **Resolvida em 25/08/2026 — e a pendência estava errada desde que foi escrita:** o número já tinha sido decidido pelo CEO em 23/08 e estava neste repositório, em `docs/whatsapp-vendas-passo-a-passo.md`. Faltava ligar a chave, não decidir. Está ligado.
2. **Falta o cadastro do número na Meta** para a recepção automática. Isso sim é decisão e trabalho do proprietário — e tem uma escolha embutida: instalar o WhatsApp comum nesse chip para atender à mão hoje **impede** a entrada na API depois sem apagar a conta antes.
3. **Não há conta de teste isolada.** Sem ela não há como exercitar o fluxo ponta a ponta sem tocar em dado real.

As duas últimas são decisão do proprietário.
