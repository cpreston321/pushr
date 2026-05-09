import { useMemo, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import {
  RELEASES,
  type Change,
  type ChangeKind,
  type Release,
  type Surface,
} from "../data/changelog";
import { SiteHeader } from "../components/SiteHeader";

const KIND_META: Record<
  ChangeKind,
  { label: string; color: string; symbol: string }
> = {
  added: {
    label: "added",
    color: "var(--color-signal)",
    symbol: "+",
  },
  changed: {
    label: "changed",
    color: "var(--color-wire-bright)",
    symbol: "~",
  },
  fixed: {
    label: "fixed",
    color: "var(--color-amber)",
    symbol: "✓",
  },
  removed: {
    label: "removed",
    color: "var(--color-rose)",
    symbol: "−",
  },
  security: {
    label: "security",
    color: "var(--color-rose)",
    symbol: "!",
  },
};

/**
 * Each shipping surface gets a quiet identity — a single letter and a tint
 * color. Used in the filter bar and as a small chip on every change row.
 * Order here is the order surfaces appear in the filter bar.
 */
const SURFACE_META: Record<
  Surface,
  { label: string; short: string; color: string }
> = {
  app: { label: "ios app", short: "app", color: "#79c0ff" },
  web: { label: "web · docs", short: "web", color: "#5be9b9" },
  api: { label: "http api", short: "api", color: "#4da3ff" },
  sdk: { label: "sdk", short: "sdk", color: "#ffb547" },
  cli: { label: "pushrsh cli", short: "cli", color: "#ff6b8b" },
};

const SURFACE_ORDER: Surface[] = ["app", "web", "api", "sdk", "cli"];

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function versionAnchor(v: string): string {
  return v.replace(/[^a-z0-9]/gi, "-");
}

function changelogHref(version: string): string {
  return `#${versionAnchor(version)}`;
}

export function Changelog() {
  const [filter, setFilter] = useState<Surface | null>(null);

  // Available surfaces across the whole log — drives which filter chips
  // render (no point offering "sdk" if no SDK change has ever shipped).
  const availableSurfaces = useMemo(() => collectSurfaces(RELEASES), []);

  // Apply the filter to each release: keep changes whose `surfaces` either
  // contain the active filter, or are unscoped (apply everywhere). A
  // release with zero matching changes drops out entirely.
  const filteredReleases = useMemo(
    () => filterReleases(RELEASES, filter),
    [filter],
  );
  const grouped = useMemo(() => groupByYear(filteredReleases), [filteredReleases]);

  const latest = RELEASES[0];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <ScrollProgressWire />

      <div className="absolute inset-0 -z-20 bg-blueprint" />
      <div className="absolute inset-0 -z-20 gradient-aurora opacity-35" />
      <div className="absolute inset-0 -z-10 bg-noise opacity-25" />
      <div className="anim-hairline absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-wire)] to-transparent" />

      <SiteHeader
        tag="log"
        nav={[
          { kind: "route", label: "docs", to: "/docs" },
          { kind: "route", label: "log", to: "/changelog" },
        ]}
      />

      <div className="relative mx-auto max-w-[920px] px-6 pt-14 pb-32 lg:pt-20">
        <Hero latest={latest} totalReleases={RELEASES.length} />

        <SurfaceFilter
          available={availableSurfaces}
          active={filter}
          onChange={setFilter}
        />

        {grouped.length === 0 ? (
          <EmptyFilterState
            surface={filter}
            onReset={() => setFilter(null)}
          />
        ) : (
          <div className="mt-14 space-y-24">
            {grouped.map(({ year, releases }) => (
              <section key={year}>
                <YearMarker year={year} />
                <div className="mt-10 space-y-16">
                  {releases.map((r) => (
                    <ReleaseEntry
                      key={r.version}
                      release={r}
                      filter={filter}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <Coda />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Topbar / hero / coda
// ---------------------------------------------------------------------------

function ScrollProgressWire() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);
  return (
    <motion.div
      style={{ scaleX, transformOrigin: "0% 50%" }}
      className="fixed left-0 right-0 top-0 z-40 h-[2px] bg-gradient-to-r from-[var(--color-wire-deep)] via-[var(--color-wire-bright)] to-[var(--color-signal)] shadow-[0_0_18px_-2px_var(--color-wire)]"
    />
  );
}

function Hero({
  latest,
  totalReleases,
}: {
  latest: Release;
  totalReleases: number;
}) {
  return (
    <section>
      <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
        00 · log
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-px w-12 bg-[var(--color-wire)]" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/40">
          every shipped change
        </span>
      </div>

      <h1 className="mt-7 font-display text-[clamp(54px,8vw,108px)] leading-[0.9] tracking-[-0.045em] text-bone">
        Change<span className="text-[var(--color-wire-bright)] glow-wire">log</span>
      </h1>

      <p className="mt-7 max-w-[600px] text-[18.5px] leading-[1.55] text-bone/75 text-pretty">
        Newest first. No marketing. If it shipped, it's here.
      </p>

      <dl className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
        <Stat label="latest" value={latest.version} accent />
        <Stat label="shipped" value={formatDate(latest.date)} />
        <Stat label="releases" value={String(totalReleases)} />
      </dl>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-[color-mix(in_oklab,var(--color-ink)_75%,transparent)] px-5 py-4">
      <div className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-bone/45">
        {label}
      </div>
      <div
        className={[
          "mt-2 font-mono tabular-nums",
          accent
            ? "text-[20px] text-[var(--color-wire-bright)]"
            : "text-[18px] text-bone",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function Coda() {
  return (
    <footer className="mt-32 border-t border-white/[0.06] pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-bone/40">
          end of log · subscribe via rss · soon™
        </div>
        <a
          href="#"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/60 transition hover:text-bone"
        >
          ↑ back to top
        </a>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Surface filter bar
// ---------------------------------------------------------------------------

function SurfaceFilter({
  available,
  active,
  onChange,
}: {
  available: Set<Surface>;
  active: Surface | null;
  onChange: (s: Surface | null) => void;
}) {
  const surfaces = SURFACE_ORDER.filter((s) => available.has(s));
  return (
    <div className="mt-12 flex flex-wrap items-center gap-2 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015] p-1.5">
      <FilterChip
        label="all"
        active={active === null}
        onClick={() => onChange(null)}
      />
      <span className="mx-1 h-4 w-px bg-white/10" />
      {surfaces.map((s) => {
        const meta = SURFACE_META[s];
        const isActive = active === s;
        return (
          <FilterChip
            key={s}
            label={meta.label}
            dot={meta.color}
            active={isActive}
            onClick={() => onChange(isActive ? null : s)}
          />
        );
      })}
    </div>
  );
}

function FilterChip({
  label,
  dot,
  active,
  onClick,
}: {
  label: string;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.22em] transition-colors",
        active
          ? "bg-white/[0.07] text-bone shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          : "text-bone/45 hover:bg-white/[0.025] hover:text-bone/75",
      ].join(" ")}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dot, opacity: active ? 1 : 0.55 }}
        />
      )}
      {label}
    </button>
  );
}

function EmptyFilterState({
  surface,
  onReset,
}: {
  surface: Surface | null;
  onReset: () => void;
}) {
  const meta = surface ? SURFACE_META[surface] : null;
  return (
    <div className="mt-16 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-10 text-center">
      <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-bone/45">
        no entries yet
      </div>
      <p className="mt-4 max-w-[440px] mx-auto text-[15px] leading-relaxed text-bone/65">
        Nothing has shipped to{" "}
        {meta ? (
          <span style={{ color: meta.color }}>{meta.label}</span>
        ) : (
          "this surface"
        )}{" "}
        yet. Check back, or browse every change.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-bone/75 transition hover:border-[var(--color-wire)]/40 hover:text-bone"
      >
        ← show all
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year marker
// ---------------------------------------------------------------------------

function YearMarker({ year }: { year: number }) {
  return (
    <div className="flex items-center gap-5">
      <div className="font-display text-[44px] leading-none tracking-[-0.03em] text-bone/90 tabular-nums">
        {year}
      </div>
      <div className="h-px flex-1 bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
      <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-bone/30">
        ▾
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Release entry
// ---------------------------------------------------------------------------

function ReleaseEntry({
  release,
  filter,
}: {
  release: Release;
  filter: Surface | null;
}) {
  const id = versionAnchor(release.version);
  const visibleChanges = useMemo(
    () => release.changes.filter((c) => matchesFilter(c, filter)),
    [release.changes, filter],
  );
  const summary = useMemo(() => summarize(visibleChanges), [visibleChanges]);
  return (
    <article
      id={id}
      className="group/release scroll-mt-28 grid grid-cols-1 gap-6 sm:grid-cols-[140px_minmax(0,1fr)]"
    >
      {/* Left rail: date + summary chips */}
      <aside className="space-y-3">
        <a
          href={changelogHref(release.version)}
          className="block font-mono text-[11px] uppercase tracking-[0.28em] text-bone/45 transition hover:text-bone"
        >
          {formatDate(release.date)}
        </a>
        <div className="flex flex-wrap gap-1.5 sm:flex-col sm:items-start sm:gap-1">
          {summary.map(({ kind, count }) => {
            const meta = KIND_META[kind];
            return (
              <span
                key={kind}
                className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em]"
                style={{ color: meta.color }}
              >
                <span className="tabular-nums opacity-70">{count}</span>
                <span className="opacity-90">{meta.label}</span>
              </span>
            );
          })}
        </div>
      </aside>

      {/* Right column: version, title, changes */}
      <div className="min-w-0">
        <div className="flex items-baseline gap-3">
          <a
            href={changelogHref(release.version)}
            className="font-mono text-[28px] tabular-nums tracking-tight text-bone no-underline transition-colors hover:text-[var(--color-wire-bright)]"
          >
            {release.version}
          </a>
          {release.yanked && (
            <span className="rounded-md border border-[var(--color-rose)]/35 bg-[var(--color-rose)]/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--color-rose)]">
              yanked · {release.yanked}
            </span>
          )}
        </div>

        {release.title && (
          <h2 className="mt-1 text-[20px] font-semibold tracking-tight text-bone/90 text-pretty">
            {release.title}
          </h2>
        )}

        <ul className="mt-5 space-y-2.5">
          {visibleChanges.map((change, i) => (
            <ChangeRow key={i} change={change} />
          ))}
        </ul>
      </div>
    </article>
  );
}

function ChangeRow({ change }: { change: Change }) {
  const meta = KIND_META[change.kind];
  return (
    <li className="grid grid-cols-[18px_92px_minmax(0,1fr)] items-baseline gap-3">
      <span
        aria-hidden
        className="font-mono text-[13px] tabular-nums text-center"
        style={{ color: meta.color }}
      >
        {meta.symbol}
      </span>
      <span
        className="font-mono text-[10px] uppercase tracking-[0.22em]"
        style={{ color: meta.color }}
      >
        {meta.label}
      </span>
      <span className="text-[14.5px] leading-[1.55] text-bone/80 text-pretty">
        <SurfaceChips surfaces={change.surfaces} />
        {change.text}
        {change.pr !== undefined && (
          <>
            {" "}
            <a
              href={`https://github.com/cpreston/pushr/pull/${change.pr}`}
              className="font-mono text-[11.5px] text-bone/40 underline decoration-bone/20 underline-offset-[3px] transition hover:text-bone hover:decoration-bone/60"
            >
              #{change.pr}
            </a>
          </>
        )}
      </span>
    </li>
  );
}

function SurfaceChips({ surfaces }: { surfaces?: Surface[] }) {
  if (!surfaces || surfaces.length === 0) return null;
  return (
    <span className="mr-2 inline-flex flex-wrap items-center gap-1 align-baseline">
      {surfaces.map((s) => {
        const meta = SURFACE_META[s];
        return (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.025] px-1.5 py-px font-mono text-[9.5px] uppercase tracking-[0.22em] text-bone/75"
            title={meta.label}
          >
            <span
              className="h-1 w-1 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.short}
          </span>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  // ISO YYYY-MM-DD parsed without a time zone (treat as a calendar date).
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function groupByYear(releases: Release[]): { year: number; releases: Release[] }[] {
  const buckets = new Map<number, Release[]>();
  for (const r of releases) {
    const year = Number(r.date.slice(0, 4));
    if (!buckets.has(year)) buckets.set(year, []);
    buckets.get(year)!.push(r);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, releases]) => ({ year, releases }));
}

function matchesFilter(change: Change, filter: Surface | null): boolean {
  if (filter === null) return true;
  // Unscoped changes (no `surfaces` field) are treated as global — they
  // show up no matter which surface is being filtered. Tag a surface
  // explicitly to keep a change scoped.
  if (!change.surfaces || change.surfaces.length === 0) return true;
  return change.surfaces.includes(filter);
}

function filterReleases(releases: Release[], filter: Surface | null): Release[] {
  if (filter === null) return releases;
  const out: Release[] = [];
  for (const r of releases) {
    const kept = r.changes.filter((c) => matchesFilter(c, filter));
    if (kept.length > 0) out.push({ ...r, changes: kept });
  }
  return out;
}

function collectSurfaces(releases: Release[]): Set<Surface> {
  const out = new Set<Surface>();
  for (const r of releases) {
    for (const c of r.changes) {
      for (const s of c.surfaces ?? []) out.add(s);
    }
  }
  return out;
}

function summarize(changes: Change[]): { kind: ChangeKind; count: number }[] {
  const counts = new Map<ChangeKind, number>();
  for (const c of changes) {
    counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  }
  const order: ChangeKind[] = [
    "added",
    "changed",
    "fixed",
    "removed",
    "security",
  ];
  return order
    .filter((k) => counts.has(k))
    .map((k) => ({ kind: k, count: counts.get(k)! }));
}
