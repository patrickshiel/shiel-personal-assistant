/** Helpers for “current local week” (Mon–Sun) task views — keep in sync with app/page.tsx due semantics. */

export type WeekCalendarTask = {
  id: string;
  content: string;
  due_string?: string;
  due?: { date: string; datetime?: string; string?: string };
};

export type WeekCalendarTasksData = {
  overdue: WeekCalendarTask[];
  dueToday: WeekCalendarTask[];
  upcoming: WeekCalendarTask[];
};

export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeekMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysFromMonday = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - daysFromMonday);
  return c;
}

export function endOfWeekSunday(d: Date): Date {
  const mon = startOfWeekMonday(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
}

export function dueDateOnly(task: WeekCalendarTask): string {
  const d = task.due?.date ?? task.due_string ?? "";
  if (!d) return "";
  return d.slice(0, 10);
}

export function mergeAllTasks(data: WeekCalendarTasksData | null): WeekCalendarTask[] {
  if (!data) return [];
  const map = new Map<string, WeekCalendarTask>();
  for (const t of [...data.overdue, ...data.dueToday, ...data.upcoming]) {
    map.set(t.id, t);
  }
  return [...map.values()];
}

export function filterTasksInLocalWeek(tasks: WeekCalendarTask[], anchor: Date = new Date()): WeekCalendarTask[] {
  const mon = startOfWeekMonday(anchor);
  const sun = endOfWeekSunday(anchor);
  const startStr = localDateStr(mon);
  const endStr = localDateStr(sun);
  return tasks.filter((t) => {
    const d = dueDateOnly(t);
    if (!d) return false;
    return d >= startStr && d <= endStr;
  });
}

export function tasksDataTasksInCurrentWeek(data: WeekCalendarTasksData | null): WeekCalendarTask[] {
  return filterTasksInLocalWeek(mergeAllTasks(data));
}

/** Today and the following 6 local calendar days (7 columns). */
export function getNextSevenDayRange(anchor: Date = new Date()): {
  dayDates: Date[];
  startStr: string;
  endStr: string;
} {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dayDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dayDates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  const end = dayDates[6]!;
  return {
    dayDates,
    startStr: localDateStr(start),
    endStr: localDateStr(end),
  };
}

export function filterTasksInNextSevenDays(tasks: WeekCalendarTask[], anchor: Date = new Date()): WeekCalendarTask[] {
  const { startStr, endStr } = getNextSevenDayRange(anchor);
  return tasks.filter((t) => {
    const d = dueDateOnly(t);
    if (!d) return false;
    return d >= startStr && d <= endStr;
  });
}

export function tasksDataTasksInNextSevenDays(data: WeekCalendarTasksData | null): WeekCalendarTask[] {
  return filterTasksInNextSevenDays(mergeAllTasks(data));
}

/** Tasks with due date exactly on this local calendar day (YYYY-MM-DD). */
export function filterTasksForDateKey(tasks: WeekCalendarTask[], dateKey: string): WeekCalendarTask[] {
  return tasks.filter((t) => dueDateOnly(t) === dateKey);
}

export function tasksDataTasksForDateKey(data: WeekCalendarTasksData | null, dateKey: string): WeekCalendarTask[] {
  return filterTasksForDateKey(mergeAllTasks(data), dateKey);
}

/** Date-only / full-day due (not a specific time slot). */
export function isAllDayTask(task: WeekCalendarTask): boolean {
  const r = taskDueRange(task);
  if (!r) return false;
  if (localDateStr(r.from) !== localDateStr(r.to)) return false;
  return (
    r.from.getHours() === 0 &&
    r.from.getMinutes() === 0 &&
    r.from.getSeconds() === 0 &&
    r.to.getHours() === 23 &&
    r.to.getMinutes() === 59
  );
}

export function groupTasksByDueDateKey(tasks: WeekCalendarTask[]): Map<string, WeekCalendarTask[]> {
  const m = new Map<string, WeekCalendarTask[]>();
  for (const t of tasks) {
    const k = dueDateOnly(t);
    if (!k) continue;
    const arr = m.get(k) ?? [];
    arr.push(t);
    m.set(k, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      const aAll = isAllDayTask(a);
      const bAll = isAllDayTask(b);
      if (aAll && !bAll) return -1;
      if (!aAll && bAll) return 1;
      return compareTasksByDueTime(a, b);
    });
  }
  return m;
}

/** Whether `date` (calendar day) falls in [weekStart, weekEnd] inclusive (local). */
export function isDateInLocalWeek(date: Date, weekStart: Date, weekEnd: Date): boolean {
  const t = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const t0 = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime();
  const t1 = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate()).getTime();
  return t >= t0 && t <= t1;
}

/** Range for list display; timed tasks use parsed instant + 1h window; date-only uses local day bounds. */
export function taskDueRange(task: WeekCalendarTask): { from: Date; to: Date } | null {
  const due = task.due;
  const dateStr = due?.date ?? task.due_string ?? "";
  if (!dateStr) return null;
  const dateOnly = dateStr.slice(0, 10);
  const datetime = due && "datetime" in due ? (due as { datetime?: string }).datetime : undefined;
  if (datetime) {
    try {
      const from = new Date(datetime);
      if (!Number.isNaN(from.getTime())) {
        return { from, to: new Date(from.getTime() + 60 * 60 * 1000) };
      }
    } catch {
      /* fall through */
    }
  }
  const strToParse = task.due_string ?? dateStr;
  const hasTime =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strToParse) || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(strToParse);
  if (hasTime) {
    try {
      const from = new Date(strToParse);
      if (!Number.isNaN(from.getTime())) {
        return { from, to: new Date(from.getTime() + 60 * 60 * 1000) };
      }
    } catch {
      /* fall through */
    }
  }
  const parts = dateOnly.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, day] = parts;
  const from = new Date(y, m - 1, day, 0, 0, 0, 0);
  const to = new Date(y, m - 1, day, 23, 59, 59, 999);
  return { from, to };
}

export function compareTasksByDueTime(a: WeekCalendarTask, b: WeekCalendarTask): number {
  const ra = taskDueRange(a);
  const rb = taskDueRange(b);
  const ta = ra ? ra.from.getTime() : 0;
  const tb = rb ? rb.from.getTime() : 0;
  if (ta !== tb) return ta - tb;
  return a.content.localeCompare(b.content);
}
