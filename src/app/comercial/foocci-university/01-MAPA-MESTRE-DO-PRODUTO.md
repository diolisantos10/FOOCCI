# 01 — Mapa Mestre do Produto Foocci

## Objetivo de aprendizagem

Ao terminar este material, humano ou agente deve conseguir explicar o Foocci sem depender de slogan, relacionar cada capacidade a uma dor real do restaurante, demonstrar o que existe e **recusar-se a prometer o que não está comprovado**.

## Definição curta

O Foocci é um sistema operacional/comercial para restaurantes. Ele conecta canal próprio de venda, cardápio, pedido, atendimento, CRM, retenção, operação, margem e inteligência. A loja do cliente final é white-label: o consumidor vê o restaurante; o Foocci trabalha por trás.

A frase comercial mais segura é:

> **O Foocci ajuda o restaurante a vender direto, operar o pedido, conhecer a própria base e trabalhar recompra no mesmo ecossistema.**

Não definir o produto como “chatbot”. IA é uma camada do produto, não o produto inteiro.

## Regra de tradução comercial

Toda função deve ser ensinada nesta sequência:

**FUNÇÃO → CONTEXTO → DOR → CONSEQUÊNCIA → CAPACIDADE → BENEFÍCIO → PERGUNTA DE DISCOVERY → DEMONSTRAÇÃO → LIMITE DA PROMESSA.**

### Exemplo

**Função:** CRM com segmentação.

**Contexto:** o restaurante recebe pedidos, mas a informação morre depois da entrega.

**Dor:** não sabe quem comprava e parou.

**Consequência:** depende de nova aquisição para gerar receita que poderia vir de recompra.

**Capacidade:** base de clientes, histórico, frequência, ticket, segmentação e campanhas.

**Benefício:** permite trabalhar relacionamento e recuperação de clientes com critério.

**Discovery:** “Hoje você consegue listar quem comprava com frequência e parou nos últimos 30 ou 60 dias?”

**Demo:** abrir ficha do cliente, segmento e campanha aplicável.

**Limite:** não prometer percentual de retorno sem dados da operação.

---

# 1. Canal próprio de venda

## Capacidades

- loja de pedidos com marca do restaurante;
- cardápio digital;
- QR de mesa;
- preços diferentes por canal;
- visibilidade de itens por canal;
- horários por dia e múltiplas faixas;
- pausa emergencial;
- pedido numerado de forma humana;
- links rastreáveis por origem.

## Dor que resolve

Dependência de canais de terceiros e dificuldade para transformar audiência própria em pedido rastreável.

## Perguntas de discovery

- “Hoje qual percentual dos seus pedidos vem por marketplace, WhatsApp e canal próprio?”
- “Quando alguém chega pelo Instagram, você sabe quantos clicam, iniciam pedido e compram?”
- “Você pratica o mesmo preço no marketplace e no canal direto?”

## Argumento comercial

Não vender “fim do marketplace”. Vender **construção de canal próprio complementar**, mensurável e controlado pelo restaurante.

## Demonstração mínima

Mostrar experiência do cliente, pedido, marca, canal, preço por canal e rastreio.

---

# 2. Operação do pedido

## Capacidades documentadas

- fila de pedidos por status;
- delivery, retirada e salão;
- alerta sonoro;
- alerta específico quando é necessário humano;
- coordenação do alarme entre dispositivos;
- impressão automática de comanda;
- impressão por estação;
- retentativa de impressão;
- auditoria de edição.

## Dor

Pedido entra por vários lugares, cozinha perde informação, responsabilidade fica difusa.

## Consequência

Atraso, retrabalho, erro de produção, cancelamento e perda de confiança no sistema.

## Perguntas

- “Como o pedido sai do canal de venda e chega à cozinha hoje?”
- “Quando uma comanda falha, quem percebe?”
- “Quantos lugares diferentes sua equipe precisa olhar no pico?”

## Regra de promessa

Impressão possui dependência local e histórico de validação operacional. Demonstrar a arquitetura, mas confirmar condições de hardware/instalação antes de garantir implantação específica.

---

# 3. Cardápio e engenharia do produto

## Capacidades

- categorias e ordenação;
- variantes;
- adicionais e grupos obrigatórios/opcionais;
- indisponibilidade;
- múltiplas imagens;
- importação por planilha;
- enriquecimento de dados para IA;
- porção e serve-quantas-pessoas;
- melhoria de imagem assistida por IA, quando disponível no fluxo validado.

## Dor

Cardápio mal estruturado reduz conversão e aumenta erro de pedido.

## Venda consultiva

Não falar “tem adicional”. Explicar que o sistema consegue **guiar a escolha**: tamanho, sabor, complemento, bebida e demais opções obrigatórias sem depender de o atendente lembrar tudo.

---

# 4. CMV, ficha técnica e precificação

## Capacidades documentadas

- custo por item;
- ficha técnica;
- cálculo de markup;
- despesas, impostos/taxas e margem desejada;
- reprecificação sugerida ou automática com limites;
- arredondamento comercial;
- CMV do período;
- histórico de alteração de preço.

## Dor

Preço no “feeling” e aumento de custo não refletido no cardápio.

## Perguntas

- “Você sabe a margem de contribuição dos seus dez itens mais vendidos?”
- “Quando o custo do salmão, queijo ou carne sobe, como o preço do prato é revisado?”
- “Quem é responsável pela ficha técnica?”

## Cuidado

Nunca afirmar que o sistema “garante lucro”. Ele melhora informação e disciplina de precificação; o resultado depende da operação e da qualidade dos dados.

---

# 5. Pagamentos

## Capacidades documentadas

- Pix, dinheiro, cartão e link;
- pagar agora ou no recebimento, conforme configuração;
- troco;
- integrações Mercado Pago e SumUp condicionadas a credenciais/configuração.

## Venda

Pagamento é continuidade da jornada. O foco não é listar meios; é reduzir ruptura entre “quero comprar” e “pedido concluído”.

---

# 6. Fiscal

NFC-e é módulo condicionado a configuração fiscal, certificado e integrações necessárias.

## Regra

Vendedor **não presta consultoria tributária**. Explica capacidade técnica e requisitos de implantação. Questão fiscal específica vai para profissional/área responsável.

---

# 7. Entrega e retirada

## Capacidades

- taxa simples;
- zonas;
- cálculo por distância;
- pedido mínimo;
- frete grátis acima de valor;
- tempo por zona;
- retirada independente.

## Dor

Frete mal configurado destrói margem ou impede venda.

## Discovery

“Você cobra entrega por bairro, quilometragem ou preço único? E como sabe se a taxa cobre a operação?”

---

# 8. WhatsApp e atendimento

## Capacidades documentadas

- integração por provedores suportados;
- WhatsApp oficial condicionado à configuração da Meta;
- recepção automática;
- personalidade configurável;
- menu inicial;
- transferência para humano;
- histórico;
- identificação do cliente entre canais.

## O que NÃO vender como geral

**Pedido completo por texto no WhatsApp** aparece no histórico do projeto como piloto/controlado. Até haver validação atual explícita, classificar como **PILOTO — NÃO PROMETER COMO DISPONÍVEL PARA TODO CLIENTE**.

## Posicionamento

“O Foocci não tira o humano do atendimento; organiza quando a automação resolve e quando o humano precisa assumir.”

---

# 9. Central de conversas

## Capacidades

- caixa de conversas;
- assumir conversa;
- devolver para automação conforme fluxo;
- histórico;
- estados de atendimento;
- alerta de necessidade humana.

## Dor

Ninguém sabe quem está atendendo, cliente repete contexto e a equipe perde mensagem.

---

# 10. CRM e relacionamento

## Capacidades documentadas

### Base
- ficha de cliente;
- histórico;
- ticket e frequência;
- preferências/sinais;
- segmentação por temperatura;
- importação de bases;
- higienização de dados.

### Campanhas
O resumo executivo documenta catálogo de campanhas para:
- avaliação;
- aniversário;
- segunda compra;
- primeiro pedido;
- queda de frequência;
- reativação;
- VIP;
- progressão de nível;
- cupom vencendo;
- carrinho abandonado;
- indicação;
- redes sociais.

### Segurança e governança
O projeto mantém regras de teto, descanso, opt-out e proteção do canal. A implementação evoluiu ao longo de agosto/setembro; portanto o vendedor ensina **a existência de governança**, não números fixos de limite sem consultar a configuração vigente.

## Dor central

O restaurante normalmente trabalha aquisição e pedido, mas não trata a base como ativo.

## Discovery

- “Quantos clientes únicos compraram nos últimos 90 dias?”
- “Quantos compraram uma vez e nunca voltaram?”
- “Você consegue falar com quem está esfriando antes de virar perdido?”
- “Quem decide hoje qual campanha mandar e para quem?”

## Argumento

CRM não é “disparo”. CRM é **decidir quem deve receber o quê, quando e por qual motivo**.

---

# 11. Cupons, promoções, fidelidade e indicação

## Capacidades documentadas

- promoções por produto/categoria/pedido;
- percentual, valor, frete e outros mecanismos suportados;
- validade e regras;
- carteira de cupons;
- programa por níveis;
- régua por gasto ou pedidos;
- janela temporal;
- benefícios;
- indicação com recompensa.

## Venda

O valor não está em “dar desconto”. Está em criar **motivo de retorno com regra e mensuração**.

---

# 12. Analytics e inteligência

## Capacidades documentadas

- faturamento;
- pedidos;
- ticket;
- clientes novos;
- cancelamento;
- curva de produtos;
- zero venda;
- categorias;
- attach rate;
- melhores clientes;
- segmentos;
- canais;
- upsell;
- cohort;
- eficiência operacional;
- diagnóstico automatizado, quando houver dado suficiente.

## Perguntas

- “Quais três números você olha toda semana?”
- “Você sabe qual canal traz cliente que volta mais?”
- “Você sabe quantos pedidos têm bebida ou sobremesa?”
- “Você mede retenção em 30, 60 e 90 dias?”

---

# 13. Agentes de IA

O Foocci possui agentes especializados em tarefas diferentes. Ensinar o vendedor a explicar **papel e guardrail**, não tecnologia pela tecnologia.

## Princípios

1. IA usa dados reais da operação.
2. Ausência de informação não autoriza invenção.
3. Promessas e ações devem passar por travas.
4. Humano pode assumir em cenários previstos.
5. Agente não é sinônimo de autonomia irrestrita.

## Posicionamento comercial

“IA aqui não é uma caixinha que conversa. Ela trabalha dentro de processos concretos: atendimento, venda, CRM e análise.”

---

# 14. Marca e white-label

O consumidor final interage com a marca do restaurante. O Foocci aparece como infraestrutura.

## Valor

O restaurante constrói ativo próprio em vez de ensinar o cliente a lembrar apenas do intermediário.

---

# 15. Integrações

Documentadas no projeto:
- Saipos, condicionada a credenciamento/configuração;
- Mercado Pago;
- SumUp;
- Google;
- Meta;
- API externa.

## Regra de venda

Integração sempre é vendida com a pergunta: **“qual versão, credencial, processo e dependência existem nesta operação?”**

Nunca responder “integra” sem validar o cenário específico.

---

# 16. Planos e preço — fonte vigente

Fonte atual no código: `src/lib/billing/pricing.ts`.

| Plano | Mensal | Trimestral | Anual |
|---|---:|---:|---:|
| Essencial | R$ 179 | R$ 483 | R$ 1.790 |
| Crescimento | R$ 429 | R$ 1.158 | R$ 4.290 |
| Performance | R$ 899 | R$ 2.427 | R$ 8.990 |

Regra documentada: 50% no primeiro mês para cliente novo, aplicada pela fonte de cobrança vigente. Ciclos trimestral/anual já carregam sua própria condição; não inventar desconto adicional.

## Posicionamento dos planos

- **Essencial:** começar a vender direto.
- **Crescimento:** trabalhar recorrência.
- **Performance:** aprofundar margem, inteligência e integração.

## Regra

Preço nunca deve ser duplicado em material estático de agente. Em operação real, consultar a fonte vigente.

---

# 17. Calculadora de economia

Existe lógica para estimar comissão evitada ao migrar parte do faturamento para canal próprio **e descontar o custo do Foocci**.

## Regra pedagógica

O vendedor pode fazer cenário, nunca previsão garantida.

Fórmula conceitual:

**economia bruta = faturamento migrado × taxa de comissão evitada**

**economia líquida estimada = economia bruta − custo do Foocci − outros custos relevantes**

Sempre usar premissas declaradas pelo prospect.

---

# 18. O que o Foocci NÃO é

- não é apenas chatbot;
- não é “uma IA que faz tudo”;
- não é marketplace;
- não é promessa de zerar marketplace;
- não é garantia de aumento de faturamento;
- não é consultoria fiscal;
- não é licença para disparo indiscriminado no WhatsApp;
- não substitui julgamento humano onde a operação exige pessoa;
- não deve vender piloto como produto geral.

---

# 19. Teste de domínio

O aluno só domina produto quando consegue responder, sem decorar:

1. Qual problema de negócio cada módulo resolve?
2. Que pergunta de discovery revela essa dor?
3. Que tela ou fluxo provaria a capacidade?
4. Qual limite deve ser dito?
5. Em que situação aquele módulo não é prioridade?
6. Como explicar em 30 segundos para um dono de restaurante?
7. Como explicar em profundidade para um gerente operacional?

**Critério de aprovação:** conhecimento funcional sem invenção + tradução clara para valor de negócio.
