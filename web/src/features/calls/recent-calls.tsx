import { Link } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import { useCalls } from '@/api/owner';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CallList } from './call-list';

const SHOWN = 5;

// The latest calls, on the dashboard.
export function RecentCalls() {
  const calls = useCalls(SHOWN);
  const list = calls.data?.pages[0]?.calls ?? [];
  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <CardTitle>Recent calls</CardTitle>
        {list.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/calls">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      {calls.isPending ? (
        <Skeleton className="mx-6 mb-6 h-24" />
      ) : list.length === 0 ? (
        <p className="border-t px-6 py-5 text-muted-foreground text-sm">
          No calls yet. They show up here once your receptionist answers them.
        </p>
      ) : (
        <div className="border-t">
          <CallList calls={list} />
        </div>
      )}
    </Card>
  );
}
