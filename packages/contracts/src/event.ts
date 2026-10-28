
export interface EventDate {
  date: string;
  label: string;
}

export interface EventSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  venue: string;
  timezone: string;
  currency: 'USD';
  dates: EventDate[];
}
