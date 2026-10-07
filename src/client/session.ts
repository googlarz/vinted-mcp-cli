import { ProxyAgent, Agent, type Dispatcher, fetch as undiciFetch } from 'undici';
import { DOMAIN, type Country } from './types.js';
import { TtlCache } from './cache.js';
import { TokenBucket } from './rate-limit.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface SessionEntry {
  cookie: string;
  expiresAt: number;
}

export interface DebugInfo {
  country: Country;
  bootstrapStatus: number;
  cookieNames: string[];
  cookie: string;
}

export interface VintedClientOptions {
  proxyUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;        // default 60s; 0 disables
  rateLimitPerSec?: number;   // default 3 req/s/country
  rateLimitBurst?: number;    // default 6
  dispatcher?: Dispatcher;    // override HTTP dispatcher (tests)
}

const MAX_RETRY_AFTER_MS = 10_000;

export class VintedClient {
  private dispatcher: Dispatcher;
  private sessions = new Map<Country, SessionEntry>();
  private sessionTtlMs = 10 * 60 * 1000;
  public readonly proxyUrl?: string;
  private cache: TtlCache<string, unknown>;
  private staticCache = new TtlCache<string, unknown>(0, 100);
  private cacheTtlMs: number;
  private bucket: TokenBucket;
  private timeoutMs: number;
  private bootstrapping = new Map<Country, Promise<string>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(opts: VintedClientOptions = {}) {
    this.proxyUrl =
      opts.proxyUrl ?? process.env.VINTED_PROXY_URL ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY ?? undefined;
    this.timeoutMs = opts.timeoutMs ?? 20000;
    this.dispatcher =
      opts.dispatcher ??
      (this.proxyUrl
        ? new ProxyAgent({ uri: this.proxyUrl, headersTimeout: this.timeoutMs })
        : new Agent({ headersTimeout: this.timeoutMs }));

    this.cacheTtlMs = opts.cacheTtlMs ?? Number(process.env.VINTED_CACHE_TTL_MS ?? 60_000);
    this.cache = new TtlCache(this.cacheTtlMs);
    const refill = opts.rateLimitPerSec ?? Number(process.env.VINTED_RATE_LIMIT_PER_SEC ?? 3);
    const burst = opts.rateLimitBurst ?? Number(process.env.VINTED_RATE_LIMIT_BURST ?? 6);
    this.bucket = new TokenBucket(burst, refill);
  }

  private domainFor(country: Country): string {
    if (!Object.hasOwn(DOMAIN, country)) throw new Error(`Unknown country: ${String(country)}`);
    return DOMAIN[country];
  }

  private async bootstrap(country: Country): Promise<{ status: number; cookie: string; cookieNames: string[] }> {
    const domain = this.domainFor(country);
    const res = await undiciFetch(`https://${domain}/catalog`, {
      method: 'GET',
      dispatcher: this.dispatcher,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
      },
      redirect: 'follow',
    });

    await drain(res);
    const setCookies: string[] = (res.headers as any).getSetCookie?.() ?? [];
    const byName = new Map<string, string>();
    for (const raw of setCookies) {
      const head = raw.split(';')[0];
      const eq = head.indexOf('=');
      if (eq <= 0) continue;
      const name = head.slice(0, eq);
      const value = head.slice(eq + 1);
      if (!value) continue; // skip empty (Vinted sends empty access_token_web first then a real one)
      byName.set(name, value);
    }
    const pairs = [...byName.entries()].map(([n, v]) => `${n}=${v}`);
    return {
      status: res.status,
      cookie: pairs.join('; '),
      cookieNames: [...byName.keys()],
    };
  }

  private async getSessionCookie(country: Country): Promise<string> {
    const cached = this.sessions.get(country);
    if (cached && cached.expiresAt > Date.now()) return cached.cookie;

    let pending = this.bootstrapping.get(country);
    if (!pending) {
      pending = (async () => {
        try {
          const { status, cookie } = await this.bootstrap(country);
          if (!cookie) {
            throw new Error(
              `Vinted bootstrap failed for ${country} (status ${status}). ` +
              `Set VINTED_PROXY_URL or pass --proxy. Cloudflare may be blocking your IP/TLS fingerprint.`,
            );
          }
          this.sessions.set(country, { cookie, expiresAt: Date.now() + this.sessionTtlMs });
          return cookie;
        } finally {
          this.bootstrapping.delete(country);
        }
      })();
      this.bootstrapping.set(country, pending);
    }
    return pending;
  }

  async debug(country: Country): Promise<DebugInfo> {
    const r = await this.bootstrap(country);
    return { country, bootstrapStatus: r.status, cookieNames: r.cookieNames, cookie: r.cookie };
  }

  async fetchHtml(url: string): Promise<{ status: number; body: string }> {
    const res = await undiciFetch(url, {
      method: 'GET',
      dispatcher: this.dispatcher,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
      },
      redirect: 'follow',
    });
    return { status: res.status, body: await res.text() };
  }

  async apiGet<T = unknown>(country: Country, path: string, overrideTtlMs?: number): Promise<T> {
    return this.cached(country, path, overrideTtlMs, () =>
      this.fetchWithRetry(country, path, 'json', (res) => res.json() as Promise<T>),
    );
  }

  /** GET an HTML page and cache the parsed result (not the multi-MB document). */
  async pageGet<T>(country: Country, path: string, parse: (html: string) => T, overrideTtlMs?: number): Promise<T> {
    return this.cached(country, path, overrideTtlMs, async () =>
      parse(await this.fetchWithRetry(country, path, 'html', (res) => res.text())),
    );
  }

  private async cached<T>(
    country: Country,
    path: string,
    overrideTtlMs: number | undefined,
    load: () => Promise<T>,
  ): Promise<T> {
    this.domainFor(country);
    const ttl = overrideTtlMs ?? this.cacheTtlMs;
    const cache = overrideTtlMs !== undefined ? this.staticCache : this.cache;
    const cacheKey = `${country}:${path}`;

    if (ttl > 0) {
      const hit = cache.get(cacheKey) as T | undefined;
      if (hit !== undefined) return hit;
      const running = this.inflight.get(cacheKey);
      if (running) return running as Promise<T>;
    }

    const run = load().then((value) => {
      if (ttl > 0) cache.set(cacheKey, value, ttl);
      return value;
    });
    if (ttl > 0) {
      this.inflight.set(cacheKey, run);
      run.finally(() => this.inflight.delete(cacheKey)).catch(() => {});
    }
    return run;
  }

  private async fetchWithRetry<T>(
    country: Country,
    path: string,
    kind: 'json' | 'html',
    read: (res: Awaited<ReturnType<typeof undiciFetch>>) => Promise<T>,
  ): Promise<T> {
    const domain = this.domainFor(country);
    const url = `https://${domain}${path}`;
    const maxRetries = 3;
    let reauthed = false;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.bucket.take(country);
      const cookie = await this.getSessionCookie(country);
      const res = await undiciFetch(url, {
        method: 'GET',
        dispatcher: this.dispatcher,
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: kind === 'json'
          ? {
              'User-Agent': UA,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': `https://${domain}/`,
              'Cookie': cookie,
              'X-Requested-With': 'XMLHttpRequest',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
            }
          : {
              'User-Agent': UA,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Referer': `https://${domain}/`,
              'Cookie': cookie,
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'same-origin',
            },
      });

      if (res.status === 429 && attempt < maxRetries) {
        await drain(res);
        const retryAfter = Number(res.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
          : Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
        await sleep(delayMs);
        continue;
      }

      if (res.status === 401 || res.status === 403) {
        await drain(res);
        // Only drop the session we actually used; a concurrent request may have refreshed it already.
        if (this.sessions.get(country)?.cookie === cookie) this.sessions.delete(country);
        if (res.status === 401 && !reauthed && attempt < maxRetries) {
          reauthed = true;
          continue;
        }
        throw new Error(
          `Vinted ${res.status} for ${url}. Session/auth rejected. ` +
          `Set VINTED_PROXY_URL or use --browser for gated endpoints.`,
        );
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Vinted ${res.status} for ${url}: ${body.slice(0, 200)}`);
      }

      return read(res);
    }

    throw new Error(`Vinted 429 for ${url}: rate-limited after ${maxRetries} retries`);
  }
}

async function drain(res: { body?: { cancel(): Promise<void> } | null }): Promise<void> {
  try { await res.body?.cancel(); } catch { /* connection already closed */ }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
