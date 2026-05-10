#!/usr/bin/env python3
"""
Synthesize the pushr notification sound palette.

Pure stdlib additive synthesis — sine fundamentals stacked with a few
harmonics and shaped by a Hann-style attack + exponential release. Original
audio, no licensing baggage.

Run:
    python3 mobile/scripts/synth-sounds.py
    # then convert WAV -> CAF (Apple's notification format):
    for f in mobile/assets/sounds/*.wav; do
      afconvert -f caff -d ima4 "$f" "${f%.wav}.caf"
    done
    rm mobile/assets/sounds/*.wav

Tweak frequencies / durations / harmonic mix below to taste, re-run.
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Dict, List, Optional, Tuple

SAMPLE_RATE = 44100
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "sounds"


def write_wav(path: Path, samples: list[float]) -> None:
    pcm = bytearray()
    for s in samples:
        if s > 1.0:
            s = 1.0
        elif s < -1.0:
            s = -1.0
        pcm += struct.pack("<h", int(s * 32767))
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(bytes(pcm))


def envelope(n_samples: int, attack_ms: float, release_ms: float) -> list[float]:
    """Linear attack into exponential release. Click-free at both ends."""
    attack = int(attack_ms * SAMPLE_RATE / 1000)
    release_start = max(0, n_samples - int(release_ms * SAMPLE_RATE / 1000))
    env = [0.0] * n_samples
    for i in range(n_samples):
        a = 1.0 if i >= attack or attack == 0 else (i / attack)
        if i < release_start:
            r = 1.0
        else:
            t = (i - release_start) / max(1, n_samples - release_start)
            r = math.exp(-5.0 * t)
        env[i] = a * r
    return env


def tone(
    freq_hz: float,
    duration_ms: float,
    *,
    harmonics: list[tuple[float, float]] | None = None,
    attack_ms: float = 4.0,
    release_ms: float | None = None,
    gain: float = 0.6,
) -> list[float]:
    n = int(duration_ms * SAMPLE_RATE / 1000)
    if release_ms is None:
        release_ms = max(duration_ms - attack_ms, 1.0)
    env = envelope(n, attack_ms, release_ms)
    partials = [(freq_hz, 1.0)] + (harmonics or [])
    samples = [0.0] * n
    for i in range(n):
        t = i / SAMPLE_RATE
        v = 0.0
        for f, amp in partials:
            v += amp * math.sin(2.0 * math.pi * f * t)
        # Normalize against summed amplitude to keep peak gain consistent.
        v /= sum(amp for _, amp in partials)
        samples[i] = gain * env[i] * v
    return samples


def silence(duration_ms: float) -> list[float]:
    return [0.0] * int(duration_ms * SAMPLE_RATE / 1000)


def concat(*chunks: list[float]) -> list[float]:
    out: list[float] = []
    for c in chunks:
        out.extend(c)
    return out


# ---------------------------------------------------------------------------
# The palette
# ---------------------------------------------------------------------------

PALETTE: dict[str, list[float]] = {
    # 1. PULSE — soft, warm "blip". Default for normal priority.
    "pulse": tone(
        880, 240,
        harmonics=[(1760, 0.18)],
        attack_ms=6, release_ms=220, gain=0.55,
    ),

    # 2. WIRE — two-note "relay close". Crisp, technical.
    "wire": concat(
        tone(659.25, 100, attack_ms=3, release_ms=85, gain=0.55),
        silence(8),
        tone(987.77, 110, attack_ms=3, release_ms=95, gain=0.5),
    ),

    # 3. TAP — high, brief tick. Subtle for low-priority.
    "tap": tone(
        1760, 70,
        harmonics=[(3520, 0.18)],
        attack_ms=2, release_ms=64, gain=0.45,
    ),

    # 4. BELL — fundamental + 2nd/3rd/4th harmonic, slow exp tail.
    "bell": tone(
        880, 800,
        harmonics=[(1760, 0.45), (2640, 0.20), (3960, 0.08)],
        attack_ms=3, release_ms=780, gain=0.55,
    ),

    # 5. ESCALATE — ascending C-E-G major arpeggio. Positive but urgent.
    "escalate": concat(
        tone(523.25, 100, attack_ms=3, release_ms=85, gain=0.55),
        silence(20),
        tone(659.25, 100, attack_ms=3, release_ms=85, gain=0.55),
        silence(20),
        tone(783.99, 150, attack_ms=3, release_ms=130, gain=0.6),
    ),

    # 6. KLAXON — three alternating pulses. Says "look now" without
    # fight-or-flight.
    "klaxon": concat(
        tone(440, 180, harmonics=[(880, 0.30)], attack_ms=4, release_ms=140, gain=0.6),
        silence(40),
        tone(660, 180, harmonics=[(1320, 0.30)], attack_ms=4, release_ms=140, gain=0.6),
        silence(40),
        tone(440, 240, harmonics=[(880, 0.30)], attack_ms=4, release_ms=200, gain=0.6),
    ),
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, samples in PALETTE.items():
        out = OUT_DIR / f"{name}.wav"
        write_wav(out, samples)
        ms = round(1000 * len(samples) / SAMPLE_RATE)
        print(f"  {name:10s}  {ms:>4} ms  -> {out.relative_to(OUT_DIR.parent.parent)}")
    print(f"wrote {len(PALETTE)} wavs to {OUT_DIR}")


if __name__ == "__main__":
    main()
