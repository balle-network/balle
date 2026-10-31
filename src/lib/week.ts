/*
 * The race week runs Monday 00:00 UTC to Sunday 23:59:59 UTC.
 */

const DAY = 86_400_000;

/** Start (ms) of the race week containing `now`. */
export function weekStart(now: number) {
  const d = new Date(now);
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return midnight - sinceMonday * DAY;
}

/** Last millisecond of the race week containing `now`. */
export const weekEnd = (now: number) => weekStart(now) + 7 * DAY - 1;

/** "Sun 11 Oct, 23:59 UTC" */
export function closeLabel(now: number) {
  const end = new Date(weekEnd(now));
  const wd = end.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const dm = end.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${wd} ${dm}, 23:59 UTC`;
}

/** Days, hours, minutes, seconds left until `end`. */
export function left(end: number, now: number) {
  const s = Math.max(0, Math.floor((end - now) / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}
