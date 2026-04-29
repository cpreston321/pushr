/**
 * pushr — minimal TypeScript SDK.
 *
 * Wraps POST /notify and /healthz on a pushr Convex deployment. Zero deps,
 * works anywhere `fetch` is available (Node 18+, Bun, Deno, browsers,
 * edge runtimes).
 *
 * Default usage — reads PUSHR_URL and PUSHR_TOKEN from process.env:
 *
 *   import { notify, ping, liveActivity } from "pushr";
 *
 *   await notify({ title: "Build green", body: "deploy #42 ok" });
 *
 *   const la = liveActivity("deploy-42", { name: "ci.example.com" });
 *   await la.start({ title: "Deploy #42", status: "Building", progress: 0 });
 *   await la.update({ status: "Tests pass", progress: 0.6 });
 *   await la.end({ status: "Done" });
 *
 * Power-user — explicit client (multi-tenant, custom fetch, etc.):
 *
 *   import { Pushr } from "pushr";
 *   const pushr = new Pushr({ url, token });
 *   await pushr.notify({ title: "…", body: "…" });
 */

export type Priority = "low" | "normal" | "high" | number;

export type Action =
  | {
      kind: "open_url";
      id: string;
      label: string;
      url: string;
      destructive?: boolean;
    }
  | {
      kind: "callback";
      id: string;
      label: string;
      callbackUrl: string;
      destructive?: boolean;
      authRequired?: boolean;
    }
  | {
      kind: "reply";
      id: string;
      label: string;
      callbackUrl: string;
      placeholder?: string;
    };

export interface AckConfig {
  /** Seconds between escalations. Server enforces 10..86400. */
  timeoutSec: number;
  /** Max re-pushes after the initial delivery. Server enforces 1..20. */
  maxAttempts: number;
}

export interface LiveActivityState {
  title?: string;
  status?: string;
  /** 0..1 */
  progress?: number;
  /** SF Symbol name */
  icon?: string;
}

export interface LiveActivityAttributes {
  name?: string;
  logoUrl?: string;
}

export interface LiveActivityPayload {
  action: "start" | "update" | "end";
  activityId: string;
  state: LiveActivityState;
  attributes?: LiveActivityAttributes;
  staleDate?: number;
  /** 0..1 */
  relevanceScore?: number;
}

export interface NotifyInput {
  title: string;
  body: string;
  priority?: Priority;
  /** Tap-target URL on the receiving device. */
  url?: string;
  /** Image URL for rich attachment (requires Notification Service Extension). */
  image?: string;
  /** Custom data delivered alongside the push. */
  data?: Record<string, unknown>;
  /** Single legacy action button. */
  action?: { label: string; url: string };
  /** Typed action buttons (open URL, server callback, inline reply). */
  actions?: Action[];
  /** Ack-or-escalate: re-push at high priority until the user taps in. */
  ack?: AckConfig;
  /** Drive a Live Activity (iOS 16.2+). */
  liveActivity?: LiveActivityPayload;
  /** Schedule for future delivery. Epoch ms or Date. */
  deliverAt?: number | Date;
}

export interface NotifyResponse {
  id: string;
  scheduledFor: number | null;
}

export interface PushrOptions {
  /** Base URL of the Convex deployment, e.g. https://<slug>.convex.site */
  url: string;
  /** Source-app bearer token (pshr_…) */
  token: string;
  /** Override the fetch implementation (tests, polyfills). */
  fetch?: typeof fetch;
}

export class PushrError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly data?: Record<string, unknown>;
  constructor(
    message: string,
    status: number,
    code?: string,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PushrError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export class Pushr {
  readonly #url: string;
  readonly #token: string;
  readonly #fetch: typeof fetch;

  constructor(opts: PushrOptions) {
    if (!opts.url) throw new TypeError("Pushr: url is required");
    if (!opts.token) throw new TypeError("Pushr: token is required");
    const candidate = opts.fetch ?? globalThis.fetch;
    if (!candidate) {
      throw new TypeError(
        "Pushr: no global fetch available — pass opts.fetch (Node <18, etc.)",
      );
    }
    this.#url = opts.url.replace(/\/+$/, "");
    this.#token = opts.token;
    this.#fetch = candidate;
  }

  async notify(input: NotifyInput): Promise<NotifyResponse> {
    const payload: Record<string, unknown> = { ...input };
    if (input.deliverAt instanceof Date) {
      payload.deliverAt = input.deliverAt.getTime();
    }
    return this.#post<NotifyResponse>("/notify", payload);
  }

  async ping(): Promise<{ ok: true }> {
    const res = await this.#fetch(this.#url + "/healthz");
    if (!res.ok) throw await errorFor(res, "Health check failed");
    return (await res.json()) as { ok: true };
  }

  liveActivity(
    activityId: string,
    attributes?: LiveActivityAttributes,
  ): LiveActivityHandle {
    return new LiveActivityHandle(this, activityId, attributes);
  }

  async #post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.#fetch(this.#url + path, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.#token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await errorFor(res, "Request failed");
    return (await res.json()) as T;
  }
}

export class LiveActivityHandle {
  readonly #pushr: Pushr;
  readonly #activityId: string;
  readonly #attributes?: LiveActivityAttributes;

  constructor(
    pushr: Pushr,
    activityId: string,
    attributes?: LiveActivityAttributes,
  ) {
    this.#pushr = pushr;
    this.#activityId = activityId;
    this.#attributes = attributes;
  }

  start(
    state: LiveActivityState,
    opts?: { staleDate?: number; relevanceScore?: number },
  ): Promise<NotifyResponse> {
    return this.#dispatch("start", state, opts);
  }

  update(
    state: LiveActivityState,
    opts?: { staleDate?: number; relevanceScore?: number },
  ): Promise<NotifyResponse> {
    return this.#dispatch("update", state, opts);
  }

  end(state?: LiveActivityState): Promise<NotifyResponse> {
    return this.#dispatch("end", state ?? {});
  }

  #dispatch(
    action: LiveActivityPayload["action"],
    state: LiveActivityState,
    opts?: { staleDate?: number; relevanceScore?: number },
  ): Promise<NotifyResponse> {
    const liveActivity: LiveActivityPayload = {
      action,
      activityId: this.#activityId,
      state,
    };
    if (this.#attributes) liveActivity.attributes = this.#attributes;
    if (opts?.staleDate !== undefined) liveActivity.staleDate = opts.staleDate;
    if (opts?.relevanceScore !== undefined) {
      liveActivity.relevanceScore = opts.relevanceScore;
    }
    return this.#pushr.notify({
      title: state.title ?? this.#activityId,
      body: state.status ?? action,
      liveActivity,
    });
  }
}

async function errorFor(res: Response, fallback: string): Promise<PushrError> {
  let data: Record<string, unknown> | undefined;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    // Non-JSON body — leave data undefined.
  }
  const message =
    (typeof data?.error === "string" ? data.error : undefined) ?? fallback;
  const code = typeof data?.code === "string" ? data.code : undefined;
  return new PushrError(message, res.status, code, data);
}

// ---------------------------------------------------------------------------
// Default client — reads PUSHR_URL / PUSHR_TOKEN from env on first use.
//
// The bare exports below let callers skip the constructor entirely:
//
//   import { notify } from "pushr";
//   await notify({ title: "…", body: "…" });
//
// To override (custom fetch, alternate creds), instantiate Pushr directly.
// ---------------------------------------------------------------------------

let cached: Pushr | undefined;

const readEnv = (name: string): string | undefined =>
  typeof process !== "undefined" ? process.env?.[name] : undefined;

const defaultClient = (): Pushr => {
  if (cached) return cached;
  const url = readEnv("PUSHR_URL");
  const token = readEnv("PUSHR_TOKEN");
  if (!url) throw new TypeError("pushr: PUSHR_URL is not set");
  if (!token) throw new TypeError("pushr: PUSHR_TOKEN is not set");
  cached = new Pushr({ url, token });
  return cached;
};

/** Force-reset the cached default client (useful in tests after mutating env). */
export const resetDefaultClient = (): void => {
  cached = undefined;
};

export const notify = (input: NotifyInput): Promise<NotifyResponse> =>
  defaultClient().notify(input);

export const ping = (): Promise<{ ok: true }> => defaultClient().ping();

export const liveActivity = (
  activityId: string,
  attributes?: LiveActivityAttributes,
): LiveActivityHandle => defaultClient().liveActivity(activityId, attributes);
