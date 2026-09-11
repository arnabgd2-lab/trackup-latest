// The LinkedIn funnel.
//
// Half an operator's work was invisible to the app's only reporting surface:
// DataContext queries `jobs` and nothing else, and the Dashboard mounts inside
// the Upwork app, so someone running LinkedIn had no numbers at all.
//
// Computed from `leads.status` alone, which already spans every stage, so this
// needs no schema of its own.

import { isTerminal, readSentSteps, type Lead, type LeadStatus } from '../apps/linkedin/types';
import { CONNECTION_STEP_KEY } from './outreachLimits';
import { isSameIstDay } from './dateIst';

export interface Stage {
  key: string;
  label: string;
  count: number;
  /** Share of the PRIOR stage, which is the number that tells you where it breaks. */
  rate: number | null;
  /** Why this rate is what it is, or why it is being withheld. */
  note?: string;
}

/**
 * Anyone who has reached this stage OR passed through it.
 *
 * Counting only the current status would show one lead at each stage and call it
 * a funnel. A lead sitting at `meeting` was requested, connected and replied on
 * the way there, and every one of those has to count.
 */
const REACHED: Record<string, LeadStatus[]> = {
  requested: ['requested', 'connected', 'replied', 'meeting', 'won', 'lost', 'no_reply'],
  connected: ['connected', 'replied', 'meeting', 'won', 'lost'],
  replied: ['replied', 'meeting', 'won', 'lost'],
  meeting: ['meeting', 'won', 'lost'],
  won: ['won'],
};

/**
 * Below this, a percentage is theatre.
 *
 * Three connections and one reply is not a 33% reply rate, and printing one is
 * how an operator talks themselves into keeping a message that is not working.
 */
export const MIN_SAMPLE = 10;

const rateOf = (num: number, denom: number): number | null =>
  denom >= MIN_SAMPLE ? num / denom : null;

export const funnelFor = (leads: Lead[]): Stage[] => {
  const count = (key: string) => leads.filter((l) => REACHED[key].includes(l.status)).length;

  const added = leads.length;
  const requested = count('requested');
  const connected = count('connected');
  const replied = count('replied');
  const meeting = count('meeting');
  const won = count('won');

  const withheld = (denom: number) =>
    denom < MIN_SAMPLE ? `Too few to rate: ${denom} of ${MIN_SAMPLE}` : undefined;

  return [
    { key: 'added', label: 'Leads added', count: added, rate: null },
    {
      key: 'requested',
      label: 'Requested',
      count: requested,
      rate: rateOf(requested, added),
      note: withheld(added),
    },
    {
      key: 'connected',
      label: 'Accepted',
      count: connected,
      rate: rateOf(connected, requested),
      // Acceptance is LinkedIn's own number, and the only stage here with a
      // benchmark worth quoting. The 4-8% figures in the packs are cold email
      // REPLY rates against emails sent, and the packs record an explicit
      // disagreement between sources about even that. Printing a cold-email
      // benchmark under a LinkedIn chart would be worse than printing nothing.
      note: withheld(requested),
    },
    {
      key: 'replied',
      label: 'Replied',
      count: replied,
      rate: rateOf(replied, connected),
      note: withheld(connected),
    },
    {
      key: 'meeting',
      label: 'Meetings',
      count: meeting,
      rate: rateOf(meeting, replied),
      note: withheld(replied),
    },
    { key: 'won', label: 'Won', count: won, rate: rateOf(won, meeting), note: withheld(meeting) },
  ];
};

/** Closed leads, which is what makes any of the above a rate rather than a tally. */
export const closedCount = (leads: Lead[]): number => leads.filter((l) => isTerminal(l.status)).length;

export const revenueFrom = (leads: Lead[]): number =>
  leads.filter((l) => l.status === 'won').reduce((sum, l) => sum + (l.deal_value ?? 0), 0);

/**
 * The exact set a tile's count is built from, so clicking a number can show
 * who it means instead of leaving the operator to guess.
 */
export const leadsForStage = (leads: Lead[], key: string): Lead[] =>
  key === 'added' ? leads : leads.filter((l) => REACHED[key]?.includes(l.status) ?? false);

export interface TodaySplit {
  requestedToday: number;
  connectedToday: number;
}

/**
 * Same-day counts for the two tiles worth watching hour to hour: how many
 * requests actually went out today, and how many of today's accepts landed.
 * Both compare against a fixed IST calendar day (see `dateIst.ts`), not the
 * viewer's own device clock.
 *
 * "Requested" reads the connection note's own send time out of `sent_steps`,
 * which survives a lead moving on to a later stage the same day. "Connected"
 * reads `status_changed_at`, a DB-trigger timestamp that only moves on a real
 * status change — but it holds the MOST RECENT transition, so a lead that
 * connected today and then also replied today would show under "replied
 * today", not here. That's judged acceptable for this operator's volume: a
 * lead clearing two stages in one day is the exception, not the case this
 * tile exists to answer.
 */
export const todaySplit = (leads: Lead[], now: Date = new Date()): TodaySplit => {
  let requestedToday = 0;
  let connectedToday = 0;
  for (const lead of leads) {
    const sent = readSentSteps(lead.sent_steps);
    if (isSameIstDay(sent[CONNECTION_STEP_KEY], now)) requestedToday += 1;
    if (lead.status === 'connected' && isSameIstDay(lead.status_changed_at, now)) connectedToday += 1;
  }
  return { requestedToday, connectedToday };
};
