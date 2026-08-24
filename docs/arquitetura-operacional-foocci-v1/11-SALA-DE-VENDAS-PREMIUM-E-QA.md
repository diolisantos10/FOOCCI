# Sala de Vendas Premium e QA de Conversão — Prioridade 0

## Decisão

A Sala de Vendas é a **Prioridade 0 operacional** do Foocci. É a primeira experiência funcional a ser construída após o mínimo indispensável de identidade, RBAC e persistência segura.

Não será apenas uma caixa de WhatsApp. Será um workspace de receita projetado para:

- receber bem cada lead;
- responder rápido sem perder humanidade;
- qualificar com consistência;
- indicar a próxima melhor ação;
- dividir trabalho entre SDR IA e SDRs humanos;
- reduzir perdas por esquecimento, demora ou falta de contexto;
- medir qualidade e conversão;
- transformar aprendizado em coaching e melhoria do agente IA.

A solução deve combinar padrões comprovados do mercado sem copiar interface ou propriedade intelectual de terceiros.

## Referências funcionais estudadas

- Intercom: qualificação por IA, workflows e escalonamento controlado para humanos.
  - https://www.intercom.com/help/en/articles/13927115-fin-for-sales-faqs
  - https://www.intercom.com/help/en/articles/12396892-manage-fin-ai-agent-s-escalation-guidance-and-rules
- Salesforce: roteamento por habilidades, capacidade, disponibilidade, prioridade e regras.
  - https://help.salesforce.com/s/articleView?id=service.omnichannel_attribute_based_routing.htm&language=en_US&type=5
  - https://help.salesforce.com/s/articleView?id=service.service_presence_routing_options.htm&language=en_US&type=5
- HubSpot: scoring de leads, workspace comercial, filas de execução e próximas ações guiadas.
  - https://knowledge.hubspot.com/scoring/understand-the-lead-scoring-tool
  - https://knowledge.hubspot.com/prospecting/use-guided-execution-in-the-sales-workspace
  - https://knowledge.hubspot.com/prospecting/customize-guided-actions
- Zendesk QA: scorecards, AutoQA, análise de causas, coaching e calibração.
  - https://support.zendesk.com/hc/en-us/articles/10093676975898-Getting-started-with-Zendesk-QA-Admin-guide
  - https://support.zendesk.com/hc/en-us/articles/7043760215194-Creating-scorecards
  - https://support.zendesk.com/hc/en-us/articles/7043747123354-Understanding-autoscoring-categories
- Front: caixa compartilhada, regras, acessos e foco operacional.
  - https://help.front.com/en/articles/2157
  - https://help.front.com/en/articles/2109

## 1. Arquitetura da experiência

### 1.1 Visão do SDR

O SDR abre diretamente `/admin/vendas` e encontra:

1. **Meu dia:** novos leads, handoffs, tarefas vencidas, reuniões, follow-ups e oportunidades sem próximo passo.
2. **Conversas:** caixa compartilhada com filas e filtros.
3. **Pipeline:** funil macro e visão de oportunidades.
4. **Agenda:** reuniões, demonstrações e tarefas.
5. **Playbooks:** perguntas, objeções, snippets e materiais autorizados.
6. **Meu desempenho:** conversão, SLA, qualidade e coaching permitido.

O SDR não vê módulos globais do admin.

### 1.2 Visão do gerente

Além da operação:

- fila ao vivo e SLA;
- capacidade, disponibilidade e carga por SDR;
- distribuição/rebalanceamento;
- conversas em risco;
- QA e coaching;
- performance por pessoa, agente IA, versão, campanha e etapa;
- configurações de fila, roteamento, playbook e scorecard;
- aprovações de exceção.

### 1.3 Tela de conversa

Desktop em três painéis:

- **Esquerda — fila:** nome, negócio, origem, estágio, responsável, modo IA/humano, espera, prioridade e prévia.
- **Centro — conversa:** histórico único, mensagens, notas internas, autoria, status real, composer e ações.
- **Direita — ficha 360°:** dados, qualificação, score, tarefas, agenda, objeções, próximos passos e timeline.

A interface deve permitir trabalhar sem trocar de página para as ações mais frequentes.

## 2. Recepção do lead

### 2.1 Entrada

Todos os leads comerciais convergem para a mesma operação, preservando:

- origem;
- campanha, conjunto/anúncio quando disponível;
- UTMs;
- landing page/formulário;
- data/hora de captura;
- consentimento/base aplicável;
- telefone normalizado;
- histórico anterior e deduplicação.

WhatsApp é o canal principal de atendimento. Outras origens alimentam o CRM e direcionam a conversa ao mesmo número/fluxo oficial quando aplicável.

### 2.2 Primeira experiência

- confirmação imediata de recebimento quando o canal e a política permitirem;
- apresentação curta e humana;
- reconhecimento do contexto da campanha;
- uma pergunta por vez;
- nada de formulário longo disfarçado de chat;
- transparência de que existe assistente virtual, sem interromper a experiência;
- opção simples de falar com uma pessoa;
- detecção de idioma, urgência, frustração e intenção;
- promessa de prazo somente se calculada por SLA real.

### 2.3 Triage inicial

Classificar sem bloquear o atendimento:

- novo restaurante, restaurante em operação ou rede;
- interesse principal;
- intenção: conhecer, preço, demonstração, aderir, suporte indevido ou outro;
- potencial/fit;
- urgência;
- necessidade de humano;
- risco/sensibilidade;
- duplicidade ou relacionamento anterior.

## 3. Ficha 360° do lead

O Arquiteto deve construir a ficha dentro do produto. Ela é preenchida progressivamente pela captura, pela IA e pelo humano.

### 3.1 Identificação

- nome;
- telefone e WhatsApp;
- e-mail;
- cargo/papel;
- preferência de contato;
- consentimento e opt-out.

### 3.2 Restaurante/empresa

- nome do restaurante;
- cidade/UF;
- categoria culinária;
- quantidade de unidades;
- modelo: salão, delivery ou híbrido;
- estágio: ideia, implantação ou operação;
- site e redes quando fornecidos.

### 3.3 Operação atual

- volume aproximado de pedidos;
- canais de venda;
- WhatsApp/Instagram utilizados;
- cardápio digital, PDV, delivery/marketplace e integrações atuais;
- tamanho do time de atendimento;
- processo comercial/CRM atual.

Não exigir tudo no primeiro contato. Campos sensíveis ou de esforço elevado entram somente quando necessários.

### 3.4 Diagnóstico comercial

- dor principal;
- perdas/fricções percebidas;
- objetivo desejado;
- solução atual e insatisfação;
- urgência/timing;
- pessoas envolvidas na decisão;
- restrições;
- interesse em plano/funcionalidades;
- aderência;
- objeções;
- próximo passo acordado.

### 3.5 Controle comercial

- origem/campanha/UTMs;
- etapa do funil;
- responsável;
- modo atual IA/humano;
- fit score e motivos;
- prioridade da fila e motivos;
- última interação;
- próxima ação, dono e prazo;
- demonstração/proposta;
- resumo vivo;
- tags e motivo de perda quando aplicável.

### 3.6 Proveniência e confiabilidade

Cada campo deve indicar:

- informado pelo lead;
- importado de integração;
- preenchido por humano;
- inferido pela IA;
- confiança;
- data da última atualização.

Inferência de IA não pode substituir fato. O humano pode corrigir; a correção gera auditoria e feedback para avaliação.

A ficha mostra completude por etapa, mas não incentiva coleta desnecessária.

## 4. Fila inteligente e distribuição

### 4.1 Separar dois scores

**Fit Score:** probabilidade/aderência comercial baseada em critérios configuráveis e explicáveis.

**Queue Priority:** urgência operacional para definir quem deve ser atendido agora.

Não misturar fit baixo com falta de prioridade: um lead aguardando além do SLA continua urgente.

### 4.2 Fatores de prioridade

- handoff/pedido explícito de humano;
- risco de estourar ou SLA estourado;
- tempo de espera;
- intenção de aderir, agendar ou negociar;
- mensagem nova;
- tarefa vencida;
- estágio e compromisso marcado;
- prioridade manual justificada;
- capacidade/disponibilidade do time.

A UI deve explicar “por que este lead está primeiro”.

### 4.3 Roteamento

Configuração por:

- fila;
- round robin;
- capacidade;
- disponibilidade/presença;
- habilidades;
- origem/região/segmento;
- proprietário anterior;
- prioridade;
- distribuição manual pelo gerente.

O sistema deve prevenir sobrecarga, abandono de fila, dupla atribuição e distribuição a agente indisponível.

## 5. SDR IA + SDR humano

### 5.1 Modos

- `AI_ACTIVE`;
- `HANDOFF_REQUESTED`;
- `HUMAN_ACTIVE`;
- `WAITING_LEAD`;
- `RESOLVED`.

### 5.2 Handoff

Handoff obrigatório por:

- pedido do lead;
- alta intenção de compra/negociação;
- desconto, condição ou exceção;
- baixa confiança;
- repetição/falha;
- frustração;
- tema sensível;
- risco de informação incorreta;
- política configurada.

O resumo de handoff inclui intenção, fatos coletados, perguntas pendentes, objeções, tom, próxima recomendação e mensagens relevantes.

### 5.3 Copilot do SDR humano

Durante modo humano, a IA pode:

- resumir;
- sugerir resposta;
- sugerir pergunta;
- recuperar informação autorizada;
- alertar campo faltante;
- indicar risco/política;
- recomendar próxima ação.

A IA **não envia** enquanto o humano está ativo. Sugestões precisam ser editáveis e claramente identificadas.

## 6. Execução orientada à venda

### 6.1 Centro de ações

Filas guiadas:

- responder agora;
- handoffs aguardando;
- leads novos;
- follow-ups do dia;
- vencidos;
- demonstrações;
- propostas sem retorno;
- leads sem próximo passo;
- reengajamento permitido.

### 6.2 Próxima melhor ação

Recomendação explicável e configurável:

- responder;
- perguntar dado faltante;
- enviar material autorizado;
- agendar demonstração;
- criar follow-up;
- chamar humano;
- mover etapa;
- marcar perda/nutrição.

O SDR decide. Automação de envio depende de política, WhatsApp e kill switch.

### 6.3 Playbooks

- recepção;
- descoberta;
- qualificação;
- demonstração;
- preço;
- objeções;
- concorrentes;
- integrações;
- fechamento;
- reengajamento;
- perda/nutrição.

Conteúdo versionado, com owner, vigência e materiais oficiais. Preço, promessa e integração devem vir de fonte autorizada.

### 6.4 Reunião e proposta

- agendamento;
- participantes;
- preparação automática;
- lembrete autorizado;
- resultado;
- tarefas pré/pós;
- proposta vinculada;
- validade e versão;
- aceite/rejeição;
- condições aprovadas.

## 7. QA sofisticado

### 7.1 Cobertura

Toda conversa recebe pré-avaliação automática. Revisão humana concentra-se em:

- falhas críticas;
- baixa confiança do avaliador;
- reclamações;
- negociações;
- perdas;
- conversas com grande impacto;
- amostra aleatória estratificada por SDR, IA, campanha e etapa.

A nota automática não é decisão final de RH nem punição automática.

### 7.2 Scorecard inicial — 100 pontos

| Categoria | Peso |
|---|---:|
| Recepção, contexto e velocidade | 10 |
| Descoberta e qualificação | 20 |
| Exatidão sobre Foocci, preço e integrações | 20 |
| Venda consultiva e tradução de valor | 15 |
| Tratamento de objeções | 10 |
| Próximo passo e follow-up | 10 |
| Clareza, empatia e personalização | 10 |
| Higiene de CRM e registro | 5 |

Pesos e perguntas são versionados e configuráveis.

### 7.3 Falhas críticas

A ocorrência gera flag crítica independentemente da nota:

- ignorar opt-out;
- vazar PII/segredo;
- inventar funcionalidade, integração, preço, desconto ou prazo;
- enviar para lead errado;
- IA enviar durante `HUMAN_ACTIVE`;
- duplicar mensagens por corrida/idempotência;
- assédio, discriminação ou conteúdo inadequado;
- manipular ficha/etapa para melhorar métrica;
- marcar venda sem evidência.

### 7.4 Evidência e explicação

Cada item automático deve mostrar:

- resultado;
- trecho/mensagem que sustenta a avaliação;
- message ID/timestamp;
- regra/versão;
- confiança;
- possibilidade de revisão/contestação humana.

Não armazenar raciocínio privado do modelo.

### 7.5 Calibração

- conjunto ouro de conversas avaliadas por humanos;
- dupla avaliação periódica;
- comparação IA × revisor × gerente;
- divergência por categoria;
- ajuste de critérios/prompt;
- histórico por versão;
- QA em shadow antes de afetar dashboard.

### 7.6 Causa raiz e coaching

Toda falha permite causa raiz:

- conhecimento desatualizado;
- playbook;
- prompt;
- ferramenta/integração;
- processo;
- treinamento;
- capacidade/SLA;
- erro humano;
- dado insuficiente.

O gerente cria coaching com conversa, evidência, ação, responsável, prazo e reavaliação. O SDR pode comentar/contestar.

### 7.7 QA da IA

Avaliar por versão do agente:

- precisão factual;
- aderência à política;
- qualidade da descoberta;
- taxa/motivo de handoff;
- contenção saudável, sem evitar humano;
- conversão assistida;
- latência;
- custo;
- regressões;
- falhas críticas.

Rollout por shadow → allowlist → piloto → expansão, com kill switch e rollback.

## 8. Métricas de receita e operação

- primeira resposta e espera;
- SLA atingido/estourado;
- contato, resposta e qualificação;
- agendamento e comparecimento;
- proposta e fechamento;
- tempo por etapa;
- conversão por origem/campanha;
- conversão por SDR humano, IA e híbrido;
- handoff por motivo e tempo até aceite;
- leads sem próximo passo;
- tarefas vencidas;
- perdas por motivo;
- QA médio e falhas críticas;
- correlação qualidade × conversão, sem afirmar causalidade;
- produtividade e capacidade sem incentivar mensagens inúteis.

Toda métrica mostra denominador, período, fonte e atualização. Dado insuficiente aparece como indisponível, não zero.

## 9. Critérios de aceite P0

1. SDR trabalha o dia inteiro dentro da Sala de Vendas sem precisar acessar o restante do admin.
2. Lead novo aparece uma vez, com origem e prioridade explicáveis.
3. Primeira resposta/handoff respeitam políticas e SLA.
4. Ficha 360° é progressiva, auditável e separa fato de inferência.
5. Nenhum lead ativo fica sem responsável/fila e próximo passo.
6. IA e humano compartilham histórico; assumir impede envio concorrente.
7. Gerente enxerga fila, capacidade, SLA, riscos e reatribui.
8. QA cobre 100% automaticamente, apresenta evidência e permite revisão humana.
9. Falhas críticas bloqueiam score “bonito” de esconder risco.
10. Conversão é mensurada da origem ao fechamento.
11. RBAC impede SDR de acessar qualquer outro módulo.
12. Envio real permanece desligado até autorização específica.

## 10. Limites

“Projetada para vender” significa reduzir atrito, melhorar velocidade, consistência, contexto e execução. A plataforma não pode garantir venda nem usar manipulação, spam ou métricas enganosas.
