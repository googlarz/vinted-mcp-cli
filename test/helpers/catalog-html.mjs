// Builds a catalog page in the shape Vinted serves today: Next.js flight data embedded in <script> tags.
export function catalogEntry({ id, title = `t${id}`, price = '10.00', currency = 'EUR', brand = 'Nike', second = 'M · Très bon état', userId = id, favourites = 0 }) {
  return {
    id,
    productItem: {
      id, title, url: `/items/${id}-${title.toLowerCase().replace(/\W+/g, '-')}?referrer=catalog`,
      favouriteCount: favourites,
      price: { amount: price, currencyCode: currency },
      thumbnailUrl: `https://images1.vinted.net/t/${id}/310x430/x.webp`,
      photos: [{ url: `https://images1.vinted.net/t/${id}/f800/x.webp`, isMain: true }],
      user: { id: userId, photo: null, isBusiness: false },
      itemBox: { firstLine: brand, secondLine: second, exposure: '$undefined', itemId: String(id) },
    },
  };
}

export function catalogHtml(entries, pagination = {}, { between = '' } = {}) {
  const pg = { current_page: 1, per_page: 96, total_entries: entries.length, total_pages: 1, ...pagination };
  const flight =
    `0:{"noise":"${'x'.repeat(50)}"}\n` +
    `5:{"catalogBrand":{"brand":"$undefined"},"items":{"items":${JSON.stringify(entries)}${between},"pagination":${JSON.stringify(pg)},"uiState":"SUCCESS"}}\n`;
  // split into two chunks to exercise chunk concatenation
  const mid = Math.floor(flight.length / 2);
  const chunk = (s) => `<script>self.__next_f.push([1,${JSON.stringify(s)}])</script>`;
  return `<!doctype html><html><body>${chunk(flight.slice(0, mid))}${chunk(flight.slice(mid))}</body></html>`;
}

// Client double: serves catalog pages via pageGet, mirroring VintedClient.pageGet's parse hook.
export class CatalogClient {
  constructor(pages) {
    this.pages = pages; // (country, path) => html string | Error
    this.calls = [];
  }
  async pageGet(country, path, parse, ttl) {
    this.calls.push({ country, path, ttl });
    const html = await this.pages(country, path);
    if (html instanceof Error) throw html;
    return parse(html);
  }
  async apiGet(country, path) {
    this.calls.push({ country, path });
    throw new Error(`unmocked api: ${path}`);
  }
}
