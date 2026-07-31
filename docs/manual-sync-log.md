# Manual Sync — Log noturno

Diário das atualizações automáticas do manual. Cada linha é uma noite.
(Entradas mais recentes no topo.)

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
