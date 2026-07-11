-- Persistent human-attention alarm acknowledgement.
-- When an operator clicks "Estou ciente" / "Silenciar" the ack is stored here so
-- the app-wide alarm (GlobalAlertEngine, which runs on every page) stays silent
-- for this conversation across ALL pages and ALL devices — not only in the tab
-- that currently has Atendimento open. Cleared on a fresh handoff so a genuinely
-- new human request rings again. Nullable, additive: fast, non-locking.
ALTER TABLE "conversations" ADD COLUMN "handoffAlarmAckAt" TIMESTAMP(3);
