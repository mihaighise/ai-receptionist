import { Loader2, PhoneIncoming } from 'lucide-react';
import { useCalls } from '@/api/owner';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CallList } from './call-list';

// /calls: every call the receptionist answered, newest first, with the messages it took.
export function CallsPage() {
  const calls = useCalls();
  const list = calls.data?.pages.flatMap((page) => page.calls) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calls"
        description="Every call your receptionist answered, newest first. Tap a message to read it."
      />
      {calls.isPending ? (
        <Skeleton className="h-72" />
      ) : calls.error ? (
        <Alert variant="destructive">
          <AlertDescription>Could not load your calls: {calls.error.message}</AlertDescription>
        </Alert>
      ) : list.length === 0 ? (
        <Card className="items-center gap-2 px-6 py-14 text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <PhoneIncoming className="size-5" />
          </span>
          <p className="font-medium">No calls yet</p>
          <p className="max-w-sm text-muted-foreground text-sm">
            Calls show up here as soon as your receptionist has answered them, with any message it took.
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden py-0">
            <CallList calls={list} />
          </Card>
          {calls.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              onClick={() => calls.fetchNextPage()}
              disabled={calls.isFetchingNextPage}
            >
              {calls.isFetchingNextPage && <Loader2 className="animate-spin" />} Show older calls
            </Button>
          )}
        </>
      )}
    </div>
  );
}
