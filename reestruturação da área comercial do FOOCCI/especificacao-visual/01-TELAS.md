# As telas, lidas dos desenhos do CEO (18/09/2026)

> Leitura literal feita pelo Diretor Geral a partir das imagens que o CEO enviou.
> A moldura comum (cabeçalho, lateral, cartões de indicador, paleta) está em
> `00-MOLDURA-COMUM.md` e vale para TODAS. **Leia aquele arquivo primeiro.**

---

## 12 — Central SDR / Gatekeeper → `/comercial/sdr`

Subtítulo: *"Conquiste o contato certo, atravesse gatekeepers e leve a conversa até o decisor."*

**5 indicadores:** Prioridade alta · Gatekeepers ativos · **Decisores encontrados** · Reuniões agendadas · Follow-ups.

**Quatro colunas:**
1. **Filas e Pipeline SDR** — lista vertical, cada linha com ícone colorido, nome, número à direita e seta: `Novos prospects · Gatekeeper · Falando com atendente · Decisor identificado · Abordagem comercial · Reunião · Sem contato`.
2. **Conversas SDR (n)** com seletor "Mais recentes" e busca. Cada item: avatar, nome, prévia da última mensagem, hora, **pílula do canal** (WhatsApp/Instagram/Site) e **pílula do estado** (Gatekeeper / Follow-up / Decisor / Novos / Sem contato), com contador vermelho de não lidas.
3. **A conversa** — cabeçalho com avatar, nome, "Online", ícones de ligar/vídeo/menu. Balões verdes (nós) à direita, brancos (eles) à esquerda, com hora e ✓✓. Abaixo do campo de digitação, **quatro botões de ação**: `Pedir contato do responsável · Explicar motivo do contato · Agendar reunião · Registrar no CRM`.
4. **Copiloto SDR (IA)** — Resumo da situação · **Tipo de gatekeeper detectado** · **Decisor encontrado** (nome, cargo, pílula de confiança) · Próxima melhor ação · Respostas sugeridas (com botão de copiar) · **Checklist da descoberta (2/3)** com caixas marcáveis.

**Adaptação:** os 9 tipos de porteiro que já classificamos entram no lugar de "Tipo de gatekeeper detectado". Enquanto a maioria dos leads não tiver Empresa ligada, gatekeeper e decisor saem como **"não medido" com o motivo** — os baldes continuam desenhados. Os quatro botões de ação são ATOS: só desenhar os que existirem de verdade.

---

## 13 — Revenue Supervisor → dentro de `/comercial/painel` e `/comercial/torre`

Linha de contexto *"Bem-vindo, Carlos!"*. Subtítulo: *"Diagnostique gargalos e oportunidades em toda a operação: Hunter, SDR, Vendas e CRM."*

**8 indicadores em duas fileiras de 4:** Prospects qualificados · Decisores encontrados · Reuniões · Oportunidades abertas // Conversão em vendas · Receita do mês · Reativações · Clientes em risco.

**Corpo:** **Funil de Receita** (barras horizontais decrescentes com valor e %: Empresas encontradas → Prospects válidos → Prontas para SDR → Decisores encontrados → Oportunidades → Vendas → Clientes ativos) · **Receita ao longo do mês** (linha cheia = realizada, tracejada = meta) · **Saúde da Operação** (rosca com índice central 0–100 e legenda Em crescimento/Em atenção/Crítico/**Sem dados**).

Abaixo: **Eficiência por Etapa** (tabela: Etapa · SLA · Conversão · Volume · **Gargalo** · Tendência ↑↓→) e **Previsão e Meta** (meta / realizada / previsão + barra de % atingido).

Coluna direita: **Diagnóstico da IA** (parágrafo que nomeia a CAUSA) · **Principais gargalos** (barras com %) · **Ações recomendadas** numeradas.

**Adaptação:** a legenda já prevê **"Sem dados"** — é o nosso "não medido", use-a. A coluna SLA da tabela **não tem fonte hoje**: `slaVenceEm` é lido e nada o escreve. Mostrar "não medido" e o motivo, nunca um tempo inventado.

---

## 14 — Hunter IA / Inteligência Comercial → `/comercial/prospeccao`

Subtítulo: *"Descubra restaurantes, enriqueça dados e priorize prospects com maior potencial de venda."*

**6 indicadores:** Empresas encontradas · Enriquecidas · ICP alto · Decisores encontrados · Prontas para SDR · Novas hoje.

**Tabela "Restaurantes prospectados"** com filtros (Estado, Cidade, Segmento, Fonte, Ticket estimado, Mais filtros) e colunas: checkbox · Restaurante/Empresa (com avatar) · Cidade · Categoria · **Fontes** (ícones site/Instagram/Maps) · Delivery próprio (Sim/Não) · iFood · Unidades · Contato geral · **Decisor** (nome ou "Não encontrado" em cinza) · **ICP** · **Prioridade** (Alta/Média/Baixa em pílula) · **Status** (Pronto SDR / Decisor encontrado / Enriquecendo / Descoberta) · Ações. Com paginação e "Itens por página".

Rodapé: **Categorias com maior ICP** (barras) e **Fila de enriquecimento** (tarefa, empresa, prioridade, status, prazo).

Direita: **Pipeline Hunter** (Descoberta/Enriquecendo/Pronto SDR/Gatekeeper/Decisor encontrado com n e %) · **Sugestões da IA** · **Fontes monitoradas** (barras por fonte).

**⚠️ Adaptação maior de todas:** a descoberta automática **NÃO EXISTE** — depende de fonte de dados contratada. A tela existe e mostra o que temos (planilha importada, base fria), e diz **com todas as letras** que a descoberta automática não está ligada e o que falta. Não simular fonte que não consultamos. Nunca raspar o Maps: a política proíbe guardar listings para base própria.

---

## 11 — CRM IA / Departamento de CRM → `/comercial/crm`

Subtítulo: *"Gerencie relacionamento, follow-ups, reativações e oportunidades com inteligência."*

**6 indicadores:** Contatos analisados hoje · Follow-ups do dia · Propostas sem retorno · Clientes em risco · Reativações · **Receita potencial**.

**Três colunas:**
1. **Segmentos / Listas de CRM** — `Leads sem resposta · Propostas paradas · Reuniões pós-demo · Clientes para recompra · Upsell · Reativação · Risco de churn`, cada um com contagem.
2. **Plano do dia da CRM IA** — *"Ações sugeridas pela IA para você focar no que realmente importa"*, com 4 seletores (Segmento, Canal, Prioridade, Responsável) e tabela: Contato/Empresa · **Segmento** (pílula colorida) · **Próxima ação** · Canal (ícone) · **Janela ideal** · **Potencial (R$)** · Status (Pendente/Aprovado/Em execução).
3. **Copiloto CRM IA** — Diagnóstico do dia · **Campanha recomendada** com botão · Próximos disparos (hora + empresa + o quê) · **Ações automáticas** com três interruptores.

Rodapé: **Oportunidades por segmento** (barras) e **Automação em destaque** (a jornada desenhada em blocos ligados por setas).

**Adaptação:** o plano do dia já existe no serviço; a rota que a tela chama **lê e classifica, nunca enfileira** — abrir painel não pode virar ato. Receita potencial com item sem estimativa é **piso, não total**, e a tela diz isso.

---

## 09 — Follow-up Automático → `/comercial/relacionamento`

Subtítulo: *"Recupere oportunidades e aumente suas vendas com jornadas automáticas no WhatsApp."*

Três abas: **Modelos prontos · Minhas automações · Logs de execução**.

**Construtor da Jornada** — canvas com blocos ligados por setas, de cima para baixo: Gatilho → Condição (que bifurca Sim/Não) → Espera → Template WhatsApp → Personalização → **Condição de Parada**. Cada bloco é um cartão colorido com ícone, título e uma linha de detalhe. Controles de zoom (+, −, ajustar) no canto. Botões **Salvar** e **Ativar automação**.

Direita: **Resultados desta automação** (Mensagens enviadas · Respostas · Recuperações · Reativações · **Vendas recuperadas em R$**) e **Componentes da Jornada** — a paleta de blocos para arrastar.

Rodapé: **Automações Ativas (n)** — tabela com Nome · Gatilho · Leads no fluxo · Mensagens enviadas · Respostas · Recuperações · Vendas (R$) · Status (Ativa/Pausada) · Ações.

**Adaptação:** temos os 14 estados de follow-up e a cadência por comportamento; a **edição visual** da jornada é construção grande — se não couber agora, a tela mostra as cadências que existem em modo leitura, e diz que a edição visual ainda não existe. **Nunca um botão "Ativar automação" que não ativa nada.**

---

## 10 — Pós-venda e Relacionamento → `/comercial/relacionamento` (aba)

Subtítulo: *"Clientes que já compraram. Mais valor, mais satisfação, mais crescimento."*

**5 indicadores:** Clientes Ativos · Recompras · Ticket Médio · **Satisfação (NPS)** · Clientes para Reativar.

Três colunas: **lista de Clientes** (busca + filtro; cada linha com avatar, empresa, pessoa, última compra, valor, pílula Ativo/Em risco/Para reativar) · **a ficha do cliente** (nome, CNPJ, "Cliente desde", botão Ações, abas Visão Geral/Histórico/Tickets/Oportunidades/Campanhas; três cartões Total de Compras, Valor Total, Última Compra; **Linha do Tempo do Cliente** com ícone colorido por tipo de evento, título, detalhe, data e hora) · **Saúde do Cliente** (rosca 0–100 com faixas Excelente/Boa/Atenção/Em risco) + Satisfação e Suporte + **Oportunidades** (Recompra/Cross-sell/Upsell com pílula).

Rodapé: **Produtos Complementares** e **Próximas Ofertas Recomendadas**.

**Adaptação:** NPS, tickets e produtos complementares **não existem** no nosso comercial. Manter os lugares e escrever "não medido" com o motivo, ou substituir por dado equivalente que temos (ex.: risco de churn, que já está construído). Nunca inventar nota.

---

## 08 — Catálogo, Oferta e Checkout → `/comercial/oferta`

Migalha `Vendas › Nova Proposta`. Subtítulo: *"Transforme conversas em vendas. Monte propostas, aplique descontos e gere um link de pagamento em segundos."* Topo à direita: **Selecionar cliente** e **Enviar proposta no WhatsApp** (verde).

Abas: **Catálogo de Produtos · Ofertas e Combos · Meus Produtos**. Busca + pílulas de categoria. **Grade de cartões de produto**: imagem, nome, marca, preço grande, "Em estoque: n", botão azul **Selecionar**, e coração de favorito.

Direita: **Sua Proposta** — itens com miniatura, nome, variação, estoque, seletor de quantidade (− 1 +), preço e lixeira; **Cupom ou Desconto** com campo e botão Aplicar; e o fecho: Subtotal · Desconto (com %) · Frete · **Total da Proposta** em negrito; botão verde **Gerar link de pagamento** e botão branco **Salvar proposta**.

Rodapé: **Status do Pagamento** em quatro passos ligados por setas (Pagamento Pendente → via PIX → no Cartão → Pedido Confirmado).

**⚠️ Adaptação grande:** nós **não vendemos produtos com estoque** — vendemos **planos de assinatura**. O catálogo vira o catálogo de planos que já existe (`catalogoDePlanos`), sem imagem de produto, sem estoque, sem frete. O desenho do fecho (subtotal, desconto com limite, total, gerar link) **permanece** — é exatamente o que `propostas.ts` e `checkoutDaProposta.ts` fazem. O limite de desconto é o que o código já impõe, não um campo livre.

---

## 06 — Qualificação e Lead Score → `/comercial/qualificacao`

Migalha `Leads › Qualificação e Lead Score`. Subtítulo: *"Analise, priorize e direcione os melhores leads para o time de vendas."* Botão **Exportar** no topo direito.

**4 cartões de temperatura**, cada um com ícone próprio: **Pronto para Comprar** (chama) · **Quentes** (chama) · **Mornos** (termômetro) · **Frios** (floco de neve), com variação *vs. última semana*.

**Tabela** com busca e filtros (Origem, Produto, Lead Score, Stage, Mais filtros) e colunas: checkbox · Nome/Empresa (avatar) · **Origem** (ícone do canal) · Produto · Necessidade · **Urgência** (pílula Alta/Média/Baixa) · Orçamento · Objeções · **Valor Potencial** · **Prob. de Compra (%)** · **Score** (pílula colorida pela temperatura) · **Score numérico** · **Stage** (seletor) · Ações. Paginação com "Mostrando 1–10 de 803 leads".

Rodapé: **Distribuição de Leads por Score** (rosca com total no centro e legenda com n e %) · **Taxa de Conversão por Score** (barras) · **Sugestões de Priorização** com selo IA.

**Adaptação:** o nosso enum chama `PRIORIDADE_MAXIMA` onde o desenho diz "Pronto para Comprar", e tem dois valores que o desenho não previu (`DESQUALIFICADO`, `NUTRICAO`) — **mostrar os dois nomes lado a lado e desenhar os extras**, senão a soma da tela fica menor que a base. Lead sem score vai para "não classificados" ("ninguém perguntou ainda"), nunca para FRIO nem para zero.

---

## 07 — Motor de Decisão / Roteamento → `/comercial/roteamento`

Migalha `Automações › Motor de Decisão`. Subtítulo: *"Defina as regras que decidem se a IA continua, transfere para um vendedor e para quem encaminhar."* Topo direito: cartão **Motor ativo** com interruptor verde e *"Processando leads em tempo real"*.

Abas: **Regras de Roteamento · SLA e Escalação · Lógica de Propriedade · Testes e Simulação**.

**Lista numerada de regras**, cada uma num cartão: número, ícone colorido, título, uma linha de explicação, os **campos de configuração em linha** (seletores), a seta `→`, o destino, o **SLA**, e um interruptor. As oito do desenho: 1 Por Produto/Interesse · 2 Por Região/Idioma · 3 Por Valor do Pedido · 4 Por Disponibilidade do Agente · 5 Por Especialidade do Vendedor · 6 Round Robin · 7 Prioridade VIP · 8 **Regra Padrão (Fallback)**. Frase que governa tudo: *"As regras são avaliadas na ordem abaixo. A primeira que corresponder será aplicada."*

Direita: **Preview em Tempo Real** — abas Exemplos/Simular Lead/Logs de Decisão, e cartões por lead mostrando o caminho (IA qualifica → Roteia para X) com o **Motivo** e a **regra que decidiu**, e o selo "Será roteado" / "Continua com IA" / "Será roteado (VIP)".

**Adaptação:** **seis dos critérios não existem no nosso código** (produto, idioma, valor potencial, carteira, VIP, fallback). Eles aparecem na lista em bloco separado, **"previsto, não construído"**, com o que falta — nunca com interruptor que não liga nada. O **Preview** é a peça mais valiosa e é construível hoje: mostrar, para leads reais, qual regra decidiria e por quê.

---

## 05 — Atendimento com IA / Copiloto do Vendedor → `/comercial/conversas`

Subtítulo: *"Converse com seus clientes no WhatsApp com o apoio da nossa IA. Você no controle, a IA ao seu lado."* Topo direito: **Ações da conversa** e menu.

Três colunas: **lista de conversas** (busca + abas `Todas 12 / Em atendimento 8 / Aguardando 3`; cada item com avatar, nome, prévia, hora e pílula Atendendo/Aguardando/Resolvido) · **a conversa** (cabeçalho com foto, nome, Online, seletor **Em atendimento**; balões com hora e ✓✓, **cartões de produto dentro da conversa**, áudio com forma de onda, imagem, e o **cartão de link de pagamento**) · **Copiloto do Vendedor (IA)** com *"Analisando conversa..."*.

O copiloto traz: **Resumo da conversa** · **Intenção detectada** com percentual de confiança · **Objeções identificadas** com contador · **Próxima melhor ação** · **Respostas sugeridas** cada uma com botão **Usar sugestão** · **Oferta recomendada** com botão Gerar oferta · e três atalhos no rodapé: Buscar no catálogo · Registrar no CRM · Criar tarefa.

**Adaptação:** esta tela já existe e o copiloto já está no ar — o que falta é a fidelidade visual e as peças que o desenho tem e nós não (intenção com %, oferta recomendada). **A IA nunca envia sozinha daqui:** "Usar sugestão" preenche o campo para a pessoa revisar, nunca dispara.
