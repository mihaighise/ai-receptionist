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
  created_at: string;
}

// What the API accepts when creating or saving a business.
export type BusinessInput = Omit<Business, 'id' | 'created_at'>;

export interface Options {
  languages: { code: string; name: string }[];
  features: { code: string; label: string }[];
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

// The greeting and Claude's instructions for unsaved form values.
export const usePreview = () =>
  useMutation({ mutationFn: (input: BusinessInput) => api<Preview>('POST', '/admin/preview', input) });
