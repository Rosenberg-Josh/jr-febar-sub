import { createContext, useContext } from 'react';

export const VENUE_OPTIONS = [
  { id: 'ALL', label: 'All venues', short: 'All' },
  { id: 'COSM-LA', label: 'Cosm Los Angeles', short: 'LA' },
  { id: 'COSM-DAL', label: 'Cosm Dallas', short: 'DAL' },
] as const;

export const WINDOW_OPTIONS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 365, label: 'Last 12 months' },
] as const;

export interface FilterState {
  venue: string;
  days: number;
  setVenue: (v: string) => void;
  setDays: (d: number) => void;
}

export const FilterContext = createContext<FilterState | null>(null);

export function useFilters(): FilterState {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterContext');
  return ctx;
}

export function venueLabel(id: string): string {
  return VENUE_OPTIONS.find((v) => v.id === id)?.label ?? id;
}

export function windowLabel(days: number): string {
  return WINDOW_OPTIONS.find((w) => w.days === days)?.label ?? `Last ${days} days`;
}

export const OUTLETS = ['Dome Bar', 'Concourse Kitchen', 'In-Seat Service', 'Lounge'] as const;
export const PAYMENT_METHODS = ['Credit Card', 'Debit Card', 'Apple Pay', 'Google Pay'] as const;
