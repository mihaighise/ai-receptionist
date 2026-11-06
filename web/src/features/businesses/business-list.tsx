import { Link } from '@tanstack/react-router';
import { PhoneOff, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useBusinesses, useOptions } from '@/api/businesses';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatPhone } from '@/lib/phone';

// The sidebar: every business, with its Twilio number and languages, and a button to add one.
export function BusinessList() {
  const { data: businesses, isPending, error } = useBusinesses();
  const { data: options } = useOptions();
  const [search, setSearch] = useState('');

  const languageName = (code: string) => options?.languages.find((l) => l.code === code)?.name ?? code;
  const shown = businesses?.filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Businesses</h2>
        <Button asChild size="sm">
          <Link to="/admin/businesses/new">
            <Plus /> New
          </Link>
        </Button>
      </div>

      {businesses && businesses.length > 5 && (
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search businesses"
            className="pl-8"
          />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load businesses: {error.message}. Is the API running (npm run api)?
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-14" />
          ))}
        </div>
      ) : (
        <nav aria-label="Businesses" className="flex flex-col gap-1">
          {shown?.map((b) => (
            <Link
              key={b.id}
              to="/admin/businesses/$businessId"
              params={{ businessId: b.id }}
              className="rounded-md px-3 py-2 transition-colors hover:bg-muted"
              activeProps={{ className: 'bg-accent text-accent-foreground hover:bg-accent' }}
            >
              <span className="flex items-center gap-2">
                <span
                  className={
                    b.active ? 'truncate font-medium' : 'truncate font-medium text-muted-foreground line-through'
                  }
                >
                  {b.name}
                </span>
                {!b.active && <Badge variant="outline">Paused</Badge>}
              </span>
              <span className="flex items-center gap-1 text-muted-foreground text-xs">
                {formatPhone(b.twilio_number) || (
                  <>
                    <PhoneOff className="size-3" /> No number
                  </>
                )}
                <span aria-hidden>·</span>
                {b.languages.map(languageName).join(', ')}
              </span>
            </Link>
          ))}
          {shown?.length === 0 && <p className="px-3 py-2 text-muted-foreground text-sm">No businesses found.</p>}
        </nav>
      )}
    </div>
  );
}
