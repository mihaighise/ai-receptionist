# Admin site

The web app for the AI receptionist, with two parts:

- **Owner app** (`/`): business owners sign in with Google, set up their receptionist (`/setup`) and see it on the dashboard. It uses `/api/owner` and `/api/auth`.
- **Admin site** (`/admin`): add businesses and edit how their calls are answered. It uses `/api/admin`, which only answers on this computer.

It's a React app that talks to the API in the repo root (`src/api`).

## Running it

```bash
npm install
npm run dev        # owner app: http://localhost:5173, admin site: http://localhost:5173/admin
```

The API must be running too (`npm run api:dev` in the repo root, with the database up: `docker compose up -d db`). Vite forwards `/api` to it on `localhost:3001`. Set `API_URL` to use another address.

In Docker (`docker compose up --build` in the repo root), the site is built and served by nginx at http://localhost:3001, which forwards `/api` to the API container (`nginx.conf`).

## Scripts

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Development server that updates the page as you edit |
| `npm run build`  | Type-checks and builds the site into `dist/`         |
| `npm test`       | Runs the tests (Vitest)                              |
| `npm run check`  | Lint and formatting check (Biome)                    |
| `npm run format` | Fixes formatting and import order                    |

## Stack

TypeScript, Vite, React, TanStack Router (pages), TanStack Query (loading and saving data), React Hook Form with Zod (forms and validation), Tailwind CSS with shadcn/ui components, lucide-react icons, Sonner toasts, Vitest and Biome.

## Code

| Path                       | What it holds                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `src/main.tsx`             | Starts the app: data loading, pages and toasts                                           |
| `src/router.tsx`           | The pages and their addresses, and which ones need a signed-in owner                     |
| `src/features/owner/`      | The owner app: sign-in page, its layout and the dashboard                                |
| `src/features/setup/`      | The owner's setup wizard: its steps, checks and review                                   |
| `src/routes/`              | The admin site's layout and pages                                                        |
| `src/features/businesses/` | Admin: the business list, the form and its validation, the preview and the delete dialog |
| `src/api/`                 | The API client, and the hooks that load and save businesses and the owner's data         |
| `src/lib/auth-client.ts`   | Better Auth's client: sign in with Google, the current session, sign out                 |
| `src/components/ui/`       | shadcn/ui components, added with `npx shadcn@latest add <name>`                          |
| `src/components/`          | Other shared components                                                                  |

The form's checks in `business-schema.ts` match the API's in `src/api/admin/routes.js`. The API checks again and its errors appear next to the same fields, so a rule changed in only one place still can't save bad data.
