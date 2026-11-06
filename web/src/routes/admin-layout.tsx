import { Outlet, useLocation } from '@tanstack/react-router';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { BusinessList } from '@/features/businesses/business-list';
import { cn } from '@/lib/utils';

// The admin site (/admin): header, the business list on the left and the current page on the
// right. On a phone there's room for only one, so the list shows on the admin home page and each
// business on its own page.
export function AdminLayout() {
  const isHome = useLocation({ select: (location) => location.pathname.replace(/\/$/, '') === '/admin' });

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-lg">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <Logo label="Admin" />
          <p className="hidden text-muted-foreground text-xs sm:block">Changes apply from the next call.</p>
          <ThemeToggle className="ml-auto" />
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 md:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className={cn('md:sticky md:top-20 md:self-start', !isHome && 'hidden md:block')}>
          <BusinessList />
        </aside>
        <main className={cn('min-w-0', isHome && 'hidden md:block')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
