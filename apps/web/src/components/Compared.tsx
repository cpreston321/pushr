import { motion } from "motion/react";

type Verdict = "yes" | "no" | "partial" | "free" | "paid";

type Row = {
  feature: string;
  hint?: string;
  pushr: Verdict | string;
  ntfy: Verdict | string;
  igotify: Verdict | string;
};

const ROWS: Row[] = [
  {
    feature: "Native iOS app",
    pushr: "yes",
    ntfy: "yes",
    igotify: "yes",
  },
  {
    feature: "Free iOS app",
    pushr: "free",
    ntfy: "free",
    igotify: "free",
  },
  {
    feature: "Open source",
    pushr: "yes",
    ntfy: "yes",
    igotify: "yes",
  },
  {
    feature: "Connect your own instance",
    hint: "Point the iOS app at any backend URL",
    pushr: "yes",
    ntfy: "yes",
    igotify: "yes",
  },
  {
    feature: "Self-host the backend",
    hint: "Run the server end-to-end",
    pushr: "yes",
    ntfy: "yes",
    igotify: "yes",
  },
  {
    feature: "Hosted backend available",
    hint: "Skip self-hosting if you don't want it",
    pushr: "yes",
    ntfy: "yes",
    igotify: "no",
  },
  {
    feature: "Live Activities + Dynamic Island",
    hint: "Lock-screen progress driven from a webhook",
    pushr: "yes",
    ntfy: "no",
    igotify: "no",
  },
  {
    feature: "Badge count synced across devices",
    pushr: "yes",
    ntfy: "no",
    igotify: "no",
  },
  {
    feature: "Custom sounds per source",
    hint: "A different chime per project, not per priority",
    pushr: "yes",
    ntfy: "partial",
    igotify: "partial",
  },
  {
    feature: "Per-source icons + color",
    hint: "Brand each app sending notifications",
    pushr: "yes",
    ntfy: "partial",
    igotify: "yes",
  },
  {
    feature: "Numeric priorities 1–10",
    hint: "Gotify-compatible scale",
    pushr: "yes",
    ntfy: "partial",
    igotify: "yes",
  },
  {
    feature: "Per-source bearer tokens",
    pushr: "yes",
    ntfy: "yes",
    igotify: "yes",
  },
];

export function Compared() {
  return (
    <section className="relative overflow-hidden py-32">
      <div className="absolute inset-0 -z-20 bg-blueprint opacity-40" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-black/50 to-transparent" />

      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
              02 / Compared
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
              ntfy.{" "}
              <span className="text-bone/40">iGotify.</span>{" "}
              <span className="block text-[var(--color-wire-bright)]">
                pushr.sh.
              </span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 max-w-[640px] text-[17px] leading-relaxed text-bone/65"
            >
              ntfy and iGotify already nail the basics — free apps, open source,
              point them at your own server. We built pushr.sh for the parts iOS
              has that the others haven't shipped yet:{" "}
              <span className="text-bone">Live Activities</span>,{" "}
              <span className="text-bone">Dynamic Island</span>, and{" "}
              <span className="text-bone">badge sync across devices</span>.
            </motion.p>
          </div>
        </div>

        {/* Free-instance callout */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="relative mt-16 overflow-hidden rounded-3xl border border-[var(--color-wire)]/40 bg-gradient-to-br from-[var(--color-wire-deep)]/15 via-transparent to-[var(--color-signal)]/10 p-8 ring-wire"
        >
          <div className="absolute inset-0 -z-10 bg-noise opacity-30 mix-blend-overlay" />
          <div className="grid grid-cols-12 items-center gap-6">
            <div className="col-span-12 lg:col-span-8">
              <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-[var(--color-wire-bright)]">
                BYO instance · $0 forever
              </div>
              <h3 className="mt-3 font-display text-[clamp(32px,4.4vw,56px)] leading-[1] tracking-[-0.04em] text-bone">
                Spin up Convex.{" "}
                <span className="text-[var(--color-wire-bright)]">
                  Point the app at it.
                </span>
              </h3>
              <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-bone/70">
                The whole stack is open source. Run the backend on your own
                domain, drop the URL into settings, and we never touch your
                payloads — no per-message fees, no usage caps, no upsell.
              </p>
            </div>
            <div className="col-span-12 lg:col-span-4">
              <div className="rounded-2xl border border-white/10 bg-black/50 p-4 font-mono text-[12.5px] leading-[1.7] text-bone/85 backdrop-blur">
                <div className="text-bone/40">$ in app settings → server</div>
                <div className="mt-1">
                  <span className="text-[var(--color-wire-bright)]">URL </span>
                  <span className="text-[var(--color-amber)]">
                    https://pushr.you.dev
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] animate-pulse-wire" />
                  <span className="text-bone/65">connected · 200 OK</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Comparison matrix */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="mt-16 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02]"
        >
          {/* Header row */}
          <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-0 border-b border-white/10 bg-black/40">
            <div className="px-6 py-5 font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/45">
              Feature
            </div>
            <HeaderCell name="pushr.sh" highlight tag="ours" />
            <HeaderCell name="ntfy" tag="open-source" />
            <HeaderCell name="iGotify" tag="for Gotify" />
          </div>

          {ROWS.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-0 ${
                i !== ROWS.length - 1 ? "border-b border-white/[0.06]" : ""
              }`}
            >
              <div className="px-6 py-5">
                <div className="text-[14.5px] text-bone">{row.feature}</div>
                {row.hint && (
                  <div className="mt-0.5 text-[12.5px] text-bone/45">
                    {row.hint}
                  </div>
                )}
              </div>
              <Cell value={row.pushr} highlight />
              <Cell value={row.ntfy} />
              <Cell value={row.igotify} />
            </div>
          ))}
        </motion.div>

        <p className="mt-6 text-center font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/35">
          comparisons reflect public docs as of may 2026 · corrections welcome
        </p>
      </div>
    </section>
  );
}

function HeaderCell({
  name,
  tag,
  highlight,
}: {
  name: string;
  tag: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`px-6 py-5 ${
        highlight
          ? "bg-gradient-to-b from-[var(--color-wire-deep)]/15 to-transparent"
          : ""
      }`}
    >
      <div
        className={`font-display text-[22px] leading-none tracking-tight ${
          highlight ? "text-[var(--color-wire-bright)] glow-wire" : "text-bone"
        }`}
      >
        {name}
      </div>
      <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/45">
        {tag}
      </div>
    </div>
  );
}

function Cell({
  value,
  highlight,
}: {
  value: Verdict | string;
  highlight?: boolean;
}) {
  const isVerdict = ["yes", "no", "partial", "free", "paid"].includes(value);
  return (
    <div
      className={`flex items-center px-6 py-5 ${
        highlight ? "bg-[var(--color-wire-deep)]/[0.06]" : ""
      }`}
    >
      {isVerdict ? <Mark v={value as Verdict} /> : <span className="text-bone/80">{value}</span>}
    </div>
  );
}

function Mark({ v }: { v: Verdict }) {
  if (v === "yes") {
    return (
      <span className="inline-flex items-center gap-2 text-[14px] text-bone">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-signal)]/15 text-[var(--color-signal)]"
          style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-signal) 40%, transparent)" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5.2L4.2 7.4 8.2 2.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    );
  }
  if (v === "free") {
    return (
      <span className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-wire-bright)]/15 text-[var(--color-wire-bright)]"
          style={{ boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--color-wire-bright) 40%, transparent)" }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5.2L4.2 7.4 8.2 2.6"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-wire-bright)]">
          free
        </span>
      </span>
    );
  }
  if (v === "partial") {
    return (
      <span
        aria-label="partial support"
        className="inline-block h-[2px] w-6 rounded-full bg-bone/30"
      />
    );
  }
  if (v === "paid") {
    return (
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-[var(--color-amber)]">
        paid
      </span>
    );
  }
  // no
  return (
    <span
      aria-label="not supported"
      className="inline-block h-1.5 w-1.5 rounded-full bg-bone/20"
    />
  );
}
