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
