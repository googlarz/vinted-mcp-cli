import { DOMAIN, type Country } from './types.js';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface BrowserOptions {
  headless?: boolean;
  proxyUrl?: string;
  timeoutMs?: number;
}

const MISSING_DEPS_MSG =
  'Browser mode requires optional deps: npm i playwright playwright-extra puppeteer-extra-plugin-stealth\n' +
  'Then: npx playwright install chromium';

async function loadStealthChromium() {
  let chromium: any, addExtra: any, stealth: any;
  try {
    ({ chromium, addExtra } = await import('playwright-extra' as string));
    stealth = (await import('puppeteer-extra-plugin-stealth' as string)).default;
  } catch {
    throw new Error(MISSING_DEPS_MSG);
  }
  // playwright-extra v4 exposes `chromium` already extra-fied
  if (chromium?.use) {
    chromium.use(stealth());
    return chromium;
  }
  if (addExtra) {
    const base = (await import('playwright' as string)).chromium;
    const extra = addExtra(base);
    extra.use(stealth());
    return extra;
  }
  throw new Error(MISSING_DEPS_MSG);
}

const MAX_BROWSERS = 2;
let activeBrowsers = 0;
const slotWaiters: Array<() => void> = [];

// Each call launches Chromium; cap how many run at once. A finishing call hands its slot straight to the next waiter.
async function withBrowserSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeBrowsers >= MAX_BROWSERS) await new Promise<void>((resolve) => slotWaiters.push(resolve));
  else activeBrowsers++;
  try {
    return await fn();
  } finally {
    const next = slotWaiters.shift();
    if (next) next();
    else activeBrowsers--;
  }
}

export function fetchItemDetailsViaBrowser(
  itemId: number,
  country: Country = 'fr',
  opts: BrowserOptions = {},
): Promise<any> {
  return withBrowserSlot(() => launchAndFetch(itemId, country, opts));
}

async function launchAndFetch(itemId: number, country: Country, opts: BrowserOptions): Promise<any> {
  const chromium = await loadStealthChromium();
  const proxyUrl = opts.proxyUrl ?? process.env.VINTED_PROXY_URL ?? process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const proxy = proxyUrl ? toPlaywrightProxy(proxyUrl) : undefined;

  const browser = await chromium.launch({ headless: opts.headless ?? true, proxy });
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(opts.timeoutMs ?? 30000);

    const url = `https://${DOMAIN[country]}/items/${itemId}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for DataDome clearance cookie if present
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // Call the gated API from inside the page context — same TLS, same cookies
    const data = await page.evaluate(async (id: number) => {
      const r = await fetch(`/api/v2/items/${id}/details`, {
        headers: { Accept: 'application/json, text/plain, */*' },
        credentials: 'include',
      });
      if (!r.ok) throw new Error(`upstream ${r.status}`);
      return r.json();
    }, itemId);

    return data;
  } finally {
    await browser.close().catch(() => {});
  }
}

function toPlaywrightProxy(url: string) {
  const u = new URL(url);
  const out: { server: string; username?: string; password?: string } = {
    server: `${u.protocol}//${u.host}`,
  };
  if (u.username) out.username = decodeURIComponent(u.username);
  if (u.password) out.password = decodeURIComponent(u.password);
  return out;
}
