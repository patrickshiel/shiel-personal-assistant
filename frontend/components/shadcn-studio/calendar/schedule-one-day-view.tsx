"use client";

import { useMemo } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react";

import { ScheduleCurrentTimeBar } from "@/components/shadcn-studio/calendar/schedule-current-time-bar";
import { TASK_SCHEDULE_STYLES, TimedBlock } from "@/components/shadcn-studio/calendar/schedule-view-shared";
import { Button } from "@/components/ui/button";
import {
  groupCalendarEventsByDateKey,
  stylesForCalendarContext,
  type CalendarEventDto,
} from "@/lib/calendar-events";
import {
  collectTimedItemsForDay,
  DEFAULT_DAY_END_HOUR,
  DEFAULT_DAY_START_HOUR,
  gridBodyHeightPx,
  placeTimedItemsForDay,
} from "@/lib/schedule-time-grid";
import {
  groupTasksByDueDateKey,
  isAllDayTask,
  localDateStr,
  type WeekCalendarTask,
} from "@/lib/tasks-week";
import { cn } from "@/lib/utils";

export type ScheduleOneDayViewProps = {
  className?: string;
  /** Local calendar day (time portion ignored). */
  dayDate: Date;
  onPrevDay: () => void;
  onNextDay: () => void;
  onToday?: () => void;
  tasks: WeekCalendarTask[];
  onAddTask?: () => void;
  onSelectTask?: (task: WeekCalendarTask) => void;
  calendarEvents?: CalendarEventDto[];
  calendarLoading?: boolean;
  calendarError?: string | null;
};

function formatDayHeading(d: Date): { weekday: string; dayNum: string; monthShort: string } {
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "long" }),
    dayNum: String(d.getDate()),
    monthShort: d.toLocaleDateString(undefined, { month: "short" }),
  };
}

export function ScheduleOneDayView({
  className,
  dayDate,
  onPrevDay,
  onNextDay,
  onToday,
  tasks,
  onAddTask,
  onSelectTask,
  calendarEvents = [],
  calendarLoading = false,
  calendarError = null,
}: ScheduleOneDayViewProps) {
  const dateKey = useMemo(() => localDateStr(dayDate), [dayDate]);
  const todayStr = localDateStr(new Date());
  const groupedTasks = useMemo(() => groupTasksByDueDateKey(tasks), [tasks]);
  const groupedCal = useMemo(() => groupCalendarEventsByDateKey(calendarEvents), [calendarEvents]);

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

  const placed = useMemo(() => {
    const raw = collectTimedItemsForDay(dateKey, dayDate, tasks, calendarEvents);
    return placeTimedItemsForDay(raw, dayDate, DEFAULT_DAY_START_HOUR, DEFAULT_DAY_END_HOUR);
  }, [dateKey, dayDate, tasks, calendarEvents]);

  const gridTemplate = `44px minmax(120px, 1fr)`;
  const { weekday, dayNum, monthShort } = formatDayHeading(dayDate);
  const isToday = dateKey === todayStr;
  const longCaption = dayDate.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const adTasks = (groupedTasks.get(dateKey) ?? []).filter((t) => isAllDayTask(t));
  const adCals = (groupedCal.get(dateKey) ?? []).filter((e) => e.allDay);
  const allDayEmpty = adTasks.length === 0 && adCals.length === 0;

  return (
    <div className={cn("flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3", className)}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={onPrevDay}
              aria-label="Previous day"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 shrink-0"
              onClick={onNextDay}
              aria-label="Next day"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
          {onToday && !isToday ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 px-2.5 text-xs"
              onClick={onToday}
            >
              Today
            </Button>
          ) : null}
          <div className="min-w-0">
            <h2
              className={cn(
                "truncate text-base font-semibold tracking-tight",
                isToday ? "text-primary" : "text-foreground"
              )}
              title={longCaption}
            >
              {longCaption}
            </h2>
            {calendarLoading || calendarError ? (
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  calendarError ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {calendarLoading ? "Loading calendar…" : calendarError}
              </p>
            ) : null}
          </div>
        </div>
        {onAddTask ? (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={onAddTask}>
            <PlusIcon className="size-3.5" aria-hidden />
            New task
          </Button>
        ) : null}
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex min-h-0 min-w-[280px] flex-1 flex-col overflow-x-auto">
          {/* Day header */}
          <div
            className="grid shrink-0 divide-x divide-border/80 border-b border-border bg-muted/30 dark:bg-muted/20"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="bg-muted/40 px-1 py-1.5 dark:bg-muted/30" />
            <div
              className={cn(
                "px-2 py-1.5 text-center",
                isToday && "bg-primary/10 dark:bg-primary/15"
              )}
            >
              <div className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">
                {weekday}
              </div>
              <div className="text-muted-foreground text-[9px]">{monthShort}</div>
              <div
                className={cn(
                  "text-lg font-bold tabular-nums",
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
          </div>

          {/* All-day strip */}
          <div
            className="grid shrink-0 divide-x divide-border/80 border-b border-border bg-muted/15 dark:bg-muted/10"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="flex items-start bg-muted/30 px-1 py-1 text-[9px] text-muted-foreground dark:bg-muted/25">
              All day
            </div>
            <div className="max-h-24 min-h-[28px] overflow-y-auto px-0.5 py-1">
              {allDayEmpty ? (
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
          </div>

          {/* Time grid — grows with card height (min compact height); scroll only on small viewports */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="relative flex min-h-0 w-full flex-1 flex-col">
              <div
                className="grid min-h-0 w-full flex-1 [grid-template-rows:minmax(0,1fr)]"
                style={{ gridTemplateColumns: gridTemplate, minHeight: bodyHeight }}
              >
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

                <div className="relative flex h-full min-h-0 min-w-0 shrink-0 flex-col border-l border-border/60 bg-background/50 dark:bg-background/30">
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
              </div>
              <ScheduleCurrentTimeBar anchorDay={dayDate} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleOneDayView;
