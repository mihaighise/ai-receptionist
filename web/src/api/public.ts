// What anyone can read, signed in or not: the plans, for the landing page.

import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import type { Plan, TopUp } from './owner';

export const usePublicPlans = () =>
  useQuery({
    queryKey: ['public', 'plans'],
    queryFn: () => api<{ plans: Plan[]; topUp: TopUp }>('GET', '/plans'),
    staleTime: Infinity,
  });
