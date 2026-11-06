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

// What the API accepts when creating or saving a business. The owner is given by email.
export type BusinessInput = Omit<
  Business,
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
  features: { code: string; label: string }[];
}

// The latest automatic Twilio number order for a business (src/api/phone-numbers.js).
export interface NumberOrder {
  // dry_run: what would have been bought; buying; bought; failed (see error).
  status: 'dry_run' | 'buying' | 'bought' | 'failed';
  area_code: string | null;
  phone_number: string | null;
  error: string | null;
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
