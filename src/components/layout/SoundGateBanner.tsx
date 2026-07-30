"use client";

/**
 * SoundGateBanner — the one-tap "ativar som" prompt.
 *
 * Browsers refuse to play ANY sound until the user interacts with the page once.
 * That single gesture is the whole ballgame for order alerts. Instead of making
 * the owner remember to open Configurações and press "Testar" every morning
 * (their words: "não tem como ir na integração testar todo dia"), this bar comes
 * to THEM: it appears on whatever screen they're on the moment audio isn't armed,
 * and a single tap arms it for the ENTIRE session — then it disappears.
 *
 * This is NOT the old floating "Silenciar alarme" balloon (that stays gone, and
 * lives on a different component that still renders nothing). This one ENABLES
 * sound, never rings, and self-dismisses on the first interaction anywhere —
 * including a tap on itself. Mounted once in the dashboard shell, sibling to
 * GlobalAlertEngine.
 */

import { useEffect, useState } from "react";
import { isAudioArmed, subscribeAudioArmed, markAudioArmed } from "@/lib/audio-gate";
import { resumeSharedAudioContext } from "@/lib/sound-player";
import { fetchRestaurantSoundSettings } from "@/lib/sound-prefs";

export function SoundGateBanner() {
  // Assume armed until we learn otherwise, so there is never an SSR/first-paint flash.
  const [armed, setArmed] = useState(true);
  // Sound is ON by default (matches the app defaults), so a slow or failed settings
  // fetch never suppresses the prompt when it's most needed. The fetch only corrects
  // it DOWN if the restaurant actually turned every alert off.
  const [soundOn, setSoundOn] = useState(true);
  const [show, setShow] = useState(false);

  // Reflect the arming gate (flipped by any first gesture, or a successful play).
  useEffect(() => {
    setArmed(isAudioArmed());
    return subscribeAudioArmed(() => setArmed(isAudioArmed()));
  }, []);

  // Is any alert sound enabled? Re-read on every save from Configurações → Sons.
  useEffect(() => {
    const load = () => {
      void fetchRestaurantSoundSettings().then((s) => {
        setSoundOn(Boolean(s && s.soundEnabled && (s.newOrderSoundEnabled || s.humanAttentionSoundEnabled)));
      });
    };
    load();
    window.addEventListener("foocci:sound-settings-changed", load);
    return () => window.removeEventListener("foocci:sound-settings-changed", load);
  }, []);

  // Reveal only after a short beat, so someone who clicks something right away
  // (which arms audio) never even sees a flash of the bar.
  useEffect(() => {
    if (armed || !soundOn) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), 900);
    return () => clearTimeout(t);
  }, [armed, soundOn]);

  if (!show || armed || !soundOn) return null;

  // The tap itself is a user gesture: GlobalAlertEngine's capture-phase arming
  // listener fires first and unlocks the real audio elements; we also resume the
  // shared context and flip the gate here so the bar hides immediately.
  const arm = () => {
    void resumeSharedAudioContext();
    markAudioArmed();
  };

  // Chip pequeno, colado no canto superior direito (dentro da faixa do topo) —
  // não uma faixa no meio da tela por cima do conteúdo. Some no 1º toque/clique.
  return (
    <div className="pointer-events-none fixed right-3 top-2.5 z-[60]">
      <button
        type="button"
        onClick={arm}
        title="Ativar o som dos alertas de pedido"
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md transition hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
      >
        <span aria-hidden>🔔</span>
        Ativar som
      </button>
    </div>
  );
}
