// Public library entrypoint — types + client
export { VintedClient } from './client/session.js';
export type { VintedClientOptions } from './client/session.js';
export type {
  Country, Condition, SortBy, SearchParams,
  Item, SearchResult, ItemDetail, Seller, CategoryHit,
} from './client/types.js';
export { COUNTRIES, DOMAIN, CONDITION_ID, SORT_VALUE } from './client/types.js';
export type { BrandHit, ItemSlim, FeedbackEntry, FeedbackResult, ColorHit, SizeEntry, SizeGroup } from './client/endpoints.js';
export { opSearch, opSearchAll } from './ops/search.js';
export { opGetItem } from './ops/get-item.js';
export { opGetSeller } from './ops/get-seller.js';
export { opCompare } from './ops/compare.js';
export { opTrending } from './ops/trending.js';
export { opBrands, resolveBrandIds } from './ops/brands.js';
export { opCategories } from './ops/categories.js';
export { opSellerItems } from './ops/seller-items.js';
export { opGetSellerFeedback } from './ops/get-seller-feedback.js';
export { opGetColors } from './ops/get-colors.js';
export { opGetSizeGroups } from './ops/get-size-groups.js';
export { resolveSizeIds } from './ops/sizes.js';
export type { ResolveSizeIdsResult } from './ops/sizes.js';
