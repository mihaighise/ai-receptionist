// The pages of the admin site and their addresses:
//   /                          the business list (and, on wide screens, an empty editor)
//   /businesses/new            add a business
//   /businesses/:businessId    edit a business

import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { EditBusinessPage, HomePage, NewBusinessPage } from './routes/business-pages';
import { RootLayout } from './routes/root-layout';

const rootRoute = createRootRoute({ component: RootLayout });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomePage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/businesses/new', component: NewBusinessPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/businesses/$businessId', component: EditBusinessPage }),
]);

export const router = createRouter({ routeTree });

// Makes links and params type-checked against the routes above.
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
