#!/usr/bin/env node
import { Command, Option } from 'commander';
import { VintedClient } from './client/session.js';
import { COUNTRIES, type Condition, type Country, type SortBy } from './client/types.js';
import { opSearch, opSearchAll } from './ops/search.js';
import { opGetItem } from './ops/get-item.js';
import { opGetSeller } from './ops/get-seller.js';
import { opCompare } from './ops/compare.js';
import { opTrending } from './ops/trending.js';
import { opBrands, resolveBrandIds } from './ops/brands.js';
import { opCategories } from './ops/categories.js';
import { opSellerItems } from './ops/seller-items.js';
import { opGetSellerFeedback } from './ops/get-seller-feedback.js';
import { opGetColors, resolveColorIds } from './ops/get-colors.js';
import { opGetSizeGroups } from './ops/get-size-groups.js';
import { resolveSizeIds } from './ops/sizes.js';
import { printOutput } from './format.js';

type OutputFormat = 'json' | 'table';

function client(opts: { proxy?: string; cache?: boolean }) {
  return new VintedClient({ proxyUrl: opts.proxy, cacheTtlMs: opts.cache === false ? 0 : undefined });
}

function out(x: unknown, fmt: OutputFormat = 'json') {
  printOutput(x, fmt);
}

function fail(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function parseList<T extends string>(v: string): T[] {
  return v.split(',').map((s) => s.trim()).filter(Boolean) as T[];
}

const program = new Command();
program
  .name('vinted')
  .description('CLI for the Vinted marketplace — search, items, sellers, price compare, trending.')
  .version('1.6.2')
  .option('--proxy <url>', 'HTTP/HTTPS proxy URL (also: VINTED_PROXY_URL, HTTPS_PROXY)')
  .option('--no-cache', 'disable in-memory response cache (default 60s TTL)')
  .addOption(new Option('--output <fmt>', 'output format').choices(['json', 'table']).default('json'));

program
  .command('search <query>')
  .description('Search Vinted listings')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('--price-min <n>', 'min price', (v) => Number(v))
  .option('--price-max <n>', 'max price', (v) => Number(v))
  .option('--brand-ids <ids>', 'comma-separated brand IDs', (v) => parseList<string>(v).map(Number))
  .option('--brand <names>', 'comma-separated brand names (resolved to IDs via Vinted lookup)')
  .option('--category-id <n>', 'category ID', (v) => Number(v))
  .option('--size-ids <ids>', 'comma-separated size IDs', (v) => parseList<string>(v).map(Number))
  .option('--size <labels>', 'comma-separated size labels (auto-resolved to IDs, e.g. "M,L,XL" or "42,43")')
  .option('--color-ids <ids>', 'comma-separated color IDs', (v) => parseList<string>(v).map(Number))
  .option('--color <names>', 'comma-separated color names (resolved to IDs via Vinted lookup)')
  .option('--condition <list>', 'comma-separated conditions', (v) => parseList<Condition>(v))
  .addOption(new Option('--sort <s>', 'sort').choices(['relevance', 'price_low_to_high', 'price_high_to_low', 'newest_first']).default('relevance'))
  .option('-l, --limit <n>', 'max items per page (1–100)', (v) => Number(v), 20)
  .option('-p, --page <n>', 'page', (v) => Number(v), 1)
  .option('--date-from <date>', 'filter items listed after this date (YYYY-MM-DD)')
  .option('--date-to <date>', 'filter items listed before this date (YYYY-MM-DD)')
  .option('--all', 'walk pages and return all results (up to --max-items)')
  .option('--max-items <n>', 'cap when --all (default 1000)', (v) => Number(v), 1000)
  .option('--max-pages <n>', 'cap when --all (default 25)', (v) => Number(v), 25)
  .option('--watch [interval]', 'poll for new items every N seconds (default 60)')
  .action(async (query: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const c = client(g);
      const fmt: OutputFormat = g.output ?? 'json';
      let brandIds = o.brandIds as number[] | undefined;
      if (!brandIds && o.brand) {
        const names = parseList<string>(o.brand);
        const r = await resolveBrandIds(c, names, o.country as Country);
        brandIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) {
          process.stderr.write(`warn: unresolved brand(s): ${r.unresolved.join(', ')}\n`);
        }
      }
      let sizeIds = o.sizeIds as number[] | undefined;
      if (!sizeIds && o.size) {
        const labels = parseList<string>(o.size);
        const r = await resolveSizeIds(c, labels, o.country as Country);
        sizeIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) {
          process.stderr.write(`warn: unresolved size(s): ${r.unresolved.join(', ')}\n`);
        }
      }
      let colorIds = o.colorIds as number[] | undefined;
      if (!colorIds && o.color) {
        const names = parseList<string>(o.color);
        const r = await resolveColorIds(c, names, o.country as Country);
        colorIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) {
          process.stderr.write(`warn: unresolved color(s): ${r.unresolved.join(', ')}\n`);
        }
      }
      const params = {
        query,
        country: o.country as Country,
        priceMin: o.priceMin,
        priceMax: o.priceMax,
        brandIds,
        categoryId: o.categoryId,
        sizeIds,
        colorIds,
        condition: o.condition,
        sortBy: o.sort as SortBy,
        perPage: o.limit,
        page: o.page,
        dateFrom: o.dateFrom,
        dateTo: o.dateTo,
      };

      if (o.watch !== undefined) {
        const interval = typeof o.watch === 'string' ? Number(o.watch) * 1000 : 60_000;
        const seen = new Set<number>();
        const poll = async () => {
          const r = await opSearch(c, { ...params, sortBy: 'newest_first', perPage: 50 });
          const fresh = r.items.filter((i) => !seen.has(i.id));
          fresh.forEach((i) => seen.add(i.id));
          if (seen.size > 0 && fresh.length > 0) {
            out({ totalCount: fresh.length, page: 1, items: fresh }, fmt);
          }
        };
        await poll(); // first run populates seen set without printing
        process.stderr.write(`watching "${query}" every ${interval / 1000}s — Ctrl+C to stop\n`);
        setInterval(poll, interval);
        return;
      }

      const r = o.all
        ? await opSearchAll(c, { ...params, maxItems: o.maxItems, maxPages: o.maxPages })
        : await opSearch(c, params);
      out(r, fmt);
    } catch (e) { fail(e); }
  });

program
  .command('item <idOrUrl>')
  .description('Get item by ID or Vinted URL')
  .addOption(new Option('-c, --country <cc>', 'country code (when passing ID)').choices(COUNTRIES).default('fr'))
  .option('--browser', 'use stealth browser to fetch full details (bypasses DataDome). Also: VINTED_BROWSER=1')
  .action(async (idOrUrl: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const isUrl = /^https?:/.test(idOrUrl);
      const base = isUrl
        ? { url: idOrUrl }
        : { itemId: Number(idOrUrl), country: o.country as Country };
      const r = await opGetItem(client(g), { ...base, browser: o.browser });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('seller <id>')
  .description('Get seller profile by ID')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .action(async (id: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opGetSeller(client(g), { sellerId: Number(id), country: o.country as Country });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('seller-items <id>')
  .description('List items currently for sale by a seller')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('-l, --limit <n>', 'max items', (v) => Number(v), 20)
  .option('-p, --page <n>', 'page', (v) => Number(v), 1)
  .action(async (id: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opSellerItems(client(g), {
        sellerId: Number(id),
        country: o.country as Country,
        limit: o.limit,
        page: o.page,
      });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('compare <query>')
  .description('Compare prices across countries')
  .option('--countries <list>', 'comma-separated country codes (default: fr,de,it,es,nl,pl)', (v) => parseList<Country>(v))
  .option('--all-countries', 'compare all 19 Vinted countries')
  .option('-l, --limit <n>', 'items per country', (v) => Number(v), 20)
  .option('--brand-ids <ids>', 'comma-separated brand IDs', (v) => parseList<string>(v).map(Number))
  .option('--brand <names>', 'comma-separated brand names (resolved to IDs)')
  .option('--category-id <n>', 'category ID', (v) => Number(v))
  .option('--size-ids <ids>', 'comma-separated size IDs', (v) => parseList<string>(v).map(Number))
  .option('--size <labels>', 'comma-separated size labels (auto-resolved to IDs, e.g. "M,L" or "42,43")')
  .option('--color-ids <ids>', 'comma-separated color IDs', (v) => parseList<string>(v).map(Number))
  .option('--color <names>', 'comma-separated color names (auto-resolved to IDs)')
  .option('--condition <list>', 'comma-separated conditions', (v) => parseList<Condition>(v))
  .action(async (query: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const c = client(g);
      let brandIds = o.brandIds as number[] | undefined;
      if (!brandIds && o.brand) {
        const r = await resolveBrandIds(c, parseList<string>(o.brand), 'fr');
        brandIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) process.stderr.write(`warn: unresolved brand(s): ${r.unresolved.join(', ')}\n`);
      }
      let sizeIds = o.sizeIds as number[] | undefined;
      if (!sizeIds && o.size) {
        const r = await resolveSizeIds(c, parseList<string>(o.size), 'fr');
        sizeIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) process.stderr.write(`warn: unresolved size(s): ${r.unresolved.join(', ')}\n`);
      }
      let colorIds = o.colorIds as number[] | undefined;
      if (!colorIds && o.color) {
        const r = await resolveColorIds(c, parseList<string>(o.color), 'fr');
        colorIds = r.ids.length ? r.ids : undefined;
        if (r.unresolved.length) process.stderr.write(`warn: unresolved color(s): ${r.unresolved.join(', ')}\n`);
      }
      const countries = o.allCountries ? ([...COUNTRIES] as Country[]) : (o.countries ?? ['fr', 'de', 'it', 'es', 'nl', 'pl'] as Country[]);
      const r = await opCompare(c, {
        query,
        countries,
        limit: o.limit,
        brandIds,
        categoryId: o.categoryId,
        sizeIds,
        colorIds,
        condition: o.condition,
      });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('brands <query>')
  .description('Look up Vinted brand IDs by name')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('-l, --limit <n>', 'max results', (v) => Number(v), 10)
  .action(async (query: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opBrands(client(g), { query, country: o.country as Country, limit: o.limit });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('categories')
  .description('Browse Vinted category tree (use IDs with --category-id in search)')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('--query <q>', 'filter by name keyword')
  .action(async (o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opCategories(client(g), { country: o.country as Country, query: o.query });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('debug')
  .description('Inspect bootstrap (cookies received from homepage)')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .action(async (o, cmd) => {
    try {
      const c = client(cmd.optsWithGlobals());
      out(await c.debug(o.country as Country));
    } catch (e) { fail(e); }
  });

program
  .command('trending')
  .description('Trending / newest items')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('--category-id <n>', 'category ID', (v) => Number(v))
  .option('-l, --limit <n>', 'max items', (v) => Number(v), 20)
  .action(async (o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opTrending(client(g), {
        country: o.country as Country,
        categoryId: o.categoryId,
        limit: o.limit,
      });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('feedback <id>')
  .description('Fetch buyer/seller feedback reviews for a user')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .option('-l, --limit <n>', 'reviews per page', (v) => Number(v), 20)
  .option('-p, --page <n>', 'page', (v) => Number(v), 1)
  .action(async (id: string, o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opGetSellerFeedback(client(g), {
        sellerId: Number(id),
        country: o.country as Country,
        limit: o.limit,
        page: o.page,
      });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('colors')
  .description('List all Vinted color options with IDs (use IDs with --color-ids in search)')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .action(async (o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opGetColors(client(g), { country: o.country as Country });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('size-groups')
  .description('List all Vinted size groups with size IDs (use IDs with --size-ids in search)')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .action(async (o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await opGetSizeGroups(client(g), { country: o.country as Country });
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program
  .command('sizes <labels...>')
  .description('Resolve size labels (e.g. "M" "42") to numeric Vinted size IDs for use with --size-ids')
  .addOption(new Option('-c, --country <cc>', 'country code').choices(COUNTRIES).default('fr'))
  .action(async (labels: string[], o, cmd) => {
    try {
      const g = cmd.optsWithGlobals();
      const r = await resolveSizeIds(client(g), labels, o.country as Country);
      if (r.unresolved.length) {
        process.stderr.write(`warn: unresolved size(s): ${r.unresolved.join(', ')}\n`);
      }
      out(r, g.output);
    } catch (e) { fail(e); }
  });

program.parseAsync().catch(fail);
