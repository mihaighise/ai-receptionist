import { useQueryClient } from '@tanstack/react-query';
import { Outlet, useNavigate } from '@tanstack/react-router';
import { LogOut, Phone } from 'lucide-react';
import { useMe } from '@/api/owner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { APP_NAME } from '@/lib/brand';

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) return <img src={image} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full" />;
  return (
    <span className="flex size-8 items-center justify-center rounded-full bg-accent font-medium text-accent-foreground text-sm">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

// The owner app's frame: header with who's signed in and a sign-out button, and the page below.
// The router only shows it to signed-in owners (see router.tsx).
export function OwnerLayout() {
  const { data } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const signOut = async () => {
    await authClient.signOut();
    // Forget everything loaded for this owner, so the next person to sign in starts clean.
    queryClient.clear();
    navigate({ to: '/sign-in' });
  };

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Phone className="size-4" />
          </div>
          <p className="font-semibold">{APP_NAME}</p>
          <span className="flex-1" />
          {data && (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={data.user.name} image={data.user.image} />
              <span className="hidden truncate text-sm sm:inline">{data.user.name}</span>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut /> Sign out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
