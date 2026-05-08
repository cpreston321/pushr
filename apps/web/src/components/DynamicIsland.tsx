import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

type Stage =
  | { kind: "idle" }
  | { kind: "compact"; label: string; pct: number; status: string; icon: string }
  | { kind: "expanded"; label: string; pct: number; status: string; icon: string };

const SCRIPT: Stage[] = [
  { kind: "idle" },
  { kind: "compact", label: "Deploy #482", pct: 12, status: "Building", icon: "▴" },
  { kind: "expanded", label: "Deploy #482", pct: 28, status: "Running tests", icon: "✓" },
  { kind: "expanded", label: "Deploy #482", pct: 64, status: "Pushing image", icon: "✦" },
  { kind: "expanded", label: "Deploy #482", pct: 92, status: "Warming pods", icon: "❖" },
  { kind: "compact", label: "Deploy #482", pct: 100, status: "Live", icon: "✓" },
];

const STEP_MS = 2400;

// Wall-clock-aligned shared timer so the Dynamic Island (top) and the
// lock-screen Live Activity (bottom) tick the same script in lockstep.
const subscribers = new Set<() => void>();
let timerStarted = false;

function ensureTimer() {
  if (timerStarted || typeof window === "undefined") return;
  timerStarted = true;
  setInterval(() => {
    subscribers.forEach((s) => s());
  }, STEP_MS);
}

function useSharedScript(): Stage {
  ensureTimer();
  const compute = () => Math.floor(Date.now() / STEP_MS) % SCRIPT.length;
  const [step, setStep] = useState(compute);
  useEffect(() => {
    const sub = () => setStep(compute());
    subscribers.add(sub);
    return () => {
      subscribers.delete(sub);
    };
  }, []);
  return SCRIPT[step];
}

export function DynamicIsland() {
  const stage = useSharedScript();

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.8 }}
      className="relative overflow-hidden bg-black"
      style={{
        borderRadius: 28,
        boxShadow:
          "0 8px 24px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.04)",
        width: stage.kind === "expanded" ? 320 : stage.kind === "compact" ? 200 : 124,
        height: stage.kind === "expanded" ? 78 : 36,
      }}
    >
      <AnimatePresence mode="popLayout">
        {stage.kind === "idle" && <IdleView key="idle" />}
        {stage.kind === "compact" && (
          <CompactView key="compact" pct={stage.pct} icon={stage.icon} label={stage.label} />
        )}
        {stage.kind === "expanded" && (
          <ExpandedView
            key="expanded"
            pct={stage.pct}
            icon={stage.icon}
            label={stage.label}
            status={stage.status}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function IdleView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full w-full"
    />
  );
}

function CompactView({ pct, icon, label }: { pct: number; icon: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full items-center justify-between px-3 text-bone"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-wire)] text-[11px] text-black">
          {icon}
        </span>
        <span className="font-mono text-[11px] tracking-tight">{label}</span>
      </div>
      <span className="font-mono text-[11px] tabular-nums text-bone/70">{pct}%</span>
    </motion.div>
  );
}

function ExpandedView({
  pct,
  icon,
  label,
  status,
}: {
  pct: number;
  icon: string;
  label: string;
  status: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex h-full items-center gap-3 px-4 text-bone"
    >
      <div className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-[var(--color-wire)] text-black">
        <span className="text-[15px]">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone/70">
            {label}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-bone/80">{pct}%</span>
        </div>
        <div className="mt-1 truncate text-[13px]">{status}</div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-[var(--color-wire)]"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 24 }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * The lock-screen Live Activity widget, pinned to the bottom of the lock
 * screen above the home indicator. Shares its script with `DynamicIsland`
 * via `useSharedScript`, so progress / status update in lockstep.
 */
export function LockScreenLiveActivity() {
  const stage = useSharedScript();

  if (stage.kind === "idle") {
    return (
      <AnimatePresence>
        <motion.div
          key="idle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
          className="rounded-3xl border border-dashed border-white/10 px-5 py-4 text-center"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-bone/40">
            no live activity
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      key="active"
      initial={{ opacity: 0, y: 12, scale: 0.97, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      transition={{
        type: "spring",
        stiffness: 320,
        damping: 30,
        opacity: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
        filter: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
      }}
      className="relative overflow-hidden rounded-[28px] border border-white/15 bg-black/55 backdrop-blur-2xl shadow-[0_30px_60px_-30px_rgba(10,132,255,0.55)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 100% at 0% 0%, color-mix(in oklab, var(--color-wire-deep) 35%, transparent), transparent 65%)",
        }}
      />
      <div className="relative flex items-center gap-3.5 p-4">
        <div className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-gradient-to-br from-[var(--color-wire-bright)] to-[var(--color-wire-deep)] text-[18px] text-ink shadow-[0_8px_22px_-8px_var(--color-wire)]">
          {stage.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-bone/60">
              ci.peptide · live
            </span>
            <span className="font-mono text-[11px] tabular-nums text-bone">
              {stage.pct}%
            </span>
          </div>
          <p className="mt-0.5 truncate text-[15px] font-medium leading-tight text-bone">
            {stage.label}
          </p>
          <p className="truncate text-[12.5px] text-bone/65">{stage.status}</p>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-[var(--color-wire-bright)]"
              initial={false}
              animate={{ width: `${stage.pct}%` }}
              transition={{ type: "spring", stiffness: 140, damping: 24 }}
              style={{
                boxShadow: "0 0 12px var(--color-wire-bright)",
              }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
