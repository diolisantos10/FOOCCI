import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { ManualArea, ManualRuleStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_CHAPTERS = [
  {
    slug:        "visao-geral",
    title:       "Visão Geral do Foocci",
    area:        "GENERAL",
    description: "Propósito, missão e visão geral do produto Foocci/Fute.",
    content:     "# Visão Geral do Foocci\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui o propósito, missão, público-alvo e posicionamento do Foocci.",
    status:      "BACKLOG",
  },
  {
    slug:        "principios-operacionais",
    title:       "Princípios Operacionais",
    area:        "GENERAL",
    description: "Regras fundamentais que guiam todas as decisões de produto e operação.",
    content:     "# Princípios Operacionais\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui os princípios inegociáveis do produto — como tratamos o restaurante, como o agente deve se comportar, o que nunca deve acontecer.",
    status:      "BACKLOG",
  },
  {
    slug:        "arquitetura-do-sistema",
    title:       "Arquitetura do Sistema",
    area:        "INTEGRATIONS",
    description: "Visão técnica da arquitetura: stack, serviços, integrações e fluxos de dados.",
    content:     "# Arquitetura do Sistema\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: stack (Next.js, Prisma, PostgreSQL, Railway), integrações externas (Evolution API, Nominatim, Google Maps, OpenAI, Anthropic), e fluxos de dados principais.",
    status:      "BACKLOG",
  },
  {
    slug:        "waiter-agent",
    title:       "Waiter Agent",
    area:        "WAITER_AGENT",
    description: "Regras de comportamento, limites e fluxos do agente de atendimento ao cliente.",
    content:     "# Waiter Agent\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: prompt base, regras de escalação para humano, o que o agente pode e não pode fazer, como lida com pedidos, reclamações, cardápio, e frete.",
    status:      "BACKLOG",
  },
  {
    slug:        "crm-agent",
    title:       "CRM / CRM Agent",
    area:        "CRM",
    description: "Regras do módulo CRM: segmentação, campanhas, automações e perfil adaptativo.",
    content:     "# CRM / CRM Agent\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: como segmentos são calculados, como campanhas são disparadas, regras do CRM Adaptive Brain, e limites de automação.",
    status:      "BACKLOG",
  },
  {
    slug:        "whatsapp-agent",
    title:       "WhatsApp Agent / Atendimento",
    area:        "WHATSAPP",
    description: "Fluxo de atendimento via WhatsApp, integração com Evolution API, e regras de handoff.",
    content:     "# WhatsApp Agent / Atendimento\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: fluxo de entrada de mensagem, como o bot decide responder, quando transfere para humano, configuração do Evolution API, e regras de mensagem proibida.",
    status:      "BACKLOG",
  },
  {
    slug:        "ui-ux",
    title:       "UI/UX",
    area:        "UI_UX",
    description: "Padrões de interface, componentes, fluxos de usuário e decisões de design.",
    content:     "# UI/UX\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: sistema de design, componentes reutilizáveis, fluxo do checkout do cliente, fluxo do dashboard do restaurante, e decisões de UX.",
    status:      "BACKLOG",
  },
  {
    slug:        "branding",
    title:       "Branding / Marca",
    area:        "BRANDING",
    description: "Identidade visual, voz, tom e uso da marca Foocci/Fute.",
    content:     "# Branding / Marca\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: paleta de cores, tipografia, logotipo, voz da marca, e regras de uso da marca Foocci e Fute.",
    status:      "BACKLOG",
  },
  {
    slug:        "integracoes",
    title:       "Integrações",
    area:        "INTEGRATIONS",
    description: "Todos os serviços externos integrados: Evolution API, OpenAI, Anthropic, Railway, etc.",
    content:     "# Integrações\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui cada integração externa: endpoint, autenticação, limites de rate, como falhas são tratadas, e plano de fallback.",
    status:      "BACKLOG",
  },
  {
    slug:        "checkout-pagamentos",
    title:       "Checkout / Pagamentos",
    area:        "CHECKOUT",
    description: "Fluxo de checkout do cliente, cálculo de frete, Pix, e regras de pagamento.",
    content:     "# Checkout / Pagamentos\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: fluxo de checkout (endereço → nome → pagamento → confirmação), modos de frete (simples, distância), Pix, e regras do finalize.",
    status:      "BACKLOG",
  },
  {
    slug:        "analytics",
    title:       "Analytics",
    area:        "ANALYTICS",
    description: "Métricas, eventos rastreados, dashboards e decisões baseadas em dados.",
    content:     "# Analytics\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: quais eventos são rastreados, como o dashboard do restaurante é calculado, métricas de engajamento do CRM, e fontes de dados.",
    status:      "BACKLOG",
  },
  {
    slug:        "seguranca-operacional",
    title:       "Segurança Operacional",
    area:        "SECURITY",
    description: "Regras de segurança, autenticação, autorização e proteção de dados.",
    content:     "# Segurança Operacional\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui: modelo de autenticação (NextAuth, sessão do admin), autorização por role, proteção de dados do cliente, e regras de acesso a endpoints internos.",
    status:      "BACKLOG",
  },
  {
    slug:        "backlog",
    title:       "Backlog",
    area:        "BACKLOG",
    description: "Funcionalidades e decisões planejadas mas ainda não implementadas.",
    content:     "# Backlog\n\n> Este capítulo está pendente de conteúdo inicial.\n\nDocumente aqui features e melhorias planejadas que ainda não foram implementadas, com prioridade e contexto de por que existem.",
    status:      "BACKLOG",
  },
  {
    slug:        "historico-de-decisoes",
    title:       "Histórico de Decisões",
    area:        "GENERAL",
    description: "Registro permanente de decisões técnicas e de produto relevantes.",
    content:     "# Histórico de Decisões\n\n> Este capítulo está pendente de conteúdo inicial.\n\nEste capítulo é um índice narrativo. O log detalhado fica no módulo de Decisões (Decision Log). Documente aqui as decisões mais impactantes com contexto e consequências.",
    status:      "BACKLOG",
  },
] as const;

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const created: string[] = [];
  const skipped: string[] = [];
  const errors:  string[] = [];

  for (const ch of BASE_CHAPTERS) {
    try {
      const exists = await prisma.operationalManualChapter.findUnique({
        where: { slug: ch.slug },
        select: { id: true },
      });

      if (exists) {
        skipped.push(ch.slug);
        continue;
      }

      await prisma.operationalManualChapter.create({
        data: {
          slug:        ch.slug,
          title:       ch.title,
          area:        ch.area as ManualArea,
          description: ch.description,
          content:     ch.content,
          status:      ch.status as ManualRuleStatus,
          version:     "0.1",
          isPublished: false,
          createdBy:   "admin-seed-ui",
        },
      });

      created.push(ch.slug);
    } catch (err) {
      errors.push(`${ch.slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const total = await prisma.operationalManualChapter.count();

  return NextResponse.json({
    created:      created.length,
    skipped:      skipped.length,
    total,
    errors,
    createdSlugs: created,
  });
}
