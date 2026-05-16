import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Pushr, PushrError, notify, ping, liveActivity, resetDefaultClient } from './index';

/**
 * Build a fake `fetch` that records each call and returns canned responses.
 * Each call to `enqueue` queues the next response. `calls` is the recorded
 * call log so each test can assert URL/method/body without a real server.
 */
function makeFakeFetch() {
  const calls: { url: string; init?: RequestInit }[] = [];
  const queue: Response[] = [];
  // `typeof fetch` differs between bun and node (Node 20's fetch type has a
  // `preconnect` method that bun-types omits). The SDK only calls `fetchFn`
  // as a plain (input, init) => Promise<Response>, so we spell that shape
  // explicitly to avoid the cross-runtime mismatch.
  const fetchFn = async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    calls.push({ url: String(input), init });
    const next = queue.shift();
    if (!next) throw new Error('fakeFetch: no response queued');
    return next;
  };
  const enqueue = (
    body: unknown,
    init: { status?: number; headers?: Record<string, string> } = {}
  ) => {
    queue.push(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status: init.status ?? 200,
        headers: { 'content-type': 'application/json', ...init.headers }
      })
    );
  };
  return { calls, enqueue, fetchFn };
}

describe('Pushr — constructor', () => {
  it('requires url and token', () => {
    expect(() => new Pushr({ url: '', token: 't', fetch: globalThis.fetch })).toThrow(TypeError);
    expect(() => new Pushr({ url: 'https://x', token: '', fetch: globalThis.fetch })).toThrow(
      TypeError
    );
  });

  it('strips trailing slashes from url', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n1', scheduledFor: null });
    const p = new Pushr({
      url: 'https://example.com///',
      token: 't',
      fetch: fetchFn
    });
    await p.notify({ title: 'hi', body: '' });
    expect(calls[0].url).toBe('https://example.com/notify');
  });

  it('throws if no fetch is available and none is provided', () => {
    const original = globalThis.fetch;
    // Simulate a runtime without fetch.
    // @ts-expect-error - intentionally clearing global
    globalThis.fetch = undefined;
    try {
      expect(() => new Pushr({ url: 'https://x', token: 't' })).toThrow(/fetch/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('Pushr.notify', () => {
  it('POSTs JSON with bearer auth', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'abc', scheduledFor: null });
    const p = new Pushr({ url: 'https://x', token: 'pshr_t', fetch: fetchFn });
    const res = await p.notify({ title: 'Hi', body: 'Body' });
    expect(res).toEqual({ id: 'abc', scheduledFor: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://x/notify');
    expect(calls[0].init?.method).toBe('POST');
    const headers = new Headers(calls[0].init?.headers);
    expect(headers.get('authorization')).toBe('Bearer pshr_t');
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      title: 'Hi',
      body: 'Body'
    });
  });

  it('converts Date deliverAt to epoch ms before sending', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: 1700000000000 });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const date = new Date(1700000000000);
    await p.notify({ title: 't', body: 'b', deliverAt: date });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.deliverAt).toBe(1700000000000);
    expect(sent.deliverAt).toBe(date.getTime());
  });

  it('throws PushrError carrying status, code, and server data on 4xx', async () => {
    const { fetchFn, enqueue } = makeFakeFetch();
    enqueue({ error: 'rate limited', code: 'RATE_LIMIT', retryAfter: 60 }, { status: 429 });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const err = await p.notify({ title: 't', body: 'b' }).catch((e) => e);
    expect(err).toBeInstanceOf(PushrError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('RATE_LIMIT');
    expect(err.message).toBe('rate limited');
    expect(err.data).toMatchObject({ retryAfter: 60 });
  });

  it("falls back to the generic message when the body isn't JSON", async () => {
    const { fetchFn, enqueue } = makeFakeFetch();
    enqueue('Internal Server Error', {
      status: 500,
      headers: { 'content-type': 'text/plain' }
    });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const err = await p.notify({ title: 't', body: 'b' }).catch((e) => e);
    expect(err).toBeInstanceOf(PushrError);
    expect(err.status).toBe(500);
    expect(err.message).toBe('Request failed');
  });
});

describe('Pushr.ping', () => {
  it('hits /healthz with no body', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ ok: true });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    await p.ping();
    expect(calls[0].url).toBe('https://x/healthz');
    expect(calls[0].init?.method).toBeUndefined();
  });

  it('throws PushrError on a non-OK response', async () => {
    const { fetchFn, enqueue } = makeFakeFetch();
    enqueue({ error: 'down' }, { status: 503 });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const err = await p.ping().catch((e) => e);
    expect(err).toBeInstanceOf(PushrError);
    expect(err.status).toBe(503);
  });
});

describe('Pushr.liveActivity', () => {
  it('start sends a notify with the right liveActivity payload', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const la = p.liveActivity('deploy-42', { name: 'ci' });
    await la.start({ title: 'Deploy', status: 'Building', progress: 0 });
    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.title).toBe('Deploy');
    expect(sent.body).toBe('Building');
    expect(sent.liveActivity).toMatchObject({
      action: 'start',
      activityId: 'deploy-42',
      attributes: { name: 'ci' },
      state: { title: 'Deploy', status: 'Building', progress: 0 }
    });
  });

  it('update + end omit attributes after the first call only when intended', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    enqueue({ id: 'n', scheduledFor: null });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const la = p.liveActivity('d', { name: 'ci' });
    await la.update({ status: 'Tests' });
    await la.end({ status: 'Done' });
    expect(JSON.parse(String(calls[0].init?.body)).liveActivity.action).toBe('update');
    expect(JSON.parse(String(calls[1].init?.body)).liveActivity.action).toBe('end');
    // Attributes are sent on every dispatch — server is responsible for
    // deciding which it cares about.
    expect(JSON.parse(String(calls[1].init?.body)).liveActivity.attributes).toEqual({
      name: 'ci'
    });
  });

  it('end() without state sends an empty state object', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const la = p.liveActivity('d');
    await la.end();
    expect(JSON.parse(String(calls[0].init?.body)).liveActivity.state).toEqual({});
  });

  it('propagates staleDate and relevanceScore through opts', async () => {
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    const p = new Pushr({ url: 'https://x', token: 't', fetch: fetchFn });
    const la = p.liveActivity('d');
    await la.start({ status: 'go' }, { staleDate: 123, relevanceScore: 0.9 });
    const sent = JSON.parse(String(calls[0].init?.body)).liveActivity;
    expect(sent.staleDate).toBe(123);
    expect(sent.relevanceScore).toBe(0.9);
  });
});

describe('default client (env-driven)', () => {
  let origUrl: string | undefined;
  let origToken: string | undefined;
  let origFetch: typeof fetch;

  beforeEach(() => {
    origUrl = process.env.PUSHR_URL;
    origToken = process.env.PUSHR_TOKEN;
    origFetch = globalThis.fetch;
    resetDefaultClient();
  });

  afterEach(() => {
    process.env.PUSHR_URL = origUrl;
    process.env.PUSHR_TOKEN = origToken;
    if (origUrl === undefined) delete process.env.PUSHR_URL;
    if (origToken === undefined) delete process.env.PUSHR_TOKEN;
    globalThis.fetch = origFetch;
    resetDefaultClient();
  });

  it('throws if PUSHR_URL is missing', () => {
    delete process.env.PUSHR_URL;
    process.env.PUSHR_TOKEN = 't';
    expect(() => notify({ title: 't', body: 'b' })).toThrow(/PUSHR_URL/);
  });

  it('throws if PUSHR_TOKEN is missing', () => {
    process.env.PUSHR_URL = 'https://x';
    delete process.env.PUSHR_TOKEN;
    expect(() => ping()).toThrow(/PUSHR_TOKEN/);
  });

  it('uses env-defined url/token to wire a single shared client', async () => {
    process.env.PUSHR_URL = 'https://x';
    process.env.PUSHR_TOKEN = 't';
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    enqueue({ ok: true });
    globalThis.fetch = fetchFn as typeof fetch;
    await notify({ title: 't', body: 'b' });
    await ping();
    expect(calls[0].url).toBe('https://x/notify');
    expect(calls[1].url).toBe('https://x/healthz');
  });

  it('liveActivity() resolves through the cached default client', async () => {
    process.env.PUSHR_URL = 'https://x';
    process.env.PUSHR_TOKEN = 't';
    const { fetchFn, enqueue, calls } = makeFakeFetch();
    enqueue({ id: 'n', scheduledFor: null });
    globalThis.fetch = fetchFn as typeof fetch;
    await liveActivity('a').start({ status: 'ok' });
    expect(JSON.parse(String(calls[0].init?.body)).liveActivity.activityId).toBe('a');
  });
});
