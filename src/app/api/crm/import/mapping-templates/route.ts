import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import { ColumnMapping, validateMapping } from "@/services/crm/UniversalFieldMapper";

// GET /api/crm/import/mapping-templates — list templates for the restaurant
export async function GET(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.importMappingTemplate.findMany({
    where:   { restaurantId: ctx.restaurantId },
    orderBy: { updatedAt: "desc" },
    select:  { id: true, name: true, sourceSystem: true, importType: true, mappings: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json({ templates });
}

// POST /api/crm/import/mapping-templates — create a new template
export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const { name, sourceSystem, importType, mappings } = body as {
    name:         string;
    sourceSystem?: string;
    importType?:   string;
    mappings:      ColumnMapping[];
  };

  if (!name?.trim()) {
    return NextResponse.json({ error: "Nome do template é obrigatório" }, { status: 400 });
  }

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json({ error: "Mapeamentos são obrigatórios" }, { status: 400 });
  }

  const resolvedType = (importType ?? "customers") as "customers" | "products" | "generic";
  const validation = validateMapping(mappings, resolvedType);
  if (!validation.valid) {
    return NextResponse.json({ error: "Mapeamento inválido", details: validation.errors }, { status: 422 });
  }

  const template = await prisma.importMappingTemplate.create({
    data: {
      restaurantId: ctx.restaurantId,
      name:         name.trim(),
      sourceSystem: sourceSystem ?? "GENERIC",
      importType:   resolvedType,
      mappings:     mappings as object[],
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
