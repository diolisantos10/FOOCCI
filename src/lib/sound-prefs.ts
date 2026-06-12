export const SOUND_PREF_KEY              = "foocci_order_sound";
export const HANDOFF_SOUND_PREF_KEY      = "handoff-sound-enabled";

export const SOUND_LAST_PLAYED_KEY       = "foocci_order_sound_last_played";
export const HANDOFF_SOUND_LAST_PLAYED_KEY = "foocci_handoff_sound_last_played";
export const SOUND_LAST_ERROR_KEY        = "foocci_order_sound_last_error";
export const HANDOFF_SOUND_LAST_ERROR_KEY  = "foocci_handoff_sound_last_error";

export function readSoundPref(key: string, defaultValue = true): boolean {
  if (typeof window === "undefined") return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? defaultValue : stored === "true";
  } catch { return defaultValue; }
}

export function writeSoundPref(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, String(value)); } catch { /* ignore */ }
}

export interface RestaurantSoundSettingsDto {
  soundEnabled:                     boolean;
  newOrderSoundEnabled:             boolean;
  humanAttentionSoundEnabled:       boolean;
  soundVolume:                      number;
  repeatNewOrderSoundUntilAccepted: boolean;
  repeatHumanAttentionUntilSeen:    boolean;
  soundTheme:                       string;
}

/**
 * Loads the restaurant sound settings from the DB-backed API.
 * Operational screens (Pedidos, Atendimento) use this as the source of truth;
 * the localStorage mirrors above are only the instant fallback before this resolves.
 * Returns null on any failure so callers keep their fallback.
 */
export async function fetchRestaurantSoundSettings(): Promise<RestaurantSoundSettingsDto | null> {
  try {
    const res = await fetch("/api/settings/sounds");
    if (!res.ok) return null;
    const json: { data?: RestaurantSoundSettingsDto } = await res.json();
    if (!json?.data || typeof json.data !== "object") return null;
    return json.data;
  } catch {
    return null;
  }
}
