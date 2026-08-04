/**
 * manualV01Content.ts
 *
 * Approved Manual Operacional v0.1 — server-side TypeScript payload.
 * Mirrors scripts/manual-v01-content.mjs exactly.
 *
 * Source: ChatGPT approved seed, reviewed and accepted by product owner.
 *
 * Safety rules (same as scripts/import-manual-v01.mjs):
 *   - Never connects AI agents.
 *   - Never adds RAG/embeddings.
 *   - Never exposes to restaurant users.
 *   - Content is published only through the admin import action.
 */

export interface ManualV01Chapter {
  slug:    string;
  title:   string;
  area:    string;
  status:  string;
  version: string;
  content: string;
}

export const MANUAL_V01_CONTENT: ManualV01Chapter[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "visao-geral",
    title:   "Visão Geral do Foocci",
    area:    "GENERAL",
    status:  "DECIDED",
    version: "0.1",
    content: `# Visão Geral do Foocci

Foocci é um Sales + CRM Engine para restaurantes.

Foocci não é um chatbot genérico. É um sistema de venda guiada, relacionamento com clientes, inteligência comercial e operação digital para restaurantes.

O objetivo central do Foocci é aumentar receita, recorrência e eficiência operacional por meio de:
- pedido guiado;
- cardápio visual;
- upsell contextual;
- CRM inteligente;
- campanhas;
- WhatsApp;
- atendimento;
- analytics;
- integrações;
- agentes de IA especializados.

Foocci transforma conversa em venda e cliente em recorrência.

## O que Foocci representa

Foocci representa:
- vendas automatizadas;
- relacionamento com clientes;
- inteligência comercial;
- simplicidade operacional;
- hospitalidade moderna;
- uso de IA aplicada ao restaurante real.

Foocci não representa:
- chatbot genérico;
- painel técnico frio;
- automação complexa;
- CRM tradicional cheio de campos;
- software enterprise distante;
- ferramenta que exige que o restaurante entenda tecnologia.

## Regra central

Foocci deve sempre escolher a solução que vende mais com menos fricção.

Se houver dúvida entre complexidade técnica e simplicidade operacional, escolher simplicidade operacional.
`,
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "principios-operacionais",
    title:   "Princípios Operacionais",
    area:    "GENERAL",
    status:  "DECIDED",
    version: "0.1",
    content: `# Princípios Operacionais do Foocci

## 1. Condução > reação

Foocci deve guiar o cliente até concluir o pedido. O sistema não deve apenas responder; deve conduzir para a próxima ação.

## 2. Baixa fricção

O cliente deve clicar mais do que digitar. Sempre que possível, usar botões, cards, categorias, sugestões visuais e ações rápidas.

## 3. Venda primeiro

Toda interação deve aproximar o cliente da conversão, recompra ou relacionamento.

## 4. Visual > texto

Imagens, cards, botões, chips e estados visuais vendem melhor do que blocos longos de texto.

## 5. Continuidade

O fluxo não pode quebrar quando muda de etapa, canal ou agente. O cliente nunca pode ficar sem próxima ação clara.

## 6. Estado > prompt

Foocci é state-driven, não prompt-driven. A IA segue o estado do sistema. O sistema decide etapa, regras, disponibilidade, carrinho, pagamento e validação.

## 7. IA orienta, UI vende

A IA escreve, sugere e orienta. A UI mostra, conduz, valida, confirma e converte.

## 8. Sem alucinação

Nenhuma IA pode inventar produto, preço, promoção, categoria, disponibilidade, status de pedido ou regra operacional.

## 9. Restaurante não deve ver complexidade técnica

O dono não precisa ver webhook, token, geocoding, provider, payload, fallback, latitude/longitude ou detalhes técnicos.

Ele precisa ver:
- ativo;
- pausado;
- funcionando;
- WhatsApp conectado;
- pagamento aguardando;
- campanha pausada;
- nenhum cliente elegível;
- precisa corrigir endereço.

## 10. Camadas de verdade

Todo conteúdo do Manual deve ser classificado como:
- Implementado;
- Parcial;
- Decidido;
- Backlog.

Manual não pode misturar visão futura com comportamento já existente sem marcação clara.
`,
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "arquitetura-do-sistema",
    title:   "Arquitetura do Sistema",
    area:    "INTEGRATIONS",
    status:  "PARTIAL",
    version: "0.1",
    content: `# Arquitetura do Sistema

Foocci é um sistema modular, state-driven, com agentes de IA especializados, UI visual, CRM, WhatsApp, pedidos, pagamentos, integrações e analytics.

## Stack principal atual

- Next.js 14 App Router;
- TypeScript;
- Prisma;
- PostgreSQL / Railway;
- NextAuth JWT;
- OpenAI SDK;
- Evolution API v2.3.7+;
- Mercado Pago Pix;
- Stone;
- AWS S3;
- Tailwind;
- Vitest / Playwright;
- Railway deploy.

## Estrutura geral

O sistema possui:
- dashboard autenticado;
- área admin/master;
- rotas públicas de pedido;
- rotas públicas de QR;
- APIs internas e públicas;
- serviços por domínio;
- módulos de IA;
- CRM;
- WhatsApp;
- pedidos;
- cardápio;
- pagamentos;
- analytics;
- integrações.

## Áreas principais

- Dashboard;
- Pedidos;
- Cardápio;
- Conversas / Atendimento;
- Clientes;
- CRM;
- Marketing / Campanhas;
- Promoções;
- Analytics;
- Agentes IA;
- Canais;
- Marca;
- Integrações;
- Configurações;
- Labs / Simulador;
- Manual Operacional interno.

## Manual Operacional dentro do Fute Master/Admin

O Manual Operacional é a fonte oficial interna do Foocci.

Ele deve viver dentro do Foocci/Fute Master/Admin, acessível apenas internamente.

Restaurantes/clientes não têm acesso.

O Manual deve possuir:
- capítulos;
- versões;
- revisões;
- solicitações de alteração;
- aceitar/rejeitar atualizações;
- histórico de decisões;
- status de regra;
- fonte da decisão;
- futura consulta por agentes.

Agentes ainda não devem consultar o Manual nesta fase. Isso será uma fase futura.
`,
  },

  // ── 4 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "waiter-agent",
    title:   "Waiter Agent",
    area:    "WAITER_AGENT",
    status:  "DECIDED",
    version: "0.1",
    content: `# Waiter Agent

## Definição

O Waiter Agent é o garçom/vendedor IA do Foocci dentro da experiência de pedido do cliente.

Ele atua no \`/pedido\`, usando cardápio real, UI visual, cards, botões e estado do pedido para conduzir o cliente até a compra.

## O que ele é

- garçom digital;
- vendedor contextual;
- especialista do cardápio;
- condutor do pedido;
- camada de linguagem curta e comercial;
- apoio ao upsell.

## O que ele não é

- não é chatbot livre;
- não é dono do fluxo;
- não é fonte de verdade do cardápio;
- não cria produtos;
- não inventa preço;
- não inventa promoção;
- não finaliza pedido sem confirmação;
- não substitui a UI.

## Contrato correto

Fluxo correto:

Cliente pergunta
→ Foocci detecta intenção/stage
→ sistema consulta cardápio real
→ sistema monta candidateProducts/productIds
→ IA escreve mensagem curta
→ Foocci valida productIds
→ UI renderiza cards reais

Regra:
UI vende. Texto orienta.

## Fluxo ideal

Entrada / identificação
→ escolha principal
→ configuração do produto
→ opcionais/adicionais
→ bebida
→ sobremesa
→ extras
→ revisão do pedido
→ entrega ou retirada
→ endereço se delivery
→ pagamento
→ confirmação
→ conclusão

## Upsell obrigatório

O Waiter deve garantir que antes da revisão final sejam cobertos:
- bebida;
- sobremesa;
- extras, quando existirem.

Coberto significa:
- oferecido;
- aceito;
- recusado;
- inexistente/sem produto disponível.

Recusa deve ser respeitada. Insistência infinita é proibida.

## Regras inegociáveis

- usar apenas produtos reais;
- validar productIds;
- não alucinar;
- não listar cardápio inteiro em texto;
- mensagens curtas, preferencialmente até 2 linhas;
- usar cards, imagens e botões sempre que possível;
- não contradizer UI;
- não pular upsell obrigatório;
- não finalizar sem confirmação;
- prompt do dono nunca vence regra crítica.

## Gaps conhecidos

- busca semântica de cardápio precisa evoluir;
- filtros de restrição podem estar parciais;
- cards precisam sempre estar vinculados a productIds reais;
- extras upsell precisa validação contínua;
- fallback rule-based pode interceptar perguntas que deveriam ir para IA;
- prompt customizado precisa ser validado em todos os fluxos.
`,
  },

  // ── 5 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "crm-agent",
    title:   "CRM / CRM Agent",
    area:    "CRM",
    status:  "DECIDED",
    version: "0.1",
    content: `# CRM / CRM Agent

## Definição do CRM

CRM no Foocci não é uma lista de clientes.

CRM é o motor de relacionamento, recorrência, retenção e inteligência comercial do restaurante.

Ele deve responder:
- quem comprou;
- quem parou de comprar;
- quem vale mais;
- quem está em risco;
- quem merece campanha;
- quem deve receber cupom;
- qual campanha gerou venda.

## Definição do CRM Agent

O CRM Agent é o agente de relacionamento e inteligência comercial do Foocci.

Ele atua para:
- reativar clientes;
- reter clientes;
- personalizar mensagens;
- criar oportunidades;
- sugerir campanhas;
- enriquecer histórico;
- usar WhatsApp como canal;
- medir resultados.

## O que ele não é

- não é atendente de balcão;
- não é Waiter Agent;
- não é WhatsApp Agent;
- não dispara mensagens sem segurança;
- não inventa dados de cliente;
- não ignora opt-out;
- não mistura atendimento reativo com CRM ativo.

## Dados de cliente

O Foocci deve armazenar e usar:
- nome;
- telefone;
- endereço;
- histórico de pedidos;
- total gasto;
- quantidade de pedidos;
- última compra;
- tier;
- preferências;
- restrições;
- respostas a campanhas;
- origem;
- observações;
- importedLastOrderAt;
- importedTotalSpent;
- importedOrderCount.

Telefone é a chave principal.

Cliente deve ser identificado uma vez e os dados devem ser reaproveitados.

## Segmentação

Segmentos:
- Quente;
- Morno;
- Frio;
- Perdido;
- VIP;
- Recorrente;
- Inativo.

Tiers:
- Bronze;
- Silver;
- Gold;
- Diamond.

Regras de segmentação devem ser configuráveis em CRM Configurações, não hardcoded.

Clientes frios devem considerar \`lastOrderAt\` e \`importedLastOrderAt\`.

## Campanhas

Campanhas devem ter:
- nome;
- objetivo;
- público;
- canal;
- mensagem;
- cupom opcional;
- status;
- programação;
- métricas;
- detalhes.

Campanhas ativas devem aparecer no topo.

Detalhes de campanha devem ser grandes e diagnósticos, não um painel pequeno.

Campanhas devem mostrar:
- enviados;
- pendentes;
- falhas;
- respostas;
- cupons;
- pedidos;
- receita.

## Segurança de envio WhatsApp

O CRM deve respeitar:
- limite diário;
- lote;
- delay aleatório;
- janela de envio;
- dias permitidos;
- quiet hours;
- opt-out;
- frequência por cliente;
- aquecimento gradual;
- não enviar quando restaurante estiver fechado/pausado, salvo regra explícita.

## Backlog aprovado

- mensagens com variação por IA;
- personalização por cliente;
- anti-repetição;
- score de risco;
- A/B testing;
- campanhas por produto favorito;
- relatórios monetizáveis;
- automações avançadas.
`,
  },

  // ── 6 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "whatsapp-agent",
    title:   "WhatsApp Agent / Atendimento",
    area:    "WHATSAPP",
    status:  "DECIDED",
    version: "0.1",
    content: `# WhatsApp Agent / Atendimento

## Definição

O WhatsApp Agent é o agente de recepção, triagem e atendimento inicial do Foocci no WhatsApp.

Ele é o host digital do restaurante.

## O que ele faz

- cumprimenta o cliente;
- mostra menu de opções;
- responde dúvidas simples;
- sabe se categorias/produtos existem no cardápio real;
- envia link identificado para o \`/pedido\`;
- transfere para humano;
- mantém o cliente com caminho claro.

## O que ele não faz

- não é Waiter Agent;
- não é CRM Agent;
- não vende pedido complexo pelo WhatsApp no estágio atual;
- não monta carrinho manual;
- não inventa produto, preço ou promoção;
- não ignora pedido de humano;
- não responde como chatbot genérico.

## Relação com cardápio

O WhatsApp Agent pode responder se existe:
- combo;
- bebida;
- sobremesa;
- temaki;
- hot roll;
- categoria específica.

Mas deve direcionar a compra para o link do Foocci.

## Menu obrigatório

Em greeting, fallback ou retorno de humano para IA, deve mostrar opções claras.

Exemplo:
1. Ver cardápio
2. Horário de funcionamento
3. Falar com atendente
4. Redes sociais
5. Cazza Club

GPT não deve responder greeting genericamente sem menu.

## Handoff humano

Quando humano assume:
- IA para;
- conversa muda de estado;
- operador assume.

Quando devolve para IA:
- IA deve reapresentar o menu;
- cliente não pode ficar sem caminho.

Eventos internos não devem aparecer como mensagens comuns.

## CRM outbound

Mensagem enviada pelo CRM não vira atendimento ativo até o cliente responder.

Quando o cliente responde, a conversa entra como resposta CRM.

## Evolution API

Decisões técnicas:
- usar Evolution API v2.3.7+;
- webhookByEvents deve ser false;
- endpoint único: \`/api/webhooks/meta/whatsapp\`;
- autenticação por query-token;
- token validado server-side;
- não expor token ao restaurante;
- preservar sessão conectada;
- mensagens reais aparecem em \`/atendimento\`.

## UI da integração WhatsApp

Restaurante deve ver:
- QR;
- status conectado/desconectado;
- número/perfil conectado;
- saúde básica do webhook;
- botão para Central de Mensagens;
- reconectar.

Não deve ver:
- API key;
- webhook secret;
- Evolution server;
- instanceName;
- env vars;
- probes;
- logs crus;
- reset técnico.
`,
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "ui-ux",
    title:   "UI/UX",
    area:    "UI_UX",
    status:  "DECIDED",
    version: "0.1",
    content: `# UI/UX do Foocci

## Regra de ouro

Agentes pensam. Interface conduz.

Agentes cuidam de:
- o que a IA entende;
- decide;
- sugere;
- escreve.

UI/UX cuida de:
- como o usuário vê;
- clica;
- confirma;
- entende;
- compra;
- opera;
- recebe erros;
- vê próximos passos.

## Princípios

- mobile-first;
- visual antes de texto;
- baixa fricção;
- clique mais, digite menos;
- IA orienta, UI vende;
- clareza operacional;
- interface limpa;
- continuidade de fluxo;
- sem complexidade técnica para restaurante.

## Responsabilidades de UI/UX

- defender simplicidade operacional;
- proteger conversão;
- separar UI de motor;
- padronizar UX;
- exigir prova visual em mudanças importantes.

## Dashboard

Dashboard deve ser cockpit do restaurante:
- vendas de hoje;
- pedidos;
- ticket médio;
- atrasos;
- canal/modalidade;
- produtos;
- CRM;
- campanhas;
- alertas;
- insights.

## Pedidos

Pedidos é central de operação:
- status claros;
- ações rápidas;
- busca;
- filtros;
- comanda;
- detalhes;
- editar pedido;
- excluir pedido com confirmação;
- reversão interna em analytics/CRM quando excluir.

Excluir pedido não deve estornar pagamento externo automaticamente.

## Cardápio

Menu editor deve permitir:
- categorias;
- produtos;
- imagens;
- drag-and-drop;
- toggles;
- showInDelivery;
- showInDineIn;
- variantes;
- opcionais;
- adicionais;
- códigos internos;
- importação;
- S3.

Categoria/produto desativado continua visível no admin.

## Pedido público

\`/pedido\` deve ser:
- visual;
- mobile-first;
- categorias sticky;
- rolagem vertical;
- cards clicáveis;
- sugestões reais;
- carrinho claro;
- checkout simples;
- Pix QR/copia-e-cola;
- opção de cancelar/voltar do Pix.

Cliente nunca pode ficar preso.

## CRM UI

CRM deve ter:
- clientes;
- filtros;
- ordenação;
- campanhas ativas no topo;
- detalhes grandes;
- audiência;
- métricas;
- CRM Configurações;
- segmentação configurável;
- tiers configuráveis.

## Atendimento UI

Central deve ter:
- conversas;
- filtros;
- busca;
- status IA/humano;
- devolver para IA;
- menu reaparece;
- eventos internos separados;
- evitar duplicidade;
- respostas CRM.

## Regras visuais

- fundo branco;
- texto preto;
- cinza apoio;
- laranja #F97316 apenas CTA/destaque;
- vermelho para destrutivo;
- verde para sucesso/ativo;
- labels claros;
- sem jargão técnico.
`,
  },

  // ── 8 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "branding",
    title:   "Branding / Marca",
    area:    "BRANDING",
    status:  "DECIDED",
    version: "0.1",
    content: `# Branding / Marca Foocci

## Nome oficial

Foocci.

Não usar em materiais oficiais:
- Fooci;
- Futi;
- FUT;
- Fute;
- Food.

Fute/FUT pode aparecer como legado interno/contextual, mas não como marca oficial.

## Definição

Foocci é:
- AI CRM;
- SaaS para restaurantes;
- agente inteligente de vendas;
- sistema de relacionamento;
- motor comercial conversacional.

Conceito central:
Foocci transforma conversa em venda e cliente em recorrência.

## Posicionamento

Frases aprovadas:
- Seu atendimento vendendo sozinho.
- Seu restaurante vendendo sozinho.
- Conversa em venda.
- Cliente em recorrência.

A marca deve ser:
- simples;
- moderna;
- comercial;
- humana;
- inteligente;
- gastronômica;
- premium acessível.

Não deve parecer:
- chatbot genérico;
- software enterprise frio;
- startup tech clichê;
- fintech;
- produto gamer;
- IA robótica sem hospitalidade.

## Tom de voz

- simples;
- direto;
- acolhedor;
- vendedor;
- leve;
- pouco técnico.

Evitar:
- omnichannel;
- IA generativa enterprise;
- automação multicanal;
- buzzwords técnicas.

## Cores

- preto #0B0B0B;
- branco #FFFFFF;
- cinza #E5E5E5;
- laranja Foocci #F97316.

Regra:
90% neutro + 10% laranja.

Laranja apenas para CTA, destaque, hover e indicadores importantes.

Evitar:
- fundo inteiro laranja;
- excesso de laranja;
- verde WhatsApp dominante;
- azul tech dominante;
- roxo/índigo como primário.

## Logo

Versões:
- Foocci preto: institucional, dashboard, documentos;
- Foocci com F laranja: marketing/campanhas.

Proibido:
- sombra;
- gradiente;
- distorção;
- alterar kerning;
- alterar proporção.

## Anagrama F

Usado para:
- app icon;
- favicon;
- avatar técnico;
- loading.

Não substitui o logo institucional.

## Robô Foocci

Mascote/Avatar:
- minimalista;
- branco;
- amigável;
- arredondado;
- chapéu de chef obrigatório.

Versões:
- neutra;
- com F laranja no peito;
- culinárias: italiano, sushi/japonês, hamburgueria etc.

Proibido:
- excesso de detalhe;
- cartoon infantil;
- fones/headsets;
- virar outro personagem.

Regra:
Nunca usar logo + F + anagrama + robô simultaneamente.

## Marca do restaurante

Foocci é sistema/motor/agente.
O restaurante é a marca principal para o cliente final.

Foocci não deve roubar protagonismo do restaurante, mas deve garantir qualidade estrutural da experiência.

## /marca

Tudo de branding deve viver em \`/marca\`:
- logo;
- avatar;
- cores;
- tom;
- persona;
- comportamento de IA;
- propagação para pedido, QR, WhatsApp, CRM e simulador.
`,
  },

  // ── 9 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "integracoes",
    title:   "Integrações",
    area:    "INTEGRATIONS",
    status:  "PARTIAL",
    version: "0.1",
    content: `# Integrações

Integrações conectam o Foocci ao ecossistema real do restaurante.

Devem ser simples para o dono e técnicas apenas para suporte/admin.

## WhatsApp / Evolution API

Estado e decisões:
- Evolution API v2.3.7+;
- endpoint único \`/api/webhooks/meta/whatsapp\`;
- webhookByEvents=false;
- autenticação por query-token;
- token validado server-side;
- preservar sessão;
- mensagens aparecem em Atendimento.

UI para restaurante:
- QR;
- status conectado/desconectado;
- número/perfil;
- saúde básica;
- Central de Mensagens.

Ocultar:
- API keys;
- webhook secret;
- servidor Evolution;
- instanceName;
- env vars;
- probes;
- logs crus;
- reset técnico.

## Mercado Pago Pix

Decisão:
- iniciar como Pix only;
- cartão e outros métodos ficam em breve;
- Pix gerado dentro do Foocci;
- mostrar QR Code;
- mostrar copia-e-cola;
- pedido pending não entra como novo operacional;
- pedido entra na operação apenas quando pagamento aprovado;
- cliente pode cancelar/voltar do Pix.

## Stone

Integração deve ser simples, com credenciais e status claros.

Evitar complexidade técnica para restaurante.

## Saipos / POS

Integração em andamento.

Objetivo:
- conectar pedidos/dados POS;
- autenticação;
- status;
- diagnóstico controlado;
- mensagens de erro legíveis.

## Regra geral

Integrações devem comunicar:
- conectado;
- desconectado;
- precisa configurar;
- erro claro;
- ação necessária.

Nunca transformar restaurante em técnico.
`,
  },

  // ── 10 ────────────────────────────────────────────────────────────────────
  {
    slug:    "checkout-pagamentos",
    title:   "Checkout / Pagamentos",
    area:    "CHECKOUT",
    status:  "PARTIAL",
    version: "0.1",
    content: `# Checkout / Pagamentos

Checkout é a etapa de caixa do Foocci.

Precisa ser simples, claro e não pode prender o cliente.

## Fluxo base

Carrinho
→ revisão
→ entrega ou retirada
→ endereço se delivery
→ forma de pagamento
→ confirmação
→ pedido/pagamento

## Pagamento online

Quando cliente escolhe pagamento online, deve haver etapa clara antes de gerar Pix:

Link de pagamento / online
→ escolher Pix via Mercado Pago
→ gerar Pix

## Pix

A tela Pix deve mostrar:
- QR Code;
- copia-e-cola;
- valor;
- status aguardando pagamento;
- botão copiar;
- botão ver QR novamente;
- opção cancelar/voltar.

Cliente não pode ficar travado no QR Code.

## Lifecycle de pagamento x operação

Pedido com Pix pendente não deve aparecer na Central de Pedidos como Novo/Recebido.

Enquanto Pix estiver pending:
- cliente fica em tela de pagamento;
- sistema aguarda webhook;
- pedido não entra no fluxo operacional.

Quando webhook confirma aprovado:
- pedido entra na operação;
- status operacional inicia.

## Cancelar/abandonar Pix

Cliente deve poder cancelar ou abandonar Pix pendente e voltar para:
- checkout;
- escolha de pagamento;
- carrinho;
- ajuste de pedido.

Evitar cobrança duplicada.

## Regra crítica

Pagamento externo não deve ser alterado automaticamente por edição/exclusão interna sem fluxo específico.

Excluir pedido no Foocci não significa estornar pagamento externo.
`,
  },

  // ── 11 ────────────────────────────────────────────────────────────────────
  {
    slug:    "analytics",
    title:   "Analytics",
    area:    "ANALYTICS",
    status:  "PARTIAL",
    version: "0.1",
    content: `# Analytics

Analytics deve transformar dados em decisão comercial.

Não deve ser apenas relatório.

Pergunta central:
O que está acontecendo e o que o dono deve fazer agora?

## Analytics Agent

O Analytics Agent é a IA analítica/comercial do restaurante.

Ele deve:
- ler vendas;
- ler pedidos;
- ler produtos;
- ler CRM;
- ler campanhas;
- identificar oportunidades;
- explicar problemas;
- sugerir ações práticas.

Ele não deve:
- inventar dados;
- tomar decisões operacionais sozinho;
- substituir humano;
- mostrar insight sem base.

## Dados importantes

Analytics deve considerar:
- receita;
- pedidos;
- ticket médio;
- produtos mais vendidos;
- vendas por horário;
- canal/modalidade;
- clientes;
- CRM;
- campanhas;
- conversão;
- atraso;
- pagamento;
- oportunidades.

## Dashboard

Dashboard deve funcionar como cockpit:
- hoje;
- 7 dias;
- mês atual;
- últimos 30 dias;
- período customizado;
- valores visíveis em gráficos;
- alertas;
- próximos passos.

## CRM Analytics

Deve mostrar:
- clientes mais valiosos;
- clientes frios;
- clientes perdidos;
- recorrência;
- taxa de resposta;
- taxa de conversão;
- receita recuperada;
- campanhas com melhor performance.

## Regra

Analytics deve sempre aproximar dado de ação.
`,
  },

  // ── 12 ────────────────────────────────────────────────────────────────────
  {
    slug:    "seguranca-operacional",
    title:   "Segurança Operacional",
    area:    "SECURITY",
    status:  "DECIDED",
    version: "0.1",
    content: `# Segurança Operacional

Foocci precisa proteger dados, operação, pagamentos, integrações e comportamento dos agentes.

## Regras principais

- credenciais sensíveis devem ser protegidas;
- multi-tenant isolation por restaurantId;
- webhook deve validar token/segredo;
- variáveis sensíveis não vão para client;
- rotas admin/master exigem proteção;
- ações destrutivas exigem confirmação;
- futuras permissões devem separar master/admin/staff.

## Manual Operacional

Manual é privado.

Restaurantes não acessam.

Agentes ainda não consultam nesta fase.

Futuramente, agentes devem consultar apenas conteúdo publicado/aprovado, não rascunhos.

## Prioridade de verdade

1. regras críticas do sistema/código;
2. Manual Operacional publicado;
3. configuração do restaurante;
4. contexto do cliente/conversa;
5. resposta gerada pela IA.

## Ações destrutivas

Excluir pedido:
- exige confirmação;
- reverte impacto interno;
- não estorna pagamento externo automaticamente.

Excluir conversa:
- exige confirmação;
- não apaga cliente automaticamente;
- não apaga pedidos automaticamente.

## Segurança WhatsApp

- não expor token;
- não expor webhook secret;
- não expor instanceName;
- validar server-side;
- preservar sessão;
- evitar reset técnico por usuário comum.

## Segurança CRM

- respeitar opt-out;
- limites de envio;
- janela segura;
- batch;
- delay;
- frequência por cliente;
- não parecer spam.

## Limitações conhecidas

- rate limiter in-memory pode não escalar multi-instance;
- permissões granulares ainda precisam evolução;
- diagnósticos técnicos devem ficar restritos a admin/suporte.
`,
  },

  // ── 13 ────────────────────────────────────────────────────────────────────
  {
    slug:    "backlog",
    title:   "Backlog",
    area:    "BACKLOG",
    status:  "BACKLOG",
    version: "0.1",
    content: `# Backlog Oficial

Este capítulo registra ideias futuras e decisões ainda não implementadas.

Backlog não é comportamento atual.

## Agentes

- contrato JSON estrito para Waiter;
- menu semantic search avançado;
- agent test runner;
- prompt studio por agente;
- personalização por histórico;
- upsell por margem, clima, horário e carrinho;
- A/B testing de mensagens;
- modo rápido para cliente recorrente;
- modo consultivo.

## CRM

- mensagens com variação por IA;
- campaign risk score;
- A/B testing;
- campanhas por produto favorito;
- reativação por margem/produto;
- sugestões automáticas de campanha;
- rollback de importação;
- relatórios monetizáveis;
- personalização por clima/horário;
- omnichannel futuro.

## WhatsApp / Atendimento

- venda completa via WhatsApp no futuro;
- AI ordering controlado;
- omnichannel;
- classificação automática de intenção;
- resumo automático de conversa;
- sugestões para operador;
- tags;
- SLA/fila;
- anexos;
- sons específicos;
- Print Agent local.

## UI/UX

- design system formal;
- permissões completas;
- dashboard cockpit avançado;
- login com identidade Foocci;
- componentes padronizados;
- empty/loading/error states;
- QR Salão avançado;
- pedido mesa/salão;
- auditoria de edição de pedido.

## Branding

- design tokens oficiais;
- biblioteca de assets;
- avatar pack por culinária;
- templates de marketing;
- assets ultra HD;
- landing page oficial;
- animações do robô;
- motion system;
- pack social media.

## Integrações

- Saipos/POS completo;
- Stone completa;
- reembolso/ajuste financeiro;
- impressão local;
- integrações futuras;
- health dashboards internos.
`,
  },

  // ── 14 ────────────────────────────────────────────────────────────────────
  {
    slug:    "historico-de-decisoes",
    title:   "Histórico de Decisões",
    area:    "GENERAL",
    status:  "DECIDED",
    version: "0.1",
    content: `# Histórico de Decisões

## Decisões iniciais (v0.1)

- Foocci é Sales + CRM Engine para restaurantes, não chatbot.
- Foocci deve ser state-driven, não prompt-driven.
- UI vende; IA orienta.
- Agentes oficiais atuais: Waiter Agent, CRM Agent, WhatsApp Agent e Analytics Agent.
- Marca/Persona não é agente; é módulo de branding.
- Manual Operacional não é agente; é base documental interna.
- Manual deve viver dentro do Foocci/Fute Master/Admin.
- Restaurantes não acessam o Manual.
- Atualizações do Manual devem virar solicitações pendentes para aprovar/rejeitar.
- Agentes futuramente só devem consultar conteúdo publicado/aprovado.
- Waiter Agent é vendedor no \`/pedido\`.
- WhatsApp Agent é recepção/triagem.
- CRM Agent é relacionamento/recorrência.
- Analytics Agent é gerente comercial analítico.
- Branding oficial é Foocci, não Fute/FUT para materiais oficiais.
- Mercado Pago começa Pix only.
- Pedido Pix pending não deve entrar como pedido operacional.
- Cliente deve poder cancelar/voltar da tela Pix.
- WhatsApp Evolution usa endpoint único e query-token auth.
- CRM deve ter segmentação configurável.
- Campanhas ativas devem aparecer no topo.
- UI/UX é responsável por como o usuário vê, clica, confirma, entende e compra.
- Chats de agentes cuidam da inteligência; UI/UX cuida da experiência.
- Mudança importante no produto deve gerar atualização pendente no Manual.

## Regra de manutenção

Toda decisão relevante deve registrar:
- data;
- área;
- motivo;
- impacto;
- status;
- capítulo afetado;
- se é implementado, parcial, decidido ou backlog.
`,
  },
];
