import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { PhoneFrame } from './PhoneFrame';
import { DynamicIsland, LockScreenLiveActivity } from './DynamicIsland';
import { makeNotification, sequenceNotification, type Notification } from '../lib/notifications';

const MAX_STACK = 4;

export function Hero() {
  const [stack, setStack] = useState<Notification[]>([]);
  const [pulse, setPulse] = useState(0);

  const fire = useCallback((idx?: number) => {
    setStack((prev) => {
      const next = idx != null ? sequenceNotification(idx) : makeNotification();
      const merged = [next, ...prev].slice(0, MAX_STACK);
      return merged;
    });
    setPulse((p) => p + 1);
  }, []);

  // Auto-seed: drop a notification in shortly after page load, then a few more.
  useEffect(() => {
    const timers: number[] = [];
    timers.push(window.setTimeout(() => fire(0), 700));
    timers.push(window.setTimeout(() => fire(2), 2400));
    timers.push(window.setTimeout(() => fire(5), 4400));
    return () => timers.forEach(clearTimeout);
  }, [fire]);

  return (
    <section className="relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="absolute inset-0 -z-20 bg-blueprint" />
      <div className="absolute inset-0 -z-20 gradient-aurora" />
      <div className="absolute inset-0 -z-10 bg-noise opacity-40" />

      {/* Top hairline */}
      <div className="anim-hairline absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-wire)] to-transparent" />

      <div className="relative mx-auto grid max-w-[1280px] grid-cols-1 gap-12 px-6 pt-14 pb-28 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-24">
        {/* Left column — copy */}
        <div className="relative flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] animate-pulse-wire" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/70">
              v1.0 · live on the App Store
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 font-display text-[clamp(72px,11vw,176px)] leading-[0.86] tracking-[-0.02em] text-bone"
          >
            <span className="block">your phone,</span>
            <span className="block glow-wire text-[var(--color-wire-bright)]">on the wire.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18 }}
            className="mt-7 max-w-[520px] text-pretty text-[18px] leading-relaxed text-bone/75"
          >
            <span className="font-mono text-[var(--color-wire-bright)]">pushr.sh</span> is a
            personal push-notification hub for builders. Any project POSTs a payload to a single URL
            — your iPhone lights up. Deploys, payments, doorbells, trading bots — wired to the same
            wrist-flick.
          </motion.p>

          {/* CTA row with the LIVE FIRE button */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.32 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <button
              type="button"
              onClick={() => fire()}
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-bone px-6 py-3.5 font-medium text-ink transition active:scale-[0.98]"
            >
              <span
                aria-hidden
                className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                  background:
                    'radial-gradient(120% 120% at 50% 0%, rgba(10,132,255,0.35), transparent 60%)'
                }}
              />
              <span className="relative flex items-center gap-2">
                <span className="relative grid h-6 w-6 place-items-center">
                  <span className="absolute inset-0 rounded-full bg-[var(--color-wire-deep)] animate-pulse-wire" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-bone" />
                </span>
                Send a push — try it
              </span>
              <span
                aria-live="polite"
                className="relative font-mono text-[11px] tabular-nums text-ink/60"
              >
                {pulse.toString().padStart(3, '0')}
              </span>
            </button>

            <a
              href="#install"
              className="group inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-3.5 text-[15px] text-bone backdrop-blur transition hover:border-[var(--color-wire)] hover:bg-white/[0.06]"
            >
              <AppleGlyph />
              Download for iOS
              <Arrow />
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 flex items-baseline gap-6 font-mono text-[11px] uppercase tracking-[0.22em] text-bone/45"
          >
            <span>iOS 16.2+</span>
            <span className="h-px w-6 bg-bone/20" />
            <span>Live Activities</span>
            <span className="h-px w-6 bg-bone/20" />
            <span>Convex backend</span>
          </motion.div>

          {/* Tiny terminal echo */}
          <motion.pre
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-12 max-w-[560px] overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-4 font-mono text-[12.5px] leading-relaxed text-bone/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            <span className="text-[var(--color-wire-bright)]">$</span>{' '}
            <span className="text-bone">curl</span> -X POST{' '}
            <span className="text-[var(--color-signal)]">"$PUSHR_URL/notify"</span>{' '}
            <span className="text-bone/50">\</span>
            {'\n  '}-H{' '}
            <span className="text-[var(--color-amber)]">"Authorization: Bearer $TOKEN"</span>{' '}
            <span className="text-bone/50">\</span>
            {'\n  '}-d{' '}
            <span className="text-[var(--color-amber)]">
              {"'"}
              {`{"title":"shipped 🚀","body":"build #482","priority":"high"}`}
              {"'"}
            </span>
            <span className="ml-1 inline-block h-[1em] w-[7px] -translate-y-[1px] bg-[var(--color-wire-bright)] align-middle animate-cursor" />
          </motion.pre>
        </div>

        {/* Right column — phone */}
        <div className="relative flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 40, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.2 }}
            className="relative"
          >
            <PhoneFrame
              notifications={stack}
              island={<DynamicIsland />}
              lockWidget={<LockScreenLiveActivity />}
            />
          </motion.div>

          {/* Background decorative wire SVG */}
          <svg
            aria-hidden
            className="pointer-events-none absolute -left-20 top-20 h-[500px] w-[280px] opacity-50 mix-blend-screen"
            viewBox="0 0 280 500"
            fill="none"
          >
            <path
              d="M-20 40 C 80 60, 80 240, 220 280 S 320 460, 280 520"
              stroke="var(--color-wire)"
              strokeWidth="1"
              className="wire-path"
            />
            <circle cx="-20" cy="40" r="3" fill="var(--color-wire-bright)" />
          </svg>
        </div>
      </div>

      {/* Marquee */}
      <Marquee />
    </section>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M11.16 8.32c-.02-2.05 1.67-3.03 1.74-3.08-.95-1.39-2.42-1.58-2.95-1.6-1.25-.13-2.45.74-3.08.74-.65 0-1.62-.72-2.66-.7-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1.99 8.1.69.99 1.5 2.09 2.55 2.05 1.03-.04 1.42-.66 2.66-.66 1.24 0 1.6.66 2.69.64 1.11-.02 1.81-1 2.49-1.99.78-1.13 1.1-2.24 1.12-2.3-.02-.01-2.16-.83-2.18-3.21zM9.32 2.92c.56-.69.95-1.65.84-2.61-.81.04-1.81.55-2.4 1.23-.52.6-.99 1.58-.86 2.52.91.07 1.84-.46 2.42-1.14z" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden
    >
      <path d="M3 7h8M7 3l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Marquee() {
  const items = [
    'POST /notify',
    'Bearer auth',
    'Live Activities',
    'Dynamic Island',
    'Priority routing',
    'Custom sounds',
    'Badge sync',
    'Source apps',
    'iOS 16.2+',
    'Convex backend'
  ];
  const seq = [...items, ...items];
  return (
    <div className="relative border-y border-white/[0.06] bg-black/20 py-4">
      <div className="flex w-max animate-marquee gap-12 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.3em] text-bone/45">
        {seq.map((t, i) => (
          <span key={i} className="flex items-center gap-12">
            <span>{t}</span>
            <span className="text-[var(--color-wire)]">◆</span>
          </span>
        ))}
      </div>
    </div>
  );
}
