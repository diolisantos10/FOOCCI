-- CRM Custom Actions
-- Stores manually-created CRM action templates by restaurant owners.
-- Actions are DRAFT-only until a future scheduling layer is built.

CREATE TABLE "crm_custom_actions" (
  "id"            TEXT         NOT NULL,
  "restaurantId"  TEXT         NOT NULL,
  "name"          TEXT         NOT NULL,
  "objective"     TEXT         NOT NULL,
  "targetSegment" TEXT         NOT NULL,
  "channel"       TEXT         NOT NULL DEFAULT 'WHATSAPP',
  "message"       TEXT         NOT NULL,
  "notes"         TEXT,
  "status"        TEXT         NOT NULL DEFAULT 'DRAFT',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "crm_custom_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_custom_actions_restaurantId_idx"        ON "crm_custom_actions"("restaurantId");
CREATE INDEX "crm_custom_actions_restaurantId_status_idx" ON "crm_custom_actions"("restaurantId", "status");

ALTER TABLE "crm_custom_actions"
  ADD CONSTRAINT "crm_custom_actions_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
