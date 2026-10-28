
export type ProductCategory = 'TICKET' | 'EXTRA';

export type TicketType =
  | 'DAY_PASS'
  | 'ALL_DAY_PASS'
  | 'FAMILY_PASS';

export type ExtraType =
  | 'DANDIYA_STICKS'
  | 'DINNER_PLATE'
  | 'GARBA_WORKSHOP';

export type InventoryPolicy =
  | 'SHARED'
  | 'PER_DAY'
  | 'PER_SESSION';

export interface ProductSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  category: ProductCategory;
  type: TicketType | ExtraType;
  priceInCents: number;
  currency: 'USD';
  available: boolean;
}

export interface TicketAgePolicy {
  minimumAge: number;
  maximumAge?: number;
}

export interface ProductAvailability {
  productId: string;
  availableQuantity: number;
  eventDate?: string;
}
