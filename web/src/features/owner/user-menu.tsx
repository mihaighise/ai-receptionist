import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronsUpDown, LogOut } from 'lucide-react';
import { useMe } from '@/api/owner';
import { ThemeToggle } from '@/components/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

function OwnerAvatar({ name, image, className }: { name: string; image: string | null; className?: string }) {
  return (
    <Avatar className={cn('size-8', className)}>
      {image && <AvatarImage src={image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback className="bg-accent font-medium text-accent-foreground text-sm">
        {name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

// The signed-in owner: their name and email, the theme, and Sign out. compact: only the avatar
// (the phone top bar); otherwise a full-width row (the bottom of the sidebar).
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { data } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  if (!data) return null;
  const { user } = data;

  const signOut = async () => {
    await authClient.signOut();
    // Forget everything loaded for this owner, so the next person to sign in starts clean.
    queryClient.clear();
    navigate({ to: '/sign-in' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account"
        className={cn(
          'flex items-center gap-3 rounded-lg text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50',
          compact ? 'p-0.5' : 'w-full p-2 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent',
        )}
      >
        <OwnerAvatar name={user.name} image={user.image} />
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">{user.name}</span>
              <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} side={compact ? 'bottom' : 'top'} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-3 font-normal">
          <OwnerAvatar name={user.name} image={user.image} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-sm">{user.name}</span>
            <span className="block truncate text-muted-foreground text-xs">{user.email}</span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <p className="mb-2 text-muted-foreground text-xs">Theme</p>
          <ThemeToggle showLabels />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
