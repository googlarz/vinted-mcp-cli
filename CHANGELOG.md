# Changelog

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
