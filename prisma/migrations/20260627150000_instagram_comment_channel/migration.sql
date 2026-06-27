-- Instagram post comments arrive on a separate channel from DMs so the Central
-- can label and route them (public comment replies, not the messaging API).
ALTER TYPE "Channel" ADD VALUE 'INSTAGRAM_COMMENT';
