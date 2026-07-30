# Manual Sync — Log noturno

Diário das atualizações automáticas do manual. Cada linha é uma noite.
(Entradas mais recentes no topo.)

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
