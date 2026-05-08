import { motion } from "motion/react";
import { useState } from "react";

type Tab = "curl" | "cli" | "sdk" | "live-activity";

export function CodeShowcase() {
  const [tab, setTab] = useState<Tab>("curl");
  const [copied, setCopied] = useState(false);

  const samples: Record<Tab, { lang: string; lines: { kind: string; text: string }[] }> = {
    curl: {
      lang: "shell",
      lines: [
        { kind: "comment", text: "# wire any project to your phone in one shot" },
        { kind: "cmd", text: "curl -X POST \"$PUSHR_URL/notify\" \\" },
        { kind: "flag", text: "  -H \"Authorization: Bearer $PUSHR_TOKEN\" \\" },
        { kind: "flag", text: "  -H \"Content-Type: application/json\" \\" },
        { kind: "data", text: "  -d '{" },
        { kind: "json", text: "    \"title\": \"shipped 🚀\"," },
        { kind: "json", text: "    \"body\":  \"main → production · build #482\"," },
        { kind: "json", text: "    \"priority\": \"high\"," },
        { kind: "json", text: "    \"url\": \"https://peptide.com/admin\"" },
        { kind: "data", text: "  }'" },
      ],
    },
    cli: {
      lang: "shell",
      lines: [
        { kind: "comment", text: "# brew install pushrsh — single-binary, built with Bun" },
        { kind: "comment", text: "# bare-mode: first arg is the title, second the body" },
        { kind: "cmd", text: "pushrsh \"shipped 🚀\" \"main → prod · build #482\" -p high" },
        { kind: "json", text: "" },
        { kind: "comment", text: "# pipe stdin straight into a notification body" },
        { kind: "cmd", text: "tail -n 5 deploy.log | pushrsh \"Cron failed\" -p high" },
        { kind: "json", text: "" },
        { kind: "comment", text: "# attach an action button — taps deep-link on the device" },
        { kind: "cmd", text: "pushrsh \"PR ready\" \"+812 / -96\" -a \"View=https://gh.io/318\"" },
        { kind: "json", text: "" },
        { kind: "comment", text: "# drive the Dynamic Island in three commands" },
        { kind: "cmd", text: "pushrsh la start  deploy-482 --title \"Deploy #482\" --status Building --progress 0" },
        { kind: "cmd", text: "pushrsh la update deploy-482 --status \"Tests pass\" --progress 0.6" },
        { kind: "cmd", text: "pushrsh la end    deploy-482 --status Live" },
      ],
    },
    sdk: {
      lang: "ts",
      lines: [
        { kind: "comment", text: "// bun add pushr — zero deps, any fetch runtime" },
        { kind: "import", text: "import { notify, liveActivity } from \"pushr\";" },
        { kind: "json", text: "" },
        { kind: "comment", text: "// reads PUSHR_URL + PUSHR_TOKEN from env" },
        { kind: "import", text: "await notify({" },
        { kind: "json", text: "  title: \"new sale\"," },
        { kind: "json", text: "  body:  `$${amount} from ${customer}`," },
        { kind: "json", text: "  priority: 9," },
        { kind: "import", text: "});" },
        { kind: "json", text: "" },
        { kind: "comment", text: "// drive a Live Activity from any worker" },
        { kind: "import", text: "const la = liveActivity(\"deploy-482\");" },
        { kind: "import", text: "await la.start({ status: \"Building\", progress: 0 });" },
        { kind: "import", text: "await la.update({ status: \"Tests pass\", progress: 0.6 });" },
        { kind: "import", text: "await la.end({ status: \"Live\" });" },
      ],
    },
    "live-activity": {
      lang: "json",
      lines: [
        { kind: "comment", text: "# drive the Dynamic Island from /notify" },
        { kind: "data", text: "{" },
        { kind: "json", text: "  \"title\": \"Deploy #482\"," },
        { kind: "json", text: "  \"body\":  \"Building\"," },
        { kind: "json", text: "  \"liveActivity\": {" },
        { kind: "json", text: "    \"action\": \"start\"," },
        { kind: "json", text: "    \"activityId\": \"deploy-482\"," },
        { kind: "json", text: "    \"attributes\": { \"name\": \"ci.peptide\" }," },
        { kind: "json", text: "    \"state\": {" },
        { kind: "json", text: "      \"title\": \"Deploy #482\"," },
        { kind: "json", text: "      \"status\": \"Running tests\"," },
        { kind: "json", text: "      \"progress\": 0.35," },
        { kind: "json", text: "      \"icon\": \"hammer.fill\"" },
        { kind: "json", text: "    }" },
        { kind: "json", text: "  }" },
        { kind: "data", text: "}" },
      ],
    },
  };

  const current = samples[tab];

  const copyText = current.lines.map((l) => l.text).join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
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
            <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-[1.7]">
              {current.lines.map((line, i) => (
                <div key={i} className="flex gap-4">
                  <span className="select-none text-bone/25 tabular-nums">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <code className={lineClass(line.kind)}>{line.text}</code>
                </div>
              ))}
            </pre>

            {/* Bottom status bar */}
            <div className="flex items-center justify-between border-t border-white/[0.06] bg-black/40 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.22em] text-bone/45">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-signal)] animate-pulse-wire" />
                {current.lang}
              </span>
              <span>{current.lines.length} lines · 200 OK</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function lineClass(kind: string): string {
  switch (kind) {
    case "comment":
      return "text-bone/40";
    case "cmd":
      return "text-[var(--color-wire-bright)]";
    case "flag":
      return "text-bone/80";
    case "data":
      return "text-bone/85";
    case "json":
      return "text-[var(--color-amber)]";
    case "import":
      return "text-[var(--color-wire-bright)]";
    default:
      return "text-bone/85";
  }
}
