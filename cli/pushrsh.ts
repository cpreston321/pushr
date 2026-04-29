#!/usr/bin/env bun
/**
 * pushrsh — send notifications from the shell.
 *
 * Wraps POST /notify and Live Activity dispatch on a pushr Convex deployment.
 *
 *   export PUSHR_URL=https://<slug>.convex.site
 *   export PUSHR_TOKEN=pshr_xxx
 *   pushrsh "Build green" "deploy #42 ok"
 *   pushrsh "Prod down" "5xx spike" -p high -u https://status.example.com
 *   echo "$LOG_TAIL" | pushrsh "Cron failed" -p high
 *
 * Run `pushrsh help` for the full reference.
 */

import { parseArgs, type ParseArgsConfig } from "node:util";
import {
  liveActivity as la,
  notify,
  ping,
  PushrError,
  type LiveActivityState,
  type NotifyInput,
  type Priority,
} from "../sdk/index";

const C = {
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:    (s: string) => `\x1b[31m${s}\x1b[0m`,
};

function fail(msg: string): never {
  process.stderr.write(C.red(msg) + "\n");
  process.exit(1);
}

const USAGE = `pushrsh — send notifications from the shell.

USAGE
  pushrsh [send] TITLE [BODY] [options]
  pushrsh la (start|update|end) ACTIVITY_ID [options]
  pushrsh ping
  pushrsh help

ENVIRONMENT
  PUSHR_URL     Convex site URL, e.g. https://<slug>.convex.site
  PUSHR_TOKEN   Source-app bearer token (pshr_…)

SEND OPTIONS
  -p, --priority VALUE     low | normal | high | 1-10
  -u, --url URL            tap-target URL on the device
  -i, --image URL          attachment image URL
  -a, --action LABEL=URL   single legacy action button
  -d, --data KEY=VALUE     custom data k/v (repeatable, string values)
      --ack T/M            ack-or-escalate: timeoutSec/maxAttempts (e.g. 60/5)
      --at WHEN            schedule: epoch_ms, +30s, +5m, +1h
      --json FILE|-        send raw JSON body (ignores other flags)
  -q, --quiet              print only the notification id on success

If BODY is omitted and stdin is not a tty, the body is read from stdin.

LIVE ACTIVITY OPTIONS
      --title T            dynamic island title
      --status S           progress label
      --progress 0..1
      --icon NAME          SF Symbol name
      --name N             attributes.name (start)
      --logo URL           attributes.logoUrl (start)
      --stale EPOCH_MS
      --relevance 0..1

EXAMPLES
  pushrsh "Backup ok" "210MB → s3://archive"
  pushrsh "Prod alert" "5xx spike" -p high -u https://status.example.com
  pushrsh "Deploy" "ship-it?" -a "View=https://ci/123"
  pushrsh "Heads-up" "PR merged" --ack 30/3
  echo "$LOG_LINE" | pushrsh "Cron failed" -p high
  pushrsh "Custom" "raw" --json payload.json
  pushrsh la start deploy-42 --title "Deploy #42" --status Running --progress 0.1
  pushrsh la update deploy-42 --status "Tests pass" --progress 0.6
  pushrsh la end   deploy-42 --status Done`;

async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8");
}

function parseWhen(v: string): number {
  if (/^\d+$/.test(v)) return Number(v);
  const m = v.match(/^\+(\d+)([smh])?$/);
  if (!m) fail(`--at: invalid value '${v}' (use epoch_ms, +30s, +5m, +1h)`);
  const n = Number(m[1]);
  const unit = m[2] ?? "s";
  const mult = unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : 1_000;
  return Date.now() + n * mult;
}

function parsePriority(v: string): Priority {
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    if (n < 1 || n > 10) fail("--priority number must be 1-10");
    return n;
  }
  if (v !== "low" && v !== "normal" && v !== "high") {
    fail("--priority must be low | normal | high | 1-10");
  }
  return v;
}

function parseAck(v: string): { timeoutSec: number; maxAttempts: number } {
  const m = v.match(/^(\d+)\/(\d+)$/);
  if (!m) fail("--ack expects TIMEOUT/MAX (e.g. 60/5)");
  return { timeoutSec: Number(m[1]), maxAttempts: Number(m[2]) };
}

function kvPairs(values: string[], flag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of values) {
    const eq = raw.indexOf("=");
    if (eq <= 0) fail(`${flag} expects KEY=VALUE, got: ${raw}`);
    out[raw.slice(0, eq)] = raw.slice(eq + 1);
  }
  return out;
}

async function dispatch<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof PushrError) {
      process.stderr.write(C.yellow(`HTTP ${err.status}`) + "\n");
      const body = err.data ?? { error: err.message };
      process.stderr.write(JSON.stringify(body) + "\n");
      process.exit(1);
    }
    fail((err as Error).message);
  }
}

async function cmdSend(argv: string[]): Promise<void> {
  const positionals: string[] = [];
  let i = 0;
  while (i < argv.length && !argv[i].startsWith("-") && positionals.length < 2) {
    positionals.push(argv[i]);
    i++;
  }
  const rest = argv.slice(i);

  const config: ParseArgsConfig = {
    args: rest,
    allowPositionals: false,
    strict: true,
    options: {
      priority: { type: "string",  short: "p" },
      url:      { type: "string",  short: "u" },
      image:    { type: "string",  short: "i" },
      action:   { type: "string",  short: "a" },
      data:     { type: "string",  short: "d", multiple: true },
      ack:      { type: "string" },
      at:       { type: "string" },
      json:     { type: "string" },
      quiet:    { type: "boolean", short: "q" },
      help:     { type: "boolean", short: "h" },
    },
  };

  let parsed;
  try {
    parsed = parseArgs(config);
  } catch (err) {
    fail((err as Error).message);
  }
  const v = parsed.values as {
    priority?: string; url?: string; image?: string; action?: string;
    data?: string[]; ack?: string; at?: string; json?: string;
    quiet?: boolean; help?: boolean;
  };

  if (v.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  // --json bypasses the typed SDK path: ship the raw bytes through fetch.
  if (v.json !== undefined) {
    const raw = v.json === "-"
      ? await readStdin()
      : await Bun.file(v.json).text().catch(() => fail(`--json file not found: ${v.json}`));
    const url = process.env.PUSHR_URL ?? fail("PUSHR_URL not set");
    const token = process.env.PUSHR_TOKEN ?? fail("PUSHR_TOKEN not set");
    const res = await fetch(url.replace(/\/+$/, "") + "/notify", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: raw,
    });
    const text = await res.text();
    if (!res.ok) {
      process.stderr.write(C.yellow(`HTTP ${res.status}`) + "\n" + text + "\n");
      process.exit(1);
    }
    if (v.quiet) {
      try {
        process.stdout.write(((JSON.parse(text) as { id?: string }).id ?? "") + "\n");
      } catch {
        process.stdout.write(text + "\n");
      }
    } else {
      process.stdout.write(text + "\n");
    }
    return;
  }

  const title = positionals[0];
  let body = positionals[1];
  if (!title) {
    process.stdout.write(USAGE + "\n");
    process.exit(1);
  }
  if (!body && !process.stdin.isTTY) {
    body = (await readStdin()).replace(/\n+$/, "");
  }
  if (!body) fail("BODY required (positional, --json, or stdin)");

  const input: NotifyInput = { title, body };
  if (v.priority !== undefined) input.priority = parsePriority(v.priority);
  if (v.url)   input.url = v.url;
  if (v.image) input.image = v.image;
  if (v.action) {
    const eq = v.action.indexOf("=");
    if (eq <= 0) fail("--action expects LABEL=URL");
    input.action = { label: v.action.slice(0, eq), url: v.action.slice(eq + 1) };
  }
  if (v.data?.length) input.data = kvPairs(v.data, "--data");
  if (v.ack)          input.ack = parseAck(v.ack);
  if (v.at)           input.deliverAt = parseWhen(v.at);

  const result = await dispatch(notify(input));
  if (v.quiet) {
    process.stdout.write(result.id + "\n");
  } else {
    process.stdout.write(JSON.stringify(result) + "\n");
  }
}

async function cmdLa(argv: string[]): Promise<void> {
  const action = argv[0];
  if (action !== "start" && action !== "update" && action !== "end") {
    fail("la subcommand required: start | update | end");
  }
  const activityId = argv[1];
  if (!activityId || activityId.startsWith("-")) fail("ACTIVITY_ID required");

  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(2),
      allowPositionals: false,
      strict: true,
      options: {
        title:     { type: "string" },
        status:    { type: "string" },
        progress:  { type: "string" },
        icon:      { type: "string" },
        name:      { type: "string" },
        logo:      { type: "string" },
        stale:     { type: "string" },
        relevance: { type: "string" },
        help:      { type: "boolean", short: "h" },
      },
    });
  } catch (err) {
    fail((err as Error).message);
  }
  const v = parsed.values as Record<string, string | boolean | undefined>;
  if (v.help) {
    process.stdout.write(USAGE + "\n");
    return;
  }

  const num = (key: string): number | undefined => {
    const raw = v[key];
    if (raw === undefined) return undefined;
    if (typeof raw !== "string") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) fail(`--${key} must be numeric`);
    return n;
  };

  const state: LiveActivityState = {};
  if (typeof v.title === "string")  state.title = v.title;
  if (typeof v.status === "string") state.status = v.status;
  const progress = num("progress");
  if (progress !== undefined) state.progress = progress;
  if (typeof v.icon === "string") state.icon = v.icon;

  const attrs: { name?: string; logoUrl?: string } = {};
  if (typeof v.name === "string") attrs.name = v.name;
  if (typeof v.logo === "string") attrs.logoUrl = v.logo;
  const hasAttrs = Object.keys(attrs).length > 0;

  const opts: { staleDate?: number; relevanceScore?: number } = {};
  const stale = num("stale");
  if (stale !== undefined) opts.staleDate = stale;
  const relevance = num("relevance");
  if (relevance !== undefined) opts.relevanceScore = relevance;

  const handle = la(activityId, hasAttrs ? attrs : undefined);
  const result = await dispatch(
    action === "start"  ? handle.start(state, opts) :
    action === "update" ? handle.update(state, opts) :
                          handle.end(state),
  );
  process.stdout.write(JSON.stringify(result) + "\n");
}

async function cmdPing(): Promise<void> {
  const result = await dispatch(ping());
  process.stdout.write(JSON.stringify(result) + "\n");
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      process.stdout.write(USAGE + "\n");
      return;
    case "ping":
      await cmdPing();
      return;
    case "la":
      await cmdLa(rest);
      return;
    case "send":
      await cmdSend(rest);
      return;
    default:
      // Bare-mode: `pushrsh "Title" "Body" -p high` — treat first token as title.
      await cmdSend([cmd, ...rest]);
  }
}

main().catch((err) => fail((err as Error).message));
