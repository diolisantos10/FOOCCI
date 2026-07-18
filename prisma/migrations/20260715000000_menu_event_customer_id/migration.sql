-- A menu visit only counts for the conversion KPI once the visitor is IDENTIFIED
-- (passed the mandatory phone screen, or arrived already identified). Store the
-- customerId on the event; anonymous opens leave it null and do not count.
ALTER TABLE "menu_events" ADD COLUMN "customerId" TEXT;
CREATE INDEX "menu_events_restaurantId_customerId_idx" ON "menu_events"("restaurantId", "customerId");
