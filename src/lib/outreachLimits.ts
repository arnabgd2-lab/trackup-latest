// The daily send-cap guardrail.
//
// The LinkedIn pack's own doctrine says the daily quota is 20 connection
// requests (leadImport.ts carries the same number in its header comment), and
// outside guidance for an aged account converges on 15-25/day, with LinkedIn's
// actual weekly invitation cap widely reported around 100/week. None of that
// was ever enforced anywhere in the UI - the queue could tell you who was due,
// but nothing told you when to stop for the day.
//
// This is a guardrail, not a lock. The app cannot see LinkedIn itself and
// cannot stop a send that happens in another tab, so it works the only way it
// honestly can: count what has already been marked Sent today, show it
// prominently, and put a second click between the operator and marking one
// more connection request sent once the cap is passed. The human stays the
// one who decides; the app's job is to make the number impossible to ignore.

import type { Lead } from '../apps/linkedin/types';
import { readSentSteps } from '../apps/linkedin/types';
import { readMigrating } from './storage';

/** The step that carries LinkedIn's actual platform risk: a fresh invitation. */
export const CONNECTION_STEP_KEY = 'connectionNote';

const CAP_KEY = 'ember.linkedin.dailyConnectionCap';
const DEFAULT_DAILY_CAP = 20;

/** LinkedIn's own widely-reported weekly invitation cap, for the secondary readout. */
export const REPORTED_WEEKLY_PLATFORM_CAP = 100;

export const loadDailyCap = (): number => {
  const raw = readMigrating(CAP_KEY, CAP_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_DAILY_CAP;
};

export const saveDailyCap = (n: number): void => {
  try {
    localStorage.setItem(CAP_KEY, String(Math.max(1, Math.round(n))));
  } catch {
    // Best-effort. Worst case the cap resets to the default next load.
  }
};

const isSameLocalDay = (iso: string, ref: Date): boolean => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
};

const isWithinPastDays = (iso: string, ref: Date, days: number): boolean => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const ms = ref.getTime() - d.getTime();
  return ms >= 0 && ms < days * 24 * 60 * 60 * 1000;
};

/** How many leads had `stepKey` marked sent on `ref`'s calendar day. */
export const sentOnDay = (leads: Lead[], stepKey: string, ref: Date): number =>
  leads.reduce((n, lead) => {
    const sent = readSentSteps(lead.sent_steps);
    const at = sent[stepKey];
    return at && isSameLocalDay(at, ref) ? n + 1 : n;
  }, 0);

/** How many leads had `stepKey` marked sent in the trailing `days` days. */
export const sentInPastDays = (leads: Lead[], stepKey: string, ref: Date, days: number): number =>
  leads.reduce((n, lead) => {
    const sent = readSentSteps(lead.sent_steps);
    const at = sent[stepKey];
    return at && isWithinPastDays(at, ref, days) ? n + 1 : n;
  }, 0);

export type CapLevel = 'ok' | 'caution' | 'over';

export interface ConnectionCapStatus {
  sentToday: number;
  cap: number;
  sentThisWeek: number;
  weeklyReportedCap: number;
  level: CapLevel;
  remaining: number;
}

export const connectionCapStatus = (leads: Lead[], now: Date = new Date()): ConnectionCapStatus => {
  const cap = loadDailyCap();
  const sentToday = sentOnDay(leads, CONNECTION_STEP_KEY, now);
  const sentThisWeek = sentInPastDays(leads, CONNECTION_STEP_KEY, now, 7);
  const ratio = cap > 0 ? sentToday / cap : 0;
  const level: CapLevel = sentToday >= cap ? 'over' : ratio >= 0.7 ? 'caution' : 'ok';
  return {
    sentToday,
    cap,
    sentThisWeek,
    weeklyReportedCap: REPORTED_WEEKLY_PLATFORM_CAP,
    level,
    remaining: Math.max(0, cap - sentToday),
  };
};
