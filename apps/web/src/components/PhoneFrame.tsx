import { AnimatePresence } from 'motion/react';
import type { ReactNode } from 'react';
import { NotificationCard } from './NotificationCard';
import type { Notification } from '../lib/notifications';

type Props = {
  notifications: Notification[];
  island?: ReactNode;
  lockWidget?: ReactNode;
};

export function PhoneFrame({ notifications, island, lockWidget }: Props) {
  return (
    <div className="relative">
      {/* Glow halo */}
      <div
        className="pointer-events-none absolute -inset-12 -z-10 rounded-[64px] blur-3xl"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 30%, color-mix(in oklab, var(--color-wire) 35%, transparent), transparent 70%)'
        }}
      />

      <div
        className="relative w-[380px] rounded-[58px] border border-white/15 bg-gradient-to-b from-[#1a2540] via-[#0e1730] to-[#0a0f1c] p-2 shadow-[0_60px_120px_-40px_rgba(10,132,255,0.5),inset_0_0_0_1px_rgba(255,255,255,0.06)]"
        aria-hidden="false"
      >
        {/* Side hardware buttons */}
        <div className="absolute -left-[3px] top-28 h-10 w-[3px] rounded-l-sm bg-white/10" />
        <div className="absolute -left-[3px] top-44 h-16 w-[3px] rounded-l-sm bg-white/10" />
        <div className="absolute -left-[3px] top-64 h-16 w-[3px] rounded-l-sm bg-white/10" />
        <div className="absolute -right-[3px] top-40 h-24 w-[3px] rounded-r-sm bg-white/10" />

        <div className="relative h-[760px] overflow-hidden rounded-[50px] bg-[#0a0f1c]">
          {/* Wallpaper */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(120% 80% at 50% 0%, #173266 0%, #0d1a36 38%, #06091a 75%, #04060f 100%)'
            }}
          />
          <div className="absolute inset-0 bg-noise opacity-[0.18] mix-blend-overlay" />
          <div className="absolute inset-0 scanline opacity-30" />

          {/* Status bar */}
          <div className="relative flex items-center justify-between px-9 pt-4 font-mono text-[12px] tracking-tight text-bone">
            <span className="tabular-nums">9:41</span>
            <div className="flex items-center gap-1.5">
              <Glyph name="signal" />
              <Glyph name="wifi" />
              <Glyph name="battery" />
            </div>
          </div>

          {/* Dynamic Island */}
          <div className="relative mt-1 flex justify-center">{island}</div>

          {/* Lock screen header */}
          <div className="relative mt-8 px-7 text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-bone/55">
              Thursday, May 8
            </p>
            <p className="mt-1 font-display text-[78px] leading-[0.88] tracking-tight text-bone glow-wire">
              9:41
            </p>
          </div>

          {/* Notification stack */}
          <div className="relative mt-7 flex flex-col items-center gap-2.5 px-5">
            <AnimatePresence initial={false} mode="popLayout">
              {notifications.map((n, i) => (
                <NotificationCard key={n.id} n={n} index={i} />
              ))}
            </AnimatePresence>
            {notifications.length === 0 && (
              <div className="mt-4 max-w-[260px] rounded-2xl border border-dashed border-white/10 px-4 py-5 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/45">
                  awaiting payload
                </p>
                <p className="mt-1 text-[13px] text-bone/60">
                  POST a notification — it lands here.
                </p>
              </div>
            )}
          </div>

          {/* Lock-screen Live Activity widget — pinned above the home indicator */}
          {lockWidget && <div className="absolute bottom-7 left-4 right-4">{lockWidget}</div>}

          {/* Home indicator */}
          <div className="absolute bottom-2 left-1/2 h-1 w-32 -translate-x-1/2 rounded-full bg-bone/40" />
        </div>
      </div>
    </div>
  );
}

function Glyph({ name }: { name: 'signal' | 'wifi' | 'battery' }) {
  if (name === 'signal') {
    return (
      <svg width="16" height="10" viewBox="0 0 16 10" fill="currentColor" aria-hidden>
        <rect x="0" y="6" width="3" height="4" rx="0.5" />
        <rect x="4.5" y="4" width="3" height="6" rx="0.5" />
        <rect x="9" y="2" width="3" height="8" rx="0.5" />
        <rect x="13.5" y="0" width="3" height="10" rx="0.5" />
      </svg>
    );
  }
  if (name === 'wifi') {
    return (
      <svg
        width="14"
        height="10"
        viewBox="0 0 14 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden
      >
        <path d="M1 4.2a8.5 8.5 0 0 1 12 0" strokeLinecap="round" />
        <path d="M3 6.4a5.5 5.5 0 0 1 8 0" strokeLinecap="round" />
        <circle cx="7" cy="9" r="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      width="22"
      height="10"
      viewBox="0 0 22 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden
    >
      <rect x="0.5" y="0.5" width="18" height="9" rx="2" />
      <rect x="2" y="2" width="14" height="6" rx="1" fill="currentColor" />
      <rect x="19.5" y="3.5" width="1.5" height="3" rx="0.5" fill="currentColor" />
    </svg>
  );
}
