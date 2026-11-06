// The owner app's data from the API (/api/owner): who is signed in and their business.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Business, Options, Preview } from './businesses';
import { api } from './client';

export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  // Null until they set up their business (or one is linked to them).
  business: Business | null;
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
    onSuccess: (business) => queryClient.setQueryData<Me>(ME_KEY, (me) => me && { ...me, business }),
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
