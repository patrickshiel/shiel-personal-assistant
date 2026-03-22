"use client";

import { useEffect, useState } from "react";

import { getCurrentTimeIndicator } from "@/lib/schedule-time-grid";
import { cn } from "@/lib/utils";

function useNowTick(intervalMs = 30_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

/**
 * Horizontal “now” line across the timed grid when `anchorDay` is today (local).
 * Shows at top/bottom (dashed) when the clock is outside the visible grid window (e.g. before 6:00).
 */
export function ScheduleCurrentTimeBar({
  anchorDay,
  className,
}: {
  anchorDay: Date;
  className?: string;
}) {
  const nowMs = useNowTick();
  const indicator = getCurrentTimeIndicator(anchorDay, new Date(nowMs));

  if (indicator == null) return null;

  const { topFrac, mode } = indicator;
  const edge = mode !== "in-window";

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-[35] overflow-visible", className)} aria-hidden>
      <div
        className="absolute left-0 right-0 flex items-center"
        style={
          mode === "before-hours"
            ? { top: 0 }
            : mode === "after-hours"
              ? { top: "100%", transform: "translateY(-100%)" }
              : { top: `${topFrac * 100}%`, transform: "translateY(-50%)" }
        }
      >
        <span
          className={cn(
            "size-2.5 shrink-0 rounded-full shadow-md ring-2 ring-background",
            edge ? "bg-muted-foreground/90" : "bg-lime-400 dark:bg-lime-300"
          )}
        />
        <div
          className={cn(
            "min-w-0 flex-1 shadow-md",
            edge ? "h-px border-t border-dashed border-muted-foreground/80" : "h-[3px] rounded-full bg-lime-400 dark:bg-lime-300"
          )}
        />
      </div>
    </div>
  );
}
