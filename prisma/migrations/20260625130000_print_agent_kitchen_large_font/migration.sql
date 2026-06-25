-- Opt-in ESC/POS double-height ("letras grandes") on kitchen comandas. OFF by
-- default so nothing changes unless the restaurant enables it and confirms the
-- printer accepts raw ESC/POS control codes.

ALTER TABLE "print_agents" ADD COLUMN "kitchenLargeFont" BOOLEAN NOT NULL DEFAULT false;
