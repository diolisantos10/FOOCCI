-- Migration: add_waiter_prompt
-- Adds waiterPrompt (TEXT, nullable) to restaurant_brand_configs.
-- This field stores free-text instructions for the Waiter Agent,
-- injected into the system prompt after all hard rules.

ALTER TABLE "restaurant_brand_configs" ADD COLUMN "waiterPrompt" TEXT;
