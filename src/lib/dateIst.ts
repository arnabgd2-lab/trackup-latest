// IST calendar-day helpers.
//
// `outreachLimits.ts`'s day checks compare against whichever timezone the
// browser/OS happens to be set to, which is exactly right for a guardrail
// meant to track LinkedIn's own daily/weekly caps as the operator
// experiences them minute to minute. The funnel's "today" tiles are a
// different question — "how many landed today, India time" should read the
// same on any device, including one left on UTC — so this compares against a
// fixed Asia/Kolkata offset instead of `Date`'s local getters. IST carries no
// DST, so a plain +5:30 offset is exact, not an approximation.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** `d` shifted into IST wall-clock time, still stored as a UTC-epoch Date. */
const toIstShifted = (d: Date): Date => new Date(d.getTime() + IST_OFFSET_MS);

/** `YYYY-MM-DD` of `d` as it reads on an IST calendar, regardless of the caller's own timezone. */
export const istDateKey = (d: Date): string => {
  const s = toIstShifted(d);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, '0');
  const day = String(s.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Whether ISO timestamp `iso` falls on the same IST calendar day as `ref`. */
export const isSameIstDay = (iso: string | null | undefined, ref: Date): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return istDateKey(d) === istDateKey(ref);
};
