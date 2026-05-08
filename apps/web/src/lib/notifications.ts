export type Priority = "low" | "normal" | "high";

export type Notification = {
  id: string;
  app: string;
  title: string;
  body: string;
  time: string;
  priority: Priority;
  glyph: string;
  tint: string;
};

const SAMPLES: Omit<Notification, "id" | "time">[] = [
  {
    app: "ci.acme",
    title: "Deploy #482 succeeded",
    body: "main → production · 1m 04s · 12 files changed",
    priority: "normal",
    glyph: "✦",
    tint: "var(--color-signal)",
  },
  {
    app: "stripe",
    title: "Payment received",
    body: "$4,200.00 from Acme, Inc. · invoice_4f2a settled",
    priority: "high",
    glyph: "$",
    tint: "var(--color-amber)",
  },
  {
    app: "linear",
    title: "ENG-2104 ready for review",
    body: "Riley pushed 3 commits · diff +812 / −96",
    priority: "normal",
    glyph: "◆",
    tint: "var(--color-wire-bright)",
  },
  {
    app: "uptime",
    title: "api.pushr.sh is back up",
    body: "p95 240ms · resolved after 38s downtime",
    priority: "high",
    glyph: "▲",
    tint: "var(--color-rose)",
  },
  {
    app: "convex",
    title: "Function ran 14,302 times",
    body: "messages:list · last hour · 0 errors",
    priority: "low",
    glyph: "≈",
    tint: "var(--color-wire)",
  },
  {
    app: "github",
    title: "PR #318 merged",
    body: "feat(island): live activity progress fills smoothly",
    priority: "normal",
    glyph: "❖",
    tint: "var(--color-bone)",
  },
  {
    app: "doorbell",
    title: "Front door — motion",
    body: "raccoon spotted · 02:14 AM · clip 8s",
    priority: "low",
    glyph: "◉",
    tint: "var(--color-wire-bright)",
  },
  {
    app: "tradingbot",
    title: "Limit hit · BTC short",
    body: "filled @ 71,204 · pnl +1.84% · auto-flat in 3m",
    priority: "high",
    glyph: "⌁",
    tint: "var(--color-amber)",
  },
];

let counter = 0;

export function makeNotification(seed?: number): Notification {
  const idx = seed != null ? seed % SAMPLES.length : Math.floor(Math.random() * SAMPLES.length);
  const sample = SAMPLES[idx];
  counter += 1;
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  return {
    id: `n-${Date.now()}-${counter}`,
    time,
    ...sample,
  };
}

export function sequenceNotification(idx: number): Notification {
  return makeNotification(idx);
}
