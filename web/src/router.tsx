// The pages and their addresses. One app holds both sites:
//   /                                the owner app (signed-in owners only)
//   /sign-in                         owner sign-in
//   /setup                           set up (or change) the owner's receptionist
//   /plan                            choose a plan and pay for it (Stripe Checkout)
//   /admin                           the admin site: the business list
//   /admin/businesses/new            add a business
//   /admin/businesses/:businessId    edit a business
// The admin site is protected by the API, which only answers admin requests from this computer.

import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router';
import { PlanPage } from './features/billing/plan-page';
import { DashboardPage } from './features/owner/dashboard-page';
import { OwnerLayout } from './features/owner/owner-layout';
import { SignInPage } from './features/owner/sign-in-page';
import { SetupPage } from './features/setup/setup-page';
import { authClient } from './lib/auth-client';
import { AdminLayout } from './routes/admin-layout';
import { EditBusinessPage, HomePage, NewBusinessPage } from './routes/admin-pages';

const isSignedIn = async () => Boolean((await authClient.getSession()).data);

const rootRoute = createRootRoute({ component: Outlet });

// ?checkout=<Stripe Checkout Session ID>, on the pages Stripe sends owners back to.
const checkoutSearch = (search: Record<string, unknown>) => ({
  checkout: typeof search.checkout === 'string' ? search.checkout : undefined,
});

// Owner app. Everything inside needs a signed-in owner; anyone else goes to the sign-in page.
const ownerRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'owner',
  component: OwnerLayout,
  beforeLoad: async () => {
    if (!(await isSignedIn())) throw redirect({ to: '/sign-in' });
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignInPage,
  // Better Auth sends people back here with ?error=<code> when signing in fails.
  validateSearch: (search: Record<string, unknown>) => ({
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  beforeLoad: async () => {
    if (await isSignedIn()) throw redirect({ to: '/' });
  },
});

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminLayout });

const routeTree = rootRoute.addChildren([
  ownerRoute.addChildren([
    createRoute({
      getParentRoute: () => ownerRoute,
      path: '/',
      component: DashboardPage,
      // Stripe sends owners back with ?checkout=<Checkout Session ID> after paying for a plan.
      validateSearch: checkoutSearch,
    }),
    createRoute({ getParentRoute: () => ownerRoute, path: '/setup', component: SetupPage }),
    createRoute({
      getParentRoute: () => ownerRoute,
      path: '/plan',
      component: PlanPage,
      // Stripe sends owners back with ?checkout=<Checkout Session ID> after buying extra minutes.
      validateSearch: checkoutSearch,
    }),
  ]),
  signInRoute,
  adminRoute.addChildren([
    createRoute({ getParentRoute: () => adminRoute, path: '/', component: HomePage }),
    createRoute({ getParentRoute: () => adminRoute, path: '/businesses/new', component: NewBusinessPage }),
    createRoute({ getParentRoute: () => adminRoute, path: '/businesses/$businessId', component: EditBusinessPage }),
  ]),
]);

export const router = createRouter({ routeTree });

// Makes links and params type-checked against the routes above.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
