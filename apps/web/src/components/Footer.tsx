import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";

export function Footer() {
  return (
    <section
      id="install"
      className="relative overflow-hidden border-t border-white/[0.06] py-32"
    >
      <div className="absolute inset-0 -z-20 gradient-aurora opacity-70" />
      <div className="absolute inset-0 -z-10 bg-blueprint opacity-30" />

      <div className="mx-auto max-w-[1280px] px-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-3">
            <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
              04 / Install
            </div>
            <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />
          </div>
          <div className="col-span-12 lg:col-span-9">
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6 }}
              className="font-display text-[clamp(48px,7vw,96px)] leading-[0.92] tracking-[-0.04em] text-balance text-bone"
            >
              one app.{" "}
              <span className="text-[var(--color-wire-bright)] glow-wire">
                three doorways.
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-6 max-w-[640px] text-[17px] leading-relaxed text-bone/65"
            >
              Receive on iPhone. Send from your shell. Wire it into any
              codebase with the SDK. Pick one — or use all three.
            </motion.p>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-4 md:grid-cols-3">
          <InstallCard
            kind="iOS app"
            title="pushr"
            tagline="App Store · iPhone & iPad"
            command="App Store"
            cta="Download"
            href="#"
            snippet={
              <span className="inline-flex items-center gap-2">
                <AppleGlyph small /> iOS 16.2+
              </span>
            }
            accent="wire"
          />
          <InstallCard
            kind="CLI"
            title="pushrsh"
            tagline="single-binary, built with Bun"
            command="brew install pushrsh"
            cta="View on GitHub"
            href="#"
            snippet={
              <>
                <span className="text-[var(--color-wire-bright)]">$</span>{" "}
                <span className="text-bone">pushrsh</span>{" "}
                <span className="text-[var(--color-amber)]">"shipped"</span>{" "}
                <span className="text-bone/60">-p high</span>
              </>
            }
            accent="signal"
          />
          <InstallCard
            kind="SDK"
            title="pushr"
            tagline="zero deps · any fetch runtime"
            command="bun add pushr"
            cta="Read the docs"
            href="#"
            snippet={
              <>
                <span className="text-[var(--color-wire-bright)]">await</span>{" "}
                <span className="text-bone">notify</span>
                <span className="text-bone/60">{"({ title, body })"}</span>
              </>
            }
            accent="amber"
          />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/40 p-6">
          <div className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/45">
            What ships in each surface
          </div>
          <div className="mt-4 grid grid-cols-1 gap-6 text-[14px] text-bone/70 md:grid-cols-3">
            <div>
              <div className="text-bone">iOS app</div>
              <p className="mt-1 leading-snug text-bone/55">
                Live feed, Dynamic Island, badge sync, source-app and device
                management.
              </p>
            </div>
            <div>
              <div className="text-bone">CLI · pushrsh</div>
              <p className="mt-1 leading-snug text-bone/55">
                Send, schedule, pipe stdin, drive Live Activities, attach
                actions — all from the shell.
              </p>
            </div>
            <div>
              <div className="text-bone">SDK · pushr</div>
              <p className="mt-1 leading-snug text-bone/55">
                Typed{" "}
                <span className="font-mono text-bone">notify()</span> +{" "}
                <span className="font-mono text-bone">liveActivity()</span>.
                Node, Bun, Deno, edge — anywhere fetch runs.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-24 grid grid-cols-12 gap-6 border-t border-white/[0.06] pt-10">
          <div className="col-span-12 md:col-span-5">
            <div className="flex items-center gap-2.5">
              <img
                src="/pushr-icon.png"
                alt="pushr"
                width={28}
                height={28}
                className="h-7 w-7 rounded-lg shadow-[0_4px_18px_-4px_var(--color-wire)]"
              />
              <span className="font-mono text-[13px] tracking-tight text-bone">pushr.sh</span>
            </div>
            <p className="mt-4 max-w-[360px] text-[13.5px] leading-relaxed text-bone/55">
              A personal push-notification hub. Built on Convex + Apple Push. Made by builders,
              for builders.
            </p>
          </div>

          <FootCol
            title="Product"
            items={[
              ["App Store", "#install"],
              ["Features", "#features"],
              ["API", "/docs"],
              ["Changelog", "/changelog"],
            ]}
          />
          <FootCol
            title="Developers"
            items={[
              ["Docs", "/docs"],
              ["GitHub", "#"],
              ["CLI · pushrsh", "#"],
              ["SDK · pushr", "#"],
            ]}
          />
          <FootCol
            title="Connect"
            items={[
              ["Twitter", "#"],
              ["Email", "#"],
              ["Privacy", "#"],
              ["Terms", "#"],
            ]}
          />
        </div>

        {/* Big logotype echo */}
        <div className="mt-20 select-none">
          <div className="flex items-end justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-bone/35">
              © pushr.sh, 2026 — wired in California
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.32em] text-bone/35">
              status: <span className="text-[var(--color-signal)]">all systems pushing</span>
            </span>
          </div>
          <h3 className="mt-10 font-display text-[clamp(120px,24vw,360px)] leading-[0.8] tracking-[-0.04em] text-bone/[0.08]">
            <span>pushr</span>.sh
          </h3>
        </div>
      </div>
    </section>
  );
}

type InstallAccent = "wire" | "signal" | "amber";

function InstallCard({
  kind,
  title,
  tagline,
  command,
  cta,
  href,
  snippet,
  accent,
}: {
  kind: string;
  title: string;
  tagline: string;
  command: string;
  cta: string;
  href: string;
  snippet: React.ReactNode;
  accent: InstallAccent;
}) {
  const tints: Record<InstallAccent, string> = {
    wire: "rgba(77,163,255,0.10)",
    signal: "rgba(91,233,185,0.08)",
    amber: "rgba(255,181,71,0.06)",
  };
  const accentColor: Record<InstallAccent, string> = {
    wire: "var(--color-wire-bright)",
    signal: "var(--color-signal)",
    amber: "var(--color-amber)",
  };
  return (
    <div
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-white/20"
      style={{
        backgroundImage: `radial-gradient(140% 100% at 0% 0%, ${tints[accent]}, transparent 65%)`,
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="font-mono text-[10.5px] uppercase tracking-[0.28em]"
          style={{ color: accentColor[accent] }}
        >
          {kind}
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/40">
          v1.0
        </span>
      </div>
      <div>
        <div
          className="font-display text-[28px] leading-none tracking-[-0.03em] text-bone"
        >
          {title}
        </div>
        <div className="mt-1 text-[12.5px] text-bone/55">{tagline}</div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[12px] text-bone/85">
        {snippet}
      </div>
      <a
        href={href}
        className="mt-auto inline-flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/65 transition hover:border-[var(--color-wire)] hover:bg-white/[0.05] hover:text-bone"
      >
        <span className="truncate">{command}</span>
        <span className="text-bone/45 group-hover:text-bone">↗</span>
      </a>
      <div className="text-[11px] uppercase tracking-[0.22em] text-bone/35">{cta}</div>
    </div>
  );
}

function FootCol({ title, items }: { title: string; items: [string, string][] }) {
  return (
    <div className="col-span-6 md:col-span-2.5 lg:col-span-2">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/45">
        {title}
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map(([label, href]) => (
          <li key={label}>
            {href.startsWith("/") ? (
              <Link
                to={href}
                className="text-[14px] text-bone/70 transition hover:text-bone"
              >
                {label}
              </Link>
            ) : (
              <a
                href={href}
                className="text-[14px] text-bone/70 transition hover:text-bone"
              >
                {label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AppleGlyph({ small }: { small?: boolean } = {}) {
  const size = small ? 12 : 32;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M11.16 8.32c-.02-2.05 1.67-3.03 1.74-3.08-.95-1.39-2.42-1.58-2.95-1.6-1.25-.13-2.45.74-3.08.74-.65 0-1.62-.72-2.66-.7-1.36.02-2.62.79-3.32 2.01-1.42 2.46-.36 6.1.99 8.1.69.99 1.5 2.09 2.55 2.05 1.03-.04 1.42-.66 2.66-.66 1.24 0 1.6.66 2.69.64 1.11-.02 1.81-1 2.49-1.99.78-1.13 1.1-2.24 1.12-2.3-.02-.01-2.16-.83-2.18-3.21zM9.32 2.92c.56-.69.95-1.65.84-2.61-.81.04-1.81.55-2.4 1.23-.52.6-.99 1.58-.86 2.52.91.07 1.84-.46 2.42-1.14z" />
    </svg>
  );
}
