# As 14 peças do desenho do CEO — leitura literal

> Recebidas em 19/09/2026. **Cinco imagens estão arquivadas** em `../imagens/`
> (Painel/Revenue Supervisor, Prospecção/Hunter, SDR/Gatekeeper, CRM IA,
> Automações/Follow-up). **Nove foram vistas mas os arquivos não chegaram ao
> disco** — a leitura abaixo foi escrita olhando o desenho, e está marcada
> `IMAGEM PENDENTE`. Onde a imagem existir, **a imagem ganha da descrição.**

## A moldura, idêntica em todas

Cabeçalho escuro (azul-marinho quase preto) com o ícone WhatsApp e o produto
"Atendimento & Vendas WhatsApp / Mais conversas. Mais vendas."; **busca central
com Ctrl+K** ("Buscar leads, conversas ou vendas..."); sino com contador; o
usuário à direita com foto, nome e **cargo** ("Supervisor"). Lateral clara e
estreita: Painel · Prospecção · SDR · Atendimento (com contador) · Leads ·
Vendas · Pós-venda · Automações · Campanhas · Relatórios · Configurações; o item
ativo em pílula azul-clara. **Cartão de rodapé** da lateral: plano, consumo
("142.315 de 200.000"), barra e botão "Gerenciar plano". Topo do conteúdo:
título grande, subtítulo de uma linha que diz o que a tela faz, e à direita
seletor de data + status "Tempo real". Faixa de cartões-indicadores com ícone
colorido, número grande e variação vs. ontem. Três colunas abaixo: lista/filas à
esquerda, trabalho ao centro, **copiloto de IA à direita**.

---

## 1 — Fluxo Completo (diagrama, não tela) · IMAGEM PENDENTE
Dez etapas em faixa colorida: 1 Captação · 2 Identificação do contato ·
3 IA recepciona · 4 Qualificação · 5 Lead Score · 6 Motor de decisão/Roteamento ·
7A Caminho IA / 7B Caminho humano · 8 Resultado · 9 Follow-up automático ·
10 Pós-venda. Agrupadas em **Atrai → Atende e Converte → Relaciona**. No topo, a
régua da Control Tower. Embaixo: "Visão do vendedor em uma única tela" e "IA como
copiloto do vendedor".

## 2 — Sala do Supervisor / Control Tower · IMAGEM PENDENTE
Oito indicadores: Leads entrando · IA atendendo · Aguardando vendedor · SLA médio
· **Leads quentes sem dono** · Conversão da IA · Conversão por agente · Receita do
dia · Perdas. Funil em tempo real (Entrando → IA atendeu → Qualificados → Em
atendimento → Propostas → Vendas, com % em cada degrau). Volume ao longo do tempo.
**Saúde da fila** em rosca (em atendimento / aguardando vendedor / aguardando há
+10 min) com alerta "18 leads aguardam há mais de 10 minutos". Ranking de
vendedores (atendimentos, conversão, vendas, SLA) e Principais motivos de perda.

## 3 — Revenue Supervisor / Inteligência de Receita · `tela-painel-revenue-supervisor.webp`
Oito indicadores incl. Receita do mês e Clientes em risco. Funil de receita de
seis degraus com valor e %. Receita ao longo do mês (realizada × meta projetada).
**Índice de Saúde da Operação** (0–100) em rosca. Coluna direita: **Diagnóstico da
IA em texto corrido**, Principais gargalos em barras, e **Ações recomendadas
numeradas**. Embaixo: Eficiência por etapa (Hunter/SDR/Atendimento/Vendas/CRM com
SLA, conversão, volume, gargalo e tendência) e Previsão e Meta.

## 4 — Hunter IA / Inteligência Comercial · `tela-prospeccao-hunter-ia.webp`
Seis indicadores (Empresas encontradas → Novas hoje). **Tabela de restaurantes
prospectados** com caixa de seleção, logo, cidade, categoria, ícones de fonte
(site/Instagram/Maps), Delivery próprio Sim/Não, iFood, unidades, contato geral,
decisor, **ICP numérico**, prioridade e status; paginação. Direita: Pipeline
Hunter, Sugestões da IA, Fontes monitoradas em barras. Embaixo: Categorias com
maior ICP e **Fila de enriquecimento** com tarefa, prioridade, status e prazo.

## 5 — Central SDR / Gatekeeper · `tela-central-sdr-gatekeeper.webp`
Cinco indicadores (Prioridade alta, Gatekeepers ativos, Decisores encontrados,
Reuniões, Follow-ups). Quatro colunas: **Filas e Pipeline SDR** (Novos prospects ·
Gatekeeper · Falando com atendente · Decisor identificado · Abordagem comercial ·
Reunião · Sem contato) · lista de conversas com logo, canal e etiqueta ·
**conversa aberta** com botões de chamada e vídeo · **Copiloto SDR**: resumo,
**tipo de gatekeeper detectado**, decisor encontrado com grau de confiança,
próxima melhor ação, respostas sugeridas copiáveis e **checklist da descoberta
(2/3)**. Sob a conversa: Pedir contato do responsável · Explicar motivo ·
Agendar reunião · Registrar no CRM.

## 6 — Qualificação e Lead Score · IMAGEM PENDENTE
Quatro indicadores por temperatura: Pronto para Comprar · Quentes · Mornos ·
Frios. Filtros (origem, produto, score, stage). **Tabela larga**: nome/empresa,
origem, produto, **necessidade**, urgência, **orçamento em faixa**, objeções,
valor potencial, probabilidade, **pílula de temperatura + score**, e **stage
editável em dropdown na própria linha**. Embaixo: distribuição por score em
rosca, taxa de conversão por score em barras, e Sugestões de priorização da IA.

## 7 — Motor de Decisão / Roteamento · IMAGEM PENDENTE
Interruptor "Motor ativo". Abas: Regras de Roteamento · SLA e Escalação · Lógica
de Propriedade · Testes e Simulação. **Regras numeradas e ordenadas** (a primeira
que corresponder é aplicada): por produto, região/idioma, valor do pedido,
disponibilidade do agente, especialidade, round robin, prioridade VIP, e **regra
padrão de fallback** — cada uma com destino, **SLA próprio** e liga/desliga.
Direita: **Preview em Tempo Real** com leads de exemplo mostrando o caminho
(IA qualifica → roteia para X) e **o motivo com a regra que pegou**; abas
Exemplos · Simular Lead · Logs de Decisão.

## 8 — Atendimento com IA / Copiloto do Vendedor · IMAGEM PENDENTE
Três colunas: conversas (Todas/Em atendimento/Aguardando) · a conversa com
**cartões de produto, áudio e link de pagamento dentro do fio** · **Copiloto do
Vendedor**: resumo, **intenção detectada com %**, objeções identificadas, próxima
melhor ação, respostas sugeridas com botão "Usar sugestão", oferta recomendada
com "Gerar oferta". Rodapé: Buscar no catálogo · Registrar no CRM · Criar tarefa.

## 9 — Central de Atendimento · IMAGEM PENDENTE
Três colunas: **Caixas de Conversa** (Meus leads · Novos · Quentes · Aguardando
cliente · Follow-up · Pagamento pendente · Fechados · Perdidos) e **Canais de
Origem** com contagem (WhatsApp, Instagram, Facebook, Site, Indicação, Outros) ·
lista de conversas com etiqueta de estágio e ícone de canal · conversa aberta com
**Atribuir a mim · Transferir · Prioridade · Encerrar**. Rodapé com abas Respostas
rápidas · Modelos · Anotações internas, e botões de frase pronta.

## 10 — Perfil do Lead / CRM 360 · IMAGEM PENDENTE
Cabeçalho do lead: foto, **pílula de temperatura**, telefone copiável, e-mail,
cidade, canal de origem, produto de interesse, **Lead Score em rosca**, vendedor
responsável (com "Alterar") e **status em dropdown**. Abas: Resumo · Histórico ·
Compras · Conversas · Tags · Atividades. No Resumo: Informações do Lead (incl.
**"Como nos conheceu?"**), **Linha do Tempo** de eventos com hora, Últimas
Conversas com caixa de **anotação interna**, Tags, Compras/Oportunidades, e
**Análise e Insights da IA** (objeções, probabilidade em barra, próximo follow-up
com "Marcar como realizado", campanha de atribuição, observações com autor e data).

## 11 — Catálogo, Oferta e Checkout · IMAGEM PENDENTE
Abas Catálogo · Ofertas e Combos · Meus Produtos; busca e categorias; **grade de
produtos com foto, preço e estoque**. Direita: **"Sua Proposta"** com itens,
quantidade, cupom/desconto, subtotal, desconto, frete, **Total**, e os botões
**Gerar link de pagamento** e Salvar proposta. Topo: Selecionar cliente e **Enviar
proposta no WhatsApp**. Embaixo: **Status do Pagamento em quatro passos**
(Pendente → PIX → Cartão → Confirmado).

## 12 — Pós-venda e Relacionamento · IMAGEM PENDENTE
Cinco indicadores: Clientes ativos · Recompras · Ticket médio · **NPS** · Clientes
para reativar. Lista de clientes com estado (Ativo / Em risco / Para reativar),
última compra e valor. Centro: ficha da empresa com CNPJ, cliente desde, abas
(Visão geral · Histórico · Tickets · Oportunidades · Campanhas), três números
(total de compras, valor total, última compra) e **Linha do Tempo do Cliente**.
Direita: **Saúde do Cliente 0–100 em rosca com faixas**, NPS e tickets,
Oportunidades (recompra/cross-sell/upsell). Embaixo: Produtos complementares e
Próximas ofertas recomendadas.

## 13 — CRM IA / Departamento de CRM · `tela-crm-ia-departamento.webp`
Seis indicadores. Esquerda: **Segmentos/Listas** (Leads sem resposta · Propostas
paradas · Reuniões pós-demo · Clientes para recompra · Upsell · Reativação ·
Risco de churn). Centro: **Plano do dia da CRM IA** — filtros e **uma linha por
contato** com segmento, **próxima ação**, canal, **janela ideal**, potencial em R$
e status. Direita: Copiloto com diagnóstico do dia, campanha recomendada com
botão, **Próximos disparos com horário**, e **Ações automáticas em interruptores**.
Embaixo: Oportunidades por segmento e **Automação em destaque desenhada em blocos**.

## 14 — Follow-up Automático · `tela-automacoes-followup.webp`
Abas Modelos prontos · Minhas automações · Logs de execução. **Construtor da
Jornada em blocos ligados**: Gatilho → Condição → dois ramos (Espera → Template →
Personalização) → **Condição de Parada**; zoom e tela cheia; Salvar e Ativar.
Direita: Resultados (mensagens, respostas com taxa, recuperações, reativações,
**vendas recuperadas em R$**) e **paleta de componentes para arrastar**. Embaixo:
tabela de Automações Ativas com gatilho, leads no fluxo, enviadas, respostas,
recuperações, vendas e status.
