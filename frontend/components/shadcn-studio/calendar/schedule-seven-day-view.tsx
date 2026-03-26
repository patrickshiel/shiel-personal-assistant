"use client";

import { useMemo } from "react";
import { PlusIcon } from "lucide-react";

import { ScheduleCurrentTimeBar } from "@/components/shadcn-studio/calendar/schedule-current-time-bar";
import {
  CalendarStatusBar,
  TASK_SCHEDULE_STYLES,
  TimedBlock,
} from "@/components/shadcn-studio/calendar/schedule-view-shared";
import { Button } from "@/components/ui/button";
import {
  groupCalendarEventsByDateKey,
  stylesForCalendarContext,
  type CalendarConfigured,
  type CalendarEventDto,
} from "@/lib/calendar-events";
import {
  collectTimedItemsForDay,
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  gridBodyHeightPx,
  placeTimedItemsForDay,
  type PlacedTimedItem,
} from "@/lib/schedule-time-grid";
import {
  getNextSevenDayRange,
  groupTasksByDueDateKey,
  isAllDayTask,
  localDateStr,
  type WeekCalendarTask,
} from "@/lib/tasks-week";
import { cn } from "@/lib/utils";

export type ScheduleSevenDayViewProps = {
  className?: string;
  tasks: WeekCalendarTask[];
  onAddTask?: () => void;
  onSelectTask?: (task: WeekCalendarTask) => void;
  calendarEvents?: CalendarEventDto[];
  calendarLoading?: boolean;
  calendarError?: string | null;
  calendarConfigured?: CalendarConfigured;
};

function formatDayHeading(d: Date): { weekday: string; dayNum: string; monthShort: string } {
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    dayNum: String(d.getDate()),
    monthShort: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

function formatRangeCaption(dayDates: Date[]): string {
  if (dayDates.length < 7) return "";
  const a = dayDates[0]!;
  const b = dayDates[6]!;
  const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${a.toLocaleDateString(undefined, { month: "long", year: "numeric" })} · ${a.getDate()}–${b.getDate()}`;
  }
  return `${a.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export function ScheduleSevenDayView({
  className,
  tasks,
  onAddTask,
  onSelectTask,
  calendarEvents = [],
  calendarLoading = false,
  calendarError = null,
  calendarConfigured,
}: ScheduleSevenDayViewProps) {
  const { dayDates } = useMemo(() => getNextSevenDayRange(new Date()), []);
  const groupedTasks = useMemo(() => groupTasksByDueDateKey(tasks), [tasks]);
  const groupedCal = useMemo(() => groupCalendarEventsByDateKey(calendarEvents), [calendarEvents]);
  const caption = useMemo(() => formatRangeCaption(dayDates), [dayDates]);
  const todayStr = localDateStr(new Date());

  const slotsPerDay = (DEFAULT_DAY_END_HOUR - DEFAULT_DAY_START_HOUR) * 2;
  const bodyHeight = gridBodyHeightPx(DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR, 16);
  const hourSpan = DEFAULT_DAY_END_HOUR - DEFAULT_DAY_START_HOUR;
  const hourLabelHours = useMemo(() => {
    const h: number[] = [];
    for (let hour = DEFAULT_DAY_START_HOUR; hour < DEFAULT_DAY_END_HOUR; hour++) {
      h.push(hour);
    }
    return h;
  }, []);

  const placedByDay = useMemo(() => {
    const m = new Map<string, PlacedTimedItem[]>();
    for (const d of dayDates) {
      const key = localDateStr(d);
      const raw = collectTimedItemsForDay(key, d, tasks, calendarEvents);
      m.set(key, placeTimedItemsForDay(raw, d, DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR));
    }
    return m;
  }, [dayDates, tasks, calendarEvents]);

  const gridTemplate = `44px repeat(7, minmax(72px, 1fr))`;

  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div
          className="flex min-w-0 max-w-full flex-nowrap items-center gap-x-2 overflow-x-auto text-sm sm:gap-x-3 [scrollbar-width:thin]"
          role="group"
          aria-label="Next 7 days summary"
        >
          <span className="shrink-0 font-semibold tracking-tight text-foreground">Next 7 days</span>
          <span className="text-muted-foreground/80 shrink-0" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground shrink-0">{caption}</span>
          <span className="text-muted-foreground/80 shrink-0" aria-hidden>
            ·
          </span>
          <span className="text-muted-foreground shrink-0 whitespace-nowrap text-[11px] sm:text-sm">
            {DEFAULT_DAY_START_HOUR}:00–{DEFAULT_DAY_END_HOUR}:00 · 30-minute rows
          </span>
          <span className="text-muted-foreground/80 shrink-0" aria-hidden>
            ·
          </span>
          <CalendarStatusBar
            loading={calendarLoading}
            error={calendarError}
            configured={calendarConfigured}
            inline
            className="shrink-0 text-[11px] sm:text-xs"
          />
        </div>
        {onAddTask ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onAddTask}>
            <PlusIcon className="size-3.5" aria-hidden />
            New task
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex min-h-0 min-w-[780px] flex-1 flex-col overflow-x-auto">
          {/* Day headers */}
          <div
            className="grid shrink-0 divide-x divide-border/80 border-b border-border bg-muted/30 dark:bg-muted/20"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="bg-muted/40 px-1 py-1.5 dark:bg-muted/30" />
            {dayDates.map((d) => {
              const key = localDateStr(d);
              const { weekday, dayNum, monthShort } = formatDayHeading(d);
              const isToday = key === todayStr;
              return (
                <div
                  key={`h-${key}`}
                  className={cn(
                    "px-1 py-1.5 text-center",
                    isToday && "bg-primary/10 dark:bg-primary/15"
                  )}
                >
                  <div className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                    {weekday}
                  </div>
                  <div className="text-muted-foreground text-[9px]">{monthShort}</div>
                  <div
                    className={cn(
                      "text-sm font-bold tabular-nums",
                      isToday ? "text-primary" : "text-foreground"
                    )}
                  >
                    {dayNum}
                  </div>
                  {onAddTask ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mx-auto mt-0.5 size-6"
                      title="New task"
                      onClick={onAddTask}
                    >
                      <PlusIcon className="size-3" />
                      <span className="sr-only">New task</span>
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* All-day strip */}
          <div
            className="grid shrink-0 divide-x divide-border/80 border-b border-border bg-muted/15 dark:bg-muted/10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex items-start bg-muted/30 px-1 py-1 text-[9px] text-muted-foreground dark:bg-muted/25">
              All day
            </div>
            {dayDates.map((d) => {
              const key = localDateStr(d);
              const adTasks = (groupedTasks.get(key) ?? []).filter((t) => isAllDayTask(t));
              const adCals = (groupedCal.get(key) ?? []).filter((e) => e.allDay);
              const empty = adTasks.length === 0 && adCals.length === 0;
              return (
                <div
                  key={`ad-${key}`}
                  className="max-h-16 min-h-[28px] overflow-y-auto px-0.5 py-1"
                >
                  {empty ? (
                    <span className="text-muted-foreground/70 text-[9px]">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {adTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          disabled={!onSelectTask}
                          onClick={() => onSelectTask?.(task)}
                          className={cn(
                            "truncate rounded border px-1 py-px text-left text-[9px] font-medium",
                            TASK_SCHEDULE_STYLES.chip,
                            onSelectTask && TASK_SCHEDULE_STYLES.chipHover
                          )}
                        >
                          {task.content}
                        </button>
                      ))}
                      {adCals.map((ev) => {
                        const cs = stylesForCalendarContext(ev.context);
                        const isDeclined = ev.responseStatus === "declined";
                        return ev.htmlLink ? (
                          <a
                            key={ev.id}
                            href={ev.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              "truncate rounded border px-1 py-px text-[9px] font-medium",
                              cs.chip,
                              cs.chipHover,
                              isDeclined && "opacity-50 line-through"
                            )}
                          >
                            {ev.title}
                          </a>
                        ) : (
                          <div
                            key={ev.id}
                            className={cn(
                              "truncate rounded border px-1 py-px text-[9px] font-medium",
                              cs.chip,
                              isDeclined && "opacity-50 line-through"
                            )}
                          >
                            {ev.title}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Time grid — grows with card height; min height keeps compact layout */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="relative flex min-h-0 w-full flex-1 flex-col">
              <div
                className="grid min-h-0 w-full flex-1 [grid-template-rows:minmax(0,1fr)]"
                style={{ gridTemplateColumns: gridTemplate, minHeight: bodyHeight }}
              >
                {/* Time ruler */}
                <div className="relative flex h-full min-h-0 min-w-[44px] shrink-0 flex-col border-r border-border/80 bg-muted/20 dark:bg-muted/15">
                  <div className="flex min-h-0 flex-1 flex-col">
                    {Array.from({ length: slotsPerDay }).map((_, i) => (
                      <div
                        key={i}
                        className={cn(
                          "min-h-[12px] flex-1 border-b border-border/25",
                          i % 2 === 1 && "border-border/40"
                        )}
                      />
                    ))}
                  </div>
                  {hourLabelHours.map((hour) => (
                    <span
                      key={hour}
                      className="text-muted-foreground pointer-events-none absolute left-0.5 z-[2] text-[9px] tabular-nums"
                      style={{
                        top: `${((hour - DEFAULT_DAY_START_HOUR) / hourSpan) * 100}%`,
                      }}
                    >
                      {hour}:00
                    </span>
                  ))}
                </div>

                {dayDates.map((d) => {
                  const key = localDateStr(d);
                  const placed = placedByDay.get(key) ?? [];
                  return (
                    <div
                      key={`col-${key}`}
                      className="relative flex h-full min-h-0 min-w-0 shrink-0 flex-col border-l border-border/60 bg-background/50 dark:bg-background/30"
                    >
                      <div className="pointer-events-none absolute inset-0 flex flex-col">
                        {Array.from({ length: slotsPerDay }).map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "min-h-[12px] flex-1 border-b border-border/25",
                              i % 2 === 1 && "border-border/45"
                            )}
                          />
                        ))}
                      </div>
                      {placed.map((p) => (
                        <TimedBlock key={p.layoutId} p={p} onSelectTask={onSelectTask} />
                      ))}
                    </div>
                  );
                })}
              </div>
              {/* Today is always dayDates[0] for this range */}
              <ScheduleCurrentTimeBar anchorDay={dayDates[0]!} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleSevenDayView;
