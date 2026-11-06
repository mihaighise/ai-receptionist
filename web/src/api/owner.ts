// The owner app's data from the API (/api/owner): who is signed in and their business.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Business, Options, Preview } from './businesses';
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
>;

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
    queryFn: () => api<{ plans: Plan[]; testMode: boolean }>('GET', '/owner/plans'),
    staleTime: Infinity,
  });

// Starts paying for a plan: sends the browser to Stripe's Checkout page.
export const useCheckout = () =>
  useMutation({
    mutationFn: (plan: string) => api<{ url: string }>('POST', '/owner/billing/checkout', { plan }),
    onSuccess: ({ url }) => window.location.assign(url),
  });

// After Checkout: makes sure the new plan shows straight away.
export function useConfirmCheckout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api<Billing>('POST', '/owner/billing/confirm', { sessionId }),
    onSuccess: (billing) => queryClient.setQueryData<Me>(ME_KEY, (me) => me && { ...me, billing }),
  });
}

// Opens Stripe's billing page: change plan or card, invoices, cancel.
export const useBillingPortal = () =>
  useMutation({
    mutationFn: () => api<{ url: string }>('POST', '/owner/billing/portal'),
    onSuccess: ({ url }) => window.location.assign(url),
  });
