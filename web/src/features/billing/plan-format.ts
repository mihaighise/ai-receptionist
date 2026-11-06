// Plan and billing wording shared by the plan page and the dashboard.

const PLAN_NAMES: Record<string, string> = { starter: 'Starter', pro: 'Pro', business: 'Business' };

export const planName = (code: string) => PLAN_NAMES[code] ?? code;

// "2026-12-06T…" -> "December 6, 2026"
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
