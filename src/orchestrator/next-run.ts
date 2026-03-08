/**
 * In-process cron: compute next run time for a given cron expression.
 * Supports: star-slash-N (minute), 0 H * * * (daily), 0 H * * D (weekly, D = 1..5 Monday=1).
 */

export type CronParts = {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
};

function parseCron(expr: string): CronParts {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) throw new Error(`Invalid cron: ${expr}`);
  return {
    minute: parts[0] ?? "*",
    hour: parts[1] ?? "*",
    dayOfMonth: parts[2] ?? "*",
    month: parts[3] ?? "*",
    dayOfWeek: parts[4] ?? "*",
  };
}

/** Get the next run time after `after` (local time). */
export function getNextRun(cronExpr: string, after: Date): Date {
  const p = parseCron(cronExpr);
  const next = new Date(after.getTime());

  // */15 or */30 on minute
  if (p.minute.startsWith("*/") && p.hour === "*" && p.dayOfMonth === "*" && p.month === "*" && p.dayOfWeek === "*") {
    const step = parseInt(p.minute.slice(2), 10);
    if (step === 15 || step === 30) {
      const min = next.getMinutes();
      const nextMin = Math.ceil((min + 1) / step) * step;
      if (nextMin >= 60) {
        next.setMinutes(0);
        next.setHours(next.getHours() + 1);
      } else {
        next.setMinutes(nextMin);
      }
      next.setSeconds(0, 0);
      return next;
    }
  }

  // 0 H * * * — daily at hour H
  if (p.minute === "0" && p.dayOfMonth === "*" && p.month === "*" && p.dayOfWeek === "*") {
    const hour = parseInt(p.hour, 10);
    next.setMinutes(0, 0, 0);
    next.setHours(hour);
    if (next.getTime() <= after.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // 0 H * * D — weekly at hour H on day D (1=Monday, 7=Sunday)
  if (p.minute === "0" && p.dayOfMonth === "*" && p.month === "*" && p.dayOfWeek !== "*") {
    const hour = parseInt(p.hour, 10);
    const targetDay = parseInt(p.dayOfWeek, 10); // 1 = Monday
    next.setMinutes(0, 0, 0);
    next.setHours(hour);
    const currentDay = next.getDay(); // 0 = Sunday, 1 = Monday
    const daysToAdd = (targetDay - (currentDay === 0 ? 7 : currentDay) + 7) % 7;
    if (daysToAdd > 0) {
      next.setDate(next.getDate() + daysToAdd);
    } else if (daysToAdd === 0 && next.getTime() <= after.getTime()) {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }

  // Fallback: advance by 1 minute and retry (avoid infinite loop by capping)
  next.setMinutes(next.getMinutes() + 1, 0, 0);
  return next;
}
