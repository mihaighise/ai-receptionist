// Businesses in the admin routes of the API (/api/admin): their types, and TanStack Query hooks to load and change them.
// Every change refreshes the list, so the sidebar always matches the database.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// A row of the businesses table, as the API returns it.
export interface Business {
  id: string;
  slug: string;
  name: string;
  description: string;
  // The kind of business (src/shared/business-types.js), e.g. 'restaurant'.
  business_type: string;
  address: string;
  hours: string;
  phone: string;
  faq: string[];
  twilio_number: string | null;
  languages: string[];
  features: string[];
  transfer_number: string | null;
  notify_sms: string | null;
  notify_whatsapp: string | null;
  urgent_when: string;
  // What callers can book, and when (the bookings skill). {} until the owner sets them.
  booking_settings: Partial<BookingSettings>;
  active: boolean;
  owner_id: string | null;
  // The email of the owner's account, for showing and editing who owns it.
  owner_email: string | null;
  // Billing, kept up to date from Stripe. Only businesses owners set up need a subscription.
  requires_subscription: boolean;
  plan: string | null;
  subscription_status: string | null;
  subscription_period_end: string | null;
  subscription_cancels: boolean;
  created_at: string;
}

// Appointments callers can book (src/skills/bookings/slots.js). Times are 24-hour "HH:MM", in timeZone.
export interface BookingSettings {
  services: { name: string; minutes: number }[];
  // sun..sat -> the bookable hours that day; a day that's missing is closed.
  hours: Partial<Record<Weekday, { from: string; to: string }[]>>;
  timeZone: string;
  // Free time kept after each appointment.
  bufferMinutes: number;
  // How soon an appointment can be booked, and how far ahead.
  noticeHours: number;
  horizonDays: number;
}

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

// What the API accepts when creating or saving a business. The owner is given by email. The admin
// site leaves booking settings as they are.
export type BusinessInput = Omit<
  Business,
  | 'booking_settings'
  | 'id'
  | 'created_at'
  | 'owner_id'
  | 'owner_email'
  | 'requires_subscription'
  | 'plan'
  | 'subscription_status'
  | 'subscription_period_end'
  | 'subscription_cancels'
> & { owner_email: string };

export interface Options {
  languages: { code: string; name: string }[];
  // The skills a business can switch on (src/skills).
  features: { code: string; label: string }[];
  businessTypes: BusinessType[];
}

// A kind of business and its template (src/shared/business-types.js).
export interface BusinessType {
  code: string;
  label: string;
  examples: string;
  // Skills switched on by default.
  skills: string[];
  // Example text for the setup's fields.
  placeholders: { description: string; hours: string; urgent_when: string };
  // Common questions to start from, with ___ for the owner to fill in.
  faq: string[];
  // What callers usually book, to start the bookings skill's list from.
  services: { name: string; minutes: number }[];
}

// The latest automatic Twilio number order for a business (src/api/phone-numbers.js).
export interface NumberOrder {
  // dry_run: what would have been bought; buying; bought; failed (see error); released (after
  // the plan ended).
  status: 'dry_run' | 'buying' | 'bought' | 'failed' | 'released';
  area_code: string | null;
  phone_number: string | null;
  error: string | null;
  released_at: string | null;
  // Why the last try to release the number failed; it's tried again every hour.
  release_error: string | null;
  created_at: string;
}

export interface Preview {
  greeting: { language: string; languageName: string; text: string }[];
  prompt: string;
}

const LIST_KEY = ['businesses'];

// The languages and features to choose from. They only change with the server code.
export const useOptions = () =>
  useQuery({ queryKey: ['options'], queryFn: () => api<Options>('GET', '/admin/options'), staleTime: Infinity });

export const useBusinesses = () =>
  useQuery({ queryKey: LIST_KEY, queryFn: () => api<Business[]>('GET', '/admin/businesses') });

export function useSaveBusiness(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: BusinessInput) =>
      id ? api<Business>('PUT', `/admin/businesses/${id}`, input) : api<Business>('POST', '/admin/businesses', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export function useDeleteBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<null>('DELETE', `/admin/businesses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_KEY }),
  });
}

export const useNumberOrder = (id: string) =>
  useQuery({
    queryKey: ['number-order', id],
    queryFn: () => api<NumberOrder | null>('GET', `/admin/businesses/${id}/number-order`),
  });

// The greeting and Claude's instructions for unsaved form values.
export const usePreview = () =>
  useMutation({ mutationFn: (input: BusinessInput) => api<Preview>('POST', '/admin/preview', input) });
