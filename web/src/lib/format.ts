// How numbers, times and durations are written in the owner app.

// Phone numbers: formatPhone in lib/phone.ts.
export { formatPhone } from './phone';

// 151 -> "2 min 31 s", 45 -> "45 s"
export function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (!minutes) return `${rest} s`;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

// "3:05 PM"
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// "Today", "Yesterday", or "Wednesday, November 4" (with the year if it isn't this year).
export function formatDay(iso: string, now = new Date()) {
  const day = new Date(iso);
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((startOf(now) - startOf(day)) / 86_400_000);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return day.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(day.getFullYear() !== now.getFullYear() && { year: 'numeric' }),
  });
}

// "Thursday, November 12 at 10:00 AM", for appointments.
export const formatAppointment = (iso: string) => {
  const at = new Date(iso);
  return `${at.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${formatTime(iso)}`;
};
