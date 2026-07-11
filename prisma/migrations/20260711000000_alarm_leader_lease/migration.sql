-- Cross-device alarm leader lease: only one device (across ALL open browsers/
-- computers for a restaurant, not just tabs within one browser) may play the
-- new-order / human-attention alarm at a time. See AlarmLeaderService.
ALTER TABLE "restaurant_sound_settings" ADD COLUMN "alarmLeaderDeviceId" TEXT;
ALTER TABLE "restaurant_sound_settings" ADD COLUMN "alarmLeaderHeartbeatAt" TIMESTAMP(3);
