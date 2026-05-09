import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { SiteHeader } from "./SiteHeader";

/**
 * 404 — "dead letter office".
 *
 * This site's whole metaphor is wires + payloads + delivery. The 404 page
 * leans into that: a packet that never landed. It doubles as the generic
 * error page (pass an error to render its message in the diagnostic block).
 */
export function NotFound({ error }: { error?: Error } = {}) {
  const isError = !!error;

  // Stable per-render packet identity. Real applications would surface the
  // request id from a header — we fake one for visual flavor.
  const packetId = useMemo(
    () =>
      "0x" +
      Array.from({ length: 8 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      )
        .join("")
        .toUpperCase(),
    [],
  );

  const attemptedPath = useMemo(() => {
    if (typeof window === "undefined") return "/lost";
    return window.location.pathname + window.location.search;
  }, []);

  // "Time since lost" counter — increments live, gives the page heartbeat.
  const [msSince, setMsSince] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      setMsSince(Math.floor(performance.now() - start));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Atmosphere */}
      <div className="absolute inset-0 -z-30 bg-blueprint" />
      <div className="absolute inset-0 -z-30 gradient-aurora opacity-25" />
      <div className="absolute inset-0 -z-20 bg-noise opacity-30" />
      <div className="pointer-events-none absolute inset-0 -z-10 crt-scanlines opacity-40" />
      <div className="anim-hairline absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-rose)] to-transparent" />

      <SiteHeader
        tag={isError ? "err" : "404"}
        nav={[
          { kind: "route", label: "docs", to: "/docs" },
          { kind: "route", label: "log", to: "/changelog" },
        ]}
      />

      <section className="relative mx-auto max-w-[1320px] px-6 pt-12 pb-32 lg:pt-20">
        <StatusRow
          packetId={packetId}
          msSince={msSince}
          path={attemptedPath}
          isError={isError}
        />

        <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-16 lg:grid-cols-[1fr_minmax(0,440px)] lg:gap-x-16">
          {/* LEFT — the giant typographic carcass */}
          <div className="relative">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-rose)]"
            >
              ✕ dead letter office
            </motion.div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-px w-12 bg-[var(--color-rose)]/60" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/40">
                {isError
                  ? "the wire returned an exception"
                  : "this push never landed"}
              </span>
            </div>

            <h1 className="relative mt-6 select-none font-display leading-[0.82] tracking-[-0.06em] text-bone">
              <span className="block text-[clamp(112px,20vw,300px)]">
                <Digit char={isError ? "E" : "4"} delay={0.0} />
                <Digit char={isError ? "R" : "0"} delay={0.08} broken />
                <Digit char={isError ? "R" : "4"} delay={0.16} />
              </span>
            </h1>

            <BrokenWire />

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.45 }}
              className="relative mt-10 max-w-[600px] text-pretty text-[18.5px] leading-[1.55] text-bone/75"
            >
              {isError ? (
                <>
                  Something on the wire threw, and we couldn't deliver this
                  view. The render aborted — no payload made it through.{" "}
                  <span className="font-mono text-[var(--color-rose)]">
                    the connection is intact. the route is not.
                  </span>
                </>
              ) : (
                <>
                  The route you tried to reach isn't in our delivery table.
                  Either the wire was cut, the URL got mistyped, or you
                  wandered into a corner of the system that hasn't been built
                  yet.{" "}
                  <span className="font-mono text-[var(--color-rose)]">
                    no payload was delivered.
                  </span>
                </>
              )}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="mt-9 flex flex-wrap items-center gap-3"
            >
              <Link
                to="/"
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-full bg-bone px-6 py-3.5 font-medium text-ink transition active:scale-[0.98]"
              >
                <span
                  aria-hidden
                  className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(120% 120% at 50% 0%, rgba(255,107,139,0.35), transparent 60%)",
                  }}
                />
                <span className="relative flex items-center gap-2">
                  <span className="relative grid h-6 w-6 place-items-center">
                    <span className="absolute inset-0 rounded-full bg-[var(--color-wire-deep)] animate-pulse-wire" />
                    <span className="relative h-1.5 w-1.5 rounded-full bg-bone" />
                  </span>
                  ↻ retry — back to home
                </span>
              </Link>
              <Link
                to="/docs"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-3.5 text-[15px] text-bone backdrop-blur transition hover:border-[var(--color-wire)] hover:bg-white/[0.06]"
              >
                browse the docs
                <span className="text-bone/55 transition-transform group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            </motion.div>

            <FailedCurl path={attemptedPath} packetId={packetId} error={error} />
          </div>

          {/* RIGHT — the phantom undeliverable notification */}
          <PhantomNotification packetId={packetId} />
        </div>

        <Diagnostics path={attemptedPath} isError={isError} />

        <Coda />
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Status ribbon
// ---------------------------------------------------------------------------

function StatusRow({
  packetId,
  msSince,
  path,
  isError,
}: {
  packetId: string;
  msSince: number;
  path: string;
  isError: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.32em]">
      <span className="inline-flex items-center gap-2 text-[var(--color-rose)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inset-0 rounded-full bg-[var(--color-rose)] animate-pulse-wire" />
          <span className="relative m-auto h-1 w-1 rounded-full bg-[var(--color-rose)]" />
        </span>
        status: dropped
      </span>
      <Sep />
      <span className="text-bone/55">
        packet{" "}
        <span className="text-[var(--color-wire-bright)] tabular-nums">
          {packetId}
        </span>
      </span>
      <Sep />
      <span className="text-bone/55">
        ms since lost{" "}
        <span className="tabular-nums text-[var(--color-amber)]">
          {String(msSince).padStart(5, "0")}
        </span>
      </span>
      <Sep />
      <span className="hidden truncate text-bone/40 md:inline">
        attempted{" "}
        <span className="tracking-tight text-bone/65">
          {path.length > 36 ? path.slice(0, 35) + "…" : path}
        </span>
      </span>
      <Sep className="hidden md:inline" />
      <span className="hidden text-bone/35 md:inline">
        kind{" "}
        <span className="text-bone/70">{isError ? "exception" : "no-route"}</span>
      </span>
    </div>
  );
}

function Sep({ className = "" }: { className?: string }) {
  return <span className={`text-bone/20 ${className}`}>·</span>;
}

// ---------------------------------------------------------------------------
// Glitching display digit
// ---------------------------------------------------------------------------

function Digit({
  char,
  delay,
  broken,
}: {
  char: string;
  delay: number;
  broken?: boolean;
}) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 28, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] }}
      className={[
        "relative inline-block",
        broken ? "anim-static-flicker" : "",
      ].join(" ")}
      style={
        broken
          ? {
              color: "var(--color-rose)",
              textShadow:
                "0 0 60px color-mix(in oklab, var(--color-rose) 40%, transparent)",
            }
          : {
              textShadow:
                "0 0 50px color-mix(in oklab, var(--color-wire) 22%, transparent)",
            }
      }
      data-char={char}
    >
      {char}
      {broken && (
        <>
          <span
            aria-hidden
            className="anim-glitch-cyan absolute inset-0 mix-blend-screen"
            style={{ color: "var(--color-wire-bright)" }}
          >
            {char}
          </span>
          <span
            aria-hidden
            className="anim-glitch-rose absolute inset-0 mix-blend-screen"
            style={{ color: "var(--color-amber)" }}
          >
            {char}
          </span>
          {/* horizontal "tear" — a slice that occasionally jumps */}
          <span
            aria-hidden
            className="absolute left-0 right-0 top-[42%] h-[6%] overflow-hidden"
          >
            <motion.span
              animate={{ x: [-6, 4, -2, 5, 0, -3] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="block"
              style={{ color: "var(--color-rose)" }}
            >
              {char}
            </motion.span>
          </span>
        </>
      )}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// Frayed wire SVG
// ---------------------------------------------------------------------------

function BrokenWire() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute -right-4 top-[26%] h-[260px] w-[440px] opacity-60 mix-blend-screen lg:right-2 lg:top-[34%]"
      viewBox="0 0 440 260"
      fill="none"
    >
      <path
        d="M0 130 C 80 60, 160 200, 220 130"
        stroke="var(--color-wire)"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="wire-path"
      />
      {/* Frayed end at the snap */}
      <g transform="translate(220 130)">
        <motion.g
          animate={{ rotate: [0, 4, -3, 2, 0] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        >
          <path
            d="M0 0 L 8 -10 M 0 0 L 11 4 M 0 0 L 5 11 M 0 0 L -3 7"
            stroke="var(--color-rose)"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </motion.g>
        <circle r="3" fill="var(--color-rose)" className="anim-spark" />
        <circle
          r="9"
          fill="none"
          stroke="var(--color-rose)"
          strokeWidth="1"
          className="anim-spark-ring"
          style={{ transformOrigin: "center" }}
        />
        <circle
          r="14"
          fill="none"
          stroke="var(--color-amber)"
          strokeWidth="0.6"
          className="anim-spark-ring"
          style={{ transformOrigin: "center", animationDelay: "0.5s" }}
        />
      </g>
      {/* Ghost continuation — where the wire SHOULD have continued */}
      <path
        d="M 220 130 C 280 60, 360 200, 440 130"
        stroke="var(--color-bone)"
        strokeWidth="1"
        strokeDasharray="2 7"
        opacity="0.18"
      />
      <text
        x="430"
        y="125"
        textAnchor="end"
        fontFamily="JetBrains Mono, monospace"
        fontSize="9"
        letterSpacing="3"
        fill="var(--color-bone)"
        opacity="0.35"
      >
        ?
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Phantom notification — TV-static + redacted block characters
// ---------------------------------------------------------------------------

function PhantomNotification({ packetId }: { packetId: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.35 }}
      className="relative mx-auto w-full max-w-[420px] lg:mx-0"
    >
      {/* Undeliverable ribbon */}
      <div className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[var(--color-rose)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.28em] text-ink shadow-[0_8px_24px_-8px_rgba(255,107,139,0.6)]">
        <span className="h-1 w-1 rounded-full bg-ink" />
        undeliverable · returned to sender
      </div>

      <motion.div
        animate={{ opacity: [1, 0.7, 1, 0.85, 1, 0.55, 1] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "linear" }}
        className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-b from-[#1a1f2c] to-[#0a0f1c] p-5 shadow-[0_30px_90px_-30px_rgba(255,107,139,0.45)]"
      >
        {/* Static noise overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-noise opacity-50 mix-blend-overlay"
        />
        {/* Rolling glitch bar */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div
            className="anim-scanline-roll absolute left-0 right-0 h-[3px] bg-[var(--color-wire-bright)]/30 blur-[2px]"
            style={{ animationDuration: "3.2s" }}
          />
          <div
            className="anim-scanline-roll absolute left-0 right-0 h-[1px] bg-[var(--color-rose)]/40"
            style={{ animationDuration: "5.1s", animationDelay: "1.2s" }}
          />
        </div>
        {/* Internal scanlines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 crt-scanlines opacity-30"
        />

        <div className="relative flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-rose)]/15 ring-1 ring-[var(--color-rose)]/30">
            <span className="font-mono text-[16px] text-[var(--color-rose)] leading-none">
              ▮▯▮
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-bone/55">
                pushr · undelivered
              </span>
              <span className="font-mono text-[10px] tabular-nums text-bone/40">
                --:--
              </span>
            </div>
            <div className="mt-2 font-mono text-[14.5px] font-semibold leading-snug text-bone/85">
              ▓▓▓▓▓ ▓▓ ▓ ▓▓▓▓▓▓▓
            </div>
            <div className="mt-1.5 font-mono text-[12.5px] leading-snug text-bone/55">
              ▓▓▓▓▓▓ ▓▓▓ ▓▓▓▓▓ ▓▓ ▓▓▓ ▓▓▓▓▓▓ ▓▓▓
            </div>
          </div>
        </div>
      </motion.div>

      {/* Diagnostic strip below the card */}
      <dl className="mt-5 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
        <DiagnoseRow label="route" value="not in delivery table" tone="rose" />
        <DiagnoseRow label="ttl" value="expired" tone="amber" />
        <DiagnoseRow label="payload" value="—" />
        <DiagnoseRow label="retries" value="0 / ∞" />
        <DiagnoseRow
          label="packet"
          value={packetId}
          tone="wire"
          mono
        />
      </dl>
    </motion.div>
  );
}

function DiagnoseRow({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "rose" | "amber" | "wire";
  mono?: boolean;
}) {
  const color =
    tone === "rose"
      ? "var(--color-rose)"
      : tone === "amber"
        ? "var(--color-amber)"
        : tone === "wire"
          ? "var(--color-wire-bright)"
          : "var(--color-bone)";
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-baseline gap-3 border-b border-white/[0.04] px-4 py-2.5 last:border-b-0">
      <dt className="font-mono text-[9.5px] uppercase tracking-[0.28em] text-bone/40">
        {label}
      </dt>
      <dd
        className={[
          mono ? "font-mono tabular-nums" : "",
          "text-[12.5px]",
        ].join(" ")}
        style={{ color }}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failed cURL transcript
// ---------------------------------------------------------------------------

function FailedCurl({
  path,
  packetId,
  error,
}: {
  path: string;
  packetId: string;
  error?: Error;
}) {
  const isError = !!error;
  const status = isError ? "500 internal error" : "404 not found";
  const tagline = isError
    ? "the wire is intact. the handler is not."
    : "the wire is intact. the destination is not.";
  return (
    <motion.pre
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.85 }}
      className="relative mt-12 max-w-[640px] overflow-x-auto rounded-2xl border border-white/10 bg-black/55 p-5 font-mono text-[12.5px] leading-relaxed text-bone/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
    >
      <span className="text-[var(--color-wire-bright)]">$</span>{" "}
      <span className="text-bone">curl</span> -i{" "}
      <span className="text-[var(--color-amber)]">"https://pushr.sh{path}"</span>
      {"\n"}
      <span className="text-bone/55">
        {">"} GET {path} HTTP/2
      </span>
      {"\n"}
      <span className="text-bone/55">{">"} accept: */*</span>
      {"\n"}
      <span className="text-[var(--color-rose)]">{"<"} HTTP/2 {status}</span>
      {"\n"}
      <span className="text-bone/55">{"<"} content-type: text/plain</span>
      {"\n"}
      <span className="text-bone/55">{"<"} x-pushr-packet: {packetId}</span>
      {"\n"}
      <span className="text-bone/55">{"<"} x-pushr-route: ?</span>
      {"\n\n"}
      <span className="text-bone/70">{tagline}</span>
      {isError && error?.message ? (
        <>
          {"\n"}
          <span className="text-[var(--color-rose)]/80">
            ↳ {truncate(error.message, 140)}
          </span>
        </>
      ) : null}
      <span className="ml-1 inline-block h-[1em] w-[7px] -translate-y-[1px] bg-[var(--color-wire-bright)] align-middle animate-cursor" />
    </motion.pre>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// ---------------------------------------------------------------------------
// Diagnostics grid
// ---------------------------------------------------------------------------

function Diagnostics({ path, isError }: { path: string; isError: boolean }) {
  return (
    <section className="mt-24">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
        ▣ diagnostics
      </div>
      <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] sm:grid-cols-4">
        <Stat
          label="dropped"
          value="1"
          sub="(this one)"
          tone="rose"
        />
        <Stat label="uptime" value="99.97%" sub="last 30 days" />
        <Stat
          label="route"
          value="?"
          sub={path.length > 18 ? path.slice(0, 17) + "…" : path}
          tone="amber"
        />
        <Stat
          label="kind"
          value={isError ? "ERR" : "404"}
          sub={isError ? "exception" : "no-route"}
          tone="wire"
        />
      </dl>

      <p className="mt-6 max-w-[600px] font-mono text-[11px] uppercase tracking-[0.22em] text-bone/35">
        ↳ stay calm. the rest of the system is fine. only this packet was lost.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "rose" | "amber" | "wire";
}) {
  const color =
    tone === "rose"
      ? "var(--color-rose)"
      : tone === "amber"
        ? "var(--color-amber)"
        : tone === "wire"
          ? "var(--color-wire-bright)"
          : "var(--color-bone)";
  return (
    <div className="bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)] px-5 py-5">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-bone/45">
        {label}
      </div>
      <div
        className="mt-2 font-display text-[30px] tabular-nums leading-none tracking-tight"
        style={{ color }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-2 truncate font-mono text-[10px] uppercase tracking-[0.22em] text-bone/35">
          {sub}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coda
// ---------------------------------------------------------------------------

function Coda() {
  return (
    <footer className="mt-24 border-t border-white/[0.06] pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-bone/40">
          all paths lead somewhere · this one led nowhere
        </div>
        <Link
          to="/"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/60 transition hover:text-bone"
        >
          ← home
        </Link>
      </div>
      <h3 className="mt-10 select-none font-display text-[clamp(72px,16vw,220px)] leading-[0.82] tracking-[-0.06em] text-bone/[0.05]">
        return to sender
      </h3>
    </footer>
  );
}
