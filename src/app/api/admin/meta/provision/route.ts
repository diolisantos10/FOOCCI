/**
 * POST /api/admin/meta/provision — admin-only. Provision a NEW phone number on the
 * SAME WABA as an existing restaurant config, without touching the current number.
 *
 * Uses the WABA-wide access token stored for `restaurantId`. Actions:
 *   { action: "add",          restaurantId, cc, phoneNumber, verifiedName? }  → new phone_number_id
 *   { action: "request-code", restaurantId, phoneNumberId, method? }          → SMS/VOICE code sent
 *   { action: "verify-code",  restaurantId, phoneNumberId, code }             → verifies the number
 *   { action: "status",       restaurantId, phoneNumberId }                   → live phone fields
 *
 * Registering + repointing the config to the new number is done via the existing
 * /api/admin/meta/register endpoint (phoneNumberId + pin). Read-only of secrets.
 */

import { NextRequest } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, serverError } from "@/lib/api-response";
import { MetaConfigService } from "@/services/whatsapp/MetaConfigService";
import { metaGraphUrl } from "@/services/whatsapp/metaFlag";
import {
  addPhoneNumberToWaba, requestVerificationCode, verifyPhoneCode, deletePhoneNumberFromWaba,
} from "@/services/whatsapp/MetaOnboardingService";
import { diagnoseProvisionError } from "@/services/whatsapp/metaProvisionDiagnostics";

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string; restaurantId?: string; cc?: string; phoneNumber?: string;
      verifiedName?: string; phoneNumberId?: string; method?: "SMS" | "VOICE"; code?: string;
    };
    if (!body.restaurantId) return badRequest("restaurantId é obrigatório.");

    const cfg = await MetaConfigService.getResolved(body.restaurantId);
    if (!cfg) return badRequest("Sem config Meta para este restaurante.");
    const token = cfg.accessToken;

    switch (body.action) {
      case "add": {
        const cc = (body.cc ?? "").replace(/\D/g, "");
        const phoneNumber = (body.phoneNumber ?? "").replace(/\D/g, "");
        if (!cc || !phoneNumber) return badRequest("Informe cc e phoneNumber (somente dígitos).");
        // O `verifiedName` é o NOME QUE O CLIENTE FINAL VÊ no WhatsApp, e mudá-lo
        // depois passa por revisão da Meta. Havia aqui um default fixo — "Sushi Cazza" —
        // que carimbaria o nome de um restaurante em qualquer número novo provisionado,
        // inclusive num número comercial da própria Foocci. Um default errado neste
        // campo é caro e demorado de desfazer: agora ele é obrigatório e explícito.
        const verifiedName = body.verifiedName?.trim();
        if (!verifiedName) {
          return badRequest(
            "Informe verifiedName — é o nome que aparece para quem receber a mensagem."
            + " Não existe padrão seguro aqui: trocá-lo depois exige revisão da Meta.",
          );
        }
        const r = await addPhoneNumberToWaba(token, cfg.wabaId, cc, phoneNumber, verifiedName);
        return ok({ ...r, diagnostico: r.ok ? null : diagnoseProvisionError(r.raw) });
      }
      case "delete": {
        if (!body.phoneNumberId) return badRequest("phoneNumberId é obrigatório.");
        // Guard: never delete the restaurant's live number via this path.
        if (body.phoneNumberId === cfg.phoneNumberId) {
          return badRequest("Recusado: esse é o número ativo do restaurante. Não vou removê-lo por aqui.");
        }
        const r = await deletePhoneNumberFromWaba(token, body.phoneNumberId);
        return ok(r);
      }
      case "request-code": {
        if (!body.phoneNumberId) return badRequest("phoneNumberId é obrigatório.");
        const r = await requestVerificationCode(token, body.phoneNumberId, body.method ?? "SMS");
        return ok({ ...r, diagnostico: r.ok ? null : diagnoseProvisionError(r.raw) });
      }
      case "verify-code": {
        if (!body.phoneNumberId || !body.code) return badRequest("phoneNumberId e code são obrigatórios.");
        const r = await verifyPhoneCode(token, body.phoneNumberId, body.code.replace(/\D/g, ""));
        return ok({ ...r, diagnostico: r.ok ? null : diagnoseProvisionError(r.raw) });
      }
      case "status": {
        if (!body.phoneNumberId) return badRequest("phoneNumberId é obrigatório.");
        const res = await fetch(
          metaGraphUrl(`${body.phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,platform_type,name_status,account_mode,quality_rating`),
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = await res.json().catch(() => ({}));
        return ok({ phone: json });
      }
      default:
        return badRequest("action inválida (use add | delete | request-code | verify-code | status).");
    }
  } catch (err) {
    console.error("[POST /api/admin/meta/provision]", err);
    return serverError();
  }
}
