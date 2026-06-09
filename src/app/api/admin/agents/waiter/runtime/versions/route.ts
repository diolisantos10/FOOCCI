/**
 * GET  /api/admin/agents/waiter/runtime/versions?agentSlug=waiter&restaurantId=...
 *      Lists versions for a scope + the currently ACTIVE one.
 * POST /api/admin/agents/waiter/runtime/versions
 *      Creates a DRAFT version. Body: { name, description?, mode?, libraryEnabled?,
 *      maxTechniques?, restaurantId?, techniqueIds?, createdBy? }
 *
 * Auth: admin only. Creating a draft NEVER affects a customer (bridge reads ACTIVE only).
 */

import { NextRequest, NextResponse } from "next/server";
import { guardAdmin } from "../_guard";
import { listVersions, getActiveVersion, createDraft } from "@/services/waiterRuntime/WaiterRuntimeVersionService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const agentSlug = url.searchParams.get("agentSlug") ?? "waiter";
  const restaurantIdParam = url.searchParams.get("restaurantId");
  const restaurantId = restaurantIdParam === null ? undefined : restaurantIdParam || null;

  try {
    const [versions, active] = await Promise.all([
      listVersions({ agentSlug, restaurantId }),
      getActiveVersion({ agentSlug, restaurantId: restaurantId ?? null }),
    ]);
    return NextResponse.json({ ok: true, versions, active });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao listar versões.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = guardAdmin(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ ok: false, error: "name é obrigatório." }, { status: 400 });

  try {
    const version = await createDraft({
      name,
      description: typeof body.description === "string" ? body.description : null,
      mode: body.mode === "LIBRARY_ASSISTED" ? "LIBRARY_ASSISTED" : "CURRENT",
      libraryEnabled: typeof body.libraryEnabled === "boolean" ? body.libraryEnabled : undefined,
      maxTechniques: typeof body.maxTechniques === "number" ? body.maxTechniques : undefined,
      restaurantId: typeof body.restaurantId === "string" ? body.restaurantId : null,
      techniqueIds: Array.isArray(body.techniqueIds) ? body.techniqueIds.filter((x): x is string => typeof x === "string") : undefined,
      createdBy: typeof body.createdBy === "string" ? body.createdBy : null,
    });
    return NextResponse.json({ ok: true, version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao criar versão.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
