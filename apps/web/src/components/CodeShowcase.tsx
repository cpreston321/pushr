import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { getHighlighter, normalizeLang, SHIKI_THEME } from "../lib/shiki";

type Tab = "curl" | "cli" | "sdk" | "live-activity";

const SAMPLES: Record<Tab, { lang: string; code: string }> = {
  curl: {
    lang: "bash",
    code: `# wire any project to your phone in one shot
curl -X POST "$PUSHR_URL/notify" \\
  -H "Authorization: Bearer $PUSHR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "shipped 🚀",
    "body":  "main → production · build #482",
    "priority": "high",
    "url": "https://acme.com/admin"
  }'`,
  },
  cli: {
    lang: "bash",
    code: `# brew install pushrsh — single-binary, built with Bun
# bare-mode: first arg is the title, second the body
pushrsh "shipped 🚀" "main → prod · build #482" -p high

# pipe stdin straight into a notification body
tail -n 5 deploy.log | pushrsh "Cron failed" -p high

# attach an action button — taps deep-link on the device
pushrsh "PR ready" "+812 / -96" -a "View=https://gh.io/318"

# drive the Dynamic Island in three commands
pushrsh la start  deploy-482 --title "Deploy #482" --status Building --progress 0
pushrsh la update deploy-482 --status "Tests pass" --progress 0.6
pushrsh la end    deploy-482 --status Live`,
  },
  sdk: {
    lang: "typescript",
    code: `// bun add pushr — zero deps, any fetch runtime
import { notify, liveActivity } from "pushr";

// reads PUSHR_URL + PUSHR_TOKEN from env
await notify({
  title: "new sale",
  body:  \`$\${amount} from \${customer}\`,
  priority: 9,
});

// drive a Live Activity from any worker
const la = liveActivity("deploy-482");
await la.start({ status: "Building", progress: 0 });
await la.update({ status: "Tests pass", progress: 0.6 });
await la.end({ status: "Live" });`,
  },
  "live-activity": {
    lang: "jsonc",
    code: `// drive the Dynamic Island from /notify
{
  "title": "Deploy #482",
  "body":  "Building",
  "liveActivity": {
    "action": "start",
    "activityId": "deploy-482",
    "attributes": { "name": "ci.acme" },
    "state": {
      "title": "Deploy #482",
      "status": "Running tests",
      "progress": 0.35,
      "icon": "hammer.fill"
    }
  }
}`,
  },
};

// Cache shared across renders + tab switches so re-highlighting is instant.
const highlightCache = new Map<string, string>();

function useShiki(code: string, lang: string): string | null {
  const key = `${lang}::${code}`;
  const [html, setHtml] = useState<string | null>(
    () => highlightCache.get(key) ?? null,
  );

  useEffect(() => {
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
        if (!cancel) setHtml(null);
      });
    return () => {
      cancel = true;
    };
  }, [key, code, lang]);

  return html;
}

export function CodeShowcase() {
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState(false);
  const current = SAMPLES[tab];
  const html = useShiki(current.code, current.lang);
  const lineCount = current.code.split("\n").length;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(current.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // ignore
    }
  };

  return (
    <section id="api" className="relative overflow-hidden py-32">
      <div className="absolute inset-0 -z-20 bg-blueprint opacity-40" />

      <div className="mx-auto grid max-w-[1280px] grid-cols-12 gap-8 px-6">
        <div className="col-span-12 lg:col-span-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.32em] text-[var(--color-wire-bright)]">
            03 / API
          </div>
          <div className="mt-3 h-px w-12 bg-[var(--color-wire)]" />
          <h2 className="mt-6 font-display text-[clamp(48px,7vw,96px)] leading-[0.92] tracking-[-0.02em] text-balance text-bone">
            no SDK. <span className="text-[var(--color-wire-bright)]">just a URL.</span>
          </h2>
          <p className="mt-6 max-w-[460px] text-[16.5px] leading-relaxed text-bone/65">
            One endpoint, one bearer token, one JSON payload. Send from anything that speaks HTTP —
            shell scripts, GitHub Actions, your toaster.
          </p>

          <ul className="mt-10 space-y-4">
            {[
              ["POST /notify", "Single endpoint for everything."],
              ["Idempotent", "Safe to retry. Dedupe by request id."],
              ["Multi-device", "Fan-out to every signed-in iPhone."],
              ["Typed errors", "4xx with reason codes, never silent drops."],
            ].map(([label, desc]) => (
              <li key={label as string} className="flex gap-4">
                <span className="mt-1 h-1.5 w-1.5 flex-none rounded-full bg-[var(--color-wire)] shadow-[0_0_12px_var(--color-wire)]" />
                <div>
                  <div className="font-mono text-[12.5px] tracking-tight text-bone">
                    {label}
                  </div>
                  <div className="text-[13.5px] text-bone/55">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="col-span-12 lg:col-span-7"
        >
          {/* Tab strip */}
          <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-white/10 bg-black/50 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-1">
              {(
                [
                  ["curl", "curl"],
                  ["cli", "cli"],
                  ["sdk", "sdk"],
                  ["live-activity", "live activity"],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.2em] transition ${
                    tab === t
                      ? "bg-[var(--color-wire)]/20 text-bone"
                      : "text-bone/50 hover:bg-white/5 hover:text-bone/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.2em] text-bone/70 transition hover:bg-white/5 hover:text-bone"
            >
              {copied ? "✓ copied" : "⌘ copy"}
            </button>
          </div>

          {/* Code body */}
          <div className="relative overflow-hidden rounded-b-2xl border border-white/10 bg-gradient-to-br from-black/70 to-[#06091a]/70 backdrop-blur">
            <div className="absolute inset-0 -z-10 bg-noise opacity-40 mix-blend-overlay" />

            <div className="code-showcase relative overflow-x-auto">
              {html ? (
                /* shiki returns sanitized, escaped HTML — safe to inject */
                <div dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <pre className="px-6 py-5 font-mono text-[13px] leading-[1.7] text-bone/85">
                  {current.code}
                </pre>
              )}
            </div>

            {/* Bottom status bar */}
            <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/40 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/45">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] animate-pulse-wire" />
                {current.lang}
              </span>
              <span>
                {lineCount} {lineCount === 1 ? "line" : "lines"} · 200 OK
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
