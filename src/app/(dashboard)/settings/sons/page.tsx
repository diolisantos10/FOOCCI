"use client";

import { useState, useEffect, useRef } from "react";
import { PageCard, SectionHeading, Toggle } from "../_shared";
import {
  SOUND_PREF_KEY,
  HANDOFF_SOUND_PREF_KEY,
  SOUND_LAST_PLAYED_KEY,
  HANDOFF_SOUND_LAST_PLAYED_KEY,
  SOUND_LAST_ERROR_KEY,
  HANDOFF_SOUND_LAST_ERROR_KEY,
  readSoundPref,
  writeSoundPref,
} from "@/lib/sound-prefs";

const ORDER_WAV   = "/sounds/foocci-order-alert.wav";
const HANDOFF_WAV = "/sounds/foocci-handoff-alert.wav";

export default function SonsPage() {
  const [orderSound,   setOrderSound]   = useState(true);
  const [handoffSound, setHandoffSound] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [testMsg,      setTestMsg]      = useState<string | null>(null);

  // Diagnostics
  const [diag, setDiag] = useState<{
    orderLastPlayed:   string | null;
    handoffLastPlayed: string | null;
    orderLastError:    string | null;
    handoffLastError:  string | null;
  } | null>(null);

  const orderAudioRef   = useRef<HTMLAudioElement | null>(null);
  const handoffAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setOrderSound(readSoundPref(SOUND_PREF_KEY, true));
    setHandoffSound(readSoundPref(HANDOFF_SOUND_PREF_KEY, true));
    orderAudioRef.current   = new Audio(ORDER_WAV);
    handoffAudioRef.current = new Audio(HANDOFF_WAV);
    refreshDiag();
  }, []);

  function refreshDiag() {
    try {
      setDiag({
        orderLastPlayed:   localStorage.getItem(SOUND_LAST_PLAYED_KEY),
        handoffLastPlayed: localStorage.getItem(HANDOFF_SOUND_LAST_PLAYED_KEY),
        orderLastError:    localStorage.getItem(SOUND_LAST_ERROR_KEY),
        handoffLastError:  localStorage.getItem(HANDOFF_SOUND_LAST_ERROR_KEY),
      });
    } catch { /* ignore */ }
  }

  function toggleOrder(v: boolean) {
    setOrderSound(v);
    writeSoundPref(SOUND_PREF_KEY, v);
    setTestMsg(v ? "Som de pedidos ativado." : "Som de pedidos desativado.");
    setTimeout(() => setTestMsg(null), 3000);
  }

  function toggleHandoff(v: boolean) {
    setHandoffSound(v);
    writeSoundPref(HANDOFF_SOUND_PREF_KEY, v);
    setTestMsg(v ? "Som de atendimento ativado." : "Som de atendimento desativado.");
    setTimeout(() => setTestMsg(null), 3000);
  }

  async function testOrderSound() {
    setAudioBlocked(false);
    const audio = orderAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try {
      await audio.play();
      writeSoundPref(SOUND_PREF_KEY, true);
      setOrderSound(true);
      try { localStorage.setItem(SOUND_LAST_PLAYED_KEY, new Date().toISOString()); } catch { /* ignore */ }
      setTestMsg("Som de pedidos tocou com sucesso.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("not allowed")) {
        setAudioBlocked(true);
        setTestMsg("Navegador bloqueou o som — clique em 'Desbloquear som' para autorizar.");
      } else {
        setTestMsg(`Erro: ${msg}`);
      }
      try { localStorage.setItem(SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${msg}`); } catch { /* ignore */ }
    } finally {
      refreshDiag();
      setTimeout(() => setTestMsg(null), 5000);
    }
  }

  async function testHandoffSound() {
    setAudioBlocked(false);
    const audio = handoffAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try {
      await audio.play();
      writeSoundPref(HANDOFF_SOUND_PREF_KEY, true);
      setHandoffSound(true);
      try { localStorage.setItem(HANDOFF_SOUND_LAST_PLAYED_KEY, new Date().toISOString()); } catch { /* ignore */ }
      setTestMsg("Som de atendimento tocou com sucesso.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowedError") || msg.includes("not allowed")) {
        setAudioBlocked(true);
        setTestMsg("Navegador bloqueou o som — clique em 'Desbloquear som' para autorizar.");
      } else {
        setTestMsg(`Erro: ${msg}`);
      }
      try { localStorage.setItem(HANDOFF_SOUND_LAST_ERROR_KEY, `${new Date().toISOString()}: ${msg}`); } catch { /* ignore */ }
    } finally {
      refreshDiag();
      setTimeout(() => setTestMsg(null), 5000);
    }
  }

  function unlockAudio() {
    // Playing a short silent buffer satisfies browser autoplay policy
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      setAudioBlocked(false);
      setTestMsg("Som desbloqueado. Clique em Testar para confirmar.");
      setTimeout(() => setTestMsg(null), 4000);
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-5">
      {testMsg && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          {testMsg}
        </div>
      )}

      {audioBlocked && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">🔇 Navegador bloqueou o áudio</p>
          <p className="mt-1 text-xs text-red-600">
            Por segurança, os navegadores bloqueiam áudio antes da primeira interação do usuário com
            a página. Clique no botão abaixo para autorizar.
          </p>
          <button
            type="button"
            onClick={unlockAudio}
            className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 transition"
          >
            🔊 Desbloquear som
          </button>
        </div>
      )}

      {/* Order sound */}
      <PageCard>
        <SectionHeading
          title="Som de novo pedido"
          subtitle="Toca um alerta quando um pedido PENDENTE chega na tela de Pedidos."
        />
        <div className="space-y-4">
          <Toggle
            label="Ativar som de pedidos"
            desc="Alerta sonoro ao receber um novo pedido."
            checked={orderSound}
            onChange={toggleOrder}
          />
          <button
            type="button"
            onClick={() => void testOrderSound()}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            🔔 Testar som de pedido
          </button>
        </div>
      </PageCard>

      {/* Handoff sound */}
      <PageCard>
        <SectionHeading
          title="Som de atendimento humano"
          subtitle="Toca um alerta quando uma conversa entra em modo de atendimento humano (handoff)."
        />
        <div className="space-y-4">
          <Toggle
            label="Ativar som de atendimento"
            desc="Alerta sonoro quando um cliente solicita atendimento humano."
            checked={handoffSound}
            onChange={toggleHandoff}
          />
          <button
            type="button"
            onClick={() => void testHandoffSound()}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            🔔 Testar som de atendimento
          </button>
        </div>
      </PageCard>

      {/* Diagnostics */}
      <PageCard>
        <SectionHeading
          title="Diagnóstico"
          subtitle="Última atividade dos alertas sonoros neste dispositivo."
        />
        {diag ? (
          <div className="space-y-2 text-xs text-gray-500 font-mono">
            <div>
              <span className="font-semibold text-gray-700">pedido · último toque:</span>{" "}
              {diag.orderLastPlayed ?? "—"}
            </div>
            <div>
              <span className="font-semibold text-gray-700">pedido · último erro:</span>{" "}
              {diag.orderLastError ?? "—"}
            </div>
            <div>
              <span className="font-semibold text-gray-700">atendimento · último toque:</span>{" "}
              {diag.handoffLastPlayed ?? "—"}
            </div>
            <div>
              <span className="font-semibold text-gray-700">atendimento · último erro:</span>{" "}
              {diag.handoffLastError ?? "—"}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Carregando…</p>
        )}
        <button
          type="button"
          onClick={refreshDiag}
          className="mt-4 rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition"
        >
          Atualizar diagnóstico
        </button>
      </PageCard>

      {/* Note about browser policy */}
      <PageCard>
        <SectionHeading title="Sobre autoplay" />
        <p className="text-sm text-gray-600">
          Navegadores modernos (Chrome, Safari, Firefox) bloqueiam áudio automático até que o
          usuário interaja com a página. Se os sons pararem de funcionar após recarregar, clique em
          <strong> Testar som de pedido</strong> ou <strong>Testar som de atendimento</strong> uma
          vez para reautorizar. Os botões de mudo rápido (🔕) nas telas de Pedidos e Atendimento
          também controlam esses sons individualmente.
        </p>
      </PageCard>
    </div>
  );
}
