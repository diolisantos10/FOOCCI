-- Add returnPlatform to meta_oauth_states so the OAuth callback knows
-- which integration page to redirect to (instagram or facebook).
ALTER TABLE "meta_oauth_states" ADD COLUMN "returnPlatform" TEXT;
