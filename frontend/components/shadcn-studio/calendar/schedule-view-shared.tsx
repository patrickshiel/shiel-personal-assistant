"use client";

import { formatDateRange } from "little-date";

import { type CalendarConfigured, stylesForCalendarContext } from "@/lib/calendar-events";
import { type PlacedTimedItem } from "@/lib/schedule-time-grid";
import { type WeekCalendarTask, taskDueRange } from "@/lib/tasks-week";
import { cn } from "@/lib/utils";

/** Todoist / task blocks — emerald so they don’t clash with theme `primary` (often violet) or work calendar (amber). */
export const TASK_SCHEDULE_STYLES = {
  timed:
    "border-emerald-600/45 bg-emerald-500/11 shadow-sm dark:border-emerald-400/50 dark:bg-emerald-500/16",
  timedHover: "hover:bg-emerald-500/19 dark:hover:bg-emerald-500/24",
  chip: "border-emerald-600/40 bg-emerald-500/11",
  chipHover: "hover:bg-emerald-500/17",
} as const;

export function CalendarStatusBar({
  loading,
  error,
  configured,
  className,
  inline = false,
}: {
  loading: boolean;
  error: string | null | undefined;
  configured: CalendarConfigured | undefined;
  className?: string;
  /** When true, render as inline text (e.g. single-row headers). */
  inline?: boolean;
}) {
  const Tag = inline ? "span" : "p";
  if (loading) {
    return (
      <Tag className={cn("text-muted-foreground text-xs", inline && "whitespace-nowrap", className)}>
        Loading Google Calendar…
      </Tag>
    );
  }
  if (error) {
    return (
      <Tag className={cn("text-destructive text-xs", inline && "whitespace-nowrap", className)}>{error}</Tag>
    );
  }
  const c = configured ?? { personal: false, work: false };
  if (!c.personal && !c.work) {
    return (
      <Tag
        className={cn(
          "text-muted-foreground text-xs",
          inline && "min-w-[12rem] whitespace-normal",
          className
        )}
      >
        Google Calendar: set <code className="rounded bg-muted px-1 text-[10px]">GOOGLE_*</code> in{" "}
        <code className="rounded bg-muted px-1 text-[10px]">.env</code> and run{" "}
        <code className="rounded bg-muted px-1 text-[10px]">npm run auth-google</code> in the backend (see{" "}
        <code className="rounded bg-muted px-1 text-[10px]">docs/SETUP.md</code>).
      </Tag>
    );
  }
  const parts: string[] = [];
  if (c.personal) parts.push("personal");
  if (c.work) parts.push("work");
  return (
    <Tag className={cn("text-muted-foreground text-xs", inline && "whitespace-nowrap", className)}>
      Google Calendar: {parts.join(" · ")}
    </Tag>
  );
}

export function TimedBlock({
  p,
  onSelectTask,
}: {
  p: PlacedTimedItem;
  onSelectTask?: (task: WeekCalendarTask) => void;
}) {
  const n = Math.max(1, p.numCols);
  const gap = 3;
  const pct = 100 / n;
  const left = `calc(${(p.col / n) * 100}% + ${gap / 2}px)`;
  const width = `calc(${pct}% - ${gap}px)`;

  if (p.kind === "task" && p.task) {
    const task = p.task;
    const range = taskDueRange(task);
    const timeLabel = range ? formatDateRange(range.from, range.to) : "";
    return (
      <button
        type="button"
        disabled={!onSelectTask}
        onClick={() => onSelectTask?.(task)}
        className={cn(
          "absolute z-[1] overflow-hidden rounded border px-0.5 py-0.5 text-left text-[10px] leading-tight",
          TASK_SCHEDULE_STYLES.timed,
          onSelectTask && "cursor-pointer",
          onSelectTask && TASK_SCHEDULE_STYLES.timedHover
        )}
        style={{
          top: `${p.topFrac * 100}%`,
          height: `${p.heightFrac * 100}%`,
          left,
          width,
          minHeight: 18,
        }}
        title={`${task.content}\n${timeLabel}`}
      >
        <div className="line-clamp-2 font-medium">{task.content}</div>
        {timeLabel ? <div className="text-muted-foreground mt-0.5 truncate text-[9px]">{timeLabel}</div> : null}
      </button>
    );
  }

  if (p.kind === "calendar" && p.event) {
    const ev = p.event;
    const timeLabel = formatDateRange(new Date(ev.start), new Date(ev.end));
    const cs = stylesForCalendarContext(ev.context);
    const shell = cn(
      "absolute z-[1] overflow-hidden rounded border px-0.5 py-0.5 text-left text-[10px] leading-tight",
      cs.timedShell
    );

    const inner = (
      <>
        <div className="line-clamp-2 font-medium">{ev.title}</div>
        <div className="text-muted-foreground mt-0.5 truncate text-[9px]">
          {ev.context} · {timeLabel}
        </div>
      </>
    );

    if (ev.htmlLink) {
      return (
        <a
          href={ev.htmlLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(shell, "block", cs.timedHover)}
          style={{
            top: `${p.topFrac * 100}%`,
            height: `${p.heightFrac * 100}%`,
            left,
            width,
            minHeight: 18,
          }}
          title={`${ev.title}\n${timeLabel}`}
        >
          {inner}
        </a>
      );
    }

    return (
      <div
        className={shell}
        style={{
          top: `${p.topFrac * 100}%`,
          height: `${p.heightFrac * 100}%`,
          left,
          width,
          minHeight: 18,
        }}
        title={`${ev.title}\n${timeLabel}`}
      >
        {inner}
      </div>
    );
  }

  return null;
}
