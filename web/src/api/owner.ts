// The owner app's data from the API (/api/owner): who is signed in and their business.

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookingSettings, Business, Options, Preview } from './businesses';
import { api } from './client';

export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  // Null until they set up their business (or one is linked to them).
  business: Business | null;
  billing: Billing | null;
}

// The business's plan, as the owner app shows it.
export interface Billing {
  // True until a business that needs a plan has a paid one; it doesn't answer calls until then.
  needsPlan: boolean;
  plan: string | null;
  // Stripe's subscription status: active, past_due, canceled, ...
  status: string | null;
  // When the current month ends: the next payment, or the end of the plan if it cancels.
  periodEnd: string | null;
  cancels: boolean;
  usage: Usage;
  // When the business's number will be given back because its plan ended, or null.
  numberReleasesAt: string | null;
}

// Call minutes this billing month (src/shared/usage.js).
export interface Usage {
  // False for businesses without a subscription, which have no limit (the numbers are then 0).
  limited: boolean;
  // Included in the plan each month.
  planMinutes: number;
  used: number;
  // Bought extra minutes left; they don't expire.
  extra: number;
  // Plan minutes left this month plus extra minutes. At 0, new calls aren't answered.
  remaining: number;
  periodStart: string | null;
  periodEnd: string | null;
}

// Extra minutes: their price, and the slider's range.
export interface TopUp {
  centsPerMinute: number;
  min: number;
  max: number;
  step: number;
}

export interface Plan {
  code: string;
  name: string;
  priceCents: number;
  minutes: number;
}

export const ME_KEY = ['owner', 'me'];

export const useMe = () => useQuery({ queryKey: ME_KEY, queryFn: () => api<Me>('GET', '/owner/me') });

// The sign-in providers the server has keys for, e.g. ['google'].
export const useSignInProviders = () =>
  useQuery({
    queryKey: ['owner', 'providers'],
    queryFn: () => api<{ providers: string[] }>('GET', '/owner/providers'),
    staleTime: Infinity,
  });

// What an owner sets for their business in the setup wizard. The rest (its phone number, whether
// it answers calls) is set by the app.
export type BusinessSettings = Pick<
  Business,
  | 'name'
  | 'description'
  | 'business_type'
  | 'address'
  | 'hours'
  | 'phone'
  | 'faq'
  | 'languages'
  | 'features'
  | 'transfer_number'
  | 'notify_sms'
  | 'notify_whatsapp'
  | 'urgent_when'
> & { booking_settings: BookingSettings };

// The languages and features to choose from. They only change with the server code.
export const useOwnerOptions = () =>
  useQuery({
    queryKey: ['owner', 'options'],
    queryFn: () => api<Options>('GET', '/owner/options'),
    staleTime: Infinity,
  });

// Saves the owner's business, creating it the first time.
export function useSaveMyBusiness() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: BusinessSettings) => api<Business>('PUT', '/owner/business', settings),
    // The billing summary depends on the business, so /me is loaded again.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ME_KEY }),
  });
}

// The greeting callers would hear with these settings, loaded while `enabled`.
export const useGreetingPreview = (settings: BusinessSettings, enabled: boolean) =>
  useQuery({
    queryKey: ['owner', 'preview', settings],
    queryFn: () => api<Pick<Preview, 'greeting'>>('POST', '/owner/preview', settings),
    enabled,
    staleTime: Infinity,
  });

export const usePlans = () =>
  useQuery({
    queryKey: ['owner', 'plans'],
    // testMode: payments are pretend (a Stripe test key), so the page says which card to use.
    queryFn: () => api<{ plans: Plan[]; topUp: TopUp; testMode: boolean }>('GET', '/owner/plans'),
    staleTime: Infinity,
  });

// Starts paying for a plan: sends the browser to Stripe's Checkout page.
export const useCheckout = () =>
  useMutation({
    mutationFn: (plan: string) => api<{ url: string }>('POST', '/owner/billing/checkout', { plan }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

// Buys extra minutes: sends the browser to Stripe's Checkout page.
export const useTopUp = () =>
  useMutation({
    mutationFn: (minutes: number) => api<{ url: string }>('POST', '/owner/billing/top-up', { minutes }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

// After Checkout: makes sure the new plan or the extra minutes show straight away. kind: what was
// paid for; added: the extra minutes it added (0 for a plan, or if they were already added).
export function useConfirmCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      api<Billing & { kind: 'plan' | 'top_up'; added: number }>('POST', '/owner/billing/confirm', { sessionId }),
    onSuccess: ({ kind: _kind, added: _added, ...billing }) =>
      queryClient.setQueryData<Me>(ME_KEY, (me) => me && { ...me, billing }),
  });
}

// Opens Stripe's billing page: change plan or card, invoices, cancel.
export const useBillingPortal = () =>
  useMutation({
    mutationFn: () => api<{ url: string }>('POST', '/owner/billing/portal'),
    onSuccess: ({ url }) => window.location.assign(url),
  });

// A menu read from photos (src/api/menu-import.js).
export interface MenuImport {
  id: string;
  status: 'reading' | 'done' | 'failed';
  photos: number;
  // One line per item or note, in the same form as the common questions.
  lines: string[];
  error: string | null;
}

// Starts reading a menu from photos (already shrunk, see lib/shrink-photo.ts).
export const useStartMenuImport = () =>
  useMutation({
    mutationFn: (photos: { mediaType: string; data: string }[]) =>
      api<{ id: string }>('POST', '/owner/menu-imports', { photos }),
  });

// An upload, checked every 1.5 seconds while it's being read.
export const useMenuImport = (id: string | null) =>
  useQuery({
    queryKey: ['owner', 'menu-import', id],
    queryFn: () => api<MenuImport>('GET', `/owner/menu-imports/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.status === 'reading' || !query.state.data ? 1500 : false),
  });

// One answered call, for the call history.
export interface Call {
  id: string;
  started_at: string;
  caller: string | null;
  seconds: number;
  minutes: number;
  transferred: boolean;
  // The message taken on the call, if any.
  message: { caller_name: string; callback_number: string; message: string; urgent: boolean } | null;
  // Appointments booked on the call.
  bookings: Booking[];
}

export interface Booking {
  service: string;
  starts_at: string;
  ends_at: string;
  caller_name: string;
  caller_number: string;
  notes: string;
}

// The business's calls, newest first, `pageSize` at a time (fetchNextPage loads more).
export const useCalls = (pageSize = 50) =>
  useInfiniteQuery({
    queryKey: ['owner', 'calls', pageSize],
    queryFn: ({ pageParam }) =>
      api<{ calls: Call[]; next: string | null }>(
        'GET',
        `/owner/calls?limit=${pageSize}${pageParam ? `&after=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    // New calls show up without reloading the page.
    refetchInterval: 60_000,
  });

// The owner's calendar, for booking appointments (src/api/owner/calendar-routes.js).
export interface CalendarStatus {
  connected: boolean;
  // False when the server has no Google keys, so it can't be connected.
  available: boolean;
  email?: string | null;
  // The calendar bookings go into, and the ones to choose from.
  calendarId?: string;
  calendars?: { id: string; name: string; primary: boolean }[];
}

const CALENDAR_KEY = ['owner', 'calendar'];

export const useCalendar = () =>
  useQuery({ queryKey: CALENDAR_KEY, queryFn: () => api<CalendarStatus>('GET', '/owner/calendar') });

// Opens Google's page to allow access in a popup (so the setup's unsaved answers stay on the
// page), and loads the status again when it says it's done, or is closed. onDone: ok, or why not.
export function useConnectCalendar(onDone: (result: { ok: boolean; message?: string }) => void) {
  const queryClient = useQueryClient();
  return () => {
    const popup = window.open('/api/owner/calendar/connect', 'oriana-calendar', 'width=520,height=680');
    if (!popup) return onDone({ ok: false, message: 'Allow pop-ups for this site, then try again.' });
    const finish = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(closed);
      queryClient.invalidateQueries({ queryKey: CALENDAR_KEY });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'oriana-calendar') return;
      finish();
      onDone({ ok: Boolean(event.data.ok), message: event.data.message });
    };
    window.addEventListener('message', onMessage);
    const closed = window.setInterval(() => popup.closed && finish(), 500);
  };
}

export function useChooseCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (calendarId: string) => api<{ calendarId: string }>('PUT', '/owner/calendar', { calendarId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}

export function useDisconnectCalendar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<null>('DELETE', '/owner/calendar'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CALENDAR_KEY }),
  });
}
