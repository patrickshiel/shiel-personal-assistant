import { getCalendarTimedRangeLocal, type CalendarEventDto } from "@/lib/calendar-events";
import {
  isAllDayTask,
  localDateStr,
  type WeekCalendarTask,
  taskDueRange,
} from "@/lib/tasks-week";

export const DEFAULT_DAY_START_HOUR = 6;
/** End of the visible grid (24 = local midnight / start of next calendar day, exclusive). */
export const DEFAULT_DAY_END_HOUR = 24;

/** Height of one 30-minute slot in px (compact grid). */
export const SLOT_HEIGHT_PX = 16;

export type TimedGridItemKind = "task" | "calendar";

export type TimedGridItem = {
  layoutId: string;
  kind: TimedGridItemKind;
  start: Date;
  end: Date;
  task?: WeekCalendarTask;
  event?: CalendarEventDto;
};

export type PlacedTimedItem = TimedGridItem & {
  topFrac: number;
  heightFrac: number;
  col: number;
  numCols: number;
};

/** Local midnight for a calendar day. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Next local midnight after `d` (start of next day). */
export function endOfLocalDay(d: Date): Date {
  const t = startOfLocalDay(d);
  t.setDate(t.getDate() + 1);
  return t;
}

export function dayVisibleWindow(
  dayDate: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR
): { windowStart: Date; windowEnd: Date; totalMs: number } {
  const y = dayDate.getFullYear();
  const m = dayDate.getMonth();
  const d = dayDate.getDate();
  const ws = new Date(y, m, d, dayStartHour, 0, 0, 0);
  const we =
    dayEndHour >= 24
      ? new Date(y, m, d + 1, 0, 0, 0, 0)
      : new Date(y, m, d, dayEndHour, 0, 0, 0);
  const totalMs = we.getTime() - ws.getTime();
  return { windowStart: ws, windowEnd: we, totalMs };
}

export type CurrentTimeIndicatorMode = "in-window" | "before-hours" | "after-hours";

/** Position of the “now” line; null if `now` is not the same local day as `anchorDay`. */
export function getCurrentTimeIndicator(
  anchorDay: Date,
  now: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR
): { topFrac: number; mode: CurrentTimeIndicatorMode } | null {
  if (localDateStr(now) !== localDateStr(anchorDay)) return null;
  const { windowStart, windowEnd, totalMs } = dayVisibleWindow(anchorDay, dayStartHour, dayEndHour);
  if (totalMs <= 0) return null;
  const t = now.getTime();
  const ws = windowStart.getTime();
  const we = windowEnd.getTime();
  if (t < ws) return { topFrac: 0, mode: "before-hours" };
  if (t >= we) return { topFrac: 1, mode: "after-hours" };
  return { topFrac: (t - ws) / totalMs, mode: "in-window" };
}

/** @deprecated Prefer getCurrentTimeIndicator (handles times before/after the visible window). */
export function currentTimeTopFracInWindow(
  anchorDay: Date,
  now: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR
): number | null {
  const hit = getCurrentTimeIndicator(anchorDay, now, dayStartHour, dayEndHour);
  if (!hit || hit.mode !== "in-window") return null;
  return hit.topFrac;
}

/** Intersect [a0,a1) with [b0,b1); returns null if empty. */
export function intersectIntervals(a0: Date, a1: Date, b0: Date, b1: Date): { start: Date; end: Date } | null {
  const s = Math.max(a0.getTime(), b0.getTime());
  const e = Math.min(a1.getTime(), b1.getTime());
  if (e <= s) return null;
  return { start: new Date(s), end: new Date(e) };
}

/**
 * Map clipped interval into [0,1] top and height relative to visible window.
 * Enforces minHeightFrac so short events stay visible.
 */
export function clipIntervalToWindowFractions(
  itemStart: Date,
  itemEnd: Date,
  windowStart: Date,
  windowEnd: Date,
  minHeightFrac = 0.028
): { topFrac: number; heightFrac: number } | null {
  const hit = intersectIntervals(itemStart, itemEnd, windowStart, windowEnd);
  if (!hit) return null;
  const totalMs = windowEnd.getTime() - windowStart.getTime();
  if (totalMs <= 0) return null;
  let topFrac = (hit.start.getTime() - windowStart.getTime()) / totalMs;
  let heightFrac = (hit.end.getTime() - hit.start.getTime()) / totalMs;
  if (heightFrac < minHeightFrac) {
    heightFrac = minHeightFrac;
    if (topFrac + heightFrac > 1) {
      topFrac = Math.max(0, 1 - heightFrac);
    }
  }
  return { topFrac, heightFrac };
}

function dueDateOnly(task: WeekCalendarTask): string {
  const d = task.due?.date ?? task.due_string ?? "";
  return d.slice(0, 10);
}

/**
 * Timed tasks + calendar segments that overlap this local calendar day (including after-midnight tail).
 */
export function collectTimedItemsForDay(
  dateKey: string,
  dayDate: Date,
  tasks: WeekCalendarTask[],
  calendarEvents: CalendarEventDto[]
): TimedGridItem[] {
  const dayStart = startOfLocalDay(dayDate);
  const dayEnd = endOfLocalDay(dayDate);
  const items: TimedGridItem[] = [];

  for (const task of tasks) {
    if (dueDateOnly(task) !== dateKey) continue;
    if (isAllDayTask(task)) continue;
    const range = taskDueRange(task);
    if (!range) continue;
    const seg = intersectIntervals(range.from, range.to, dayStart, dayEnd);
    if (!seg) continue;
    items.push({
      layoutId: `task:${task.id}`,
      kind: "task",
      start: seg.start,
      end: seg.end,
      task,
    });
  }

  for (const ev of calendarEvents) {
    const r = getCalendarTimedRangeLocal(ev);
    if (!r) continue;
    const seg = intersectIntervals(r.start, r.end, dayStart, dayEnd);
    if (!seg) continue;
    items.push({
      layoutId: `cal:${ev.id}:${dateKey}`,
      kind: "calendar",
      start: seg.start,
      end: seg.end,
      event: ev,
    });
  }

  return items;
}

type IntervalForCol = { layoutId: string; startMs: number; endMs: number };

/** Half-open overlap in ms: [a0,a1) vs [b0,b1). */
function intervalsOverlapMs(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 && b0 < a1;
}

/**
 * Greedy column assignment: each interval gets smallest col where last end in that col <= start.
 * `numCols` is **per interval**: only the max column index among intervals that overlap *this*
 * interval (+1). So a quiet afternoon block is full width even if the morning needed 7 columns.
 */
export function assignOverlapColumns(intervals: IntervalForCol[]): Map<string, { col: number; numCols: number }> {
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const colEnds: number[] = [];
  const colById = new Map<string, number>();

  for (const it of sorted) {
    let col = 0;
    while (col < colEnds.length && colEnds[col]! > it.startMs) {
      col++;
    }
    if (col === colEnds.length) {
      colEnds.push(it.endMs);
    } else {
      colEnds[col] = it.endMs;
    }
    colById.set(it.layoutId, col);
  }

  const out = new Map<string, { col: number; numCols: number }>();
  for (const it of intervals) {
    const c = colById.get(it.layoutId) ?? 0;
    let maxColAmongOverlaps = c;
    for (const other of intervals) {
      if (
        other.layoutId !== it.layoutId &&
        intervalsOverlapMs(it.startMs, it.endMs, other.startMs, other.endMs)
      ) {
        const oc = colById.get(other.layoutId) ?? 0;
        if (oc > maxColAmongOverlaps) maxColAmongOverlaps = oc;
      }
    }
    // Include our own column in the span (handles lone item: maxColAmongOverlaps === c → numCols = c+1)
    const numCols = Math.max(1, maxColAmongOverlaps + 1);
    out.set(it.layoutId, { col: c, numCols });
  }
  return out;
}

export function placeTimedItemsForDay(
  items: TimedGridItem[],
  dayDate: Date,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR
): PlacedTimedItem[] {
  const { windowStart, windowEnd } = dayVisibleWindow(dayDate, dayStartHour, dayEndHour);

  const withFrac: { item: TimedGridItem; topFrac: number; heightFrac: number }[] = [];
  const forCols: IntervalForCol[] = [];

  for (const item of items) {
    const fr = clipIntervalToWindowFractions(item.start, item.end, windowStart, windowEnd);
    if (!fr) continue;
    withFrac.push({ item, ...fr });
    const hit = intersectIntervals(item.start, item.end, windowStart, windowEnd);
    if (hit) {
      forCols.push({
        layoutId: item.layoutId,
        startMs: hit.start.getTime(),
        endMs: hit.end.getTime(),
      });
    }
  }

  const colMap = assignOverlapColumns(forCols);

  return withFrac.map(({ item, topFrac, heightFrac }) => {
    const c = colMap.get(item.layoutId) ?? { col: 0, numCols: 1 };
    return {
      ...item,
      topFrac,
      heightFrac,
      col: c.col,
      numCols: c.numCols,
    };
  });
}

export function gridBodyHeightPx(
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
  dayEndHour: number = DEFAULT_DAY_END_HOUR,
  slotHeightPx: number = SLOT_HEIGHT_PX
): number {
  const spanHours = dayEndHour >= 24 ? 24 - dayStartHour : dayEndHour - dayStartHour;
  const slots = spanHours * 2;
  return slots * slotHeightPx;
}
