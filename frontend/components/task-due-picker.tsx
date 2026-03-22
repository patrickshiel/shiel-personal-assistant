"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const TIME_STEP_MINUTES = 15;

/** Todoist-friendly local datetime string (date + time). */
export function formatTodoistDueLocal(d: Date): string {
  return format(d, "yyyy-MM-dd HH:mm");
}

export function parseDueValueToDate(value: string): Date | undefined {
  const v = value.trim();
  if (!v) return undefined;
  const isoTry = new Date(v);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

export type TaskDueSource = {
  due?: { date?: string; datetime?: string; string?: string };
  due_string?: string;
};

/** Best-effort initial due string for the picker from API task fields. */
export function taskToInitialDueString(task: TaskDueSource): string {
  const due = task.due;
  const datetime = due && typeof due.datetime === "string" ? due.datetime : undefined;
  if (datetime) {
    const d = new Date(datetime);
    if (!Number.isNaN(d.getTime())) return formatTodoistDueLocal(d);
  }
  const strToParse = task.due_string ?? due?.date ?? "";
  if (
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strToParse) ||
    /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(strToParse)
  ) {
    const d = new Date(strToParse);
    if (!Number.isNaN(d.getTime())) return formatTodoistDueLocal(d);
  }
  if (due?.date) {
    const dateOnly = due.date.slice(0, 10);
    const d = new Date(`${dateOnly}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return formatTodoistDueLocal(d);
  }
  return typeof task.due_string === "string" ? task.due_string : "";
}

function timeToHHmm(d: Date): string {
  return format(d, "HH:mm");
}

function mergeDateAndTime(date: Date, timeHHmm: string): Date {
  const [hh, mm] = timeHHmm.split(":").map((x) => parseInt(x, 10));
  const next = new Date(date);
  next.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
  return next;
}

function buildQuarterHourSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += TIME_STEP_MINUTES) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

const TIME_SLOTS = buildQuarterHourSlots();

function snapToQuarterHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "12:00";
  const total = h * 60 + m;
  const snapped = Math.round(total / TIME_STEP_MINUTES) * TIME_STEP_MINUTES;
  const nh = Math.floor(snapped / 60) % 24;
  const nm = snapped % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

function formatSlotLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return format(d, "h:mm a");
}

export function TaskDuePicker({
  value,
  onChange,
  className,
  /** Larger trigger text + icon (e.g. task detail panel). */
  comfortableTrigger = false,
  /** Called whenever the popover closes (outside click, Done, Clear due). */
  onPopoverClose,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  comfortableTrigger?: boolean;
  onPopoverClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(undefined);
  const [timeHHmm, setTimeHHmm] = useState("12:00");
  const activeSlotRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = parseDueValueToDate(value);
    if (d) {
      setSelectedDay(d);
      setTimeHHmm(snapToQuarterHour(timeToHHmm(d)));
    } else {
      setSelectedDay(undefined);
      setTimeHHmm("12:00");
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      activeSlotRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, timeHHmm]);

  const label = useMemo(() => {
    const d = parseDueValueToDate(value);
    if (d) {
      return format(d, "EEE, MMM d, yyyy '·' h:mm a");
    }
    if (value.trim()) {
      return value.length > 36 ? `${value.slice(0, 34)}…` : value;
    }
    return "No due date";
  }, [value]);

  const applySelection = (day: Date | undefined, time: string) => {
    if (!day) {
      onChange("");
      return;
    }
    onChange(formatTodoistDueLocal(mergeDateAndTime(day, time)));
  };

  const handleTimeSlot = (slot: string) => {
    setTimeHHmm(slot);
    const day = selectedDay ?? new Date();
    setSelectedDay(day);
    applySelection(day, slot);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      onPopoverClose?.();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        nativeButton
        render={
          <Button
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start bg-background text-left",
              comfortableTrigger
                ? "h-7 min-h-7 gap-1.5 px-2 py-0 text-sm font-normal leading-tight"
                : "h-7 min-h-7 gap-1.5 px-1.5 py-0 text-[11px] font-normal leading-tight",
              className
            )}
          >
            <CalendarIcon
              className={cn("shrink-0 opacity-70", comfortableTrigger ? "size-3.5" : "size-3")}
            />
            <span className="line-clamp-2 break-words text-left">{label}</span>
          </Button>
        }
      />
      <PopoverContent className="w-auto max-w-[calc(100vw-2rem)] p-0" align="start">
        <div className="flex flex-col border-b border-border sm:flex-row sm:border-b-0">
          <div className="min-w-0 border-border sm:border-r">
            <Calendar
              mode="single"
              required={false}
              selected={selectedDay}
              onSelect={(day) => {
                setSelectedDay(day);
                if (day) {
                  applySelection(day, timeHHmm);
                } else {
                  onChange("");
                }
              }}
              defaultMonth={selectedDay ?? new Date()}
            />
          </div>
          <div className="flex w-full shrink-0 flex-col border-t border-border sm:w-[128px] sm:border-t-0 sm:border-l">
            <p className="border-b border-border px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Time
            </p>
            <div
              className="max-h-[min(240px,40vh)] overflow-y-auto overscroll-contain px-1.5 py-1.5 [scrollbar-gutter:stable]"
              role="listbox"
              aria-label="Time"
            >
              <div className="flex flex-col gap-0.5">
                {TIME_SLOTS.map((slot) => {
                  const isActive = slot === timeHHmm;
                  return (
                    <button
                      key={slot}
                      ref={isActive ? activeSlotRef : undefined}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      id={`task-due-time-${slot}`}
                      onClick={() => handleTimeSlot(slot)}
                      className={cn(
                        "w-full rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors",
                        "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                        isActive &&
                          "border-primary/30 bg-primary font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
                      )}
                    >
                      {formatSlotLabel(slot)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-1 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => {
              onChange("");
              setSelectedDay(undefined);
              handleOpenChange(false);
            }}
          >
            Clear due
          </Button>
          <Button type="button" size="sm" className="h-7 flex-1 text-xs" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
