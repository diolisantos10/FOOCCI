-- Short WhatsApp menu link. Instead of sending the full identified /pedido URL
-- (a ~180-char signed waToken that looked awful in WhatsApp), the receptionist
-- sends foocci.com.br/r/<code>. /r/[code] signs a FRESH waToken on tap and
-- 302-redirects to /pedido/[slug]. One stable code per (restaurant, customer);
-- expiresAt is refreshed on every send.
CREATE TABLE "wa_menu_links" (
    "code" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wa_menu_links_pkey" PRIMARY KEY ("code")
);

CREATE UNIQUE INDEX "wa_menu_links_restaurantId_phone_key" ON "wa_menu_links"("restaurantId", "phone");

CREATE INDEX "wa_menu_links_restaurantId_idx" ON "wa_menu_links"("restaurantId");

ALTER TABLE "wa_menu_links" ADD CONSTRAINT "wa_menu_links_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
