import { motion } from "motion/react";
import { useEffect, useState } from "react";

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden py-32">
      <div className="absolute inset-0 -z-20 bg-blueprint opacity-50" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[400px] bg-gradient-to-b from-black/60 to-transparent" />

      <div className="mx-auto max-w-[1280px] px-6">
        <SectionHeader
          eyebrow="01 / Capabilities"
          title={
            <>
              everything iOS can do,{" "}
              <span className="text-[var(--color-wire-bright)]">
                on a webhook.
              </span>
            </>
          }
          lede="Twelve lines of curl is all it takes. Behind it, a full pipeline: Convex, Apple Push, Live Activities — production-grade plumbing the app hides from you."
        />

        <div className="mt-20 grid grid-cols-12 gap-4 lg:gap-5">
          <BentoCard
            className="col-span-12 lg:col-span-7 lg:row-span-2 min-h-[420px]"
            tone="wire"
          >
            <PriorityCard />
          </BentoCard>

          <BentoCard
            className="col-span-12 sm:col-span-6 lg:col-span-5 min-h-[200px]"
            tone="signal"
          >
            <LiveActivityCard />
          </BentoCard>

          <BentoCard
            className="col-span-12 sm:col-span-6 lg:col-span-5 min-h-[200px]"
            tone="amber"
          >
            <BearerCard />
          </BentoCard>

          <BentoCard
            className="col-span-12 sm:col-span-6 lg:col-span-4 min-h-[260px]"
            tone="rose"
          >
            <SourceAppsCard />
          </BentoCard>

          <BentoCard
            className="col-span-12 sm:col-span-6 lg:col-span-4 min-h-[260px]"
            tone="bone"
          >
            <SoundsCard />
          </BentoCard>

          <BentoCard
            className="col-span-12 lg:col-span-4 min-h-[260px]"
            tone="wire"
          >
            <BadgeCard />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: string;
}) {
  return (
    <div className="grid grid-cols-12 gap-6">
      <div className="col-span-12 lg:col-span-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
          {eyebrow}
        </div>
        <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />
      </div>
      <div className="col-span-12 lg:col-span-9">
        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="font-display text-[clamp(48px,7vw,96px)] leading-[0.92] tracking-[-0.02em] text-balance text-bone"
        >
          {title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 max-w-[640px] text-[17px] leading-relaxed text-bone/65"
        >
          {lede}
        </motion.p>
      </div>
    </div>
  );
}

type Tone = "wire" | "signal" | "amber" | "rose" | "bone";

function BentoCard({
  children,
  className = "",
  tone = "wire",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: Tone;
}) {
  const tints: Record<Tone, string> = {
    wire: "rgba(77,163,255,0.08)",
    signal: "rgba(91,233,185,0.06)",
    amber: "rgba(255,181,71,0.05)",
    rose: "rgba(255,107,139,0.05)",
    bone: "rgba(244,236,216,0.04)",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
      className={`group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] p-7 transition-colors hover:border-white/20 ${className}`}
      style={{
        backgroundImage: `radial-gradient(140% 100% at 0% 0%, ${tints[tone]}, transparent 65%)`,
      }}
    >
      <div className="absolute inset-0 -z-10 bg-noise opacity-30 mix-blend-overlay" />
      {children}
    </motion.div>
  );
}

function FeatureLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/45">
      {children}
    </div>
  );
}

function FeatureTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[34px] leading-[1.05] tracking-[-0.01em] text-bone">
      {children}
    </h3>
  );
}

function FeatureBody({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[14.5px] leading-relaxed text-bone/65">{children}</p>
  );
}

/* ─── Cards ───────────────────────────────────────────── */

function PriorityCard() {
  const [active, setActive] = useState(2);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % 3), 2200);
    return () => clearInterval(t);
  }, []);

  const levels = [
    {
      name: "low",
      num: "1–6",
      desc: "Quiet delivery",
      color: "var(--color-wire)",
    },
    {
      name: "normal",
      num: "7",
      desc: "Default banner",
      color: "var(--color-signal)",
    },
    {
      name: "high",
      num: "8–10",
      desc: "Wakes the screen",
      color: "var(--color-rose)",
    },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <FeatureLabel>Priority routing</FeatureLabel>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/40">
          gotify-compatible
        </span>
      </div>
      <FeatureTitle>
        <span className="block">three lanes,</span>
        <span className="block text-[var(--color-wire-bright)]">one wire.</span>
      </FeatureTitle>
      <FeatureBody>
        Every payload picks a lane:{" "}
        <span className="font-mono text-bone">low</span>,{" "}
        <span className="font-mono text-bone">normal</span>, or{" "}
        <span className="font-mono text-bone">high</span>. High-priority pushes
        wake the device and surface as banners. Numbers 1–10 work too,
        Gotify-style.
      </FeatureBody>

      <div className="mt-auto grid grid-cols-3 gap-3 pt-8">
        {levels.map((l, i) => {
          const isActive = i === active;
          return (
            <motion.div
              key={l.name}
              animate={{
                y: isActive ? -4 : 0,
                opacity: isActive ? 1 : 0.55,
              }}
              transition={{ type: "spring", stiffness: 250, damping: 22 }}
              className="rounded-2xl border border-white/10 bg-black/30 p-4"
              style={{
                boxShadow: isActive
                  ? `0 12px 36px -12px ${l.color}, inset 0 0 0 1px ${l.color}`
                  : undefined,
              }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="font-mono text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: l.color }}
                >
                  {l.name}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-bone/45">
                  {l.num}
                </span>
              </div>
              <div className="mt-3 h-1 w-full rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: l.color }}
                  animate={{
                    width: isActive
                      ? "100%"
                      : i === 0
                        ? "30%"
                        : i === 1
                          ? "60%"
                          : "90%",
                  }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <div className="mt-3 text-[12.5px] leading-snug text-bone/60">
                {l.desc}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function LiveActivityCard() {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = (t - start) / 1000;
      const cycle = (elapsed % 4) / 4;
      setPct(Math.min(1, cycle * 1.2));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex h-full flex-col gap-5">
      <div>
        <FeatureLabel>Live Activities · iOS 16.2+</FeatureLabel>
        <h3 className="mt-3 font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-bone">
          Lockscreen progress, drivable from a webhook.
        </h3>
      </div>

      <div className="mt-auto flex items-center gap-3 rounded-2xl bg-black p-2.5">
        <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--color-signal)] text-black">
          ✦
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-bone/70">
              deploy #482
            </span>
            <span className="font-mono text-[10px] tabular-nums text-bone/80">
              {Math.round(pct * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--color-signal)]"
              style={{
                width: `${pct * 100}%`,
                transition: "width 80ms linear",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function BearerCard() {
  return (
    <div className="flex h-full flex-col gap-4">
      <FeatureLabel>Auth · per-device tokens</FeatureLabel>
      <h3 className="font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-bone">
        One token per source app. Revoke in a tap.
      </h3>
      <FeatureBody>
        Generate a token for every project that talks to your phone. Roll it,
        scope it, kill it from the app — no shared secrets.
      </FeatureBody>
      <div className="mt-auto flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-[12px] text-bone/80">
        <span className="text-[var(--color-amber)]">Bearer</span>
        <span className="truncate">pushr_live_4f2a8e1c…b09</span>
        <button
          type="button"
          className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2 text-[10.5px] uppercase tracking-[0.18em] text-bone/60 transition hover:bg-white/5 hover:text-bone"
        >
          ↻ rotate
        </button>
      </div>
    </div>
  );
}

function SourceAppsCard() {
  const apps = [
    { name: "ci.peptide", glyph: "✦", color: "var(--color-signal)" },
    { name: "stripe", glyph: "$", color: "var(--color-amber)" },
    { name: "linear", glyph: "◆", color: "var(--color-wire-bright)" },
    { name: "uptime", glyph: "▲", color: "var(--color-rose)" },
    { name: "convex", glyph: "≈", color: "var(--color-wire)" },
    { name: "github", glyph: "❖", color: "var(--color-bone)" },
  ];
  return (
    <div className="flex h-full flex-col gap-4">
      <FeatureLabel>Source apps</FeatureLabel>
      <h3 className="font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-bone">
        Group, color, brand each source.
      </h3>
      <div className="mt-auto grid grid-cols-3 gap-2">
        {apps.map((a) => (
          <div
            key={a.name}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-2"
          >
            <div
              className="grid h-7 w-7 flex-none place-items-center rounded-md text-[13px] font-semibold"
              style={{
                background: `linear-gradient(135deg, ${a.color} 0%, color-mix(in oklab, ${a.color} 55%, #0a0f1c) 100%)`,
                color: "#0a0f1c",
              }}
            >
              {a.glyph}
            </div>
            <span className="truncate font-mono text-[10.5px] text-bone/70">
              {a.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SoundsCard() {
  const bars = Array.from({ length: 18 });
  return (
    <div className="flex h-full flex-col gap-4">
      <FeatureLabel>Custom sounds</FeatureLabel>
      <h3 className="font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-bone">
        A different chime per source.
      </h3>
      <FeatureBody>
        Bundle your own .caf files at build time, then reference them by name on
        the wire.
      </FeatureBody>
      <div className="mt-auto flex items-end gap-1 rounded-xl border border-white/10 bg-black/40 px-3 py-3">
        {bars.map((_, i) => (
          <span
            key={i}
            className="block w-1 rounded-full bg-[var(--color-bone)]/70"
            style={{
              height: `${10 + Math.abs(Math.sin(i * 0.7)) * 26}px`,
              animation: `pulse-wire ${1.6 + (i % 4) * 0.2}s ease-in-out ${i * 0.06}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function BadgeCard() {
  return (
    <div className="flex h-full flex-col gap-4">
      <FeatureLabel>Badges & home indicator</FeatureLabel>
      <h3 className="font-display text-[28px] leading-[1.05] tracking-[-0.01em] text-bone">
        Unread count, kept in sync.
      </h3>
      <FeatureBody>
        Mark a notification read on any device — the home-screen badge updates
        everywhere.
      </FeatureBody>
      <div className="relative mt-auto flex items-center justify-center">
        <img
          src="/pushr-icon.png"
          alt="pushr app icon"
          width={96}
          height={96}
          className="h-24 w-24 rounded-[26px] shadow-[0_18px_48px_-12px_var(--color-wire)]"
        />
        <span className="absolute -right-1 -top-1 grid h-9 min-w-9 place-items-center rounded-full bg-[var(--color-rose)] px-2 font-mono text-[14px] font-bold tabular-nums text-bone shadow-[0_4px_18px_-4px_var(--color-rose)]">
          12
        </span>
      </div>
    </div>
  );
}
