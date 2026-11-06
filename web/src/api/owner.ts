// The owner app's data from the API (/api/owner): who is signed in and their business.

import { useQuery } from '@tanstack/react-query';
import type { Business } from './businesses';
import { api } from './client';

export interface Me {
  user: { id: string; name: string; email: string; image: string | null };
  // Null until a business is linked to this owner.
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
