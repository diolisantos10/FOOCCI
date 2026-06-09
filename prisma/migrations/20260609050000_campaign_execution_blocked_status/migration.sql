-- Separate safety BLOCKS from real send FAILURES (ADDITIVE ONLY).
-- New ExecutionStatus values: BLOCKED (safety block — not a failure) and SKIPPED
-- (not attempted this run). Existing FAILED rows are unchanged; the app
-- classifies legacy rows by reason text. No data is rewritten here.

ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
ALTER TYPE "ExecutionStatus" ADD VALUE IF NOT EXISTS 'SKIPPED';
