import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { motion, useScroll, useTransform } from "motion/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import apiMarkdown from "../../../../public/API.md?raw";
import { getHighlighter, normalizeLang, SHIKI_THEME } from "../lib/shiki";
import { SiteHeader } from "../components/SiteHeader";

type TocLeaf = { id: string; text: string };
type TocSection = {
  id: string;
  text: string;
  number: string;
  children: TocLeaf[];
};

const STRIPPED_MD = stripFirstHeading(apiMarkdown);

function anchorHref(id: string): string {
  return `#${id}`;
}

export function Docs() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sections = useMemo(() => buildToc(STRIPPED_MD), []);

  // Scroll-spy: which section is currently in view → drives sidebar active
  // state.
  useEffect(() => {
    const ids = sections.flatMap((s) => [s.id, ...s.children.map((c) => c.id)]);
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: [0, 1] },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <ScrollProgressWire />

      <div className="absolute inset-0 -z-20 bg-blueprint" />
      <div className="absolute inset-0 -z-20 gradient-aurora opacity-40" />
      <div className="absolute inset-0 -z-10 bg-noise opacity-25" />
      <div className="anim-hairline absolute left-0 right-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--color-wire)] to-transparent" />

      <SiteHeader
        tag="api · ref"
        nav={[
          { kind: "route", label: "docs", to: "/docs" },
          { kind: "route", label: "log", to: "/changelog" },
        ]}
      />

      <div className="relative mx-auto grid max-w-[1320px] grid-cols-1 gap-12 px-6 pt-14 pb-32 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16 lg:pt-20">
        <Sidebar sections={sections} activeId={activeId} />
        <article className="min-w-0">
          <Hero />
          <TryIt />
          <div className="mt-20 docs-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={mdComponents}
            >
              {STRIPPED_MD}
            </ReactMarkdown>
          </div>
          <Coda />
        </article>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Layout pieces
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

function Hero() {
  return (
    <section className="relative">
      <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
        00 · ref
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="h-px w-12 bg-[var(--color-wire)]" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/40">
          v1.0 · stable
        </span>
      </div>

      <h1 className="mt-7 font-display text-[clamp(54px,8vw,108px)] leading-[0.9] tracking-[-0.045em] text-bone">
        HTTP{" "}
        <span className="text-[var(--color-wire-bright)] glow-wire">API</span>
      </h1>

      <p className="mt-7 max-w-[680px] text-[18.5px] leading-[1.55] text-bone/75 text-pretty">
        One bearer token. One URL.{" "}
        <span className="font-mono text-bone">POST</span> a JSON payload — your
        phone lights up. Live Activities, ack-or-escalate, scheduled delivery,
        action buttons, webhook adapters. The whole surface, one page.
      </p>

      <div className="mt-9 flex flex-wrap items-center gap-3">
        <a
          href={anchorHref("post-notify")}
          className="group inline-flex items-center gap-2.5 rounded-full border border-[var(--color-wire)]/40 bg-[var(--color-wire)]/5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-bone transition hover:border-[var(--color-wire)] hover:bg-[var(--color-wire)]/10"
        >
          <span className="h-1 w-1 rounded-full bg-[var(--color-wire-bright)]" />
          start with /notify
          <span className="text-bone/50 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </a>
        <a
          href={anchorHref("live-activities")}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-bone/70 transition hover:border-white/20 hover:text-bone"
        >
          live activities
        </a>
        <a
          href={anchorHref("source-app-token-format")}
          className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.02] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-bone/70 transition hover:border-white/20 hover:text-bone"
        >
          tokens
        </a>
      </div>
    </section>
  );
}

function Coda() {
  return (
    <footer className="mt-32 border-t border-white/[0.06] pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-bone/40">
          end of reference · all systems pushing
        </div>
        <a
          href="#"
          className="font-mono text-[11px] uppercase tracking-[0.22em] text-bone/60 transition hover:text-bone"
        >
          ↑ back to top
        </a>
      </div>
      <h3 className="mt-10 select-none font-display text-[clamp(80px,16vw,220px)] leading-[0.82] tracking-[-0.045em] text-bone/[0.05]">
        post / notify
      </h3>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Interactive "Try it" panel — paste a token, fire a real /notify
// ---------------------------------------------------------------------------

type TryItResponse = {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
};

function useLocalStorage(key: string, initial: string): [string, (v: string) => void] {
  const [value, setValueState] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try {
      return window.localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  const setValue = (v: string) => {
    setValueState(v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      // Storage may be unavailable in private mode — fall back to memory.
    }
  };
  return [value, setValue];
}

function TryIt() {
  const [url, setUrl] = useLocalStorage("pushr-docs-url", "");
  const [token, setToken] = useLocalStorage("pushr-docs-token", "");
  const [title, setTitle] = useState("Hello from the docs");
  const [body, setBody] = useState("It works.");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [showToken, setShowToken] = useState(false);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<TryItResponse | null>(null);

  const cleanUrl = url.trim().replace(/\/+$/, "");
  const cleanToken = token.trim();
  const ready = !!cleanUrl && !!cleanToken && !!title.trim() && !!body.trim();

  // Always include priority in the payload. Sending `"priority":"normal"`
  // is equivalent to omitting it server-side, but keeping it here pins the
  // curl preview to a constant character count so changing priority doesn't
  // shift the layout of the response/curl column.
  const payload = useMemo(
    () => ({
      title: title.trim(),
      body: body.trim(),
      priority,
    }),
    [title, body, priority],
  );

  async function send() {
    if (!ready || sending) return;
    setSending(true);
    setResponse(null);
    const start = performance.now();
    try {
      const res = await fetch(`${cleanUrl}/notify`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      setResponse({
        status: res.status,
        ok: res.ok,
        body: prettyJson(text),
        durationMs: Math.round(performance.now() - start),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setResponse({
        status: 0,
        ok: false,
        body: `${msg}\n\n(If the request never left, the deployment may not allow CORS from this origin. Use curl from a terminal instead.)`,
        durationMs: Math.round(performance.now() - start),
      });
    } finally {
      setSending(false);
    }
  }

  const status: "idle" | "sending" | "ok" | "fail" = sending
    ? "sending"
    : !response
      ? "idle"
      : response.ok
        ? "ok"
        : "fail";

  return (
    <section
      id="try-it"
      aria-label="Send a test notification"
      className="mt-12 overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#0c1322]/85 to-[#0a0f1c]/95 shadow-[0_24px_80px_-40px_rgba(10,132,255,0.35)]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] bg-white/[0.015] px-5 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]/85">
            01 · live · POST /notify
          </span>
          <span className="hidden h-3 w-px bg-white/10 sm:inline-block" />
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.28em] text-bone/45 sm:inline">
            paste · send · receive
          </span>
        </div>
        <StatusPill status={status} statusCode={response?.status} />
      </div>

      <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.05fr_1fr]">
        {/* LEFT — form */}
        <div className="space-y-5 p-6 lg:border-r lg:border-white/[0.05]">
          <Field label="deployment url" hint="https://<your>.convex.site">
            <input
              type="url"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://insightful-skunk-123.convex.site"
              className="w-full bg-transparent font-mono text-[13px] text-bone placeholder:text-bone/30 focus:outline-none"
            />
          </Field>

          <Field
            label="bearer token"
            hint={
              cleanToken
                ? "saved on this device"
                : "paste your pshr_… token"
            }
            trailing={
              <button
                type="button"
                onClick={() => setShowToken((s) => !s)}
                className="font-mono text-[10px] uppercase tracking-[0.22em] text-bone/55 transition hover:text-bone"
                aria-label={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? "hide" : "show"}
              </button>
            }
          >
            <input
              type={showToken ? "text" : "password"}
              spellCheck={false}
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="pshr_…"
              className="w-full bg-transparent font-mono text-[13px] tracking-tight text-bone placeholder:text-bone/30 focus:outline-none"
            />
          </Field>

          <Field label="title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full bg-transparent text-[14px] text-bone placeholder:text-bone/30 focus:outline-none"
            />
          </Field>

          <Field label="body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={400}
              className="w-full resize-none bg-transparent text-[14px] leading-snug text-bone placeholder:text-bone/30 focus:outline-none"
            />
          </Field>

          {/* Priority gets its own row so its width can never feed back into
              another column. Rendered as a non-label container because a
              <label> shouldn't wrap a multi-control radio group. */}
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-bone/55">
                priority
              </span>
              <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-bone/30">
                low · normal · high
              </span>
            </div>
            <div className="mt-2">
              <PriorityPills value={priority} onChange={setPriority} />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={send}
              disabled={!ready || sending}
              className={[
                "group relative inline-flex flex-1 items-center justify-center gap-2.5 overflow-hidden rounded-lg px-4 py-3 font-mono text-[12px] uppercase tracking-[0.28em] transition",
                ready && !sending
                  ? "bg-[var(--color-wire-bright)] text-[var(--color-ink)] shadow-[0_0_0_1px_rgba(121,192,255,0.45),0_18px_48px_-18px_rgba(121,192,255,0.6)] hover:bg-[var(--color-wire-bright)]/90"
                  : "border border-white/10 bg-white/[0.02] text-bone/45",
              ].join(" ")}
            >
              {sending ? (
                <>
                  <SendingSpinner />
                  sending…
                </>
              ) : (
                <>
                  <span
                    className={
                      ready
                        ? "h-1.5 w-1.5 rounded-full bg-[var(--color-ink)]"
                        : "h-1.5 w-1.5 rounded-full bg-bone/30"
                    }
                  />
                  send POST /notify
                  <span
                    className={
                      ready
                        ? "transition-transform group-hover:translate-x-0.5"
                        : "opacity-30"
                    }
                  >
                    →
                  </span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11.5px] leading-relaxed text-bone/40">
            URL + token persist in this browser only. Nothing is logged
            server-side by the docs page.
          </p>
        </div>

        {/* RIGHT — response */}
        <div className="flex min-h-[260px] flex-col bg-[#080d18]/60">
          <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/[0.015] px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-bone/55">
              {response ? "response" : sending ? "awaiting…" : "pending"}
            </span>
            {response ? (
              <span className="font-mono text-[10px] tabular-nums text-bone/50">
                {response.durationMs} ms
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-bone/30">
                —
              </span>
            )}
          </div>
          <div className="flex-1 overflow-auto px-5 py-4">
            {response ? (
              <pre
                className={[
                  "whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.6]",
                  response.ok
                    ? "text-bone/85"
                    : "text-[color-mix(in_oklab,var(--color-rose)_85%,white)]",
                ].join(" ")}
              >
                {response.body || "(empty body)"}
              </pre>
            ) : (
              <div className="flex h-full flex-col items-start justify-center gap-2 text-bone/35">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-[var(--color-wire-bright)]/55">
                  ▌ idle
                </span>
                <p className="max-w-[260px] text-[12.5px] leading-relaxed">
                  Fill in URL + token, hit send. The actual HTTP response
                  prints here — status, latency, body.
                </p>
              </div>
            )}
          </div>
          <div className="border-t border-white/[0.05] bg-white/[0.01] px-5 py-3">
            <div className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-bone/40">
              effective curl
            </div>
            <pre
              className="mt-1.5 overflow-x-auto whitespace-pre font-mono text-[11px] leading-[1.55] text-bone/65"
              style={{ scrollbarGutter: "stable" }}
            >
              {curlPreview(cleanUrl, cleanToken, payload)}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}

const STATUS_META: Record<
  "idle" | "sending" | "ok" | "fail",
  { label: string; dot: string; text: string }
> = {
  idle: { label: "idle", dot: "bg-bone/30", text: "text-bone/45" },
  sending: {
    label: "sending",
    dot: "bg-[var(--color-wire-bright)] animate-pulse-wire",
    text: "text-[var(--color-wire-bright)]",
  },
  ok: {
    label: "ok",
    dot: "bg-[var(--color-signal)]",
    text: "text-[var(--color-signal)]",
  },
  fail: {
    label: "fail",
    dot: "bg-[var(--color-rose)]",
    text: "text-[var(--color-rose)]",
  },
};

function StatusPill({
  status,
  statusCode,
}: {
  status: "idle" | "sending" | "ok" | "fail";
  statusCode?: number;
}) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.28em]">
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      <span className={meta.text}>
        {statusCode && (status === "ok" || status === "fail")
          ? statusCode
          : meta.label}
      </span>
    </span>
  );
}

function Field({
  label,
  hint,
  trailing,
  children,
}: {
  label: string;
  hint?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-bone/55">
          {label}
        </span>
        {hint && !trailing && (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-bone/30">
            {hint}
          </span>
        )}
        {trailing}
      </div>
      <div className="mt-2 rounded-md border border-white/[0.08] bg-black/35 px-3 py-2.5 transition focus-within:border-[var(--color-wire)]/55 focus-within:bg-black/50 focus-within:shadow-[0_0_0_3px_rgba(77,163,255,0.12)]">
        {children}
      </div>
    </label>
  );
}

function PriorityPills({
  value,
  onChange,
}: {
  value: "low" | "normal" | "high";
  onChange: (v: "low" | "normal" | "high") => void;
}) {
  const opts = ["low", "normal", "high"] as const;
  // Equal-width segmented control. Each cell is the same size regardless of
  // text length, and selection only swaps colors — never anything that
  // affects box geometry — so clicking a pill produces zero layout shift.
  return (
    <div
      role="radiogroup"
      aria-label="Priority"
      className="grid w-full grid-cols-3 overflow-hidden rounded-md border border-white/[0.08] bg-black/25"
    >
      {opts.map((opt) => {
        const active = opt === value;
        const tint =
          opt === "high"
            ? "var(--color-amber)"
            : opt === "low"
              ? "var(--color-bone-dim)"
              : "var(--color-wire-bright)";
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt)}
            className={[
              "relative flex h-9 items-center justify-center font-mono text-[11px] uppercase tracking-[0.22em] outline-none transition-colors",
              active
                ? "bg-white/[0.06] text-bone"
                : "text-bone/45 hover:bg-white/[0.02] hover:text-bone/70",
            ].join(" ")}
            style={active ? { color: tint } : undefined}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SendingSpinner() {
  return (
    <span className="relative inline-flex h-3 w-3 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-[var(--color-ink)]/20 border-t-[var(--color-ink)] animate-spin" />
    </span>
  );
}

function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * Render the curl preview with each JSON property on its own line. Keeps
 * the only line that depends on `priority` short and constant in line
 * count, so toggling priority can't reflow the preview.
 */
function curlPreview(
  url: string,
  token: string,
  payload: { title: string; body: string; priority: string },
): string {
  const u = url || "$PUSHR_URL";
  const t = token ? `${token.slice(0, 9)}…` : "$PUSHR_TOKEN";
  const json = JSON.stringify(payload, null, 2)
    .split("\n")
    .map((line, i) => (i === 0 ? line : `       ${line}`))
    .join("\n");
  return [
    `curl -X POST ${u}/notify \\`,
    `  -H "Authorization: Bearer ${t}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${json}'`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({
  sections,
  activeId,
}: {
  sections: TocSection[];
  activeId: string | null;
}) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-24">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
          ref · contents
        </div>
        <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />

        <nav className="mt-8 flex flex-col gap-7">
          {sections.map((section) => (
            <SidebarSection
              key={section.id}
              section={section}
              activeId={activeId}
            />
          ))}
        </nav>

        <div className="mt-12 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-bone/45">
            quick start
          </div>
          <pre className="mt-3 overflow-x-auto font-mono text-[11.5px] leading-[1.6] text-bone/85">
            <span className="text-[var(--color-wire-bright)]">curl</span>
            {" -X POST "}
            <span className="text-[var(--color-amber)]">$URL/notify</span>
            {"\n"}
            {"  "}
            <span className="text-bone/55">-H</span>{" "}
            <span className="text-[var(--color-amber)]">"Auth: Bearer …"</span>
            {"\n"}
            {"  "}
            <span className="text-bone/55">-d</span>{" "}
            <span className="text-[var(--color-amber)]">'&#123;…&#125;'</span>
          </pre>
        </div>
      </div>
    </aside>
  );
}

function SidebarSection({
  section,
  activeId,
}: {
  section: TocSection;
  activeId: string | null;
}) {
  const isSectionActive =
    activeId === section.id ||
    section.children.some((c) => c.id === activeId);

  return (
    <div className="relative">
      <a
        href={anchorHref(section.id)}
        className="group block"
        aria-current={activeId === section.id ? "true" : undefined}
      >
        <div className="flex items-baseline gap-3">
          <span
            className={[
              "font-mono text-[10.5px] tracking-[0.18em] tabular-nums transition-colors",
              isSectionActive
                ? "text-[var(--color-wire-bright)]"
                : "text-bone/30 group-hover:text-bone/55",
            ].join(" ")}
          >
            /{section.number}
          </span>
          <span
            className={[
              "text-[14px] leading-tight tracking-tight transition-colors",
              isSectionActive
                ? "text-bone"
                : "text-bone/65 group-hover:text-bone/90",
            ].join(" ")}
          >
            {section.text}
          </span>
        </div>
      </a>
      {section.children.length > 0 && (
        <div className="relative ml-[26px] mt-3 flex flex-col gap-1.5 border-l border-white/[0.07] pl-4">
          {section.children.map((leaf) => {
            const active = activeId === leaf.id;
            return (
              <a
                key={leaf.id}
                href={anchorHref(leaf.id)}
                aria-current={active ? "true" : undefined}
                className="relative block"
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-rail"
                    className="absolute -left-[17px] top-0 bottom-0 w-px bg-[var(--color-wire-bright)] shadow-[0_0_8px_var(--color-wire)]"
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30,
                    }}
                  />
                )}
                <span
                  className={[
                    "block truncate text-[12.5px] leading-snug transition-colors",
                    active
                      ? "text-bone"
                      : "text-bone/50 hover:text-bone/80",
                  ].join(" ")}
                >
                  {leaf.text}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code block (shiki)
// ---------------------------------------------------------------------------

const highlightCache = new Map<string, string>();

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(() => {
    const key = `${lang}::${code}`;
    return highlightCache.get(key) ?? null;
  });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const key = `${lang}::${code}`;
    if (highlightCache.has(key)) {
      setHtml(highlightCache.get(key)!);
      return;
    }
    let cancel = false;
    getHighlighter()
      .then((hl) => {
        if (cancel) return;
        const out = hl.codeToHtml(code, {
          lang: normalizeLang(lang),
          theme: SHIKI_THEME,
        });
        highlightCache.set(key, out);
        setHtml(out);
      })
      .catch(() => {
        // Fall back to plain rendering if shiki fails to init.
        if (!cancel) setHtml(null);
      });
    return () => {
      cancel = true;
    };
  }, [code, lang]);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }

  const niceLang = lang === "text" ? "plain" : lang;
  const lineCount = code.split("\n").length;

  return (
    <div className="group relative mt-7 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080d18] shadow-[0_2px_0_rgba(255,255,255,0.02)_inset,0_24px_60px_-30px_rgba(10,132,255,0.25)]">
      <div className="flex items-center justify-between border-b border-white/[0.05] bg-white/[0.015] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-wire)]/60" />
            <span className="h-1.5 w-1.5 rounded-full bg-bone/15" />
            <span className="h-1.5 w-1.5 rounded-full bg-bone/15" />
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-wire-bright)]/80">
            {niceLang}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-bone/30">
            · {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
        </div>
        <button
          type="button"
          onClick={copy}
          className={[
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.22em] transition",
            copied
              ? "border-[var(--color-signal)]/40 bg-[var(--color-signal)]/10 text-[var(--color-signal)]"
              : "border-white/10 bg-white/[0.02] text-bone/55 hover:border-[var(--color-wire)]/40 hover:text-bone",
          ].join(" ")}
          aria-label="Copy code"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="relative overflow-x-auto">
        {html ? (
          <div
            className="shiki-host"
            // shiki returns sanitized, escaped HTML — safe to inject
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="px-5 py-4 font-mono text-[13px] leading-[1.65] text-bone/85">
            {code}
          </pre>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown component overrides
// ---------------------------------------------------------------------------

const mdComponents: NonNullable<
  Parameters<typeof ReactMarkdown>[0]["components"]
> = {
  h1: ({ children, ...props }) => (
    <h1
      {...props}
      className="mt-20 font-display text-[44px] leading-[0.96] tracking-[-0.035em] text-bone"
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => {
    const id = idFromChildren(children);
    return (
      <div className="mt-20">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]/80">
          §
        </div>
        <h2
          {...props}
          id={id}
          className="group mt-2 scroll-mt-28 font-display text-[36px] leading-[1.05] tracking-[-0.025em] text-bone"
        >
          <a
            href={anchorHref(id)}
            className="relative inline-block no-underline"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -left-7 top-1/2 -translate-y-1/2 font-mono text-[14px] tracking-tight text-[var(--color-wire-bright)]/0 transition-opacity group-hover:text-[var(--color-wire-bright)]/70"
            >
              §
            </span>
            {children}
          </a>
        </h2>
        <div className="mt-3 h-px w-10 bg-gradient-to-r from-[var(--color-wire)] to-transparent" />
      </div>
    );
  },
  h3: ({ children, ...props }) => {
    const id = idFromChildren(children);
    return (
      <h3
        {...props}
        id={id}
        className="group mt-12 scroll-mt-28 text-[20px] font-semibold tracking-tight text-bone"
      >
        <a href={anchorHref(id)} className="no-underline">
          {children}
        </a>
      </h3>
    );
  },
  h4: ({ children, ...props }) => (
    <h4
      {...props}
      className="mt-9 font-mono text-[10.5px] uppercase tracking-[0.28em] text-bone/55"
    >
      {children}
    </h4>
  ),
  p: ({ children, ...props }) => (
    <p {...props} className="mt-5 leading-[1.72] text-bone/75 text-pretty">
      {children}
    </p>
  ),
  a: ({ children, href, ...props }) => (
    <a
      {...props}
      href={href}
      className="text-[var(--color-wire-bright)] underline decoration-[var(--color-wire)]/35 underline-offset-[5px] transition-colors hover:decoration-[var(--color-wire)]"
    >
      {children}
    </a>
  ),
  ul: ({ children, ...props }) => (
    <ul
      {...props}
      className="mt-5 list-none space-y-2.5 pl-0 text-bone/75"
    >
      {Children.map(children, (child) =>
        isValidElement(child) ? child : null,
      )}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      {...props}
      className="mt-5 list-decimal space-y-2.5 pl-6 text-bone/75 marker:font-mono marker:text-[var(--color-wire)]/55"
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li
      {...props}
      className="relative pl-6 leading-[1.7] before:absolute before:left-0 before:top-[0.85em] before:h-px before:w-3 before:bg-[var(--color-wire)]/35"
    >
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-bone">{children}</strong>
  ),
  em: ({ children }) => <em className="text-bone/85">{children}</em>,
  hr: () => (
    <div
      role="separator"
      className="my-16 flex items-center gap-3"
      aria-hidden
    >
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <span className="font-mono text-[10px] uppercase tracking-[0.32em] text-bone/30">
        ·
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mt-6 rounded-r-lg border-l-2 border-[var(--color-wire-bright)]/50 bg-white/[0.015] py-3 pl-5 pr-4 italic text-bone/70">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => {
    // Pull the wrapped <code> child to extract raw text + language.
    const child = Children.toArray(children).find(
      (c): c is ReactElement<{ className?: string; children?: ReactNode }> =>
        isValidElement(c),
    );
    const className =
      (child?.props as { className?: string } | undefined)?.className ?? "";
    const lang = /language-(\w+)/.exec(className)?.[1] ?? "text";
    const raw =
      typeof (child?.props as { children?: ReactNode } | undefined)
        ?.children === "string"
        ? ((child!.props as { children: string }).children as string)
        : "";
    const code = raw.replace(/\n$/, "");
    return <CodeBlock code={code} lang={lang} />;
  },
  code: ({ className, children, ...props }: any) => {
    // After the `pre` override, this is reached only for inline code.
    return (
      <code
        {...props}
        className={[
          "rounded-md border border-white/[0.08] bg-black/35 px-[6px] py-[2px] font-mono text-[0.86em] text-[var(--color-wire-bright)]",
          className ?? "",
        ].join(" ")}
      >
        {children}
      </code>
    );
  },
  table: ({ children }) => (
    <div className="mt-7 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.015]">
      <table className="w-full border-collapse text-left text-[13.5px]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-white/[0.025]">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border-b border-white/[0.08] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--color-wire-bright)]/80">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-white/[0.04] px-4 py-3 align-top text-bone/75 leading-[1.55]">
      {children}
    </td>
  ),
  tr: ({ children }) => <tr className="last:[&_td]:border-b-0">{children}</tr>,
};

// ---------------------------------------------------------------------------
// Markdown helpers (TOC + slugs)
// ---------------------------------------------------------------------------

function idFromChildren(children: ReactNode): string {
  return slugify(extractText(children));
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (
    node &&
    typeof node === "object" &&
    "props" in node &&
    (node as { props: { children?: ReactNode } }).props
  ) {
    return extractText(
      (node as { props: { children?: ReactNode } }).props.children,
    );
  }
  return "";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function buildToc(md: string): TocSection[] {
  const sections: TocSection[] = [];
  const lines = md.split("\n");
  let inFence = false;
  let current: TocSection | null = null;
  let counter = 0;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      const text = stripBackticks(h2[1]);
      const id = slugify(text);
      current = {
        id,
        text,
        number: String(counter).padStart(2, "0"),
        children: [],
      };
      sections.push(current);
      counter++;
      continue;
    }
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h3 && current) {
      const text = stripBackticks(h3[1]);
      current.children.push({ id: slugify(text), text });
    }
  }
  return sections;
}

function stripBackticks(s: string): string {
  return s.replace(/`/g, "");
}

function stripFirstHeading(md: string): string {
  // The hero renders our own title — peel the first H1 off the markdown so
  // it doesn't double up.
  return md.replace(/^#\s.+\n+/, "");
}
