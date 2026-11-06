import { useSearch } from '@tanstack/react-router';
import { Loader2, Phone } from 'lucide-react';
import { useState } from 'react';
import { useSignInProviders } from '@/api/owner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient } from '@/lib/auth-client';
import { APP_NAME } from '@/lib/brand';

// Google's "G", as its sign-in branding guidelines ask for on the button.
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// Messages for the error codes Better Auth adds to the address when a sign-in fails.
const ERRORS: Record<string, string> = {
  access_denied: 'Sign-in was cancelled.',
  state_mismatch: 'Your sign-in took too long or was started in another tab. Please try again.',
};

export function SignInPage() {
  const { error } = useSearch({ from: '/sign-in' });
  const { data, isPending } = useSignInProviders();
  const [redirecting, setRedirecting] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const hasGoogle = data?.providers.includes('google');

  const signInWithGoogle = async () => {
    setRedirecting(true);
    setFailed(null);
    // On success the browser leaves for Google and comes back to the dashboard.
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
      errorCallbackURL: '/sign-in',
    });
    if (result.error) {
      setFailed(result.error.message ?? 'Could not start signing in. Please try again.');
      setRedirecting(false);
    }
  };

  const message = failed ?? (error && (ERRORS[error] ?? 'Signing in didn’t work. Please try again.'));

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Phone className="size-5" />
          </div>
          <CardTitle className="text-xl">Sign in to {APP_NAME}</CardTitle>
          <CardDescription>Your AI receptionist answers every call, in English and Spanish.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {message && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={signInWithGoogle}
            disabled={isPending || !hasGoogle || redirecting}
          >
            {redirecting ? <Loader2 className="animate-spin" /> : <GoogleLogo />}
            Continue with Google
          </Button>
          {!isPending && !hasGoogle && (
            <p className="text-center text-muted-foreground text-xs">
              Google sign-in isn't set up on this server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).
            </p>
          )}
          <p className="text-center text-muted-foreground text-xs">
            New here? Signing in with Google creates your account.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
