/**
 * BrainEvidenceContract — proofs VALIDATE the Brain.
 *
 * Every business result attributed to an agent (sale, upsell, recovery, praise)
 * becomes documented, sanitized evidence — DRAFT until a human approves; public/
 * commercial use requires approval + explicit public flag. The Waiter's
 * WaiterResultEvidence is the v1 reference implementation.
 */

export type BrainEvidenceType =
  | "SALE_CONVERSION"
  | "UPSELL"
  | "RECOVERY"
  | "FRICTION_REDUCTION"
  | "QUALITATIVE_PROOF"
  | "BEFORE_AFTER";

export type BrainEvidenceStatus = "DRAFT" | "APPROVED" | "REJECTED" | "BACKLOG";
export type BrainEvidenceConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface BrainEvidence {
  id: string;
  businessId: string;
  agentId: string;
  evidenceType: BrainEvidenceType;
  status: BrainEvidenceStatus;
  title: string;
  summary: string;
  /** ALWAYS sanitized before persisting — never raw PII. */
  sanitizedExcerpt?: string | null;
  orderValue?: number | null;
  incrementalValue?: number | null;
  confidence?: BrainEvidenceConfidence | null;
  isPublicCandidate: boolean;
}

/** Iron rule: public/commercial use needs BOTH human approval AND the flag. */
export function canUseCommercially(e: Pick<BrainEvidence, "status" | "isPublicCandidate">): boolean {
  return e.status === "APPROVED" && e.isPublicCandidate === true;
}
