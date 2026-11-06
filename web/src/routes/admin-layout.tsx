import { Outlet, useLocation } from '@tanstack/react-router';
import { Phone } from 'lucide-react';
import { BusinessList } from '@/features/businesses/business-list';
import { cn } from '@/lib/utils';

// The admin site (/admin): header, the business list on the left and the current page on the
// right. On a phone there's room for only one, so the list shows on the admin home page and each
// business on its own page.
export function AdminLayout() {
  const isHome = useLocation({ select: (location) => location.pathname.replace(/\/$/, '') === '/admin' });

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Phone className="size-4" />
          </div>
          <div>
            <p className="font-semibold leading-tight">Receptionist admin</p>
            <p className="text-muted-foreground text-xs">Changes apply from the next call.</p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className={cn('md:sticky md:top-6 md:self-start', !isHome && 'hidden md:block')}>
          <BusinessList />
        </aside>
        <main className={cn('min-w-0', isHome && 'hidden md:block')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
