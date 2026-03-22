import { localDateStr } from "@/lib/tasks-week";

/** Matches GET /api/calendar/events response items */
export type CalendarEventDto = {
  id: string;
  title: string;
  context: "personal" | "work";
  allDay: boolean;
  start: string;
  end: string;
  htmlLink?: string;
};

export type CalendarConfigured = {
  personal: boolean;
  work: boolean;
};

/** Visual styles for calendar events by account (personal vs work). */
export const CALENDAR_CONTEXT_STYLES: Record<
  CalendarEventDto["context"],
  {
    /** Timed grid blocks (absolute positioned). */
    timedShell: string;
    timedHover: string;
    /** Compact all-day chips. */
    chip: string;
    chipHover: string;
  }
> = {
  personal: {
    timedShell:
      "border-sky-500/40 bg-sky-500/10 shadow-sm dark:border-sky-400/45 dark:bg-sky-500/15",
    timedHover: "hover:bg-sky-500/15 dark:hover:bg-sky-500/20",
    chip: "border-sky-500/35 bg-sky-500/10",
    chipHover: "hover:bg-sky-500/15",
  },
  work: {
    timedShell:
      "border-indigo-500/45 bg-indigo-500/12 shadow-sm dark:border-indigo-400/50 dark:bg-indigo-500/18",
    timedHover: "hover:bg-indigo-500/18 dark:hover:bg-indigo-500/24",
    chip: "border-indigo-500/40 bg-indigo-500/12",
    chipHover: "hover:bg-indigo-500/18",
  },
};

export function stylesForCalendarContext(context: CalendarEventDto["context"]) {
  return CALENDAR_CONTEXT_STYLES[context] ?? CALENDAR_CONTEXT_STYLES.personal;
}

export function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local YYYY-MM-DD keys for each day this event should appear (all-day spans multiple days). */
export function expandCalendarEventToDateKeys(ev: CalendarEventDto): string[] {
  if (!ev.allDay) {
    const d = new Date(ev.start);
    if (Number.isNaN(d.getTime())) return [];
    return [localDateStr(d)];
  }
  const start = ev.start.slice(0, 10);
  const endExclusive = ev.end.slice(0, 10);
  const keys: string[] = [];
  let cursor = parseYmdLocal(start);
  const end = parseYmdLocal(endExclusive);
  while (cursor < end) {
    keys.push(localDateStr(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return keys;
}

export function groupCalendarEventsByDateKey(events: CalendarEventDto[]): Map<string, CalendarEventDto[]> {
  const m = new Map<string, CalendarEventDto[]>();
  for (const ev of events) {
    for (const key of expandCalendarEventToDateKeys(ev)) {
      const arr = m.get(key) ?? [];
      arr.push(ev);
      m.set(key, arr);
    }
  }
  return m;
}

/** Parsed local start/end for a timed (non-all-day) calendar event. */
export function getCalendarTimedRangeLocal(ev: CalendarEventDto): { start: Date; end: Date } | null {
  if (ev.allDay) return null;
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}
