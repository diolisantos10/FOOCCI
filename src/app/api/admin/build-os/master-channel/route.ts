/**
 * GET /api/admin/build-os/master-channel
 *
 * Estado do canal WhatsApp Master/Admin do Build OS. **Somente leitura.**
 *
 * ⚠️ MUDOU EM 04/08/2026. Esta rota tinha GET/PUT/PATCH/DELETE e provisionava uma
 * instância Evolution do Admin: gravava baseUrl e apiKey criptografada, criava a
 * instância, sincronizava webhook, gerava QR e resetava a sessão. A Evolution foi
 * eliminada do Foocci por ordem do CEO. Na Meta não existe instância, servidor
 * próprio nem QR: o número é registrado dentro do aplicativo da Meta (trabalho do
 * especialista `meta`) e vira um `phone_number_id`.
 *
 * Sobrou o que ainda faz sentido: dizer se o canal está pronto. As credenciais
 * moram no ambiente (Railway) e **nenhum segredo sai daqui** — só presença
 * (sim/não) e os 4 últimos dígitos do phone_number_id, que não é segredo.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { describeBuildOsMetaChannel } from "@/services/buildos/BuildOsMetaChannel";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint desabilitado — ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Não autorizado." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, status: describeBuildOsMetaChannel() });
}
