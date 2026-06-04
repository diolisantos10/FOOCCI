-- ════════════════════════════════════════════════════════════════════════════
--  Build OS — store the full sender phone on the webhook trace, SERVER-SIDE ONLY.
--  Additive only. Lets the admin authorize an unauthorized /build sender by
--  traceId (the backend recovers the real phone) without the full number ever
--  being exposed to the browser. The UI continues to show only `maskedPhone`.
-- ════════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "build_webhook_traces" ADD COLUMN "rawPhone" TEXT;
