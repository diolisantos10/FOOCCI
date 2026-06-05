-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — deactivate the WhatsApp Business number (+55 11 98940-0692) as a
--  Build OS operator. It is NOT the current command operator (Diego/CEO
--  +55 11 94059-5223 is). Admin-safe + idempotent: ONLY flips isActive=false for
--  that number (and its 9th-digit variant). Does NOT delete the row and does NOT
--  touch any other operator. The CEO operator stays active.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE "build_authorized_senders"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "phone" IN ('+5511989400692', '+551189400692')
  AND "isActive" = true;
