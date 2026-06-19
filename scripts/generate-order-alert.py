#!/usr/bin/env python3
"""
Generate a loud, normalized, attention-grabbing NEW ORDER alert sound.

Why this exists
---------------
The original `foocci-order-alert` asset is a single 0.35 s blip that peaks at
~68% of full scale (RMS ~ -8.7 dBFS). Even with Web Audio gain it cannot get
loud enough for a noisy restaurant kitchen. This script synthesizes a sharp,
bright, three-pulse alert that is already loud at 100% volume:

  * dual-tone (perfect fifth) in the 1.1-1.8 kHz band — the region where small
    phone/tablet speakers are most efficient and where human hearing is most
    sensitive, so it cuts through kitchen noise;
  * soft-clipped (tanh) to add harmonics and raise RMS (perceived loudness)
    without harsh digital clipping;
  * peak-normalized to 0.97 full scale;
  * three pulses with a short rising urgency, ~1.05 s total.

Pure Python stdlib (no numpy / ffmpeg required). Outputs a 16-bit mono WAV.

Usage:  python3 scripts/generate-order-alert.py
Output: public/sounds/foocci-order-alert-loud.wav
"""

import math
import os
import struct
import wave

SAMPLE_RATE = 44100
OUT_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "public", "sounds", "foocci-order-alert-loud.wav",
)

# Three pulses, each a blend of two tones (a perfect fifth) plus a 2nd harmonic
# for edge. Frequencies climb slightly to convey urgency.
PULSES = [
    {"f1": 1175.0, "f2": 1760.0, "dur": 0.16, "gap": 0.10},  # D6 + A6
    {"f1": 1318.0, "f2": 1975.0, "dur": 0.16, "gap": 0.10},  # E6 + B6
    {"f1": 1480.0, "f2": 2217.0, "dur": 0.22, "gap": 0.00},  # F#6 + C#7 (held)
]

ATTACK = 0.005   # 5 ms fast attack — sharp onset
RELEASE = 0.035  # 35 ms release — clean tail, no overlap
DRIVE = 2.4      # soft-clip drive — higher = more harmonics / louder RMS
PEAK = 0.97      # target peak (full scale = 1.0)


def envelope(t: float, dur: float) -> float:
    """Fast-attack / sustain / short-release amplitude envelope."""
    if t < ATTACK:
        return t / ATTACK
    if t > dur - RELEASE:
        return max(0.0, (dur - t) / RELEASE)
    return 1.0


def soft_clip(x: float) -> float:
    """tanh saturation — adds harmonics and lifts perceived loudness."""
    return math.tanh(DRIVE * x)


def render() -> list[float]:
    samples: list[float] = []
    for p in PULSES:
        n = int(p["dur"] * SAMPLE_RATE)
        for i in range(n):
            t = i / SAMPLE_RATE
            env = envelope(t, p["dur"])
            base = (
                0.62 * math.sin(2 * math.pi * p["f1"] * t)
                + 0.62 * math.sin(2 * math.pi * p["f2"] * t)
                + 0.18 * math.sin(2 * math.pi * (2 * p["f1"]) * t)
            )
            samples.append(soft_clip(base) * env)
        gap = int(p["gap"] * SAMPLE_RATE)
        samples.extend(0.0 for _ in range(gap))
    return samples


def normalize(samples: list[float], peak: float) -> list[float]:
    hi = max((abs(s) for s in samples), default=0.0)
    if hi == 0.0:
        return samples
    g = peak / hi
    return [s * g for s in samples]


def write_wav(path: str, samples: list[float]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            v = max(-1.0, min(1.0, s))
            frames += struct.pack("<h", int(v * 32767))
        w.writeframes(bytes(frames))


def main() -> None:
    samples = normalize(render(), PEAK)
    write_wav(OUT_PATH, samples)
    # Report loudness so the result is verifiable.
    peak = max(abs(s) for s in samples)
    rms = math.sqrt(sum(s * s for s in samples) / len(samples))
    dur = len(samples) / SAMPLE_RATE
    print(f"wrote {OUT_PATH}")
    print(
        f"duration={dur:.2f}s peak={peak * 100:.1f}% "
        f"rms={20 * math.log10(rms + 1e-9):.1f} dBFS samples={len(samples)}"
    )


if __name__ == "__main__":
    main()
