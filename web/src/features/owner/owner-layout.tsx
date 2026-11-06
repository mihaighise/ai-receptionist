import { Link, Outlet } from '@tanstack/react-router';
import { CreditCard, Headset, House, PhoneIncoming } from 'lucide-react';
import { Logo } from '@/components/logo';
import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

// The owner app's pages, in the sidebar (desktop) and the tab bar (phones).
const NAV = [
  { to: '/', label: 'Home', icon: House, exact: true },
  { to: '/calls', label: 'Calls', icon: PhoneIncoming, exact: false },
  { to: '/setup', label: 'Receptionist', icon: Headset, exact: false },
  { to: '/plan', label: 'Plan & billing', short: 'Billing', icon: CreditCard, exact: false },
] as const;

function SidebarNav() {
  return (
    <nav aria-label="Main" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact, includeSearch: false }}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-muted-foreground text-sm transition-colors',
            'hover:bg-sidebar-accent hover:text-foreground',
            'data-[status=active]:bg-sidebar-accent data-[status=active]:text-foreground',
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function TabBar() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-4">
        {NAV.map(({ to, label, icon: Icon, exact, ...rest }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact, includeSearch: false }}
            className="group flex flex-col items-center gap-1 py-2 font-medium text-[11px] text-muted-foreground data-[status=active]:text-primary"
          >
            <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors group-data-[status=active]:bg-accent">
              <Icon className="size-5" />
            </span>
            {'short' in rest ? rest.short : label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

// The owner app's frame. On a computer: a sidebar with the pages and the owner's menu. On a
// phone: a top bar with the owner's menu and a tab bar at the bottom. The router only shows it to
// signed-in owners (see router.tsx).
export function OwnerLayout() {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/" className="mb-6 px-2 py-1">
          <Logo />
        </Link>
        <SidebarNav />
        <div className="mt-auto">
          <UserMenu />
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/90 px-4 py-2.5 backdrop-blur-lg md:hidden">
        <Link to="/">
          <Logo />
        </Link>
        <UserMenu compact />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-10 md:pb-12">
        <Outlet />
      </main>

      <TabBar />
    </div>
  );
}
