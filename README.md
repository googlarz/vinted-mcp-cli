<div align="center">

# 🛍️ Vinted MCP & CLI Server

**Give your AI assistant access to Vinted — search, compare prices, and track sellers across 19 countries.**

[![npm version](https://img.shields.io/npm/v/@googlarz/vinted-client?style=flat-square&color=cc3534)](https://www.npmjs.com/package/@googlarz/vinted-client)
[![CI](https://img.shields.io/github/actions/workflow/status/googlarz/vinted-mcp-cli/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/googlarz/vinted-mcp-cli/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Node ≥18](https://img.shields.io/badge/node-%E2%89%A518-green?style=flat-square)](https://nodejs.org)

</div>

---

## The idea

Vinted has no public API. This package bridges that gap — it lets **AI assistants talk directly to Vinted** via the [Model Context Protocol](https://modelcontextprotocol.io).

Connect it to Claude, Cursor, or any MCP-compatible assistant and just ask:

> *"Find me a North Face jacket under €60 in Germany, good condition or better"*

> *"Compare prices for Air Jordan 1s across France, Italy and the UK"*

> *"What is seller #123456 currently selling? Anything under €20?"*

The AI figures out which filters to use, calls Vinted, and gives you a real answer — no searching, no filtering, no tabs.

Also ships as a **CLI tool** and **TypeScript library** for direct use.

---

## What is this?

An **MCP server**, **CLI tool**, and **TypeScript library** for the Vinted secondhand marketplace. No official API — it bootstraps a session cookie from the public catalog page and calls the private JSON API the Vinted web app uses internally.

- 🤖 **MCP server** — plug into Claude, Cursor, or any AI assistant with MCP support
- 🖥️ **CLI tool** — pipe results, watch for new listings, compare prices from your terminal
- 📦 **TypeScript library** — import `opSearch`, `opCompare`, etc. directly in your code

---

## Install

```bash
npm install -g @googlarz/vinted-client
```

Or run without installing:

```bash
npx -y -p @googlarz/vinted-client vinted search "levis 501"
```

---

## CLI Quick Start

```bash
# Search (JSON by default)
vinted search "levi's 501" --country fr

# Pretty table
vinted search "levi's 501" --country de --output table

# Filter by price, brand, condition
vinted search "adidas samba" \
  --price-min 20 --price-max 80 \
  --brand adidas \
  --condition new_with_tags,very_good \
  --output table

# Watch for new listings every 30s (minimum 5)
vinted search "air jordan 1" --watch 30

# Walk all pages and collect up to 500 results
vinted search "vintage denim" --all --max-items 500

# Get a specific item (ID or URL)
vinted item 1234567
vinted item https://www.vinted.fr/items/1234567

# Seller profile + active listings
vinted seller 987654
vinted seller-items 987654 --output table

# Cross-country price comparison (6 countries by default)
vinted compare "north face jacket" --output table

# Browse category tree
vinted categories --query shoes --output table

# Look up brand IDs
vinted brands "stone island"

# What's trending right now
vinted trending --country fr --output table

# Resolve size labels to IDs, or let search do it for you
vinted sizes M L XL --country de
vinted search "levi 501" --size M,L
vinted search "levi 501" --size-ids 206,207,208

# Filter by color (name auto-resolved)
vinted search "north face jacket" --color black --country fr

# Cross-country compare with filters (size M only)
vinted compare "adidas samba" --size-ids 103 --all-countries --output table

# Seller due-diligence
vinted feedback 987654 --country fr --output table

# Browse colors and size groups
vinted colors --output table
vinted size-groups --output table
```

---

## Commands

| Command | Description |
|---|---|
| `search <query>` | Search listings with full filter support |
| `item <id\|url>` | Get full item detail |
| `seller <id>` | Seller profile |
| `seller-items <id>` | Items a seller has for sale |
| `feedback <id>` | Seller/buyer reviews (paginated) |
| `compare <query>` | Price comparison across countries with optional filters |
| `brands <query>` | Look up brand IDs by name |
| `categories` | Browse the category tree |
| `colors` | List all color options with IDs |
| `size-groups` | List all size groups with IDs |
| `sizes <labels...>` | Resolve size labels ("M", "42") to numeric IDs |
| `trending` | Newest / trending listings |
| `debug` | Inspect session cookie names (`--show-cookie` to print values) |

### Global flags

| Flag | Description |
|---|---|
| `--output json\|table` | Output format (default: `json`) |
| `--country <cc>` | Country code (see below) |
| `--proxy <url>` | HTTP/HTTPS proxy (also: `VINTED_PROXY_URL`) |
| `--no-cache` | Disable response cache |

### Search flags

| Flag | Description |
|---|---|
| `--price-min / --price-max` | Price range |
| `--brand <names>` | Brand names (auto-resolved to IDs) |
| `--brand-ids <ids>` | Comma-separated brand IDs |
| `--category-id <n>` | Category ID (`vinted categories` to browse) |
| `--size <labels>` | Size labels (auto-resolved to IDs, e.g. `--size M,L` or `--size 42,43`) |
| `--size-ids <ids>` | Comma-separated size IDs (`vinted sizes M L` to resolve) |
| `--color-ids <ids>` | Comma-separated color IDs (`vinted colors` to browse) |
| `--color <names>` | Color names (auto-resolved to IDs, e.g. `--color black,white`) |
| `--condition <list>` | `new_with_tags`, `new_without_tags`, `very_good`, `good`, `satisfactory` |
| `--sort <s>` | `relevance`, `price_low_to_high`, `price_high_to_low`, `newest_first` |
| `--all` | Walk pages and collect all results |
| `--max-items <n>` | Cap for `--all` (default 1000) |
| `--watch [interval]` | Poll every N seconds for new listings (default 60s, minimum 5s) |

> **Result limits.** Vinted serves search results in fixed pages of 96, so `--limit` only truncates a page, and at most 960 results are reachable per query. Search results carry the listing's brand, size and condition as Vinted displays them (localised to the country site, e.g. "Très bon état") and the seller's numeric ID but not the username — use `vinted item <id>` or `vinted seller <id>` for that. Vinted's catalog has no date filter, so there is no `--date-from/--date-to`; use `--sort newest_first`.

---

## Supported Countries

`fr` `de` `uk` `it` `es` `nl` `pl` `pt` `be` `at` `lt` `cz` `sk` `hu` `ro` `hr` `fi` `dk` `se`

---

## MCP Server

Drop Vinted into any MCP-compatible AI assistant (Claude, Cursor, etc.).

### Setup — Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vinted": {
      "command": "npx",
      "args": ["-y", "-p", "@googlarz/vinted-client", "vinted-mcp"]
    }
  }
}
```

### Setup — Claude Code

```bash
claude mcp add vinted -- npx -y -p @googlarz/vinted-client vinted-mcp
```

### MCP Tools

| Tool | Description |
|---|---|
| `search_items` | Search with full filter support (brand, size, color, condition, price) |
| `search_all_items` | Like `search_items` but auto-paginates and returns all results |
| `get_new_items` | Newest listings for a query; pass the previous `latestId` as `afterId` to get only what is new |
| `get_item` | Item detail by ID or URL |
| `get_seller` | Seller profile |
| `get_seller_items` | Active listings for a seller |
| `get_seller_feedback` | Paginated buyer/seller reviews with star ratings |
| `compare_prices` | Multi-country price stats (median, mean, stdDev, min, max) with filters |
| `get_trending` | Trending / newest listings |
| `search_brands` | Brand lookup — returns IDs for use in filters |
| `get_categories` | Category tree — returns IDs for use in filters |
| `get_colors` | All color options with hex codes and IDs |
| `get_size_groups` | All size groups with IDs (Women's, Men's, Shoes, Kids…) |
| `resolve_size_ids` | Resolve size labels ("M", "42", "XL") to numeric filter IDs |
| `resolve_color_ids` | Resolve color names ("black", "navy blue") to numeric filter IDs |

Brand, size and color names passed to `search_items`, `search_all_items`, `get_new_items` and `compare_prices` are resolved automatically. If none of the names resolve the call fails (rather than silently searching unfiltered); if only some do, the result includes a `warnings` array. Browser mode for `get_item` is not available to MCP callers — the server operator enables it with `VINTED_BROWSER=1`.

### MCP over HTTP

By default the server speaks stdio. For a network transport:

```bash
VINTED_MCP_TRANSPORT=http VINTED_MCP_TOKEN=choose-a-long-random-secret npx -y -p @googlarz/vinted-client vinted-mcp
# listens on http://127.0.0.1:3001/mcp — send `Authorization: Bearer <token>`
```

Without `VINTED_MCP_TOKEN` the server only accepts loopback `Host` headers and rejects browser (`Origin`) requests, and it refuses to bind to a non-loopback `VINTED_MCP_HOST`. Set a token whenever the port is reachable by anything you don't fully trust.

### MCP Prompts

Built-in prompt templates for common workflows — use them from any MCP-compatible client:

| Prompt | Arguments | Description |
|---|---|---|
| `find-bargains` | `query`, `country?`, `maxPrice?` | Find items priced below the median — highlights potential deals |
| `seller-check` | `sellerId`, `country?` | Due-diligence check — profile, reviews, listings |
| `price-comparison` | `query` | Rank all countries by median price, recommend cheapest market |
| `wardrobe-hunt` | `brand`, `size?`, `color?`, `country?` | Brand + size + color search with auto-resolved IDs |

**Example prompts once connected:**

> *"Find me Nike Air Max 95s under €70 in Germany, size 43, very good condition"*

> *"Compare prices for a North Face puffer jacket across France, Germany and Italy"*

> *"Is seller #987654 trustworthy? Check their reviews and listings."*

> *"Find black Levi's 501 jeans size 32 — use the wardrobe-hunt prompt"*

---

## Library Usage

```typescript
import { VintedClient, opSearch, opCompare, opSearchAll, opGetNewItems } from '@googlarz/vinted-client';

const client = new VintedClient();

// Basic search
const results = await opSearch(client, {
  query: 'levi\'s 501',
  country: 'de',
  priceMax: 50,
  condition: ['very_good', 'good'],
  sortBy: 'price_low_to_high',
});

console.log(results.items);

// Collect all pages concurrently (3-page prefetch window)
const all = await opSearchAll(client, {
  query: 'vintage band tee',
  country: 'uk',
  maxItems: 300,
});

// Multi-country price comparison (report.failed lists countries that errored)
const report = await opCompare(client, {
  query: 'air jordan 1 retro',
  countries: ['fr', 'de', 'uk', 'it'],
});

// Poll for new listings: keep the cursor between calls
let cursor: number | undefined;
const fresh = await opGetNewItems(client, { query: 'air jordan 1', country: 'fr', afterId: cursor });
cursor = fresh.latestId ?? cursor;
```

### Client options

```typescript
const client = new VintedClient({
  proxyUrl: 'http://proxy:8080',   // or VINTED_PROXY_URL env var
  cacheTtlMs: 60_000,              // response cache TTL (0 = disable)
  rateLimitPerSec: 3,              // requests/sec per country
  rateLimitBurst: 6,               // burst capacity
  timeoutMs: 20_000,               // per-request timeout
});
```

---

## How it works

Vinted has no public API. This library:

1. **Bootstraps a session** by hitting `vinted.{cc}/catalog` and capturing the auth cookies the Vinted frontend sets (one bootstrap per country, shared by concurrent requests).
2. **Reads search results from the catalog page.** Vinted removed its JSON catalog endpoint; the server-rendered `/catalog` page embeds the result list in its Next.js payload, which is parsed here. Sellers, feedback, brands, colors and sizes still come from the private JSON API (`/api/v2/...`).
3. **Re-bootstraps automatically** on 401 — tokens expire, the library recovers silently.
4. **Rate-limits per country** with a token bucket (configurable burst + refill) to avoid 429s.
5. **Caches responses** with LRU+TTL — 60s for search results, 1h for static data like categories (kept in a separate cache so searches cannot evict it). Identical concurrent requests share one network call.
6. **Falls back to HTML scraping** for item pages blocked by DataDome (JSON-LD + regex extraction).
7. **Prefetches 3 pages concurrently** in `opSearchAll` to maximise throughput within the rate-limit budget.

---

## Proxy support

If Vinted blocks your IP (common on cloud VMs and CI), set a proxy:

```bash
VINTED_PROXY_URL=http://user:pass@proxy:8080 vinted search "nike"
# or
vinted search "nike" --proxy http://user:pass@proxy:8080
```

Standard `HTTPS_PROXY` / `HTTP_PROXY` env vars are also respected.

---

## Environment variables

| Variable | Description |
|---|---|
| `VINTED_PROXY_URL` | HTTP/HTTPS proxy URL |
| `VINTED_CACHE_TTL_MS` | Cache TTL in ms (default `60000`) |
| `VINTED_RATE_LIMIT_PER_SEC` | Requests per second per country (default `3`) |
| `VINTED_RATE_LIMIT_BURST` | Token bucket burst size (default `6`) |
| `VINTED_BROWSER` | Set to `1` to use stealth browser for item detail (at most 2 browsers run at once) |
| `VINTED_MCP_TRANSPORT` | `http` to serve MCP over HTTP instead of stdio |
| `VINTED_MCP_TOKEN` | Bearer token required by the HTTP transport (mandatory for non-loopback hosts) |
| `VINTED_MCP_HOST` / `VINTED_MCP_PORT` / `VINTED_MCP_PATH` | HTTP bind address (default `127.0.0.1`), port (`3001`) and path (`/mcp`) |

---

## Requirements

- Node.js ≥ 18
- Optional: `playwright` + `puppeteer-extra-plugin-stealth` for `--browser` / `VINTED_BROWSER=1` mode

---

## License

MIT © [googlarz](https://github.com/googlarz)

---

<div align="center">
<sub>Not affiliated with Vinted UAB. Use responsibly.</sub>
</div>
