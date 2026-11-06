import { CircleCheck, CirclePause, Languages, PhoneCall, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Business } from '@/api/businesses';
import { useMe } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', es: 'Spanish' };

// "+18312490526" -> "+1 (831) 249-0526"; other countries are shown as stored.
const formatNumber = (number: string) =>
  /^\+1\d{10}$/.test(number) ? `+1 (${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}` : number;

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="font-medium">{children}</div>
      </div>
    </div>
  );
}

function ReceptionistCard({ business }: { business: Business }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-lg">{business.name}</CardTitle>
          {business.active ? (
            <Badge className="bg-emerald-600 text-white">
              <CircleCheck /> Answering calls
            </Badge>
          ) : (
            <Badge variant="outline">
              <CirclePause /> Paused
            </Badge>
          )}
        </div>
        <CardDescription>Your receptionist</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <Fact icon={<PhoneCall className="size-4" />} label="Number callers dial">
          {business.twilio_number ? formatNumber(business.twilio_number) : 'Not assigned yet'}
        </Fact>
        <Fact icon={<Languages className="size-4" />} label="Speaks">
          {business.languages.map((code) => LANGUAGE_NAMES[code] ?? code).join(' and ')}
        </Fact>
      </CardContent>
    </Card>
  );
}

// What an owner sees after signing in. Setup, call history and billing come next; for now it
// shows their receptionist once a business is linked to them.
export function DashboardPage() {
  const { data, isPending, error } = useMe();

  if (isPending) return <Skeleton className="h-48" />;
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Could not load your account: {error.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl">Welcome, {data.user.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">Signed in as {data.user.email}</p>
      </div>
      {data.business ? (
        <ReceptionistCard business={data.business} />
      ) : (
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Sparkles className="size-5" />
            </div>
            <CardTitle className="text-lg">Let's set up your receptionist</CardTitle>
            <CardDescription>
              Setting up your business here is coming soon. Until then, we'll connect your business to this account for
              you.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
