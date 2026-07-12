-- Cash change ("troco para quanto?"): the bill/note the customer will pay with
-- when paying in cash. null = exact change / not a cash order. The cashier ticket
-- prints "Troco para" + "Levar troco" (changeFor - total) so the caixa is ready.
ALTER TABLE "payments" ADD COLUMN "changeFor" DECIMAL(10,2);
