import { motion } from "motion/react";
import type { Notification } from "../lib/notifications";

type Props = {
  n: Notification;
  index?: number;
};

const SPRING = { type: "spring" as const, stiffness: 360, damping: 32, mass: 0.7 };
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export function NotificationCard({ n, index = 0 }: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -24, scale: 0.96, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{
        opacity: 0,
        scale: 0.94,
        filter: "blur(6px)",
        transition: {
          opacity: { duration: 0.18, ease: EASE_OUT },
          scale: { duration: 0.18, ease: EASE_OUT },
          filter: { duration: 0.18, ease: EASE_OUT },
        },
      }}
      transition={{
        layout: SPRING,
        y: SPRING,
        scale: SPRING,
        opacity: { duration: 0.26, ease: EASE_OUT },
        filter: { duration: 0.24, ease: EASE_OUT },
      }}
      style={{
        // Stack the cards with subtle depth offset based on order in stack.
        zIndex: 100 - index,
      }}
      className="relative w-full max-w-[340px] rounded-[22px] border border-white/10 bg-white/[0.06] backdrop-blur-2xl shadow-[0_24px_60px_-20px_rgba(10,132,255,0.55)]"
    >
      <div className="flex items-start gap-3 p-3.5">
        <div
          className="grid h-10 w-10 flex-none place-items-center rounded-[10px] text-[18px] font-semibold"
          style={{
            background: `linear-gradient(135deg, ${n.tint} 0%, color-mix(in oklab, ${n.tint} 55%, #0a0f1c) 100%)`,
            color: "#0a0f1c",
            boxShadow: `0 6px 20px -6px ${n.tint}`,
          }}
          aria-hidden
        >
          {n.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-bone-dim/80">
              {n.app}
            </span>
            <span className="font-mono text-[10.5px] tabular-nums text-bone-dim/60">
              {n.time}
            </span>
          </div>
          <p className="mt-0.5 text-[14.5px] font-medium leading-snug text-bone">
            {n.title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-bone/70">
            {n.body}
          </p>
        </div>
      </div>

      {n.priority === "high" && (
        <div className="absolute -left-[3px] top-3 h-7 w-[3px] rounded-full bg-[var(--color-rose)] shadow-[0_0_18px_var(--color-rose)]" />
      )}
    </motion.div>
  );
}
