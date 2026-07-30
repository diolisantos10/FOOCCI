"use client";

/**
 * SoundStatusChip — the one-tap sound control, living INSIDE the TopBar white
 * strip on every screen (owner's request 2026-07-30: "aparecer nesse lugar",
 * pointing at the header — not a balloon floating in a corner over the account
 * cluster, and not a banner across the middle of the content).
 *
 * Three quiet states, never over content:
 *   • sound turned OFF in Configurações → muted 🔕, links to the sound settings.
 *   • not yet enabled on this browser → brand "🔔 Ativar som" with a soft pulse;
 *     one tap arms audio for the session AND remembers the choice (localStorage),
 *     so it never nags again on reload ("apertar uma vez e ficar configurado").
 *   • already enabled/armed → discreet 🔔 "Som ativo", a shortcut to the settings.
 *
 * Arming the real <audio> elements is still done app-wide by GlobalAlertEngine on
 * the first genuine gesture; this chip only gives that gesture a home and a status.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAudioArmed, isAudioOptedIn, subscribeAudioArmed, markAudioArmed } from "@/lib/audio-gate";
import { resumeSharedAudioContext } from "@/lib/sound-player";
import { fetchRestaurantSoundSettings } from "@/lib/sound-prefs";

const BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2";

export function SoundStatusChip() {
  // Assume enabled/armed on first paint so there is never an SSR flash of the
  // brand "Ativar som" chip before we learn the real state on the client.
  const [armed, setArmed]     = useState(true);
  const [optedIn, setOptedIn] = useState(true);
  const [soundOn, setSoundOn] = useState(true);

  // Reflect the arming gate + the persisted opt-in.
  useEffect(() => {
    const sync = () => { setArmed(isAudioArmed()); setOptedIn(isAudioOptedIn()); };
    sync();
    // Already opted in on this browser? Wake the shared audio context now so the
    // next gesture (or a high-engagement browser) rings without ever nagging.
    if (isAudioOptedIn()) void resumeSharedAudioContext();
    return subscribeAudioArmed(sync);
  }, []);

  // Is any alert sound enabled? Re-read on every save from Configurações → Sons.
  useEffect(() => {
    const load = () => {
      void fetchRestaurantSoundSettings().then((s) => {
        setSoundOn(s ? Boolean(s.soundEnabled && (s.newOrderSoundEnabled || s.humanAttentionSoundEnabled)) : true);
      });
    };
    load();
    window.addEventListener("foocci:sound-settings-changed", load);
    return () => window.removeEventListener("foocci:sound-settings-changed", load);
  }, []);

  // ── State 1: sound fully disabled in settings → muted shortcut ───────────────
  if (!soundOn) {
    return (
      <Link
        href="/settings/sons"
        title="Sons desativados — clique para configurar"
        className={`${BASE} border border-transparent font-medium text-muted hover:bg-[#F4F4F2] hover:text-ink focus-visible:ring-brand-300`}
      >
        <span aria-hidden>🔕</span>
        <span className="hidden sm:inline">Sons off</span>
      </Link>
    );
  }

  // ── State 2: already enabled on this browser → discreet status/shortcut ──────
  if (armed || optedIn) {
    return (
      <Link
        href="/settings/sons"
        title="Som dos alertas ativo — clique para configurar"
        className={`${BASE} border border-transparent font-medium text-muted hover:bg-[#F4F4F2] hover:text-ink focus-visible:ring-brand-300`}
      >
        <span aria-hidden>🔔</span>
        <span className="hidden sm:inline">Som ativo</span>
      </Link>
    );
  }

  // ── State 3: not yet enabled → the one-tap arm (brand, gentle pulse) ─────────
  const arm = () => {
    void resumeSharedAudioContext();
    markAudioArmed();
    setArmed(true);
    setOptedIn(true);
  };
  return (
    <button
      type="button"
      onClick={arm}
      title="Ativar o som dos alertas de pedido"
      className={`${BASE} border border-brand-600 bg-brand-500 font-semibold text-white shadow-sm hover:bg-brand-600 focus-visible:ring-brand-300`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
      <span aria-hidden>🔔</span>
      {/* Label spelled out from tablet up; on the tight phone bar the pulsing brand
          bell is the whole affordance, so it never overlaps the account cluster. */}
      <span className="hidden sm:inline">Ativar som</span>
    </button>
  );
}
