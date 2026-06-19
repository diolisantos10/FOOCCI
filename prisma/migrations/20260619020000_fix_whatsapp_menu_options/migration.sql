-- Fix WhatsApp main menu options to match the approved 7-option menu.
-- Replaces the old 6-option menu (Cardápio. Faça seu pedido. / Rodízio Presencial /
-- Horário / Redes Sociais / Cazza Club / Atendente) with the approved sequence:
-- 1 Já sei o que quero pedir  (text_order)
-- 2 Ver cardápio               (menu)
-- ── separator ──
-- 3 Rodízio presencial         (rodizio)
-- 4 Horário de funcionamento   (custom)
-- 5 Promoções                  (promotions)
-- 6 Cazza Club                 (club)
-- 7 Falar com atendente        (handoff)
--
-- Targets only the restaurant with slug = 'sushi-cazza'.
-- No-op for all other restaurants.

UPDATE "whatsapp_agent_configs" wac
SET    "menuOptions" = '[
  {"id":"opt-text-order","label":"Já sei o que quero pedir","flow":"text_order"},
  {"id":"opt-menu",      "label":"Ver cardápio",             "flow":"menu"},
  {"id":"opt-rodizio",   "label":"Rodízio presencial",       "flow":"rodizio"},
  {"id":"opt-hours",     "label":"Horário de funcionamento", "flow":"custom"},
  {"id":"opt-promo",     "label":"Promoções",                "flow":"promotions"},
  {"id":"opt-club",      "label":"Cazza Club",               "flow":"club"},
  {"id":"opt-handoff",   "label":"Falar com atendente",      "flow":"handoff"}
]'::jsonb
WHERE  wac."restaurantId" = (
  SELECT id FROM "restaurants" WHERE slug = 'sushi-cazza' LIMIT 1
);
