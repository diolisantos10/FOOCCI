# Manual Sync — Log noturno

Diário das atualizações automáticas do manual. Cada linha é uma noite.
(Entradas mais recentes no topo.)

---

## 2026-08-04
- **Arquivos que dispararam** (janela de 26h, telas do lojista):
  - `src/app/(dashboard)/menu/MenuManager.tsx`, `src/app/(dashboard)/menu/QRCard.tsx`,
    `src/app/(dashboard)/menu/page.tsx` — a tela **Cardápio** passou de **dois** para **três**
    cartões de QR. O do meio nasceu como "QR Code Loja" (commit `eedee0c2`, link próprio com
    `?modo=loja`), ganhou layout empilhado junto com os outros dois (commit `31dfefc8`) e foi
    renomeado por decisão do CEO para **QR Code Cardápio sem IA** — subtítulo "Pedido online —
    sem IA", arquivo `cardapio-sem-ia-qr-<slug>.png` (commit `3f06f093`).
  - `src/app/(dashboard)/crm/OverviewTab.tsx`, `crm/ContactBaseHealthPanel.tsx` — na **Visão
    Geral** do CRM **todos** os quadros passaram a mostrar o peso em % (inclusive **Novos** e
    **Não compraram**), e o denominador mudou de "quem já comprou" para a **base total de
    clientes**; abaixo de 1% a tela exibe uma casa decimal ("0,2%") em vez de arredondar para
    0% (commit `0f800d19`).
- **Guias atualizados:**
  - `guia-cardapio-digital-qr` — reescrito. O guia dizia "no topo há **dois** QR Codes" e agora
    são três: documentados os rótulos reais dos cartões (**QR Code Salão** "Cardápio digital —
    sem pedido", **QR Code Cardápio sem IA** "Pedido online — sem IA", **QR Code Delivery**
    "Pedido online completo"), a dica de cada um, o selo **Ativo**, o campo **Link público**, os
    três botões (**📋 Copiar link** → **✓ Copiado!**, **⬇ Baixar QR**, **👁 Visualizar**), o nome
    do arquivo baixado e o que o **?modo=loja** faz (força a versão sem IA em qualquer plano).
  - `guia-criar-campanha-crm` — o item "Os números da sua base" ganhou o bloco **"Como ler o
    percentualzinho ao lado do número"**: base do cálculo = **Clientes na base** (o único quadro
    sem %), as cinco faixas exclusivas somando ~100%, **Novos** como eixo de período sobreposto
    (percentual só informativo) e a casa decimal abaixo de 1%. Corrigido também o CTA
    **Ver perdidos**, que faltava na lista.
  - `guia-primeiros-passos` — o passo "Divulgue o cardápio" citava só dois cartões; agora
    menciona os três, com o **QR Code Cardápio sem IA** no meio.
- **Disparou mas não gerou guia:** `guia-cadastrar-produto` — o `MenuManager.tsx` mudou só no
  bloco dos cartões de QR. Todos os rótulos do guia (**+ Nova categoria**, **Criar categoria**,
  **+ Novo Produto**, **Criar produto**, **+ Adicionar item**, **Editar item**, **+ Adicionar
  variante / grupo de opções / adicional**, **Salvar alterações**, **Excluir produto**) foram
  conferidos no JSX e continuam iguais. Nada a reescrever.
- **Nenhuma rota nova** em `(dashboard)/` → nenhum guia criado.
- **Playbook:** a linha do `guia-cardapio-digital-qr` no mapa passou a citar
  `src/app/(dashboard)/menu/QRCard.tsx` — o componente que renderiza os cartões nasceu ontem e
  não estava mapeado.
- **Verificação:** `npm run type-check` — OK.

---

## 2026-08-02
- **Arquivos que dispararam** (janela de 26h, telas do lojista):
  - `src/app/(dashboard)/dashboard/DashboardClient.tsx`, `analytics/AnalyticsClient.tsx`,
    `crm/CRMClient.tsx`, `crm/OverviewTab.tsx` — o preset **"Mês anterior"** (mês fechado,
    do 1º ao último dia do mês passado) entrou nas **quatro réguas de período** do sistema,
    e na Visão Geral do CRM o quadro de novos passa a se chamar **"Novos no mês anterior"**
    (commit `9f078e29`).
  - `src/app/(dashboard)/crm/ContactBaseHealthPanel.tsx`, `crm/page.tsx` — o cartão **Saúde
    da base de contatos** (aba **Clientes**) ganhou o aviso **"N clientes com telefone, mas
    desligados para WhatsApp"** e o botão **"Ativar N para WhatsApp"**, com confirmação,
    alerta de LGPD, estado **Ativando…** e o sucesso **"✓ N clientes ativados para
    WhatsApp."**. É o que destrava campanha com audiência 0 (commit `4c76f40f`).
  - `src/app/(dashboard)/integracoes/IntegrationsCenterClient.tsx` — o painel **Conectar
    WhatsApp** parou de anunciar conexão que não existe: ganhou o **código de pareamento**
    ("Conectar com número de telefone" + **Gerar outro código**), o estado de espera ("O
    WhatsApp ainda está preparando o código. Aguarde…") e o estado honesto **"Não deu para
    confirmar o estado da conexão."** com **Tentar de novo** (commit `ddedbd08`).
- **Guias atualizados:**
  - `guia-painel-inicial` — **Mês anterior** na régua de período, com a explicação de mês
    fechado e comparação contra o mês retrasado.
  - `guia-analytics` — **Mês anterior** na lista de períodos.
  - `guia-criar-campanha-crm` — **Mês anterior** nas duas réguas (Visão Geral e Campanhas) +
    rótulo "Novos no mês anterior"; e a seção nova **"Antes ainda: sua base precisa estar
    ligada para o WhatsApp (aba Clientes)"**, com os três quadros do cartão, o passo a passo
    do **Ativar N para WhatsApp**, o que a ação não faz (não envia nada, não mexe em opt-out)
    e as duas mensagens de erro reais.
  - `guia-conectar-whatsapp` — reescrito com os rótulos reais (**Gerar QR Code**, **Atualizar
    QR**, **Gerar outro código**, **Tentar de novo**, **Testar conexão**, **Desconectar**),
    os dois caminhos (QR **ou** código de pareamento) e a leitura de cada mensagem da tela —
    incluindo o aviso de que só **"WhatsApp já está conectado!"** significa conectado. O
    guia dizia "Clique em Conectar WhatsApp" e "Atualizar QR Code", que não são os rótulos
    do código.
- **Disparou mas não gerou guia:** `src/app/(dashboard)/menu/upload/page.tsx` — o commit
  `fcf948ad` só acrescentou os campos `custoRaw`/`custo` ao tipo `RowResult`; a tela
  (colunas Foto, Categoria, Nome do Item, Descrição, Preço) não mudou. Nada a reescrever.
- **Playbook:** a linha do `guia-conectar-whatsapp` no mapa passou a citar também
  `IntegrationsCenterClient.tsx` (painel `WhatsAppQRPanel`) — o painel de QR mora lá, não em
  `integracoes/whatsapp/**`, e por isso a mudança teria sido mapeada só para `guia-integracoes`.

---

## 2026-08-01
- **Arquivos que dispararam** (mudanças depois do sync de 31/07, telas do lojista):
  - `src/app/(dashboard)/dashboard/DashboardClient.tsx` — **Origem do faturamento** virou
    **3 variáveis**: as antigas quatro fatias (CRM / Indicações / Clientes novos / Orgânico)
    deram lugar a **CRM**, **Garçom / Indicações** e **Espontânea**, com a legenda em coluna
    única (commit `afc942be`).
  - `src/app/(dashboard)/crm/CRMClient.tsx`, `OverviewTab.tsx`, `CrmAgentPanel.tsx` (removido)
    — CRM P1–P6 + faxina: **Regras de Segurança** passaram a mostrar o **limite oficial da
    Meta** (com a qualidade do número) no lugar do "🔒 Modo seguro ativo" com a escadinha
    20→40→80→150→250; o **Limite de contatos** ganhou o rótulo "(no total, para sempre)" e o
    aviso de **limite atingido**; a Visão Geral trocou a tabela vitalícia de campanhas pelos
    quadradinhos **Campanhas mais rentáveis** (top 5 por período) e o **Programa de
    relacionamento** virou big numbers com "% da base"; o painel do agente de CRM saiu da
    tela do lojista (commits `2e2091be`, `913d4b1e`, `2d43cb17`, `c8a79ce8`, `c82c979d`,
    `666e29a5`, `6b94f9bc`).
- **Guias atualizados:**
  - `guia-painel-inicial` — seção **Origem do faturamento** reescrita com as **três** origens
    reais do código (**CRM** — campanhas e automações; **Garçom / Indicações** — recomendou ou
    indicou; **Espontânea** — cliente por conta própria) e o estado vazio **"Sem faturamento
    no período"**.
  - `guia-criar-campanha-crm` — ganhou a abertura **"Antes: o que a Visão Geral te mostra"**
    (os 7 quadros da base, a régua Hoje/Últimos 7 dias/Esta semana/Este mês/Este ano/
    Personalizado com **Aplicar**, **Receita gerada pelo CRM**, **Campanhas mais rentáveis**
    top 5 com **Ver todas →**, **Clientes mais valiosos** e **Programa de relacionamento** em
    Bronze/Prata/Ouro/Diamante com "% da base") e a nova seção **"Os dois limites"**
    (🟢 Limite oficial da Meta × Limite de contatos "no total, para sempre", aviso de limite
    atingido, **Assumir controle manual**, **Proteções sempre ativas**, **Salvar
    configurações**). A lista de abas do CRM entrou na introdução.
  - `guia-limites-envio-whatsapp` — reescrito para o cartão real: saiu o "Aquecimento
    (warmup)" (a escadinha não é mais mostrada na tela) e entraram o **🟢 Limite oficial da
    Meta** com a qualidade do número, o **Limite de contatos** vitalício, os valores
    congelados do modo seguro (24 h por cliente, 5/semana, 21h–8h, delay 5–45 s) e o aviso
    **⚠️ Controle manual ativo**.
  - `guia-treinamento-dono` — a rotina diária citava o bloco **"O que fazer agora"**, que não
    existe mais na tela Início; passou a citar **Destaques** e a **Origem do faturamento**
    com as três origens.
- **Sem mudança:** `src/components/layout/Sidebar.tsx` mudou só o visual da marca (só o
  wordmark, centralizado, com o ✕ de fechar absoluto no mobile) — nenhum rótulo de navegação
  mudou, então nenhum guia foi tocado por causa dele. Nenhuma rota nova em `(dashboard)/` →
  nenhum guia criado e nenhuma linha nova no mapa do playbook.
- **Verificação:** `npm run type-check` — OK.

---

## 2026-07-31
- **Arquivos que dispararam** (mudanças depois do sync de 30/07, telas do lojista):
  - `src/app/(dashboard)/dashboard/DashboardClient.tsx` — painel **Destaques** (diário do
    período) no lugar do antigo "O que fazer agora" + **Origem do faturamento** em gráfico
    de rosca com o total no centro (commits `5b79ec3f`, `7aaea149`).
  - `src/components/layout/TopBar.tsx`, `src/components/layout/SoundStatusChip.tsx`,
    `src/app/(dashboard)/layout.tsx` — o controle de som virou chip dentro da faixa branca
    do topo (3 estados) e o opt-in passou a ficar gravado no navegador; a faixa flutuante
    `SoundGateBanner` foi removida (commit `dbfb3601`).
  - `src/app/(dashboard)/settings/impressoras/page.tsx` — aviso "Pronto!" ao fim dos 3
    passos: o Carteiro detecta a impressora sozinho (commit `24109e33`).
- **Guias atualizados:**
  - `guia-painel-inicial` — reescrito. Saiu **"O que fazer agora"** (não existe mais na
    tela); entraram **Destaques** (campeão, pico/melhor dia, ticket, clientes novos,
    carrinhos, upsell, conversão), **Origem do faturamento** (rosca com total no centro e
    legenda **CRM** / **Indicações** / **Clientes novos** / **Orgânico**, valor + %),
    **Receita no período** (barra Atual vs. janela de comparação) e **Conversão por canal**
    (WhatsApp, Cardápio (link), QR na mesa, Instagram). Régua de tempo documentada como
    valendo pra tela toda, incluindo o **Personalizado** com "de … até …".
  - `guia-sons-alertas` — nova seção de abertura "Antes de tudo: ativar o som no topo
    (1 clique)" com os três estados do chip na faixa branca (**🔔 Ativar som** laranja
    piscando, **🔔 Som ativo**, **🔕 Sons off**), a persistência do clique no navegador e o
    comportamento no celular (só o sininho). O passo a passo de **Configurações → Sons e
    alertas** ficou numa seção própria, sem mudança de rótulo.
  - `guia-impressoras` — o passo a passo agora cita o aviso **"✅ Pronto! O Carteiro acha a
    impressora sozinho"** (sem escolher marca/modelo) e o estado **"✓ Já conectado — não
    precisa fazer de novo."** do passo 3.
- **Sem mudança:** `guia-pausar-pedidos` — o `TopBar.tsx` mudou só na faixa da esquerda
  (chip de som); os rótulos de **Pausar pedidos**, motivo, retomada automática e
  **Reativar** continuam iguais aos do código. Nenhuma tela nova em `(dashboard)/` →
  nenhum guia criado e nenhuma linha nova no mapa do playbook.
- **Verificação:** `npm run type-check` — OK.

---

## 2026-07-30
- **Arquivos que dispararam** (últimas 26h, telas do lojista):
  - `src/app/(dashboard)/crm/CRMClient.tsx`, `CrmAgentPanel.tsx`, `OverviewTab.tsx`,
    `BrainPanel.tsx`, `page.tsx` — faxina do CRM + consolidação da criação de campanha
    + filtro de período period-accurate (commits `4f771506`, `f7c84c12`, `4ca719e5`).
  - `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx`, `page.tsx` — conversão de
    unidade na ficha (compra em kg / usa em g) (commit `3ba8dabd`).
  - `src/app/(dashboard)/settings/impressoras/page.tsx` — fila de impressão visível na
    tela, com contadores, comandas travadas e reenvio (commit `b1bbe72b`).
- **Guias atualizados:**
  - `guia-criar-campanha-crm` — reescrito. A galeria de "modelos prontos" não é mais
    renderizada na aba Campanhas; a criação agora é o bloco **Criar campanha
    personalizada** (botão **Preencher manual** + caixa **✨ Criar campanha com IA**)
    logo acima da lista. Documentada a régua **Período:** (Hoje/Ontem/Últimos 7 dias/
    Semana passada/Últimos 30 dias/Este mês/Personalizado/Total) e os quadros do
    **Receita gerada pelo CRM**, além das abas da janela **Gerenciar campanha**.
  - `guia-impressoras` — nova seção "Acompanhar a fila (quando o papel não sai)" com o
    cartão **Fila de impressão** (**Na fila**, **No Carteiro**, **Impressas 24h**) e o
    botão **Tentar de novo**; numeração das seções seguintes corrigida.
- **Guia criado:**
  - `guia-precificacao` — tela **Vendas → CMV & Precificação** não tinha guia. Cobre as
    seis abas (Custos & Fórmula, Markup, Preços do cardápio, Insumos, Ficha de custo,
    Automação), incluindo a unidade de **uso** por linha da ficha com conversão
    automática a partir da unidade de **compra**. Linha adicionada ao mapa do playbook.
- **Verificação:** `npm run type-check` — OK.

---

## Baseline — 20 guias do lojista publicados
- **Guias existentes:** Início, Pedidos, Central de Conversas, Cardápio, Cardápio digital/QR,
  Agentes IA, Ensinar a IA, Analytics, Promoções, CRM, Canais, Marca, Fotos do Cardápio,
  Conectar WhatsApp, Integrações, Pagamentos, Entrega, Horário, Configurações, Pausar pedidos.
- **Fonte:** `src/services/manual/howToGuidesContent.ts`.
- **Estado:** ponto de partida do robô noturno. A partir daqui, cada madrugada registra
  aqui o que mudou.
