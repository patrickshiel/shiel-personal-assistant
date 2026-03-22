"use client";

import { useMemo, useState } from "react";
import { formatDateRange } from "little-date";
import { PlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  compareTasksByDueTime,
  dueDateOnly,
  isDateInLocalWeek,
  localDateStr,
  type WeekCalendarTask,
  taskDueRange,
} from "@/lib/tasks-week";

export type CalendarEventListDemoProps = {
  weekTasks: WeekCalendarTask[];
  weekStart: Date;
  weekEnd: Date;
  /** Opens Tasks tab + new task when provided */
  onAddTask?: () => void;
  /** Opens Tasks tab with this task selected when provided */
  onSelectTask?: (task: WeekCalendarTask) => void;
};

function initialSelectedDate(weekStart: Date, weekEnd: Date): Date {
  const now = new Date();
  if (isDateInLocalWeek(now, weekStart, weekEnd)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
}

const CalendarEventListDemo = ({
  weekTasks,
  weekStart,
  weekEnd,
  onAddTask,
  onSelectTask,
}: CalendarEventListDemoProps) => {
  const [date, setDate] = useState<Date>(() => initialSelectedDate(weekStart, weekEnd));

  const defaultMonth = useMemo(
    () => new Date(date.getFullYear(), date.getMonth(), 1),
    [date]
  );

  const daysWithDue = useMemo(() => {
    const keys = new Set<string>();
    for (const t of weekTasks) {
      const d = dueDateOnly(t);
      if (d) keys.add(d);
    }
    return [...keys].map((s) => {
      const [y, m, day] = s.split("-").map(Number);
      return new Date(y, m - 1, day, 12, 0, 0, 0);
    });
  }, [weekTasks]);

  const selectedKey = localDateStr(date);

  const tasksForSelectedDay = useMemo(() => {
    return weekTasks
      .filter((t) => dueDateOnly(t) === selectedKey)
      .sort(compareTasksByDueTime);
  }, [weekTasks, selectedKey]);

  return (
    <div>
      <Card className="w-full max-w-xs py-4">
        <CardContent className="px-4">
          <Calendar
            mode="single"
            selected={date}
            defaultMonth={defaultMonth}
            onSelect={(d) => {
              if (d && isDateInLocalWeek(d, weekStart, weekEnd)) {
                setDate(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
              }
            }}
            disabled={(d) => !isDateInLocalWeek(d, weekStart, weekEnd)}
            modifiers={{ hasDue: daysWithDue }}
            modifiersClassNames={{
              hasDue:
                "font-semibold after:pointer-events-none after:absolute after:bottom-0.5 after:left-1/2 after:z-[2] after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
            }}
            className="w-full bg-transparent p-0"
          />
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-3 border-t px-4 pt-4">
          <div className="flex w-full items-center justify-between px-1">
            <div className="text-sm font-medium">
              {date.toLocaleDateString("en-US", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </div>
            {onAddTask ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                title="New task"
                onClick={onAddTask}
              >
                <PlusIcon className="size-4" />
                <span className="sr-only">New task</span>
              </Button>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-2">
            {tasksForSelectedDay.length === 0 ? (
              <p className="text-muted-foreground px-1 text-xs">No tasks due this day.</p>
            ) : (
              tasksForSelectedDay.map((task) => {
                const range = taskDueRange(task);
                const timeLabel = range
                  ? formatDateRange(range.from, range.to)
                  : "—";
                return (
                  <button
                    key={task.id}
                    type="button"
                    disabled={!onSelectTask}
                    onClick={() => onSelectTask?.(task)}
                    className={
                      onSelectTask
                        ? "bg-muted after:bg-primary/70 relative w-full rounded-md p-2 pl-6 text-left text-sm transition-colors after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full hover:bg-muted/80"
                        : "bg-muted after:bg-primary/70 relative w-full rounded-md p-2 pl-6 text-left text-sm after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full"
                    }
                  >
                    <div className="font-medium">{task.content}</div>
                    <div className="text-muted-foreground text-xs">{timeLabel}</div>
                  </button>
                );
              })
            )}
          </div>
        </CardFooter>
      </Card>
      <p className="text-muted-foreground mt-3 text-center text-xs" role="region">
        Calendar with event list — current week only
      </p>
    </div>
  );
};

export default CalendarEventListDemo;
