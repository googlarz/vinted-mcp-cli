export type Country =
  | 'fr' | 'de' | 'uk' | 'it' | 'es' | 'nl' | 'pl' | 'pt' | 'be' | 'at'
  | 'lt' | 'cz' | 'sk' | 'hu' | 'ro' | 'hr' | 'fi' | 'dk' | 'se';

export const COUNTRIES: Country[] = [
  'fr', 'de', 'uk', 'it', 'es', 'nl', 'pl', 'pt', 'be', 'at',
  'lt', 'cz', 'sk', 'hu', 'ro', 'hr', 'fi', 'dk', 'se',
];

export const DOMAIN: Record<Country, string> = {
  fr: 'www.vinted.fr', de: 'www.vinted.de', uk: 'www.vinted.co.uk',
  it: 'www.vinted.it', es: 'www.vinted.es', nl: 'www.vinted.nl',
  pl: 'www.vinted.pl', pt: 'www.vinted.pt', be: 'www.vinted.be',
  at: 'www.vinted.at', lt: 'www.vinted.lt', cz: 'www.vinted.cz',
  sk: 'www.vinted.sk', hu: 'www.vinted.hu', ro: 'www.vinted.ro',
  hr: 'www.vinted.hr', fi: 'www.vinted.fi', dk: 'www.vinted.dk',
  se: 'www.vinted.se',
};

export type Condition =
  | 'new_with_tags' | 'new_without_tags' | 'very_good' | 'good' | 'satisfactory';

export const CONDITION_ID: Record<Condition, number> = {
  new_with_tags: 6, new_without_tags: 1, very_good: 2, good: 3, satisfactory: 4,
};

export type SortBy =
  | 'relevance' | 'price_low_to_high' | 'price_high_to_low' | 'newest_first';

export const SORT_VALUE: Record<SortBy, string> = {
  relevance: 'relevance',
  price_low_to_high: 'price_asc',
  price_high_to_low: 'price_desc',
  newest_first: 'newest_first',
};

export interface SearchParams {
  query: string;
  country?: Country;
  priceMin?: number;
  priceMax?: number;
  brandIds?: number[];
  categoryId?: number;
  sizeIds?: number[];
  colorIds?: number[];
  condition?: Condition[];
  sortBy?: SortBy;
  perPage?: number;
  page?: number;
  /** Skip the response cache (used when polling for fresh listings). */
  noCache?: boolean;
}

export interface Item {
  id: number;
  title: string;
  price: string;
  currency: string;
  brand?: string;
  size?: string;
  condition?: string;
  url: string;
  favouriteCount?: number;
  photoUrl?: string;
  seller: { id: number; username: string };
}

export interface SearchResult {
  totalCount: number;
  page: number;
  items: Item[];
}

export interface ItemDetail extends Item {
  description?: string;
  photos: string[];
  createdAt?: string;
  raw?: unknown;
}

export interface Seller {
  id: number;
  username: string;
  itemCount?: number;
  feedbackReputation?: number;
  feedbackCount?: number;
  countryCode?: string;
  profileUrl: string;
  raw?: unknown;
}

export interface CategoryHit {
  id: number;
  title: string;
  parentId?: number;
  itemCount?: number;
}
