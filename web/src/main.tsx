import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { router } from './router';
import './index.css';

const queryClient = new QueryClient({
  // An API error is shown on the page; retrying it three times first would only slow that down.
  defaultOptions: { queries: { retry: 1 } },
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="bottom-center" />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
