#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { VintedClient } from './client/session.js';
import { COUNTRIES } from './client/types.js';
import { opSearch } from './ops/search.js';
import { opGetItem } from './ops/get-item.js';
import { opGetSeller } from './ops/get-seller.js';
import { opCompare } from './ops/compare.js';
import { opTrending } from './ops/trending.js';
import { opBrands, resolveBrandIds } from './ops/brands.js';
import { opCategories } from './ops/categories.js';
import { opSellerItems } from './ops/seller-items.js';
import { opGetSellerFeedback } from './ops/get-seller-feedback.js';
import { opSearchAll } from './ops/search.js';
import { opGetColors } from './ops/get-colors.js';
import { opGetSizeGroups } from './ops/get-size-groups.js';
import { resolveSizeIds } from './ops/sizes.js';

const TOOLS = [
  {
    name: 'search_items',
    description: 'Search Vinted second-hand listings with rich filters across 19 country sites. Returns a paginated list of items — each with title, price, currency, brand, size, condition, photo URL, item URL, favourite count, and seller info. Use get_categories to discover valid categoryId values and search_brands to resolve brand names to IDs. For comprehensive multi-page results use search_all_items instead.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords, e.g. "Nike Air Max 90" or "levi 501 jeans"' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to search (fr, de, uk, pl, es, nl, be, it, pt, cz, sk, hu, ro, lt, lv, ee, fi, at, se)' },
        priceMin: { type: 'number', description: 'Minimum price in the local currency of the selected country' },
        priceMax: { type: 'number', description: 'Maximum price in the local currency of the selected country' },
        brandIds: { type: 'array', items: { type: 'integer' }, description: 'Numeric Vinted brand IDs from search_brands. Prefer the brand[] parameter for name-based lookup.' },
        brand: { type: 'array', items: { type: 'string' }, description: 'Brand names to filter by, e.g. ["Nike", "Adidas"]. Automatically resolved to IDs via search_brands.' },
        categoryId: { type: 'integer', description: 'Category ID from get_categories (e.g. 4 = women\'s clothing, 5 = men\'s clothing, 1231 = women\'s shoes)' },
        sizeIds: { type: 'array', items: { type: 'integer' }, description: 'Size IDs to filter by. Discover valid IDs by inspecting results from a previous search in the same category, or use get_size_groups to browse all size groups.' },
        colorIds: { type: 'array', items: { type: 'integer' }, description: 'Color IDs to filter by (e.g. [1] for black, [3] for white). Use get_colors to discover all available color IDs and their names.' },
        condition: { type: 'array', items: { type: 'string', enum: ['new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory'] }, description: 'Item condition filter; multiple values are OR-ed together' },
        sortBy: { type: 'string', enum: ['relevance', 'price_low_to_high', 'price_high_to_low', 'newest_first'], description: 'Sort order for results. Defaults to relevance.' },
        perPage: { type: 'integer', description: 'Results per page, 1–96. Defaults to 20.' },
        page: { type: 'integer', description: 'Page number starting at 1' },
        dateFrom: { type: 'string', description: 'Return items listed on or after this date. ISO-8601 format, e.g. "2024-01-01"' },
        dateTo: { type: 'string', description: 'Return items listed on or before this date. ISO-8601 format, e.g. "2024-12-31"' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description: 'Fetch complete item details by Vinted item ID (with country) or by a direct Vinted item URL. Returns title, price, currency, brand, size, condition, full description, all photo URLs, creation date, item URL, favourite count, and seller username/ID. Automatically falls back to HTML scraping when the JSON API is unavailable.',
    inputSchema: {
      type: 'object',
      properties: {
        itemId: { type: 'integer', description: 'Numeric Vinted item ID, e.g. 5678901234' },
        url: { type: 'string', description: 'Full Vinted item URL, e.g. "https://www.vinted.fr/items/5678901234-nike-air-max". Country is inferred from the URL automatically.' },
        country: { type: 'string', enum: COUNTRIES, description: 'Country site (required when using itemId; inferred automatically when url is provided)' },
        browser: { type: 'boolean', default: false, description: 'Use headless browser for retrieval. Requires optional Playwright deps; only needed for items blocked by bot detection.' },
      },
    },
  },
  {
    name: 'get_seller',
    description: 'Fetch a seller\'s public profile by their numeric user ID. Returns username, active listing count, feedback reputation score (0–1 float), total feedback count, country code, and profile URL. Use get_seller_feedback to read review texts and star ratings, and get_seller_items to browse their listings.',
    inputSchema: {
      type: 'object',
      properties: {
        sellerId: { type: 'integer', description: 'Numeric Vinted user ID, visible in profile URLs: vinted.fr/member/12345-username' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Country site where the seller is registered' },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'get_seller_items',
    description: 'List all items currently for sale by a specific seller, paginated. Returns the same fields as search_items (title, price, brand, size, condition, photo URL, item URL). Useful for browsing a seller\'s full catalogue after finding them via search_items or get_seller.',
    inputSchema: {
      type: 'object',
      properties: {
        sellerId: { type: 'integer', description: 'Numeric Vinted user ID' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Country site where the seller is registered' },
        limit: { type: 'integer', default: 20, description: 'Items per page, 1–100' },
        page: { type: 'integer', default: 1, description: 'Page number starting at 1' },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'compare_prices',
    description: 'Compare prices for a search query across multiple Vinted country sites simultaneously. Returns median, mean, min, max, standard deviation, and sample count per country along with the local currency. Useful for finding the cheapest market to buy a specific item or understanding cross-border price gaps.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Item to compare prices for, e.g. "Levi 501 jeans" or "iPhone 14 case"' },
        countries: { type: 'array', items: { type: 'string', enum: COUNTRIES }, description: 'List of country codes to compare. Defaults to all 19 Vinted countries if omitted.' },
        limit: { type: 'integer', default: 20, description: 'Number of listings to sample per country. Higher values give more accurate statistics (max 96).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_brands',
    description: 'Search Vinted\'s brand catalogue by keyword. Returns matching brands with their numeric IDs, slugs, total item counts, and favourite counts. Pass the returned IDs to search_items.brandIds, or use search_items.brand[] to pass names and have them resolved automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Brand name keyword to search for, e.g. "Nike" or "Levi"' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Country site to query (brand catalogues are shared across countries)' },
        limit: { type: 'integer', default: 10, description: 'Maximum number of brand results to return' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_categories',
    description: 'Fetch the full Vinted category tree for a country. Returns a flat list of all categories and subcategories with their numeric IDs, names, parent IDs, and item counts. Pass a categoryId to search_items or search_all_items to restrict results to a department (e.g. women\'s clothing, men\'s shoes, electronics). Results are cached for 1 hour.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Country site to fetch categories for (category IDs are consistent across countries)' },
        query: { type: 'string', description: 'Optional keyword filter on category name, e.g. "shoes" or "dress"' },
      },
    },
  },
  {
    name: 'search_all_items',
    description: 'Search Vinted listings and automatically paginate through all results, returning up to maxItems items in a single call. Use this instead of search_items when you need comprehensive results — e.g. "find all Nike shoes under €30" or "list every item in size M from this brand". Pages are fetched concurrently for speed. Returns the same item fields as search_items.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to search' },
        priceMin: { type: 'number', description: 'Minimum price in local currency' },
        priceMax: { type: 'number', description: 'Maximum price in local currency' },
        brandIds: { type: 'array', items: { type: 'integer' }, description: 'Numeric brand IDs from search_brands' },
        brand: { type: 'array', items: { type: 'string' }, description: 'Brand names; automatically resolved to IDs' },
        categoryId: { type: 'integer', description: 'Category ID from get_categories' },
        sizeIds: { type: 'array', items: { type: 'integer' }, description: 'Size IDs to filter by' },
        colorIds: { type: 'array', items: { type: 'integer' }, description: 'Color IDs to filter by. Use get_colors to discover all available color IDs.' },
        condition: { type: 'array', items: { type: 'string', enum: ['new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory'] }, description: 'Item condition filter' },
        sortBy: { type: 'string', enum: ['relevance', 'price_low_to_high', 'price_high_to_low', 'newest_first'], description: 'Sort order' },
        maxItems: { type: 'integer', default: 200, description: 'Maximum total items to collect across all pages (default 200, max 1000)' },
        maxPages: { type: 'integer', default: 10, description: 'Maximum number of pages to fetch regardless of maxItems' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_seller_feedback',
    description: 'Fetch paginated buyer and seller feedback reviews for a Vinted user. Each entry includes the review text, star rating (1–5), feedback type (1=negative, 2=neutral, 3=positive), reviewer username, timestamp, and the associated item ID. Use this to assess seller trustworthiness and reliability before making a purchase.',
    inputSchema: {
      type: 'object',
      properties: {
        sellerId: { type: 'integer', description: 'Numeric Vinted user ID (visible in profile URLs: vinted.fr/member/12345-username)' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Country site where the seller is registered' },
        limit: { type: 'integer', default: 20, description: 'Reviews per page, 1–100' },
        page: { type: 'integer', default: 1, description: 'Page number starting at 1' },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'get_colors',
    description: 'Fetch the complete list of Vinted color options available as search filters. Returns every color with its numeric ID, display name, hex color code, short code (e.g. "BLACK"), and sort order. Pass the returned IDs to search_items.colorIds or search_all_items.colorIds to restrict results to specific colors. Results are cached for 1 hour — color catalogues change rarely.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to query (color catalogues are shared across countries)' },
      },
    },
  },
  {
    name: 'get_size_groups',
    description: 'Fetch all Vinted size groups with their constituent size IDs and labels. Returns a list of size groups (e.g. "Women\'s clothing", "Men\'s shoes", "Kids 2–8 yrs") — each containing the group ID, caption, description, and an array of sizes with numeric IDs and display titles (e.g. "XS", "42", "12 UK"). Pass individual size IDs from the sizes array to search_items.sizeIds or search_all_items.sizeIds to filter listings to an exact size. Results are cached for 1 hour.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to query (size catalogues are shared across countries)' },
      },
    },
  },
  {
    name: 'resolve_size_ids',
    description: 'Resolve human-readable size labels (e.g. "M", "42", "XL", "12 UK") to numeric Vinted size IDs suitable for use in search_items.sizeIds and search_all_items.sizeIds. Returns matched IDs with the group they belong to (e.g. "Women\'s clothing"), and a list of any labels that could not be resolved. Because "M" or "42" appear in multiple size groups (women\'s, men\'s, kids\'), multiple IDs may be returned per label — pass them all to sizeIds to cast a wide net, or filter by group name if you need a specific category.',
    inputSchema: {
      type: 'object',
      properties: {
        sizes: { type: 'array', items: { type: 'string' }, description: 'Size labels to resolve, e.g. ["M", "L"] or ["42", "43"] or ["XS", "S", "M"]' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to query (size catalogues are shared across countries)' },
      },
      required: ['sizes'],
    },
  },
  {
    name: 'get_new_items',
    description: 'Fetch the most recently listed items for a search query, optionally filtered to those posted within the last N minutes. Use this to monitor a search and detect new listings — call it repeatedly with the same query to get fresh arrivals. Items are sorted newest-first. Supports the same filters as search_items (brand, category, size, color, price, condition).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords to monitor, e.g. "Nike Air Max 90 size 42"' },
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to monitor' },
        sinceMinutes: { type: 'integer', default: 60, description: 'Return only items listed in the last N minutes (approximate — Vinted date filters are day-granular; sub-hour filtering applied client-side on createdAt when available). Default 60.' },
        perPage: { type: 'integer', default: 50, description: 'Number of items to fetch before applying the time filter, 1–96' },
        brandIds: { type: 'array', items: { type: 'integer' }, description: 'Numeric brand IDs from search_brands' },
        brand: { type: 'array', items: { type: 'string' }, description: 'Brand names; automatically resolved to IDs' },
        categoryId: { type: 'integer', description: 'Category ID from get_categories' },
        sizeIds: { type: 'array', items: { type: 'integer' }, description: 'Size IDs to filter by' },
        colorIds: { type: 'array', items: { type: 'integer' }, description: 'Color IDs to filter by' },
        priceMin: { type: 'number', description: 'Minimum price in local currency' },
        priceMax: { type: 'number', description: 'Maximum price in local currency' },
        condition: { type: 'array', items: { type: 'string', enum: ['new_with_tags', 'new_without_tags', 'very_good', 'good', 'satisfactory'] }, description: 'Item condition filter' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_trending',
    description: 'Fetch the newest and trending items on Vinted for a given country, ordered by recency. Optionally scoped to a specific category. Useful for discovering what\'s currently popular, monitoring new arrivals, or finding deals as they are listed.',
    inputSchema: {
      type: 'object',
      properties: {
        country: { type: 'string', enum: COUNTRIES, default: 'fr', description: 'Vinted country site to fetch trending items from' },
        categoryId: { type: 'integer', description: 'Optional category ID from get_categories to restrict results to a specific department' },
        limit: { type: 'integer', default: 20, description: 'Number of trending items to return, 1–96' },
      },
    },
  },
];

const PROMPTS = [
  {
    name: 'find-bargains',
    description: 'Find items priced below average for a search query — compares prices, then lists the cheapest listings relative to the median.',
    arguments: [
      { name: 'query', description: 'What to search for, e.g. "Nike Air Max 90"', required: true },
      { name: 'country', description: 'Vinted country site code (default: fr)', required: false },
      { name: 'maxPrice', description: 'Maximum price cap in local currency', required: false },
    ],
  },
  {
    name: 'seller-check',
    description: 'Due-diligence check on a Vinted seller — fetches profile, active listings, and recent reviews to assess trustworthiness.',
    arguments: [
      { name: 'sellerId', description: 'Numeric seller user ID (from item listings or profile URL)', required: true },
      { name: 'country', description: 'Vinted country site code (default: fr)', required: false },
    ],
  },
  {
    name: 'price-comparison',
    description: 'Find the cheapest country to buy a specific item by comparing prices across all Vinted sites.',
    arguments: [
      { name: 'query', description: 'Item to compare, e.g. "Levi 501 jeans W32"', required: true },
    ],
  },
  {
    name: 'wardrobe-hunt',
    description: 'Search for a specific brand, size, and color combination — resolves size labels and color names to Vinted filter IDs automatically.',
    arguments: [
      { name: 'brand', description: 'Brand name, e.g. "Adidas" or "Zara"', required: true },
      { name: 'size', description: 'Size label, e.g. "M", "42", "XL"', required: false },
      { name: 'color', description: 'Color name, e.g. "black", "navy"', required: false },
      { name: 'country', description: 'Vinted country site code (default: fr)', required: false },
    ],
  },
];

function makeServer(sharedClient?: VintedClient): Server {
  const server = new Server(
    { name: 'vinted-cli', version: '1.6.0' },
    { capabilities: { tools: {}, prompts: {} } },
  );

  let client: VintedClient | null = sharedClient ?? null;
  const getClient = () => (client ??= new VintedClient());

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: PROMPTS }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    const a = (args ?? {}) as Record<string, string>;
    const text = (t: string) => ({ role: 'user' as const, content: { type: 'text' as const, text: t } });

    switch (name) {
      case 'find-bargains': {
        const country = a.country ?? 'fr';
        const cap = a.maxPrice ? ` with a maximum price of ${a.maxPrice}` : '';
        return { messages: [text(
          `Find bargains for "${a.query}" on Vinted ${country}${cap}. ` +
          `Use compare_prices to get the median/mean price. Then use search_items with sortBy "price_low_to_high"${cap ? ` and priceMax ${a.maxPrice}` : ''} to fetch listings. ` +
          `Identify items priced more than 20% below the median and highlight them as potential deals. ` +
          `Present: median price, top 5 bargains with titles, prices, item URLs, and condition.`,
        )] };
      }
      case 'seller-check': {
        const country = a.country ?? 'fr';
        return { messages: [text(
          `Run a due-diligence check on Vinted seller ID ${a.sellerId} (${country}). Use these tools in order:\n` +
          `1. get_seller — fetch their profile (reputation score, feedback count, active listing count)\n` +
          `2. get_seller_feedback — fetch their last 20 reviews; note any negative or neutral ones and what went wrong\n` +
          `3. get_seller_items — browse their current listings\n\n` +
          `Summarise: overall trust score, notable positives, any red flags, average response to issues, and your buying recommendation (yes/cautious/no).`,
        )] };
      }
      case 'price-comparison': {
        return { messages: [text(
          `Compare prices for "${a.query}" across all Vinted country sites. ` +
          `Use compare_prices with no countries filter to get stats for all markets. ` +
          `Rank countries from cheapest to most expensive by median price. ` +
          `Convert to EUR for comparison (use approximate rates if needed). ` +
          `Recommend the best country to buy from and note any obvious shipping or import considerations.`,
        )] };
      }
      case 'wardrobe-hunt': {
        const country = a.country ?? 'fr';
        const steps: string[] = [
          `Search for "${a.brand}" items on Vinted ${country} using these steps:`,
          `1. search_brands with query "${a.brand}" to get the brand ID.`,
        ];
        if (a.size) steps.push(`2. resolve_size_ids with sizes ["${a.size}"] to get size IDs.`);
        if (a.color) steps.push(`${a.size ? '3' : '2'}. get_colors and find the ID for "${a.color}".`);
        steps.push(
          `${[a.size, a.color].filter(Boolean).length + 2}. search_items with brandIds, ` +
          (a.size ? `sizeIds, ` : '') +
          (a.color ? `colorIds, ` : '') +
          `country "${country}", sortBy "price_low_to_high". Return the top 10 results with titles, prices, condition, and item URLs.`,
        );
        return { messages: [text(steps.join('\n'))] };
      }
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: a = {} } = req.params;
    try {
      const c = getClient();
      let result: unknown;
      switch (name) {
        case 'search_items': {
          const args = a as any;
          if (!args.brandIds && Array.isArray(args.brand) && args.brand.length) {
            const r = await resolveBrandIds(c, args.brand, args.country);
            args.brandIds = r.ids.length ? r.ids : undefined;
          }
          result = await opSearch(c, args);
          break;
        }
        case 'search_brands': result = await opBrands(c, a as any); break;
        case 'get_item': result = await opGetItem(c, a as any); break;
        case 'get_seller': result = await opGetSeller(c, a as any); break;
        case 'get_seller_items': result = await opSellerItems(c, a as any); break;
        case 'compare_prices': result = await opCompare(c, a as any); break;
        case 'get_trending': result = await opTrending(c, a as any); break;
        case 'get_categories': result = await opCategories(c, a as any); break;
        case 'search_all_items': {
          const args = a as any;
          if (!args.brandIds && Array.isArray(args.brand) && args.brand.length) {
            const r = await resolveBrandIds(c, args.brand, args.country);
            args.brandIds = r.ids.length ? r.ids : undefined;
          }
          result = await opSearchAll(c, { ...args, maxItems: args.maxItems ?? 200 });
          break;
        }
        case 'get_seller_feedback': result = await opGetSellerFeedback(c, a as any); break;
        case 'get_colors': result = await opGetColors(c, a as any); break;
        case 'get_size_groups': result = await opGetSizeGroups(c, a as any); break;
        case 'resolve_size_ids': {
          const args = a as any;
          result = await resolveSizeIds(c, args.sizes ?? [], args.country);
          break;
        }
        case 'get_new_items': {
          const args = a as any;
          if (!args.brandIds && Array.isArray(args.brand) && args.brand.length) {
            const r = await resolveBrandIds(c, args.brand, args.country);
            args.brandIds = r.ids.length ? r.ids : undefined;
          }
          const sinceMs = Date.now() - (args.sinceMinutes ?? 60) * 60_000;
          const today = new Date().toISOString().split('T')[0];
          const r = await opSearch(c, {
            ...args,
            sortBy: 'newest_first',
            perPage: args.perPage ?? 50,
            dateFrom: today,
          });
          const items = r.items.filter((i: any) => {
            if (!i.createdAt) return true;
            return new Date(i.createdAt).getTime() >= sinceMs;
          });
          result = { totalCount: items.length, page: 1, items };
          break;
        }
        default: throw new Error(`Unknown tool: ${name}`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
    }
  });

  return server;
}

async function main() {
  const transport = process.env.VINTED_MCP_TRANSPORT;
  if (transport === 'http') return startHttp();
  const server = makeServer();
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
}

async function startHttp() {
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js'
  );
  const { createServer } = await import('node:http');
  const port = Number(process.env.VINTED_MCP_PORT ?? 3001);
  const host = process.env.VINTED_MCP_HOST ?? '127.0.0.1';
  const path = process.env.VINTED_MCP_PATH ?? '/mcp';

  const httpClient = new VintedClient();
  const httpServer = createServer(async (req, res) => {
    if (!req.url || !req.url.startsWith(path)) {
      res.statusCode = 404; res.end('Not Found'); return;
    }
    const server = makeServer(httpClient);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  process.stderr.write(`vinted-mcp listening on http://${host}:${port}${path}\n`);
}

main().catch((e) => {
  process.stderr.write(`fatal: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
