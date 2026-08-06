/**
 * GET /api/admin/restaurants/inventario — o inventário, antes de qualquer exclusão.
 *
 * SOMENTE LEITURA. Nenhum caminho desta rota escreve, atualiza ou apaga.
 *
 * Responde, por restaurante, a única pergunta que autoriza (ou proíbe) um caminho
 * sem volta: **este restaurante já viveu?** Base grande com zero pedido é
 * importação de teste; base com pedido recente é gente de verdade.
 *
 * ⚠️ A SAÍDA DESTA ROTA É CONSUMIDA POR FERRAMENTA COM LOG PÚBLICO.
 * Só saem contagens, datas e o slug. Nome de cliente, telefone, endereço e conteúdo
 * de conversa NUNCA passam por aqui — a projeção segura vive em
 * `RestaurantPurgeService.levantarInventario()` e é ela que decide o que existe.
 *
 * Auth: x-admin-secret OU cookie de sessão admin. Desligada sem ADMIN_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { levantarInventario } from "@/services/restaurant/RestaurantPurgeService";
import { SLUGS_PROTEGIDOS } from "@/services/restaurant/restaurantPurgeMap";

export async function GET(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json(
      { error: "Endpoint desligado — ADMIN_SECRET não configurado." },
      { status: 403 },
    );
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const linhas = await levantarInventario();

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    protegidos: SLUGS_PROTEGIDOS,
    total: linhas.length,
    resumo: {
      vivos: linhas.filter((l) => l.veredito === "VIVO").length,
      jaViveram: linhas.filter((l) => l.veredito === "JA_VIVEU").length,
      nuncaViveram: linhas.filter((l) => l.veredito === "NUNCA_VIVEU").length,
    },
    restaurantes: linhas,
  });
}
