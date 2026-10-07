# Changelog

## [1.6.3] — 2026-10-07

### Fixed — search was broken against live Vinted
- Vinted removed the JSON catalog endpoint (`/api/v2/catalog/items` now returns 404 in every country, even from a browser session). `search`, `search_all_items`, `trending`, `compare` and `get_new_items` all depended on it. Search results are now read from the server-rendered `/catalog` page, whose Next.js payload embeds the result list. Filters (brand, size, color, category, condition, price, sort) were verified against the live site.
- `seller-items` uses `/api/v2/wardrobe/{id}/items` (the old catalog query is gone).
- Item pages fall back to HTML when the details API answers 403; the fallback now returns the seller ID and username (it returned `id: 0`).
- `compare_prices` no longer hides failures: countries that errored are listed in `failed` instead of looking like "no results".
- `opSearchAll`: a failed prefetched page no longer leaves unhandled rejections (could crash Node), `maxPages` counts from the start page, returned `page` is correct, and `perPage` can no longer make it skip items.
- Setup instructions: `npx -y @googlarz/vinted-client/mcp` (README and `smithery.yaml`) never worked — the package has no `/mcp` export — and neither did `npx @googlarz/vinted-client search …` (two binaries). Use `npx -y -p @googlarz/vinted-client vinted-mcp` / `… vinted search …`.

### Changed (behaviour differences from the catalog move)
- Vinted serves fixed pages of 96 and caps results at 960 per query; `perPage`/`--limit` now only truncate a page.
- `condition` and `size` on search results are the localised strings Vinted displays (e.g. "Très bon état") and `seller.username` is empty (only the ID is listed); use `get_item`/`get_seller` for the rest.
- `dateFrom`/`dateTo` are removed from the CLI and MCP and rejected by the library: the catalog has no date filter.
- `get_new_items`: `sinceMinutes` is replaced by an `afterId` cursor and the response carries `latestId`. The catalog exposes no timestamps (the old filter could never match), but item IDs grow with listing time. Now also available as `opGetNewItems` in the library.
- MCP tools: a brand/size/color name that resolves to nothing is now an error (it used to run an unfiltered search); partly resolved lists add `warnings`. List filters also accept comma-separated strings.
- MCP `get_item` no longer takes `browser`; the operator enables it with `VINTED_BROWSER=1`, and at most 2 browsers run at once.
- `vinted debug` prints cookie names only; add `--show-cookie` for values.

### Security
- HTTP transport: `VINTED_MCP_TOKEN` enables bearer auth; without it only loopback `Host` headers are accepted and `Origin` requests are rejected (DNS rebinding); binding to a non-loopback host without a token is refused.
- MCP arguments are validated before use (country codes, `countries`, argument shape); `maxItems`/`maxPages`/`limit` are clamped and `countries` is deduplicated, so callers cannot trigger unbounded work.
- Dependencies: `npm audit` reported 11 advisories in runtime dependencies (1 critical, 6 high). Updated `undici` to ^6.29 and `@modelcontextprotocol/sdk` to ^1.32 (0 advisories now). The SDK moved from `optionalDependencies` to `dependencies` — the `vinted-mcp` binary cannot start without it. Node ≥ 18.17 (undici's requirement).
- Publish workflow: least-privilege `permissions`, tests and `npm audit` before publishing, tag/version match check, npm provenance, actions pinned by commit SHA.

### Reliability
- One session bootstrap per country is shared by concurrent requests; a 401 re-bootstraps once (it could loop three times and drop sessions other requests had just refreshed); every request has a timeout (default 20 s); `Retry-After` is capped at 10 s.
- Identical concurrent requests share one network call; static data (colors, sizes, categories) has its own cache so searches cannot evict it.
- `search --watch`: survives transient errors, rejects bad intervals (`NaN` used to hammer the API in a hot loop), no overlapping polls, bounded memory.
- Brand lookups run in parallel.
- `callTool` (the MCP tool dispatcher) is exported from the library.
- Version strings come from `package.json` (they had drifted twice).
- `get_new_items` and `search --watch` bypass the 60 s response cache (polling every 5-30 s used to return stale pages); `get_new_items` adds `truncated: true` when more than `perPage` listings may have arrived since `afterId`, and validates `afterId`.
- Catalog pagination is parsed as a whole object, so extra or reordered keys in Vinted's payload cannot silently reset `totalCount`/`page`.
- The HTTP transport matches the configured path exactly (`/mcpfoo` no longer reaches the server).

### Tests
- New unit tests for the catalog parser, `get_new_items`, tool dispatch/validation, session behaviour (undici `MockAgent`: bootstrap sharing, dedupe, 401/403/429, timeout) and the CLI. The live integration suite now covers search, filters, trending, seller items, compare and lookups, and `.github/workflows/live-smoke.yml` runs it weekly, because mocked unit tests cannot notice a site change like this one.

## [1.6.2] — 2026-10-07

### Added
- CLI `search`: `--size <labels>` flag — auto-resolves size labels (e.g. `M,L,XL` or `42,43`) to numeric IDs
- CLI `compare`: `--size <labels>` and `--color <names>` flags — auto-resolve to IDs before comparison
- MCP `search_items` / `search_all_items`: `size[]` and `color[]` params — auto-resolved server-side
- MCP `resolve_color_ids` tool — resolve color names to Vinted IDs (parallel to `resolve_size_ids`)
- Tests: `colors.test.mjs` — 5 unit tests for `resolveColorIds`

### Fixed
- `get_new_items`: `dateFrom` now derived from `sinceMs` instead of always `new Date()` — items created just before midnight were missed when polling at midnight crossing

---

## [1.6.1] — 2026-10-07

### Added
- CLI `search`: `--color-ids <ids>` and `--color <names>` flags (auto-resolved via `get_colors`)
- CLI `compare`: `--brand` / `--brand-ids` / `--size-ids` / `--color-ids` / `--condition` / `--all-countries` flags
- Op `resolveColorIds`: new export in `get-colors.ts`, matches by title or Vinted code (e.g. `BLACK`, `NAVY_BLUE`)
- Op `compare`: `stdDev` field added to `CountryStats` — was described in MCP tool but missing from the data
- `searchSlim`: accepts optional `extra` filters (`brandIds`, `categoryId`, `sizeIds`, `colorIds`, `condition`)
- `smithery.yaml`: Smithery MCP directory configuration
- Tests: `sizes.test.mjs` — 6 unit tests for `resolveSizeIds`
- README: updated commands table, search flags, MCP tools table, new MCP Prompts section, quick-start examples

---

## [1.6.0] — 2026-10-07

### Added
- CLI `colors`: list all Vinted color options with IDs
- CLI `size-groups`: list all size groups with IDs
- CLI `feedback`: paginated buyer/seller reviews
- CLI `sizes <labels...>`: resolve size labels to numeric IDs
- Op `resolveSizeIds()`: resolve size labels (M, 42, XL) to numeric IDs across all size groups
- MCP tool `resolve_size_ids`: server-side size label resolution
- MCP tool `get_new_items`: polling helper — items listed in the last N minutes
- MCP Prompts: `find-bargains`, `seller-check`, `price-comparison`, `wardrobe-hunt`

---

## [1.1.5] — 2026-09-03

### Fixed
- `TtlCache`: per-entry TTL override was being ignored (static entries used default TTL)
- `--no-cache` CLI flag: Commander.js sets `opts.cache = false`, not `opts.noCache` — cache was never disabled
- HTTP client sharing: requests to different Vinted country domains could interfere with each other's cookie jars
