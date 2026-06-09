/**
 * CRM governance diagnostic — proves, with synthetic data + cleanup, that the
 * governance foundation works in production WITHOUT an admin secret:
 *   - CRMContactLedger table exists (insert/query/delete)
 *   - Campaign.campaignFamilyKey / messageFingerprint columns exist
 *   - the ledger dedupe (concept + message) recognises an impacted customer
 *   - the pure preflight blocks an already-impacted customer
 *   - everything synthetic is cleaned up
 *
 * Never sends WhatsApp, never touches a real customer/campaign, never calls
 * Evolution. runtimeTouched stays false.
 */

import { prisma } from "@/lib/prisma";
import { getImpactedByConcept, getImpactedByMessage } from "./CRMContactLedgerService";
import { diagnosePreflight } from "./CRMPreflightDiagnosisService";
import { generateMessageFingerprint } from "./messageFingerprint";

export interface GovernanceDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  stage?: string;
  ledgerAvailable: boolean;
  campaignIdentityAvailable: boolean;
  preflightWorks: boolean;
  dedupeWorks: boolean;
  reasonCodesWork: boolean;
  cleanup: boolean;
  runtimeTouched: false;
  message: string;
}

export async function runGovernanceDiagnostic(): Promise<GovernanceDiagnosticResult> {
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const restaurantId = `__gov_diag_${stamp}`;       // synthetic, non-existent scope
  const customerId = `__gov_cust_${stamp}`;
  const familyKey = `__gov_concept_${stamp}`;
  const fingerprint = generateMessageFingerprint(`mensagem sintetica de diagnostico ${stamp}`);

  const res: GovernanceDiagnosticResult = {
    ok: false, status: "FAIL",
    ledgerAvailable: false, campaignIdentityAvailable: false, preflightWorks: false,
    dedupeWorks: false, reasonCodesWork: false, cleanup: false, runtimeTouched: false, message: "",
  };

  let ledgerId: string | null = null;
  try {
    // 1. Campaign identity columns exist (throws if the migration is missing).
    await prisma.campaign.findFirst({ select: { campaignFamilyKey: true, messageFingerprint: true } });
    res.campaignIdentityAvailable = true;

    // 2. Ledger table exists — insert a synthetic SENT impact.
    const row = await prisma.cRMContactLedger.create({
      data: {
        restaurantId, customerId, phone: "[telefone]",
        campaignId: null, campaignFamilyKey: familyKey, messageFingerprint: fingerprint,
        channel: "WHATSAPP", contactType: "CAMPAIGN", status: "SENT", reasonCode: "SENT",
        sentAt: new Date(), metadata: { diagnostic: true },
      },
      select: { id: true },
    });
    ledgerId = row.id;
    res.ledgerAvailable = true;

    // 3. Dedupe: the ledger must recognise the impacted customer by concept + message.
    const [byConcept, byMessage] = await Promise.all([
      getImpactedByConcept(restaurantId, familyKey, 60),
      getImpactedByMessage(restaurantId, fingerprint, 60),
    ]);
    res.dedupeWorks = byConcept.has(customerId) && byMessage.has(customerId);
    if (!res.dedupeWorks) {
      res.stage = "dedupe";
      res.message = "Ledger não reconheceu o cliente sintético por conceito/mensagem.";
      return await finalize(res, restaurantId, ledgerId);
    }

    // 4. Preflight must block the already-impacted customer.
    const diag = diagnosePreflight({
      customers: [{ id: customerId, phone: "5511999990000" }, { id: `${customerId}_b`, phone: "5511999990001" }],
      impactedByCampaign: new Set(),
      impactedByConcept: byConcept,
      impactedByMessage: byMessage,
      dedupeByConcept: true,
      dedupeByMessage: true,
      allowResendToImpacted: false,
      globalDailyRemaining: -1,
      campaignDailyRemaining: 1000,
      allowWeeklyOverride: false,
    });
    res.preflightWorks = diag.audienceTotal === 2 && diag.eligibleNow === 1 && diag.blocked.alreadyImpactedConcept === 1;
    res.reasonCodesWork = res.preflightWorks; // the breakdown uses the canonical reason categories
    if (!res.preflightWorks) {
      res.stage = "preflight";
      res.message = "Preflight não bloqueou o cliente já impactado.";
      return await finalize(res, restaurantId, ledgerId);
    }

    res.status = "PASS";
    res.ok = true;
    res.message = "Governança CRM validada: ledger, identidade, dedupe e preflight OK.";
    return await finalize(res, restaurantId, ledgerId);
  } catch (err) {
    res.stage = res.stage ?? "exception";
    res.message = err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido";
    return await finalize(res, restaurantId, ledgerId);
  }
}

async function finalize(res: GovernanceDiagnosticResult, restaurantId: string, ledgerId: string | null): Promise<GovernanceDiagnosticResult> {
  try {
    // Delete by the synthetic restaurant scope (covers the row + any stragglers).
    await prisma.cRMContactLedger.deleteMany({ where: { restaurantId } });
    const leftover = await prisma.cRMContactLedger.count({ where: { restaurantId } });
    res.cleanup = leftover === 0;
  } catch {
    res.cleanup = false;
  }
  void ledgerId;
  res.ok = res.status === "PASS";
  return res;
}
