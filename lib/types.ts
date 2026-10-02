export type ItemType =
  | 'sneaker'
  | 'clothing'
  | 'electronics'
  | 'tool'
  | 'watch'
  | 'jewelry'
  | 'collectible'
  | 'toy'
  | 'home_good'
  | 'appliance'
  | 'auto_part'
  | 'motorcycle_part'
  | 'book_media'
  | 'sporting_good'
  | 'general_unknown';

export type ItemStatus =
  | 'draft'
  | 'needs_photos'
  | 'needs_review'
  | 'ready_to_list'
  | 'listed'
  | 'sold'
  | 'delisted';

export type ConditionGrade =
  | 'new_with_box'
  | 'new_without_box'
  | 'pre_owned_excellent'
  | 'pre_owned_good'
  | 'pre_owned_fair'
  | 'damaged_flawed';

export type ImageLabel =
  | 'hero'
  | 'side'
  | 'back'
  | 'outsole'
  | 'size_tag'
  | 'box_label'
  | 'flaw'
  | 'insole'
  | 'other';

export type Platform = 'ebay' | 'facebook' | 'mercari' | 'offerup' | 'poshmark';
export type PlatformStatus = 'not_started' | 'drafted' | 'listed' | 'sold' | 'removed';

export interface SneakerItem {
  id: string;
  item_number: number;
  item_id: string;
  item_type: ItemType;
  status: ItemStatus;
  brand?: string;
  model?: string;
  product_name?: string;
  model_number?: string;
  serial_number?: string;
  nickname?: string;
  style_code?: string;
  upc?: string;
  size?: string;
  color?: string;
  measurements?: string;
  gender?: string;
  category?: string;
  condition_grade?: ConditionGrade;
  list_price?: number;
  accept_offer_floor?: number;
  do_not_sell_below?: number;
  local_cash_price?: number;
  notes?: string;
  hero_image_url?: string;
  inventory_number?: string;
  drive_folder_id?: string;
  ebay_listing_id?: string;
  ebay_listing_url?: string;
  created_at: string;
  updated_at: string;
}

export interface SneakerImage {
  id: string;
  item_id: string;
  storage_path: string;
  public_url: string;
  label: ImageLabel;
  sort_order: number;
  created_at: string;
}

export interface AiIdentification {
  id: string;
  item_id: string;
  item_type: ItemType;
  category_confidence: number;
  brand?: string;
  model?: string;
  product_name?: string;
  model_number?: string;
  serial_number?: string;
  nickname?: string;
  style_code?: string;
  upc?: string;
  size?: string;
  color?: string;
  measurements?: string;
  gender?: string;
  category?: string;
  production_dates?: string;
  materials?: string;
  included_accessories?: string;
  missing_accessories?: string;
  visible_flaws?: string[];
  testing_status?: string;
  authenticity_notes?: string;
  box_details?: Record<string, unknown>;
  confidence_score: number;
  missing_info: string[];
  raw_response?: Record<string, unknown>;
  verified: boolean;
  verification_sources?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface ConditionAssessment {
  id: string;
  item_id: string;
  grade?: ConditionGrade;
  outsole_wear?: string;
  heel_drag?: string;
  toe_box_creasing?: string;
  scuffs?: string;
  stains?: string;
  yellowing?: string;
  missing_insoles: boolean;
  lace_condition?: string;
  box_condition?: string;
  sole_separation: boolean;
  odor_risk: boolean;
  detailed_notes?: string;
  photo_feedback: string[];
  created_at: string;
}

export interface CompListing {
  title: string;
  price: number;
  url?: string;
  condition?: string;
  date?: string;
  platform?: string;
}

export interface CompResearch {
  id: string;
  item_id: string;
  active_listings: CompListing[];
  sold_listings: CompListing[];
  fast_sale_price?: number;
  recommended_price?: number;
  accept_offer_floor?: number;
  local_cash_price?: number;
  do_not_sell_below?: number;
  expected_sell_days?: number;
  sources?: unknown[];
  created_at: string;
  updated_at: string;
}

export interface ListingContent {
  id: string;
  item_id: string;
  ebay_title?: string;
  facebook_title?: string;
  mercari_title?: string;
  offerup_title?: string;
  ebay_description?: string;
  facebook_description?: string;
  mercari_description?: string;
  offerup_description?: string;
  item_specifics?: Record<string, string>;
  keyword_bank: string[];
  hashtags: string[];
  photo_feedback: string[];
  platform_strategy?: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformListing {
  id: string;
  item_id: string;
  platform: Platform;
  status: PlatformStatus;
  listing_url?: string;
  ebay_listing_id?: string;
  ebay_offer_id?: string;
  notes?: string;
  listed_at?: string;
  sold_at?: string;
  created_at: string;
  updated_at: string;
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  sneaker:         'Sneaker',
  clothing:        'Clothing',
  electronics:     'Electronics',
  tool:            'Tool',
  watch:           'Watch',
  jewelry:         'Jewelry',
  collectible:     'Collectible',
  toy:             'Toy',
  home_good:       'Home Good',
  appliance:       'Appliance',
  auto_part:       'Auto Part',
  motorcycle_part: 'Motorcycle Part',
  book_media:      'Book / Media',
  sporting_good:   'Sporting Good',
  general_unknown: 'General / Unknown',
};

export const STATUS_LABELS: Record<ItemStatus, string> = {
  draft: 'Draft',
  needs_photos: 'Needs Photos',
  needs_review: 'Needs Review',
  ready_to_list: 'Ready to List',
  listed: 'Listed',
  sold: 'Sold',
  delisted: 'Delisted',
};

export const STATUS_COLORS: Record<ItemStatus, string> = {
  draft: 'bg-zinc-700 text-zinc-200',
  needs_photos: 'bg-amber-900/50 text-amber-300',
  needs_review: 'bg-orange-900/50 text-orange-300',
  ready_to_list: 'bg-blue-900/50 text-blue-300',
  listed: 'bg-emerald-900/50 text-emerald-300',
  sold: 'bg-green-900/50 text-green-300',
  delisted: 'bg-red-900/50 text-red-300',
};

export const CONDITION_LABELS: Record<ConditionGrade, string> = {
  new_with_box: 'New w/ Box',
  new_without_box: 'New w/o Box',
  pre_owned_excellent: 'Pre-Owned Excellent',
  pre_owned_good: 'Pre-Owned Good',
  pre_owned_fair: 'Pre-Owned Fair',
  damaged_flawed: 'Damaged/Flawed',
};

export const IMAGE_LABELS: Record<ImageLabel, string> = {
  hero: 'Hero',
  side: 'Side',
  back: 'Back',
  outsole: 'Outsole',
  size_tag: 'Size Tag',
  box_label: 'Box Label',
  flaw: 'Flaw',
  insole: 'Insole',
  other: 'Other',
};

export const PLATFORM_LABELS: Record<Platform, string> = {
  ebay: 'eBay',
  facebook: 'Facebook Marketplace',
  mercari: 'Mercari',
  offerup: 'OfferUp',
  poshmark: 'Poshmark',
};

export const PLATFORM_STATUS_COLORS: Record<PlatformStatus, string> = {
  not_started: 'bg-zinc-700 text-zinc-300',
  drafted: 'bg-blue-900/60 text-blue-300',
  listed: 'bg-emerald-900/60 text-emerald-300',
  sold: 'bg-green-900/60 text-green-300',
  removed: 'bg-red-900/60 text-red-300',
};
