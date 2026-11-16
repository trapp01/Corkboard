/** Times and days as people read them: relative times for the timeline and sync status, and due days. */

/** "Just now", "5 minutes ago", "Today at 14:02", "Yesterday at 14:02" or a date with a time. */
export function describeTime(at: number | null, now = Date.now()): string {
  if (at === null) return 'Never';
  const seconds = Math.round((now - at) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date(now);
  if (date.toDateString() === today.toDateString()) return `Today at ${time}`;
  const yesterday = new Date(now - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return `${date.toLocaleDateString()} at ${time}`;
}

/** The full date and time, for a tooltip. */
export function fullTime(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
}

/** Today in the device's time zone as `YYYY-MM-DD`, the form due days are stored in. */
export function todayDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** A due day for a card front: "Nov 16", with the year when it is not this year's. */
export function shortDay(day: string, today: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  const value = new Date(year, month - 1, date);
  const sameYear = today.slice(0, 4) === day.slice(0, 4);
  return value.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
