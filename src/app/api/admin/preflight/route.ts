/**
 * GET /api/admin/preflight
 *
 * Runs safe, non-destructive automated checks to assess pilot readiness.
 * Global admin only (x-admin-secret header or admin cookie).
 *
 * Returns structured check results without exposing secrets or raw data.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminRequest } from "@/lib/admin-auth";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_TESTED";

export interface CheckResult {
  key:      string;
  label:    string;
  status:   CheckStatus;
  message:  string;
  critical: boolean;
}

export interface RestaurantSnapshot {
  id:               string;
  name:             string;
  slug:             string;
  isActive:         boolean;
  hasMenu:          boolean;
  hasDeliveryConfig: boolean;
  hasPaymentConfig: boolean;
  hasWhatsApp:      boolean;
  hasGoogleReview:  boolean;
  menuCategoryCount: number;
  menuItemCount:    number;
  customerCount:    number;
  orderCount:       number;
  deliveryUrl:      string;
  qrUrl:            string;
}

export interface PreflightResponse {
  timestamp:    string;
  env:          CheckResult[];
  database:     CheckResult[];
  modules:      CheckResult[];
  restaurants:  RestaurantSnapshot[];
  counts: {
    restaurants: number;
    customers:   number;
    orders:      number;
    campaigns:   number;
  };
  readiness: "NOT_STARTED" | "IN_PROGRESS" | "READY_WITH_WARNINGS" | "READY" | "BLOCKED";
}

// ── Auth guard ────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  if (!process.env.ADMIN_SECRET) return false;
  return checkAdminRequest(req);
}

// ── Environment checks ────────────────────────────────────────────────────────

function checkEnv(): CheckResult[] {
  const checks: CheckResult[] = [];

  const check = (
    key: string, label: string, critical: boolean,
    condition: boolean, pass: string, fail: string
  ): CheckResult => ({
    key, label, critical,
    status:  condition ? "PASS" : (critical ? "FAIL" : "WARNING"),
    message: condition ? pass : fail,
  });

  checks.push(check(
    "env_database_url",   "DATABASE_URL",          true,
    !!process.env.DATABASE_URL,
    "Configurado", "DATABASE_URL ausente — banco de dados inacessível"
  ));

  checks.push(check(
    "env_nextauth_secret", "NEXTAUTH_SECRET",       true,
    !!process.env.NEXTAUTH_SECRET,
    "Configurado", "NEXTAUTH_SECRET ausente — sessões de usuário não funcionarão"
  ));

  checks.push(check(
    "env_admin_secret",    "ADMIN_SECRET",          true,
    !!process.env.ADMIN_SECRET,
    "Configurado", "ADMIN_SECRET ausente — área admin desativada"
  ));

  checks.push(check(
    "env_app_url",         "NEXT_PUBLIC_APP_URL",   false,
    !!process.env.NEXT_PUBLIC_APP_URL,
    `Configurado: ${process.env.NEXT_PUBLIC_APP_URL}`,
    "NEXT_PUBLIC_APP_URL ausente — links de cardápio/QR podem estar incorretos"
  ));

  checks.push(check(
    "env_encryption_key",  "ENCRYPTION_KEY",        true,
    !!process.env.ENCRYPTION_KEY,
    "Configurado", "ENCRYPTION_KEY ausente — credenciais de integração não podem ser criptografadas"
  ));

  // Evolution (optional — only warn if absent)
  const evoPresent = !!(process.env.EVOLUTION_DEFAULT_URL || process.env.EVOLUTION_BASE_URL);
  checks.push({
    key:      "env_evolution",
    label:    "Evolution API (env base URL)",
    status:   evoPresent ? "PASS" : "WARNING",
    message:  evoPresent
      ? "URL base configurada"
      : "Nenhuma URL base do Evolution configurada — WhatsApp depende de config por restaurante",
    critical: false,
  });

  // Payment providers (both optional — only warn if absent)
  const mpPresent    = !!(process.env.MERCADOPAGO_ACCESS_TOKEN);
  const stonePresent = !!(process.env.STONE_CLIENT_ID && process.env.STONE_CLIENT_SECRET);
  const payReady     = mpPresent || stonePresent;

  checks.push({
    key:      "env_payment",
    label:    "Provedor de pagamento online",
    status:   payReady ? "PASS" : "WARNING",
    message:  payReady
      ? `Configurado: ${[mpPresent && "MercadoPago", stonePresent && "Stone"].filter(Boolean).join(" + ")}`
      : "Nenhum provedor online configurado — pay_now bloqueado; pagamento na entrega/retirada funciona",
    critical: false,
  });

  return checks;
}

// ── Database checks ───────────────────────────────────────────────────────────

async function checkDatabase(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // Connection test
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      key: "db_connection", label: "Conexão com banco de dados",
      status: "PASS", message: "Conexão OK", critical: true,
    });
  } catch (err) {
    checks.push({
      key: "db_connection", label: "Conexão com banco de dados",
      status: "FAIL",
      message: `Falha na conexão: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
      critical: true,
    });
    // Can't do further DB checks
    return checks;
  }

  // Key tables exist via counts
  try {
    const [rCount, cCount, oCount, migCount] = await Promise.all([
      prisma.restaurant.count(),
      prisma.customer.count(),
      prisma.order.count(),
      // Check migration table exists
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint as count FROM "_prisma_migrations"
        WHERE finished_at IS NOT NULL
      `.then((r) => Number(r[0]?.count ?? 0)),
    ]);

    checks.push({
      key: "db_migrations", label: "Migrações aplicadas",
      status: migCount > 0 ? "PASS" : "FAIL",
      message: migCount > 0 ? `${migCount} migrações aplicadas` : "Nenhuma migração concluída detectada",
      critical: true,
    });

    checks.push({
      key: "db_restaurants", label: "Tabela de restaurantes",
      status: "PASS",
      message: `${rCount} restaurante${rCount !== 1 ? "s" : ""} cadastrado${rCount !== 1 ? "s" : ""}`,
      critical: false,
    });

    checks.push({
      key: "db_customers", label: "Tabela de clientes",
      status: "PASS",
      message: `${cCount} cliente${cCount !== 1 ? "s" : ""} no sistema`,
      critical: false,
    });

    checks.push({
      key: "db_orders", label: "Tabela de pedidos",
      status: "PASS",
      message: `${oCount} pedido${oCount !== 1 ? "s" : ""} no sistema`,
      critical: false,
    });

    // Failed/incomplete migrations (no finished_at, not rolled back)
    const failed = await prisma.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
      LIMIT 5
    `.catch(() => []);

    if (failed.length > 0) {
      checks.push({
        key: "db_failed_migrations", label: "Migrações com falha",
        status: "FAIL",
        message: `${failed.length} migração(ões) com falha: ${failed.map((f) => f.migration_name).join(", ")}`,
        critical: true,
      });
    } else {
      checks.push({
        key: "db_failed_migrations", label: "Migrações com falha",
        status: "PASS", message: "Nenhuma migração com falha detectada", critical: true,
      });
    }
  } catch (err) {
    checks.push({
      key: "db_tables", label: "Tabelas principais",
      status: "FAIL",
      message: `Erro ao verificar tabelas: ${err instanceof Error ? err.message : "Erro desconhecido"}`,
      critical: true,
    });
  }

  return checks;
}

// ── Module / feature checks ───────────────────────────────────────────────────

async function checkModules(): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];

  // hasOptedOut field exists (migration 20260509030000)
  try {
    await prisma.$queryRaw`SELECT "hasOptedOut" FROM "customers" LIMIT 1`;
    checks.push({
      key: "module_opt_out", label: "LGPD hasOptedOut (compliance)",
      status: "PASS", message: "Campo hasOptedOut presente", critical: true,
    });
  } catch {
    checks.push({
      key: "module_opt_out", label: "LGPD hasOptedOut (compliance)",
      status: "FAIL", message: "Campo hasOptedOut ausente — migração não aplicada", critical: true,
    });
  }

  // CRM campaigns table
  try {
    const campaignCount = await prisma.campaign.count();
    checks.push({
      key: "module_campaigns", label: "CRM Campaigns",
      status: "PASS", message: `${campaignCount} campanha${campaignCount !== 1 ? "s" : ""} no sistema`, critical: false,
    });
  } catch {
    checks.push({
      key: "module_campaigns", label: "CRM Campaigns",
      status: "FAIL", message: "Tabela de campanhas inacessível", critical: false,
    });
  }

  // Evolution configs
  try {
    const evoCount = await prisma.evolutionConfig.count();
    checks.push({
      key: "module_evolution", label: "Configurações Evolution (WhatsApp)",
      status: evoCount > 0 ? "PASS" : "WARNING",
      message: evoCount > 0
        ? `${evoCount} instância${evoCount !== 1 ? "s" : ""} configurada${evoCount !== 1 ? "s" : ""}`
        : "Nenhum restaurante com WhatsApp configurado",
      critical: false,
    });
  } catch {
    checks.push({
      key: "module_evolution", label: "Configurações Evolution (WhatsApp)",
      status: "WARNING", message: "Tabela EvolutionConfig inacessível", critical: false,
    });
  }

  // WhatsApp agent mode config
  try {
    const waCfgCount = await prisma.whatsAppAgentConfig.count();
    checks.push({
      key: "module_wa_config", label: "WhatsApp Agent Config",
      status: waCfgCount > 0 ? "PASS" : "WARNING",
      message: waCfgCount > 0
        ? `${waCfgCount} restaurante${waCfgCount !== 1 ? "s" : ""} com agentMode configurado`
        : "Nenhum restaurante com agentMode configurado (usará padrão RECEPTIONIST_ONLY)",
      critical: false,
    });
  } catch {
    checks.push({
      key: "module_wa_config", label: "WhatsApp Agent Config",
      status: "WARNING", message: "Tabela WhatsAppAgentConfig inacessível", critical: false,
    });
  }

  return checks;
}

// ── Restaurant snapshots ──────────────────────────────────────────────────────

async function buildRestaurantSnapshots(): Promise<RestaurantSnapshot[]> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  const restaurants = await prisma.restaurant.findMany({
    orderBy: { createdAt: "asc" },
    take: 20,
    select: {
      id: true, name: true, slug: true, isActive: true,
    },
  });

  const snapshots: RestaurantSnapshot[] = [];

  for (const r of restaurants) {
    const [
      menuCategoryCount, menuItemCount, customerCount, orderCount,
      deliveryConfig, paymentConfig, evolutionConfig, brandConfig,
    ] = await Promise.all([
      prisma.menuCategory.count({ where: { restaurantId: r.id, isActive: true } }),
      prisma.menuItem.count({ where: { category: { restaurantId: r.id }, isActive: true } }),
      prisma.customer.count({ where: { restaurantId: r.id, isGuest: false } }),
      prisma.order.count({ where: { restaurantId: r.id } }),
      prisma.deliveryConfig.findUnique({ where: { restaurantId: r.id }, select: { id: true } }),
      prisma.paymentSettings.findUnique({ where: { restaurantId: r.id }, select: { id: true } }).catch(() => null),
      prisma.evolutionConfig.findUnique({ where: { restaurantId: r.id }, select: { id: true, isActive: true } }),
      prisma.restaurantBrandConfig.findUnique({ where: { restaurantId: r.id }, select: { googleReviewUrl: true } }),
    ]);

    snapshots.push({
      id:               r.id,
      name:             r.name,
      slug:             r.slug,
      isActive:         r.isActive,
      hasMenu:          menuCategoryCount > 0 && menuItemCount > 0,
      hasDeliveryConfig: !!deliveryConfig,
      hasPaymentConfig: !!paymentConfig,
      hasWhatsApp:      !!(evolutionConfig?.isActive),
      hasGoogleReview:  !!(brandConfig?.googleReviewUrl),
      menuCategoryCount,
      menuItemCount,
      customerCount,
      orderCount,
      deliveryUrl: r.slug ? `${appUrl}/pedido/${r.slug}` : "",
      qrUrl:       r.slug ? `${appUrl}/qr/${r.slug}` : "",
    });
  }

  return snapshots;
}

// ── Readiness score ───────────────────────────────────────────────────────────

function computeReadiness(
  env: CheckResult[],
  db: CheckResult[],
  modules: CheckResult[],
): PreflightResponse["readiness"] {
  const all = [...env, ...db, ...modules];
  const criticalFails = all.filter((c) => c.critical && c.status === "FAIL");
  const anyFail       = all.some((c) => c.status === "FAIL");
  const anyWarning    = all.some((c) => c.status === "WARNING");

  if (criticalFails.length > 0) return "BLOCKED";
  if (anyFail)                   return "BLOCKED";
  if (anyWarning)                return "READY_WITH_WARNINGS";
  return "READY";
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [envChecks, dbChecks, moduleChecks, snapshots] = await Promise.all([
      Promise.resolve(checkEnv()),
      checkDatabase(),
      checkModules(),
      buildRestaurantSnapshots(),
    ]);

    const [restaurantCount, customerCount, orderCount, campaignCount] = await Promise.all([
      prisma.restaurant.count().catch(() => 0),
      prisma.customer.count().catch(() => 0),
      prisma.order.count().catch(() => 0),
      prisma.campaign.count().catch(() => 0),
    ]);

    const readiness = computeReadiness(envChecks, dbChecks, moduleChecks);

    const response: PreflightResponse = {
      timestamp:   new Date().toISOString(),
      env:         envChecks,
      database:    dbChecks,
      modules:     moduleChecks,
      restaurants: snapshots,
      counts: { restaurants: restaurantCount, customers: customerCount, orders: orderCount, campaigns: campaignCount },
      readiness,
    };

    return NextResponse.json({ data: response });
  } catch (err) {
    console.error("[GET /api/admin/preflight]", err);
    return NextResponse.json({ error: "Erro interno ao executar preflight" }, { status: 500 });
  }
}
