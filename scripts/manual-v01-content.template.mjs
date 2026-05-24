/**
 * manual-v01-content.template.mjs
 *
 * Content template for Foocci Manual Operacional v0.1
 *
 * HOW TO USE:
 *   1. Copy this file:  cp scripts/manual-v01-content.template.mjs scripts/manual-v01-content.mjs
 *   2. Fill in each chapter's `content` field with real Markdown.
 *   3. Change `status` from "DECIDED" to "IMPLEMENTED" or "PARTIAL" as appropriate.
 *   4. Run the import script (see scripts/import-manual-v01.mjs --help).
 *
 * DO NOT commit scripts/manual-v01-content.mjs to the repo if it contains
 * sensitive operational details.  Add it to .gitignore if needed.
 *
 * RULES:
 *   - slug must match an existing chapter in the database (or pass --create-missing).
 *   - content must not be empty.
 *   - area must be a valid ManualArea enum value.
 *   - status must be a valid ManualRuleStatus enum value.
 *   - No duplicate slugs in this array.
 *
 * Valid ManualArea values:
 *   GENERAL | WAITER_AGENT | CRM | WHATSAPP | UI_UX | BRANDING |
 *   INTEGRATIONS | CHECKOUT | PAYMENTS | ANALYTICS | SECURITY | BACKLOG
 *
 * Valid ManualRuleStatus values:
 *   IMPLEMENTED | PARTIAL | DECIDED | BACKLOG
 */

export const MANUAL_V01_CONTENT = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "visao-geral",
    title:   "Visão Geral do Foocci",
    area:    "GENERAL",
    status:  "DECIDED",
    version: "0.1",
    content: `# Visão Geral do Foocci

[PLACEHOLDER — descreva o propósito, missão e visão geral do produto Foocci/Fute.]

## O que é o Foocci

[PLACEHOLDER]

## Público-alvo

[PLACEHOLDER]

## Posicionamento

[PLACEHOLDER]
`,
  },

  // ── 2 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "principios-operacionais",
    title:   "Princípios Operacionais",
    area:    "GENERAL",
    status:  "DECIDED",
    version: "0.1",
    content: `# Princípios Operacionais

[PLACEHOLDER — liste as regras fundamentais que guiam todas as decisões de produto e operação.]

## Princípios inegociáveis

[PLACEHOLDER]

## O que nunca deve acontecer

[PLACEHOLDER]

## Como tratamos o restaurante

[PLACEHOLDER]
`,
  },

  // ── 3 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "arquitetura-do-sistema",
    title:   "Arquitetura do Sistema",
    area:    "INTEGRATIONS",
    status:  "DECIDED",
    version: "0.1",
    content: `# Arquitetura do Sistema

[PLACEHOLDER — descreva a visão técnica da arquitetura: stack, serviços, integrações e fluxos de dados.]

## Stack

[PLACEHOLDER — Next.js, Prisma, PostgreSQL, Railway, etc.]

## Serviços externos

[PLACEHOLDER]

## Fluxo de dados principal

[PLACEHOLDER]
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

[PLACEHOLDER — descreva as regras de comportamento, limites e fluxos do agente de atendimento.]

## Prompt base

[PLACEHOLDER]

## O que o agente pode fazer

[PLACEHOLDER]

## O que o agente NÃO pode fazer

[PLACEHOLDER]

## Regras de escalação para humano

[PLACEHOLDER]

## Como lida com pedidos, reclamações e cardápio

[PLACEHOLDER]
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

[PLACEHOLDER — descreva o módulo CRM: segmentação, campanhas, automações e perfil adaptativo.]

## Segmentação de clientes

[PLACEHOLDER]

## Campanhas

[PLACEHOLDER]

## CRM Adaptive Brain

[PLACEHOLDER]

## Limites de automação

[PLACEHOLDER]
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

[PLACEHOLDER — descreva o fluxo de atendimento via WhatsApp, integração com Evolution API e regras de handoff.]

## Fluxo de entrada de mensagem

[PLACEHOLDER]

## Quando transferir para humano

[PLACEHOLDER]

## Configuração do Evolution API

[PLACEHOLDER]

## Mensagens proibidas

[PLACEHOLDER]
`,
  },

  // ── 7 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "ui-ux",
    title:   "UI/UX",
    area:    "UI_UX",
    status:  "DECIDED",
    version: "0.1",
    content: `# UI/UX

[PLACEHOLDER — descreva os padrões de interface, componentes, fluxos de usuário e decisões de design.]

## Sistema de design

[PLACEHOLDER]

## Fluxo do checkout do cliente

[PLACEHOLDER]

## Fluxo do dashboard do restaurante

[PLACEHOLDER]

## Decisões de UX documentadas

[PLACEHOLDER]
`,
  },

  // ── 8 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "branding",
    title:   "Branding / Marca",
    area:    "BRANDING",
    status:  "DECIDED",
    version: "0.1",
    content: `# Branding / Marca

[PLACEHOLDER — descreva a identidade visual, voz, tom e uso da marca Foocci/Fute.]

## Paleta de cores

[PLACEHOLDER]

## Tipografia

[PLACEHOLDER]

## Logotipo e uso

[PLACEHOLDER]

## Voz e tom da marca

[PLACEHOLDER]
`,
  },

  // ── 9 ─────────────────────────────────────────────────────────────────────
  {
    slug:    "integracoes",
    title:   "Integrações",
    area:    "INTEGRATIONS",
    status:  "DECIDED",
    version: "0.1",
    content: `# Integrações

[PLACEHOLDER — documente cada integração externa: endpoint, autenticação, limites de rate, e plano de fallback.]

## Evolution API

[PLACEHOLDER]

## OpenAI / Anthropic

[PLACEHOLDER]

## Nominatim / Geocoding

[PLACEHOLDER]

## Railway

[PLACEHOLDER]

## Outras integrações

[PLACEHOLDER]
`,
  },

  // ── 10 ────────────────────────────────────────────────────────────────────
  {
    slug:    "checkout-pagamentos",
    title:   "Checkout / Pagamentos",
    area:    "CHECKOUT",
    status:  "DECIDED",
    version: "0.1",
    content: `# Checkout / Pagamentos

[PLACEHOLDER — descreva o fluxo de checkout, cálculo de frete, Pix e regras de pagamento.]

## Fluxo do checkout

[PLACEHOLDER — endereço → nome → pagamento → confirmação]

## Modos de frete

[PLACEHOLDER — simples, distância, manual]

## Pix

[PLACEHOLDER]

## Regras do finalize

[PLACEHOLDER]
`,
  },

  // ── 11 ────────────────────────────────────────────────────────────────────
  {
    slug:    "analytics",
    title:   "Analytics",
    area:    "ANALYTICS",
    status:  "DECIDED",
    version: "0.1",
    content: `# Analytics

[PLACEHOLDER — descreva métricas, eventos rastreados, dashboards e decisões baseadas em dados.]

## Eventos rastreados

[PLACEHOLDER]

## Dashboard do restaurante

[PLACEHOLDER]

## Métricas de engajamento do CRM

[PLACEHOLDER]
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

[PLACEHOLDER — descreva regras de segurança, autenticação, autorização e proteção de dados.]

## Modelo de autenticação

[PLACEHOLDER — NextAuth, sessão do admin, ADMIN_SECRET]

## Autorização por role

[PLACEHOLDER]

## Proteção de dados do cliente

[PLACEHOLDER]

## Regras de acesso a endpoints internos

[PLACEHOLDER]
`,
  },

  // ── 13 ────────────────────────────────────────────────────────────────────
  {
    slug:    "backlog",
    title:   "Backlog",
    area:    "BACKLOG",
    status:  "BACKLOG",
    version: "0.1",
    content: `# Backlog

[PLACEHOLDER — liste funcionalidades e decisões planejadas mas ainda não implementadas.]

## Alta prioridade

[PLACEHOLDER]

## Média prioridade

[PLACEHOLDER]

## Baixa prioridade / ideias

[PLACEHOLDER]
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

[PLACEHOLDER — registre as decisões técnicas e de produto mais impactantes com contexto e consequências.]

## Formato de entrada

Cada decisão deve conter: data, decisão tomada, alternativas consideradas, e por que foi escolhida.

## Decisões registradas

[PLACEHOLDER]
`,
  },
];
