"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { SpeechInput } from "@/components/ai-elements/speech-input";
import {
  ArrowUpIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  Loader2Icon,
  MessageSquare,
  PencilIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { TaskDuePicker, taskToInitialDueString } from "@/components/task-due-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import ScheduleOneDayView from "@/components/shadcn-studio/calendar/schedule-one-day-view";
import ScheduleSevenDayView from "@/components/shadcn-studio/calendar/schedule-seven-day-view";
import type { CalendarConfigured, CalendarEventDto } from "@/lib/calendar-events";
import { buildScheduleDayContextMarkdown } from "@/lib/schedule-day-context";
import {
  getNextSevenDayRange,
  tasksDataTaskItemsForDateKey,
  tasksDataTasksForDateKey,
  tasksDataTasksInNextSevenDays,
} from "@/lib/tasks-week";

type Trigger = { id: string; schedule: string | null; defaultInput: string };
type Proposal = { id: string; toolName: string; args: unknown };
type JobRecord = {
  id: string;
  createdAt: string;
  type: string;
  triggerId?: string;
  status: "pending" | "approved" | "executed" | "failed";
  outputText?: string;
  proposals: Proposal[];
};

type TaskContext = "personal" | "work";
type TaskItem = {
  id: string;
  content: string;
  due_string?: string;
  due?: { date: string; datetime?: string; string?: string };
  priority: number;
  context: TaskContext;
  description?: string;
};
type TasksData = {
  overdue: TaskItem[];
  dueToday: TaskItem[];
  upcoming: TaskItem[];
  error?: string;
};

const backendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.NEXT_PUBLIC_EXPRESS_BACKEND_URL ?? "http://localhost:3001";

const PRIORITY_LABELS: Record<number, string> = { 1: "Normal", 2: "Medium", 3: "High", 4: "Urgent" };

type PriorityLevel = 1 | 2 | 3 | 4;

function priorityStyleKey(p: number): PriorityLevel {
  return p === 1 || p === 2 || p === 3 || p === 4 ? p : 1;
}

/** Badge colours: P1 neutral (theme), P2 blue, P3 amber, P4 red */
const PRIORITY_BADGE_STYLES: Record<PriorityLevel, string> = {
  1: "border-border bg-muted/90 text-card-foreground",
  2: "border-sky-500/45 bg-sky-600/22 text-sky-50 dark:border-sky-400/50 dark:bg-sky-500/25 dark:text-sky-50",
  3: "border-amber-500/50 bg-amber-600/24 text-amber-50 dark:border-amber-400/55 dark:bg-amber-500/28 dark:text-amber-50",
  4: "border-red-500/50 bg-red-600/28 text-red-50 dark:border-red-400/55 dark:bg-red-500/30 dark:text-red-50",
};

const PRIORITY_TOGGLE_ON: Record<PriorityLevel, string> = {
  1: "border-border bg-secondary text-secondary-foreground shadow-sm ring-2 ring-primary/30",
  2: "border-sky-400/70 bg-sky-600/50 text-white shadow-sm ring-2 ring-sky-400/35",
  3: "border-amber-400/70 bg-amber-600/48 text-white shadow-sm ring-2 ring-amber-400/40",
  4: "border-red-400/70 bg-red-600/52 text-white shadow-sm ring-2 ring-red-400/40",
};

const PRIORITY_TOGGLE_OFF: Record<PriorityLevel, string> = {
  1: "border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted",
  2: "border-sky-500/35 bg-sky-500/12 text-sky-200/95 hover:bg-sky-500/20 dark:text-sky-100",
  3: "border-amber-500/38 bg-amber-500/12 text-amber-200/95 hover:bg-amber-500/20 dark:text-amber-100",
  4: "border-red-500/38 bg-red-500/12 text-red-200/95 hover:bg-red-500/20 dark:text-red-100",
};

function PriorityBadge({ priority, className }: { priority: number; className?: string }) {
  const key = priorityStyleKey(priority);
  const label = PRIORITY_LABELS[priority] ?? `P${priority}`;
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex h-7 w-fit shrink-0 items-center rounded-md px-2.5 py-0 text-sm font-medium tabular-nums leading-none",
        PRIORITY_BADGE_STYLES[key],
        className
      )}
    >
      {priority} · {label}
    </Badge>
  );
}

/** Format due for display: weekday (3-letter) + date + time when available, else date only (no time). */
function formatDueForDisplay(task: TaskItem): string {
  const due = task.due;
  const dateStr = due?.date ?? task.due_string ?? "";
  if (!dateStr) return "—";
  const dateOnly = dateStr.slice(0, 10);
  const optsDateShort: Intl.DateTimeFormatOptions = { weekday: "short", year: "numeric", month: "numeric", day: "numeric" };
  const optsDateTimeShort: Intl.DateTimeFormatOptions = { weekday: "short", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" };

  const datetime = due && "datetime" in due ? (due as { datetime?: string }).datetime : undefined;
  if (datetime) {
    try {
      const d = new Date(datetime);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, optsDateTimeShort);
    } catch {
      const d = new Date(dateOnly + "T12:00:00");
      return `${d.toLocaleDateString(undefined, { weekday: "short" })} ${dateOnly} ${String(datetime).slice(11, 16)}`;
    }
  }
  const strToParse = task.due_string ?? dateStr;
  const hasTimeInString =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strToParse) || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(strToParse);
  if (hasTimeInString) {
    try {
      const d = new Date(strToParse);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, optsDateTimeShort);
    } catch {
      // fall through to date only
    }
  }
  if (dateOnly) {
    const d = new Date(dateOnly + "T12:00:00");
    if (!Number.isNaN(d.getTime())) {
      return `${d.toLocaleDateString(undefined, optsDateShort)} (no time)`;
    }
    return `${dateOnly} (no time)`;
  }
  return dateStr;
}

function dueDateOnly(task: TaskItem): string {
  const d = task.due?.date ?? task.due_string ?? "";
  if (!d) return "";
  return d.slice(0, 10);
}

/** Sortable ISO-like string for a task's due date+time (for ordering). No time = end of day. */
function dueSortKey(task: TaskItem): string {
  const due = task.due;
  const dateStr = due?.date ?? task.due_string ?? "";
  if (!dateStr) return "9999-12-31T23:59:59.999";
  const dateOnly = dateStr.slice(0, 10);
  const datetime = due && "datetime" in due ? (due as { datetime?: string }).datetime : undefined;
  if (datetime) {
    try {
      const d = new Date(datetime);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fall through
    }
  }
  const strToParse = task.due_string ?? dateStr;
  const hasTime =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strToParse) || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(strToParse);
  if (hasTime) {
    try {
      const d = new Date(strToParse);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fall through
    }
  }
  return `${dateOnly}T23:59:59.999`;
}

function compareTasksByDue(a: TaskItem, b: TaskItem): number {
  return dueSortKey(a).localeCompare(dueSortKey(b));
}

/** Format a date for task group headers (e.g. "Mon, 17 Mar 2026"). */
function formatGroupHeaderDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

/** Local calendar date as YYYY-MM-DD (avoids UTC shifts from toISOString). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday 00:00 local of the ISO-style week (week starts Monday, ends Sunday). JS getDay: Sun=0 … Sat=6. */
function startOfWeekMonday(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const daysFromMonday = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - daysFromMonday);
  return c;
}

/** Sunday of the same Monday–Sunday week as `d`. */
function endOfWeekSunday(d: Date): Date {
  const mon = startOfWeekMonday(d);
  return new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
}

/** Sunday of the current local week, YYYY-MM-DD (for grouping / labels). */
function sundayOfCurrentWeekStr(): string {
  return localDateStr(endOfWeekSunday(new Date()));
}

function splitUpcoming(upcoming: TaskItem[]): {
  tomorrow: TaskItem[];
  thisWeek: TaskItem[];
  future: TaskItem[];
} {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowStr = localDateStr(tomorrow);
  const weekSundayStr = sundayOfCurrentWeekStr();

  const tomorrowTasks: TaskItem[] = [];
  const thisWeekTasks: TaskItem[] = [];
  const futureTasks: TaskItem[] = [];

  for (const task of upcoming) {
    const due = dueDateOnly(task);
    if (!due) {
      futureTasks.push(task);
      continue;
    }
    if (due === tomorrowStr) tomorrowTasks.push(task);
    else if (due > tomorrowStr && due <= weekSundayStr) thisWeekTasks.push(task);
    else futureTasks.push(task);
  }

  tomorrowTasks.sort(compareTasksByDue);
  thisWeekTasks.sort(compareTasksByDue);
  futureTasks.sort(compareTasksByDue);

  return { tomorrow: tomorrowTasks, thisWeek: thisWeekTasks, future: futureTasks };
}

function TasksSection({
  title,
  dateBadge,
  count,
  tasks,
  defaultOpen = false,
  open,
  onOpenChange,
  renderTaskRow,
}: {
  title: string;
  dateBadge?: string;
  count: number;
  tasks: TaskItem[];
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTaskRow: (task: TaskItem) => ReactNode;
}) {
  return (
    <div className="flex shrink-0 flex-col overflow-hidden">
      <Collapsible
        defaultOpen={defaultOpen}
        {...(open !== undefined && onOpenChange ? { open, onOpenChange } : {})}
        className="flex flex-col"
      >
        <CollapsibleTrigger className="group flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-left text-sm font-medium hover:bg-muted/80">
          <ChevronDownIcon className="size-4 shrink-0 hidden group-data-[panel-open]:block" />
          <ChevronRightIcon className="size-4 shrink-0 block group-data-[panel-open]:hidden" />
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span>{title}</span>
            {dateBadge ? (
              <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] font-normal">
                {dateBadge}
              </Badge>
            ) : null}
            <span className="text-muted-foreground">({count})</span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col overflow-hidden">
          <div className="space-y-1.5 p-1.5">
            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">None</p>
            ) : (
              tasks.map(renderTaskRow)
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function TaskDetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1.5 sm:flex-nowrap",
        className
      )}
    >
      <span className="w-[5.75rem] shrink-0 self-center text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground sm:w-24">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm leading-snug text-foreground">
        {children}
      </div>
    </div>
  );
}

function parseSseEvent(rawEvent: string): { event: string | null; data: any } {
  const lines = rawEvent.split("\n");
  let event: string | null = null;
  let data: any = null;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("event:")) event = trimmed.slice("event:".length).trim();
    if (trimmed.startsWith("data:")) {
      const payload = trimmed.slice("data:".length).trim();
      try {
        data = JSON.parse(payload);
      } catch {
        data = payload;
      }
    }
  }
  return { event, data };
}

async function fetchSseDeltas(url: string, init: RequestInit, onDelta: (delta: string) => void) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const { event, data } = parseSseEvent(frame);
      if (event === "assistant_output_delta") {
        const delta = (data?.delta as string | undefined) ?? "";
        if (delta) onDelta(delta);
      }
      if (event === "error") {
        const message = (data?.message as string | undefined) ?? "Backend SSE error";
        throw new Error(message);
      }
    }
  }
}

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<string>("overview");

  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [triggersLoading, setTriggersLoading] = useState(false);

  const [selectedJob, setSelectedJob] = useState<JobRecord | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const [triggerRunning, setTriggerRunning] = useState(false);
  const [triggerOutput, setTriggerOutput] = useState("");

  const [tasksData, setTasksData] = useState<TasksData | null>(null);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksRefreshing, setTasksRefreshing] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskEditContent, setTaskEditContent] = useState("");
  const [taskEditDue, setTaskEditDue] = useState("");
  const [taskActionError, setTaskActionError] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<TaskItem | null>(null);
  const [panelContent, setPanelContent] = useState("");
  const [panelDue, setPanelDue] = useState("");
  const [panelDescription, setPanelDescription] = useState("");
  const [panelPriority, setPanelPriority] = useState<number>(1);
  const [panelSaving, setPanelSaving] = useState(false);
  const [panelEditing, setPanelEditing] = useState(false);
  const [panelCreating, setPanelCreating] = useState(false);
  const [newTaskContext, setNewTaskContext] = useState<TaskContext>("personal");
  const [refineMessages, setRefineMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [refineInput, setRefineInput] = useState("");
  const [refineRunning, setRefineRunning] = useState(false);
  const [refineProposals, setRefineProposals] = useState<Proposal[]>([]);
  const [refineStreamingContent, setRefineStreamingContent] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatOutput, setChatOutput] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const [scheduleChatMessages, setScheduleChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [scheduleChatInput, setScheduleChatInput] = useState("");
  const [scheduleChatRunning, setScheduleChatRunning] = useState(false);
  const [scheduleChatError, setScheduleChatError] = useState<string | null>(null);
  const [scheduleChatStreaming, setScheduleChatStreaming] = useState("");
  const [scheduleChatProposals, setScheduleChatProposals] = useState<Proposal[]>([]);
  const [scheduleChatApplyError, setScheduleChatApplyError] = useState<string | null>(null);

  const [calendarEvents, setCalendarEvents] = useState<CalendarEventDto[]>([]);
  const [calendarConfigured, setCalendarConfigured] = useState<CalendarConfigured>({
    personal: false,
    work: false,
  });
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  /** Local calendar day for the Schedule (single-day) tab; default is today. */
  const [scheduleDayDate, setScheduleDayDate] = useState(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  });

  const shiftScheduleDay = useCallback((deltaDays: number) => {
    setScheduleDayDate((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + deltaDays));
  }, []);

  const refreshJobs = async () => {
    setJobsLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/jobs?status=pending`);
      const json = (await res.json()) as { jobs: JobRecord[] };
      setJobs(json.jobs ?? []);
    } finally {
      setJobsLoading(false);
    }
  };

  const refreshTriggers = async () => {
    setTriggersLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/triggers`);
      const json = (await res.json()) as { triggers: Trigger[] };
      setTriggers(json.triggers ?? []);
    } finally {
      setTriggersLoading(false);
    }
  };

  const tasksDataRef = useRef<TasksData | null>(null);
  useEffect(() => {
    tasksDataRef.current = tasksData;
  }, [tasksData]);

  const refreshTasks = useCallback(async () => {
    const isInitialLoad = tasksDataRef.current === null;
    if (isInitialLoad) setTasksLoading(true);
    else setTasksRefreshing(true);
    setTaskActionError(null);
    try {
      const res = await fetch(`${backendUrl}/api/tasks`);
      const json = (await res.json()) as TasksData;
      if (!res.ok) {
        setTasksData({
          overdue: [],
          dueToday: [],
          upcoming: [],
          error: (json as { error?: string }).error ?? "Failed to load tasks",
        });
        return;
      }
      setTasksData(json);
    } finally {
      setTasksLoading(false);
      setTasksRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "tasks" || activeTab === "schedule" || activeTab === "schedule-week") refreshTasks();
  }, [activeTab, refreshTasks]);

  useEffect(() => {
    if (activeTab !== "schedule-week") return;
    const { dayDates } = getNextSevenDayRange(new Date());
    const d0 = dayDates[0]!;
    const d6 = dayDates[6]!;
    const timeMin = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 0, 0, 0, 0);
    const timeMax = new Date(d6.getFullYear(), d6.getMonth(), d6.getDate(), 23, 59, 59, 999);

    const ac = new AbortController();
    setCalendarLoading(true);
    setCalendarError(null);
    const url = `${backendUrl}/api/calendar/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}`;
    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as {
          events?: CalendarEventDto[];
          configured?: CalendarConfigured;
          error?: string;
        };
        if (!res.ok) {
          setCalendarError(data.error ?? `HTTP ${res.status}`);
          setCalendarEvents([]);
          setCalendarConfigured({ personal: false, work: false });
          return;
        }
        setCalendarEvents(data.events ?? []);
        setCalendarConfigured(data.configured ?? { personal: false, work: false });
        if (data.error) setCalendarError(data.error);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setCalendarError(e instanceof Error ? e.message : String(e));
        setCalendarEvents([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCalendarLoading(false);
      });

    return () => ac.abort();
  }, [activeTab, backendUrl]);

  useEffect(() => {
    if (activeTab !== "schedule") return;
    const d = scheduleDayDate;
    const timeMin = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const timeMax = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    const ac = new AbortController();
    setCalendarLoading(true);
    setCalendarError(null);
    const url = `${backendUrl}/api/calendar/events?timeMin=${encodeURIComponent(timeMin.toISOString())}&timeMax=${encodeURIComponent(timeMax.toISOString())}`;
    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        const data = (await res.json()) as {
          events?: CalendarEventDto[];
          configured?: CalendarConfigured;
          error?: string;
        };
        if (!res.ok) {
          setCalendarError(data.error ?? `HTTP ${res.status}`);
          setCalendarEvents([]);
          setCalendarConfigured({ personal: false, work: false });
          return;
        }
        setCalendarEvents(data.events ?? []);
        setCalendarConfigured(data.configured ?? { personal: false, work: false });
        if (data.error) setCalendarError(data.error);
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setCalendarError(e instanceof Error ? e.message : String(e));
        setCalendarEvents([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setCalendarLoading(false);
      });

    return () => ac.abort();
  }, [activeTab, backendUrl, scheduleDayDate]);

  const scheduleSevenDayTasks = tasksDataTasksInNextSevenDays(tasksData);
  const scheduleDayTasks = tasksDataTasksForDateKey(tasksData, localDateStr(scheduleDayDate));
  const scheduleDayMarkdown = useMemo(() => {
    const dk = localDateStr(scheduleDayDate);
    const items = tasksDataTaskItemsForDateKey(tasksData, dk);
    return buildScheduleDayContextMarkdown(dk, scheduleDayDate, items, calendarEvents);
  }, [scheduleDayDate, tasksData, calendarEvents]);

  useEffect(() => {
    setScheduleChatMessages([]);
    setScheduleChatStreaming("");
    setScheduleChatError(null);
    setScheduleChatInput("");
    setScheduleChatProposals([]);
    setScheduleChatApplyError(null);
  }, [scheduleDayDate]);

  useEffect(() => {
    setRefineMessages([]);
    setRefineProposals([]);
    setRefineStreamingContent("");
  }, [selectedTask?.id, panelCreating]);

  const selectedTaskKey = selectedTask ? `${selectedTask.context}:${selectedTask.id}` : "";
  useEffect(() => {
    if (panelCreating) return;
    setPanelEditing(false);
    if (!selectedTask) {
      setPanelContent("");
      setPanelDue("");
      setPanelDescription("");
      setPanelPriority(1);
      return;
    }
    setPanelContent(selectedTask.content);
    setPanelDue(taskToInitialDueString(selectedTask));
    setPanelDescription(selectedTask.description ?? "");
    setPanelPriority(selectedTask.priority);
  }, [selectedTaskKey, selectedTask, panelCreating]);

  const startEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setTaskEditContent(task.content);
    setTaskEditDue(taskToInitialDueString(task));
    setTaskActionError(null);
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setTaskEditContent("");
    setTaskEditDue("");
    setTaskActionError(null);
  };

  const saveTask = async (
    taskId: string,
    context: TaskContext,
    options?: { keepEditing?: boolean }
  ) => {
    setTaskActionError(null);
    try {
      const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          content: taskEditContent.trim() || undefined,
          dueString: taskEditDue.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTaskActionError(json.error ?? "Update failed");
        return;
      }
      if (!options?.keepEditing) {
        cancelEditTask();
      }
      await refreshTasks();
      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return {
          ...prev,
          content: taskEditContent.trim() || prev.content,
          due_string: taskEditDue.trim() || prev.due_string,
        };
      });
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveSelectedTaskPanel = async () => {
    if (!selectedTask || panelSaving) return;
    setTaskActionError(null);
    setPanelSaving(true);
    const taskId = selectedTask.id;
    const context = selectedTask.context;
    try {
      const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          content: panelContent.trim() || undefined,
          dueString: panelDue.trim() || undefined,
          description: panelDescription.trim(),
          priority: panelPriority,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTaskActionError(json.error ?? "Update failed");
        return;
      }
      await refreshTasks();
      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId || prev.context !== context) return prev;
        return {
          ...prev,
          content: panelContent.trim() || prev.content,
          due_string: panelDue.trim() || prev.due_string,
          description: panelDescription.trim() || undefined,
          priority: panelPriority,
        };
      });
      setPanelEditing(false);
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPanelSaving(false);
    }
  };

  const resetPanelDraft = () => {
    if (!selectedTask) return;
    setPanelContent(selectedTask.content);
    setPanelDue(taskToInitialDueString(selectedTask));
    setPanelDescription(selectedTask.description ?? "");
    setPanelPriority(selectedTask.priority);
  };

  const cancelPanelEdit = () => {
    resetPanelDraft();
    setPanelEditing(false);
  };

  const startNewTask = () => {
    setSelectedTask(null);
    setPanelCreating(true);
    setPanelEditing(false);
    setPanelContent("");
    setPanelDue("");
    setPanelDescription("");
    setPanelPriority(1);
    setNewTaskContext("personal");
    setTaskActionError(null);
    setRefineMessages([]);
    setRefineProposals([]);
    setRefineStreamingContent("");
  };

  const cancelPanelCreate = () => {
    setPanelCreating(false);
    setTaskActionError(null);
  };

  const saveNewTask = async () => {
    if (!panelCreating || panelSaving) return;
    const content = panelContent.trim();
    if (!content) {
      setTaskActionError("Add a task title before creating.");
      return;
    }
    setTaskActionError(null);
    setPanelSaving(true);
    try {
      const res = await fetch(`${backendUrl}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: newTaskContext,
          content,
          dueString: panelDue.trim() || undefined,
          priority: panelPriority,
          description: panelDescription.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        id?: string;
        content?: string;
        priority?: number;
        description?: string;
      };
      if (!res.ok) {
        setTaskActionError(json.error ?? "Could not create task");
        return;
      }
      const id = json.id != null ? String(json.id) : null;
      if (!id) {
        setTaskActionError("Created task but response had no id. Refresh the list.");
        await refreshTasks();
        setPanelCreating(false);
        return;
      }
      await refreshTasks();
      setPanelCreating(false);
      setSelectedTask({
        id,
        content: json.content ?? content,
        context: newTaskContext,
        priority: typeof json.priority === "number" ? json.priority : panelPriority,
        description: json.description ?? (panelDescription.trim() || undefined),
        due_string: panelDue.trim() || undefined,
      });
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setPanelSaving(false);
    }
  };

  const completeTask = async (taskId: string, context: TaskContext) => {
    setTaskActionError(null);
    try {
      const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setTaskActionError(json.error ?? "Complete failed");
        return;
      }
      await refreshTasks();
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    refreshTriggers();
    refreshJobs();
    const t = window.setInterval(() => refreshJobs(), 5000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedJob) {
      const latest = jobs.find((j) => j.id === selectedJob.id) ?? null;
      setSelectedJob(latest);
    }
  }, [jobs]);

  const runTriggerPropose = async (triggerId: string) => {
    setTriggerRunning(true);
    setTriggerOutput("");
    setSelectedJob(null);
    try {
      await fetchSseDeltas(
        `${backendUrl}/api/triggers/${encodeURIComponent(triggerId)}/propose`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) },
        (delta) => setTriggerOutput((prev) => prev + delta)
      );
    } finally {
      setTriggerRunning(false);
      await refreshJobs();
    }
  };

  const runAssistantPropose = async () => {
    const message = chatInput.trim();
    if (!message) return;

    setChatRunning(true);
    setChatOutput("");
    setChatError(null);
    setSelectedJob(null);

    try {
      const res = await fetch("/api/assistant/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Assistant propose failed: ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) setChatOutput((prev) => prev + chunk);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatRunning(false);
      setChatInput("");
      await refreshJobs();
    }
  };

  const runScheduleDayAssistant = async () => {
    const message = scheduleChatInput.trim();
    if (!message) return;

    const dateKey = localDateStr(scheduleDayDate);
    const history = scheduleChatMessages.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    }));

    setScheduleChatMessages((prev) => [...prev, { role: "user", content: message }]);
    setScheduleChatInput("");
    setScheduleChatRunning(true);
    setScheduleChatStreaming("");
    setScheduleChatError(null);
    setScheduleChatProposals([]);
    setScheduleChatApplyError(null);
    setSelectedJob(null);

    try {
      const res = await fetch(`${backendUrl}/api/assistant/schedule-day`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          dateKey,
          scheduleMarkdown: scheduleDayMarkdown,
          history,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Schedule assistant failed: ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const { event, data } = parseSseEvent(frame);
          if (event === "assistant_output_delta") {
            const delta = (data?.delta as string | undefined) ?? "";
            fullText += delta;
            setScheduleChatStreaming((prev) => prev + delta);
          }
          if (event === "assistant_output_end") {
            setScheduleChatMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
            setScheduleChatStreaming("");
          }
          if (event === "proposals") {
            const list = (data?.proposals as Proposal[] | undefined) ?? [];
            setScheduleChatProposals(list);
          }
          if (event === "error") {
            throw new Error((data?.message as string) ?? "Backend error");
          }
        }
      }
    } catch (err) {
      setScheduleChatError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduleChatRunning(false);
      await refreshJobs();
    }
  };

  const applyScheduleChatProposal = async (p: Proposal) => {
    setScheduleChatApplyError(null);
    const raw = p.args as Record<string, unknown>;

    const readContext = (): TaskContext | undefined => {
      const c = raw.context as string | undefined;
      return c === "personal" || c === "work" ? c : undefined;
    };

    try {
      if (p.toolName === "todoist_update_task") {
        const taskId =
          (typeof raw.taskId === "string" ? raw.taskId : undefined) ??
          (typeof raw.task_id === "string" ? raw.task_id : undefined);
        if (!taskId) {
          setScheduleChatApplyError("Proposal is missing task id.");
          return;
        }
        const context = readContext();
        if (!context) {
          setScheduleChatApplyError("Proposal is missing context (personal or work).");
          return;
        }
        const content = typeof raw.content === "string" ? raw.content : undefined;
        const dueString =
          typeof raw.dueString === "string" ? raw.dueString : typeof raw.due_string === "string" ? raw.due_string : undefined;
        const priority = typeof raw.priority === "number" ? raw.priority : undefined;
        const description =
          raw.description === null ? null : typeof raw.description === "string" ? raw.description : undefined;
        const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context,
            ...(content != null && { content }),
            ...(dueString != null && { dueString }),
            ...(priority != null && { priority }),
            ...(description !== undefined && { description: description === null ? "" : description }),
          }),
        });
        if (!res.ok) throw new Error(await res.text().catch(() => "Update failed"));
        setScheduleChatProposals((prev) => prev.filter((x) => x.id !== p.id));
        await refreshTasks();
        setSelectedTask((prev) => {
          if (!prev || prev.id !== taskId) return prev;
          const nextDesc =
            description === undefined
              ? prev.description
              : description === null || description === ""
                ? undefined
                : description;
          return {
            ...prev,
            content: content ?? prev.content,
            due_string: dueString ?? prev.due_string,
            priority: priority ?? prev.priority,
            description: nextDesc,
          };
        });
        return;
      }

      if (p.toolName === "todoist_close_task") {
        const taskId = typeof raw.taskId === "string" ? raw.taskId : undefined;
        const context = readContext();
        if (!taskId || !context) {
          setScheduleChatApplyError("Proposal is missing task id or context.");
          return;
        }
        const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Complete failed");
        setScheduleChatProposals((prev) => prev.filter((x) => x.id !== p.id));
        await refreshTasks();
        return;
      }

      if (p.toolName === "todoist_add_task") {
        const context = readContext();
        const content = typeof raw.content === "string" ? raw.content.trim() : "";
        if (!context || !content) {
          setScheduleChatApplyError("Proposal is missing context or task content.");
          return;
        }
        const dueString =
          typeof raw.dueString === "string" ? raw.dueString : typeof raw.due_string === "string" ? raw.due_string : undefined;
        const priority = typeof raw.priority === "number" ? raw.priority : undefined;
        const description =
          raw.description === null ? undefined : typeof raw.description === "string" ? raw.description : undefined;
        const res = await fetch(`${backendUrl}/api/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context,
            content,
            ...(dueString != null && dueString !== "" && { dueString }),
            ...(priority != null && { priority }),
            ...(description != null && description !== "" && { description }),
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Create failed");
        setScheduleChatProposals((prev) => prev.filter((x) => x.id !== p.id));
        await refreshTasks();
        return;
      }

      setScheduleChatApplyError(
        `This action (${p.toolName}) must be run from the Overview approval queue or is not supported here.`
      );
    } catch (e) {
      setScheduleChatApplyError(e instanceof Error ? e.message : String(e));
    }
  };

  const approveAndExecute = async () => {
    if (!selectedJob) return;
    const approvedProposalIds = selectedJob.proposals.map((p) => p.id);
    await fetch(`${backendUrl}/api/jobs/${selectedJob.id}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedProposalIds }),
    }).catch(() => null);
    await refreshJobs();
  };

  const ANALYZE_TASK_MESSAGE =
    "Analyze this task and tell me what's missing or vague; propose updates and ask me questions so we can fill in all details.";

  const sendRefineMessage = async (messageOverride?: string) => {
    const message = (messageOverride ?? refineInput.trim()).trim();
    if (!message || !selectedTask) return;

    setRefineMessages((prev) => [...prev, { role: "user", content: message }]);
    setRefineRunning(true);
    setRefineStreamingContent("");
    if (!messageOverride) setRefineInput("");

    const history = refineMessages.map((m) => ({
      role: m.role === "user" ? "human" : "ai",
      content: m.content,
    }));

    try {
      const res = await fetch(`${backendUrl}/api/tasks/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: selectedTask, message, history }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        throw new Error(err || `Refine failed: ${res.status}`);
      }
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const { event, data } = parseSseEvent(frame);
          if (event === "assistant_output_delta") {
            const delta = (data?.delta as string | undefined) ?? "";
            fullText += delta;
            setRefineStreamingContent((prev) => prev + delta);
          }
          if (event === "assistant_output_end") {
            setRefineMessages((prev) => [...prev, { role: "assistant", content: fullText }]);
            setRefineStreamingContent("");
          }
          if (event === "proposals") {
            const list = (data?.proposals as Proposal[] | undefined) ?? [];
            setRefineProposals(list);
          }
          if (event === "error") {
            throw new Error((data?.message as string) ?? "Backend error");
          }
        }
      }
    } catch (err) {
      setRefineMessages((prev) => [
        ...prev,
        { role: "user", content: message },
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ]);
      setRefineStreamingContent("");
    } finally {
      setRefineRunning(false);
    }
  };

  const applyRefineProposal = async (p: Proposal) => {
    if (!selectedTask) return;
    const raw = p.args as Record<string, unknown>;
    const taskId = (typeof raw.taskId === "string" ? raw.taskId : typeof raw.task_id === "string" ? raw.task_id : undefined) ?? selectedTask.id;
    const context = (raw.context as TaskContext | undefined) ?? selectedTask.context;
    const content = typeof raw.content === "string" ? raw.content : undefined;
    const dueString =
      typeof raw.dueString === "string" ? raw.dueString : typeof raw.due_string === "string" ? raw.due_string : undefined;
    const priority = typeof raw.priority === "number" ? raw.priority : undefined;
    const description =
      raw.description === null ? null : typeof raw.description === "string" ? raw.description : undefined;
    try {
      const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          ...(content != null && { content }),
          ...(dueString != null && { dueString }),
          ...(priority != null && { priority }),
          ...(description !== undefined && { description: description === null ? "" : description }),
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Update failed"));
      setRefineProposals((prev) => prev.filter((x) => x.id !== p.id));
      await refreshTasks();
      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        const nextDesc =
          description === undefined
            ? prev.description
            : description === null || description === ""
              ? undefined
              : description;
        return {
          ...prev,
          content: content ?? prev.content,
          due_string: dueString ?? prev.due_string,
          priority: priority ?? prev.priority,
          description: nextDesc,
        };
      });
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderTaskRow = (task: TaskItem) => {
    const isEditing = editingTaskId === task.id;
    if (isEditing) {
      return (
        <div
          key={`${task.context}-${task.id}`}
          className="flex items-start gap-1.5 rounded-md border border-border bg-card p-1.5 text-card-foreground"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <textarea
              value={taskEditContent}
              onChange={(e) => setTaskEditContent(e.target.value)}
              placeholder="Task name"
              rows={2}
              className="field-sizing-content min-h-[2.25rem] w-full resize-y rounded-md border border-input bg-background px-1.5 py-1 text-[11px] leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <TaskDuePicker
              value={taskEditDue}
              onChange={setTaskEditDue}
              onPopoverClose={() => {
                void saveTask(task.id, task.context, { keepEditing: true });
              }}
            />
          </div>
          <div className="flex shrink-0 flex-col gap-0.5 pt-0.5" onClick={(e) => e.stopPropagation()}>
            <Button
              type="button"
              size="icon-xs"
              className="shrink-0"
              aria-label="Save task"
              title="Save"
              onClick={() => saveTask(task.id, task.context)}
            >
              <CheckIcon className="size-3" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className="shrink-0"
              aria-label="Cancel editing"
              title="Cancel"
              onClick={cancelEditTask}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        </div>
      );
    }
    const dueLabel = formatDueForDisplay(task);
    const isSelected = selectedTask?.id === task.id && selectedTask?.context === task.context;
    return (
      <div
        key={`${task.context}-${task.id}`}
        role="button"
        tabIndex={0}
        onClick={() => {
          setSelectedTask(task);
          setPanelCreating(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setSelectedTask(task);
            setPanelCreating(false);
          }
        }}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-card-foreground transition-colors",
          isSelected
            ? "border-primary/55 bg-primary/[0.09] ring-1 ring-primary/20"
            : "border-border bg-card hover:bg-muted/60"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="truncate text-xs font-medium leading-tight">{task.content}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
              <CalendarIcon className="mr-0.5 size-2.5" />
              {dueLabel}
            </Badge>
          </div>
        </div>
        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7 shrink-0"
            aria-label="Edit task"
            title="Edit"
            onClick={() => startEditTask(task)}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            aria-label="Complete task"
            title="Complete"
            onClick={() => completeTask(task.id, task.context)}
          >
            <CheckIcon className="size-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  const scheduleTabsFillHeight =
    activeTab === "tasks" || activeTab === "schedule" || activeTab === "schedule-week";

  return (
    <div
      className={cn(
        "w-full px-6 pt-6 pb-4 lg:px-10",
        scheduleTabsFillHeight && "flex h-screen min-h-0 flex-col overflow-hidden"
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(v) => v != null && setActiveTab(v)}
        className={cn("w-full", scheduleTabsFillHeight && "flex min-h-0 flex-1 flex-col")}
      >
        <div className="mb-2 flex min-h-11 shrink-0 items-center justify-between gap-4 border-b border-border">
          <TabsList variant="line" className="mb-0 w-fit shrink-0 border-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
            <TabsTrigger value="schedule-week">Next 7 days</TabsTrigger>
          </TabsList>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {activeTab === "tasks" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={startNewTask}
                >
                  <PlusIcon className="size-3" aria-hidden />
                  New
                </Button>
                {panelCreating ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={cancelPanelCreate}
                  >
                    Cancel
                  </Button>
                ) : null}
                {selectedTask && panelEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={cancelPanelEdit}
                  >
                    Cancel
                  </Button>
                ) : null}
                {selectedTask && !panelCreating && !panelEditing ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setPanelEditing(true)}
                  >
                    <PencilIcon className="size-3" aria-hidden />
                    Edit
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <TabsContent value="tasks" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 flex-1 rounded-lg border border-border bg-muted/35 shadow-sm shadow-black/[0.07] ring-1 ring-black/[0.04] dark:border-border/60 dark:bg-muted/15 dark:shadow-none dark:ring-0"
          >
            <ResizablePanel id="tasks-list" defaultSize={32} minSize={18} className="min-w-0">
              <Card className="flex h-full min-h-0 flex-col gap-3 rounded-none border-0 bg-transparent py-0 shadow-sm shadow-black/[0.05] ring-1 ring-border/50 dark:shadow-none dark:ring-0">
              <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                <div className="shrink-0 space-y-2">
                  {tasksRefreshing ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 shrink-0 animate-spin" aria-label="Updating tasks" />
                      <span>Updating tasks…</span>
                    </div>
                  ) : null}
                  {tasksLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2Icon className="size-4 animate-spin shrink-0" aria-hidden />
                      <span>Loading tasks...</span>
                    </div>
                  ) : null}
                  {tasksData?.error ? (
                    <p className="text-sm text-destructive">{tasksData.error}</p>
                  ) : null}
                  {taskActionError ? (
                    <p className="text-sm text-destructive">{taskActionError}</p>
                  ) : null}
                </div>
                {!tasksLoading && tasksData && !tasksData.error ? (
                  (() => {
                    const { tomorrow, thisWeek, future } = splitUpcoming(tasksData.upcoming);
                    const overdueSorted = [...tasksData.overdue].sort(compareTasksByDue);
                    const dueTodaySorted = [...tasksData.dueToday].sort(compareTasksByDue);
                    const today = new Date();
                    const todayLabel = formatGroupHeaderDate(today);
                    const tomorrowDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                    const tomorrowLabel = formatGroupHeaderDate(tomorrowDate);
                    const weekMonday = startOfWeekMonday(today);
                    const weekSunday = endOfWeekSunday(today);
                    const thisWeekLabel = `${formatGroupHeaderDate(weekMonday)} – ${formatGroupHeaderDate(weekSunday)}`;
                    const endOfWeekLabel = formatGroupHeaderDate(weekSunday);
                    return (
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <ScrollArea className="flex-1 min-h-0">
                          <div className="flex flex-col gap-2 pb-1 pr-4">
                            <TasksSection
                              title="Overdue"
                              dateBadge={`< ${todayLabel}`}
                              count={overdueSorted.length}
                              tasks={overdueSorted}
                              defaultOpen={overdueSorted.length > 0}
                              renderTaskRow={renderTaskRow}
                            />
                            <TasksSection
                              title="Today"
                              dateBadge={todayLabel}
                              count={dueTodaySorted.length}
                              tasks={dueTodaySorted}
                              defaultOpen={dueTodaySorted.length > 0}
                              renderTaskRow={renderTaskRow}
                            />
                            <TasksSection
                              title="Tomorrow"
                              dateBadge={tomorrowLabel}
                              count={tomorrow.length}
                              tasks={tomorrow}
                              defaultOpen={tomorrow.length > 0}
                              renderTaskRow={renderTaskRow}
                            />
                            <TasksSection
                              title="This week"
                              dateBadge={thisWeekLabel}
                              count={thisWeek.length}
                              tasks={thisWeek}
                              defaultOpen={thisWeek.length > 0}
                              renderTaskRow={renderTaskRow}
                            />
                            <TasksSection
                              title="Future"
                              dateBadge={`> ${endOfWeekLabel}`}
                              count={future.length}
                              tasks={future}
                              defaultOpen={future.length > 0}
                              renderTaskRow={renderTaskRow}
                            />
                          </div>
                        </ScrollArea>
                      </div>
                    );
                  })()
                ) : null}
              </CardContent>
            </Card>
            </ResizablePanel>
            <ResizableHandle withHandle className="w-2 max-w-2 shrink-0 bg-border/70" />
            <ResizablePanel id="tasks-detail" defaultSize={68} minSize={25} className="min-w-0">
            <Card className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-none border-0 bg-transparent py-0 shadow-sm shadow-black/[0.05] ring-1 ring-border/50 dark:shadow-none dark:ring-0">
              <CardContent
                className={cn(
                  "flex min-h-0 flex-1 flex-col gap-3 p-4",
                  (selectedTask || panelCreating) && "overflow-hidden"
                )}
              >
                {selectedTask || panelCreating ? (
                  <>
                    {/* Border on outer shell; only description scrolls inside */}
                    <div className="flex max-h-[50%] min-h-0 shrink-0 flex-col overflow-hidden rounded-md border border-border bg-muted/30 shadow-sm ring-1 ring-border/40">
                      <div className="shrink-0 space-y-3 p-3 pb-2">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-x-6 md:gap-y-3 md:items-start">
                          <TaskDetailRow label="Task ID">
                            {panelCreating ? (
                              <span className="text-sm text-muted-foreground">—</span>
                            ) : (
                              <Badge
                                variant="outline"
                                title="Task ID cannot be edited"
                                className="inline-flex h-auto min-h-7 w-fit max-w-full items-center justify-start rounded-md px-2.5 py-1 font-mono text-xs font-normal leading-snug text-foreground whitespace-normal break-all [overflow-wrap:anywhere]"
                              >
                                {selectedTask!.id}
                              </Badge>
                            )}
                          </TaskDetailRow>
                          <TaskDetailRow label="Context">
                            {panelCreating ? (
                              <div className="flex flex-wrap gap-1">
                                {(["personal", "work"] as const).map((ctx) => (
                                  <Button
                                    key={ctx}
                                    type="button"
                                    size="xs"
                                    variant="outline"
                                    className={cn(
                                      "h-7 rounded-full border px-2.5 text-xs font-semibold capitalize transition-colors",
                                      newTaskContext === ctx
                                        ? "border-primary bg-primary/15 text-foreground shadow-sm ring-2 ring-primary/25"
                                        : "border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted"
                                    )}
                                    onClick={() => setNewTaskContext(ctx)}
                                  >
                                    {ctx}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <Badge
                                variant="outline"
                                className="inline-flex h-7 w-fit shrink-0 items-center px-2.5 py-0 text-sm font-medium capitalize leading-none rounded-md"
                              >
                                {selectedTask!.context}
                              </Badge>
                            )}
                          </TaskDetailRow>
                          {panelEditing || panelCreating ? (
                            <>
                              <TaskDetailRow label="Due">
                                <TaskDuePicker
                                  value={panelDue}
                                  onChange={setPanelDue}
                                  className="max-w-full"
                                  comfortableTrigger
                                />
                              </TaskDetailRow>
                              <TaskDetailRow label="Priority">
                                <div className="flex flex-wrap gap-1">
                                  {([1, 2, 3, 4] as const).map((p) => (
                                    <Button
                                      key={p}
                                      type="button"
                                      size="xs"
                                      variant="outline"
                                      className={cn(
                                        "h-7 rounded-full border px-2.5 text-xs font-semibold transition-colors",
                                        panelPriority === p ? PRIORITY_TOGGLE_ON[p] : PRIORITY_TOGGLE_OFF[p]
                                      )}
                                      onClick={() => setPanelPriority(p)}
                                    >
                                      {p} · {PRIORITY_LABELS[p]}
                                    </Button>
                                  ))}
                                </div>
                              </TaskDetailRow>
                              <TaskDetailRow label="Content" className="md:col-span-2">
                                <textarea
                                  value={panelContent}
                                  onChange={(e) => setPanelContent(e.target.value)}
                                  rows={3}
                                  className="field-sizing-content min-h-[4rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-snug outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                                  placeholder="Task title"
                                />
                              </TaskDetailRow>
                            </>
                          ) : (
                            <>
                              <TaskDetailRow label="Due">
                                <Badge
                                  variant="outline"
                                  className="inline-flex h-7 w-fit shrink-0 items-center gap-1.5 rounded-md px-2.5 py-0 text-sm font-normal leading-none"
                                >
                                  <CalendarIcon className="size-3.5 shrink-0 opacity-80" />
                                  {formatDueForDisplay(selectedTask!)}
                                </Badge>
                              </TaskDetailRow>
                              <TaskDetailRow label="Priority">
                                <PriorityBadge priority={selectedTask!.priority} />
                              </TaskDetailRow>
                              <TaskDetailRow label="Content" className="md:col-span-2">
                                <p className="whitespace-pre-wrap text-sm font-normal leading-snug text-foreground">
                                  {selectedTask!.content}
                                </p>
                              </TaskDetailRow>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-border/50 px-3 py-2">
                        {/* items-stretch so the value column gets a bounded height; label uses self-start */}
                        <div className="flex min-h-0 min-w-0 flex-1 flex-row gap-x-2 gap-y-1.5">
                          <span className="w-[5.75rem] shrink-0 self-start pt-0.5 text-xs font-semibold uppercase leading-none tracking-wide text-muted-foreground sm:w-24">
                            Description
                          </span>
                          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                            {panelEditing || panelCreating ? (
                              <textarea
                                value={panelDescription}
                                onChange={(e) => setPanelDescription(e.target.value)}
                                rows={6}
                                className="min-h-[8rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm leading-snug outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                                placeholder="Optional — markdown supported in Todoist"
                              />
                            ) : selectedTask!.description ? (
                              <div className="min-w-0 max-w-full text-sm font-normal leading-snug text-foreground [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:first:mt-0 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5">
                                <MessageResponse>{selectedTask!.description}</MessageResponse>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No description</p>
                            )}
                          </div>
                        </div>
                      </div>
                      {panelCreating ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/80 px-3 py-3">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={panelSaving}
                            onClick={() => void saveNewTask()}
                          >
                            {panelSaving ? (
                              <>
                                <Loader2Icon className="mr-1 size-3.5 animate-spin" aria-hidden />
                                Creating…
                              </>
                            ) : (
                              "Create task"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={panelSaving}
                            onClick={cancelPanelCreate}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : panelEditing ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/80 px-3 py-3">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={panelSaving}
                            onClick={() => void saveSelectedTaskPanel()}
                          >
                            {panelSaving ? (
                              <>
                                <Loader2Icon className="mr-1 size-3.5 animate-spin" aria-hidden />
                                Saving…
                              </>
                            ) : (
                              "Save changes"
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={panelSaving}
                            onClick={cancelPanelEdit}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {!panelCreating ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm ring-1 ring-border/40">
                      <Conversation className="min-h-0 flex-1 overflow-y-auto">
                        <ConversationContent className="gap-4 p-3">
                          {refineMessages.length === 0 && !refineStreamingContent ? (
                            <div className="flex flex-col items-center gap-3">
                              <ConversationEmptyState
                                icon={<MessageSquare className="size-12 text-muted-foreground" />}
                                title="Refine this task"
                                description=""
                              />
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                className="w-fit"
                                disabled={refineRunning}
                                onClick={() => sendRefineMessage(ANALYZE_TASK_MESSAGE)}
                              >
                                Analyze task
                              </Button>
                            </div>
                          ) : null}
                          {refineMessages.map((m, i) => (
                            <Message key={i} from={m.role}>
                              <MessageContent>
                                <MessageResponse>{m.content}</MessageResponse>
                              </MessageContent>
                            </Message>
                          ))}
                          {refineStreamingContent ? (
                            <Message from="assistant">
                              <MessageContent>
                                <MessageResponse>{refineStreamingContent}</MessageResponse>
                              </MessageContent>
                            </Message>
                          ) : null}
                          {refineRunning && !refineStreamingContent ? (
                            <Message from="assistant">
                              <MessageContent>
                                <div
                                  className="flex items-center gap-2 text-sm text-muted-foreground"
                                  role="status"
                                  aria-live="polite"
                                  aria-label="Assistant is responding"
                                >
                                  <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                                  <span>Thinking…</span>
                                </div>
                              </MessageContent>
                            </Message>
                          ) : null}
                        </ConversationContent>
                        <ConversationScrollButton />
                      </Conversation>
                    </div>
                    {refineProposals.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Suggested updates</p>
                        {refineProposals.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 p-2 text-xs"
                          >
                            <span className="truncate font-mono">{p.toolName}</span>
                            <Button size="sm" variant="default" onClick={() => applyRefineProposal(p)}>
                              Apply
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendRefineMessage();
                      }}
                      className="flex shrink-0 gap-2"
                    >
                      <Input
                        value={refineInput}
                        onChange={(e) => setRefineInput(e.target.value)}
                        placeholder="Ask for context or suggest improvements..."
                        className="flex-1 bg-background"
                        disabled={refineRunning}
                      />
                      <SpeechInput
                        onTranscriptionChange={(text) => setRefineInput((prev) => (prev ? `${prev} ${text}` : text))}
                        disabled={refineRunning}
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Voice input"
                        title="Voice input"
                      />
                      <Button type="submit" disabled={refineRunning || !refineInput.trim()}>
                        {refineRunning ? "..." : "Send"}
                      </Button>
                    </form>
                    </div>
                    ) : (
                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
                      <MessageSquare className="size-10 text-muted-foreground opacity-80" />
                      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                        Create the task above, then you can refine it with the assistant here.
                      </p>
                    </div>
                    )}
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border bg-muted/20 p-6 text-center">
                    <MessageSquare className="size-12 text-muted-foreground opacity-60" aria-hidden />
                    <span className="sr-only">No task selected</span>
                  </div>
                )}
              </CardContent>
            </Card>
            </ResizablePanel>
          </ResizablePanelGroup>
        </TabsContent>

        <TabsContent value="schedule" className="mt-0 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            <div className="shrink-0 space-y-2">
              {tasksRefreshing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 shrink-0 animate-spin" aria-label="Updating tasks" />
                  <span>Updating tasks…</span>
                </div>
              ) : null}
              {tasksLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                  <span>Loading tasks...</span>
                </div>
              ) : null}
              {tasksData?.error ? (
                <p className="text-sm text-destructive">{tasksData.error}</p>
              ) : null}
            </div>
            {!tasksLoading && tasksData && !tasksData.error ? (
              <ResizablePanelGroup
                orientation="horizontal"
                className="min-h-0 flex-1 rounded-lg border border-border bg-muted/35 shadow-sm shadow-black/[0.07] ring-1 ring-black/[0.04] dark:border-border/60 dark:bg-muted/15 dark:shadow-none dark:ring-0"
              >
                <ResizablePanel defaultSize={50} minSize={25} className="min-h-0 min-w-0">
                  <ScheduleOneDayView
                    className="min-h-0 h-full"
                    dayDate={scheduleDayDate}
                    onPrevDay={() => shiftScheduleDay(-1)}
                    onNextDay={() => shiftScheduleDay(1)}
                    tasks={scheduleDayTasks}
                    calendarEvents={calendarEvents}
                    calendarLoading={calendarLoading}
                    calendarError={calendarError}
                    onAddTask={() => {
                      setActiveTab("tasks");
                      startNewTask();
                    }}
                    onSelectTask={(t) => {
                      setActiveTab("tasks");
                      setPanelCreating(false);
                      setSelectedTask(t as TaskItem);
                    }}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={50} minSize={25} className="min-h-0 min-w-0">
                  <Card className="flex h-full min-h-0 flex-col gap-0 rounded-none border-0 bg-transparent py-0 shadow-none ring-0">
                    <CardHeader className="shrink-0 px-4 pb-2 pt-3">
                      <CardTitle className="text-sm">Day assistant</CardTitle>
                    </CardHeader>
                    <CardContent className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-4 pb-4 pt-0">
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm ring-1 ring-border/40">
                        <Conversation className="min-h-0 flex-1 overflow-y-auto">
                          <ConversationContent className="gap-4 p-3">
                            {scheduleChatMessages.length === 0 && !scheduleChatStreaming ? (
                              <ConversationEmptyState
                                icon={<MessageSquare className="size-10 text-muted-foreground" />}
                                title="Ask about this day"
                                description="Questions use the full task and calendar snapshot for the selected date."
                              />
                            ) : null}
                            {scheduleChatMessages.map((m, i) => (
                              <Message key={i} from={m.role}>
                                <MessageContent>
                                  <MessageResponse>{m.content}</MessageResponse>
                                </MessageContent>
                              </Message>
                            ))}
                            {scheduleChatStreaming ? (
                              <Message from="assistant">
                                <MessageContent>
                                  <MessageResponse>{scheduleChatStreaming}</MessageResponse>
                                </MessageContent>
                              </Message>
                            ) : null}
                            {scheduleChatRunning && !scheduleChatStreaming ? (
                              <Message from="assistant">
                                <MessageContent>
                                  <div
                                    className="flex items-center gap-2 text-sm text-muted-foreground"
                                    role="status"
                                    aria-live="polite"
                                    aria-label="Assistant is responding"
                                  >
                                    <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                                    <span>Thinking…</span>
                                  </div>
                                </MessageContent>
                              </Message>
                            ) : null}
                          </ConversationContent>
                          <ConversationScrollButton />
                        </Conversation>
                      </div>
                      {scheduleChatProposals.length > 0 ? (
                        <div className="max-h-36 shrink-0 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/25 p-2">
                          <p className="text-xs font-medium text-muted-foreground">Suggested task actions</p>
                          {scheduleChatProposals.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card/80 p-2 text-xs"
                            >
                              <span className="min-w-0 truncate font-mono" title={JSON.stringify(p.args)}>
                                {p.toolName}
                              </span>
                              <Button
                                size="sm"
                                variant="default"
                                className="shrink-0"
                                onClick={() => void applyScheduleChatProposal(p)}
                              >
                                Apply
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {scheduleChatApplyError ? (
                        <p className="shrink-0 text-xs text-destructive">{scheduleChatApplyError}</p>
                      ) : null}
                      {scheduleChatError ? (
                        <p className="shrink-0 text-xs text-destructive">Error: {scheduleChatError}</p>
                      ) : null}
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void runScheduleDayAssistant();
                        }}
                        className="flex shrink-0 gap-2"
                      >
                        <Input
                          value={scheduleChatInput}
                          onChange={(e) => setScheduleChatInput(e.target.value)}
                          placeholder="Ask about tasks or events on this day…"
                          className="min-w-0 flex-1 bg-background"
                          disabled={scheduleChatRunning}
                        />
                        <Button
                          type="submit"
                          disabled={scheduleChatRunning || !scheduleChatInput.trim()}
                          size="sm"
                          className="shrink-0"
                        >
                          {scheduleChatRunning ? "…" : "Send"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </ResizablePanel>
              </ResizablePanelGroup>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="schedule-week" className="mt-0 flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            <div className="shrink-0 space-y-2">
              {tasksRefreshing ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 shrink-0 animate-spin" aria-label="Updating tasks" />
                  <span>Updating tasks…</span>
                </div>
              ) : null}
              {tasksLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2Icon className="size-4 shrink-0 animate-spin" aria-hidden />
                  <span>Loading tasks...</span>
                </div>
              ) : null}
              {tasksData?.error ? (
                <p className="text-sm text-destructive">{tasksData.error}</p>
              ) : null}
            </div>
            {!tasksLoading && tasksData && !tasksData.error ? (
              <ScheduleSevenDayView
                className="min-h-0 flex-1"
                tasks={scheduleSevenDayTasks}
                calendarEvents={calendarEvents}
                calendarLoading={calendarLoading}
                calendarError={calendarError}
                calendarConfigured={calendarConfigured}
                onAddTask={() => {
                  setActiveTab("tasks");
                  startNewTask();
                }}
                onSelectTask={(t) => {
                  setActiveTab("tasks");
                  setPanelCreating(false);
                  setSelectedTask(t as TaskItem);
                }}
              />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="overview" className="mt-0 w-full min-w-0">
          <div className="grid min-w-0 gap-6 md:grid-cols-[1.2fr_0.9fr]">
            <Card className="flex min-w-0 flex-col overflow-hidden">
              <CardHeader>
                <CardTitle>Assistant Chat</CardTitle>
              </CardHeader>
              <CardContent className="relative flex flex-1 flex-col p-0">
                <div className="flex min-h-[500px] flex-col rounded-lg border border-border bg-card p-6">
                  <Conversation className="min-h-0 flex-1 overflow-y-auto">
                    <ConversationContent className="gap-8 p-0">
                      {!chatOutput ? (
                        <ConversationEmptyState
                          icon={<MessageSquare className="size-12 text-muted-foreground" />}
                          title="Start a conversation"
                          description="Type a message below to begin chatting"
                        />
                      ) : (
                        <Message from="assistant">
                          <MessageContent>
                            <MessageResponse>{chatOutput}</MessageResponse>
                          </MessageContent>
                        </Message>
                      )}
                    </ConversationContent>
                    <ConversationScrollButton />
                  </Conversation>

                  {chatError ? (
                    <p className="mt-2 text-sm text-destructive">Error: {chatError}</p>
                  ) : null}

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runAssistantPropose().catch(() => null);
                    }}
                    className="relative mt-4 w-full min-w-0"
                  >
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      disabled={chatRunning}
                      placeholder='Ask: "What tasks are due today?"'
                      className="min-h-[52px] w-full resize-none rounded-lg border border-input bg-background px-4 py-3 pr-12 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      rows={1}
                    />
                    <Button
                      type="submit"
                      disabled={chatRunning || !chatInput.trim()}
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-1 right-1 size-9 rounded-md bg-muted text-foreground hover:bg-muted/80"
                    >
                      {chatRunning ? (
                        <span className="text-xs">...</span>
                      ) : (
                        <ArrowUpIcon className="size-4" />
                      )}
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Approval Queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {jobsLoading ? "Loading..." : `${jobs.length} pending job(s)`}
                </p>
                {jobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending jobs.</p>
                ) : null}

                <div className="flex flex-col gap-2">
                  {jobs.map((job) => {
                    const isSelected = selectedJob?.id === job.id;
                    return (
                      <Button
                        key={job.id}
                        variant={isSelected ? "secondary" : "outline"}
                        className="h-auto flex-col items-start gap-1 text-left"
                        onClick={() => setSelectedJob(job)}
                      >
                        <span className="font-semibold">{job.type}</span>
                        <span className="font-mono text-xs opacity-80">{job.id}</span>
                        {job.outputText ? (
                          <span className="line-clamp-2 text-xs">
                            {job.outputText.slice(0, 120)}
                            {job.outputText.length > 120 ? "…" : ""}
                          </span>
                        ) : null}
                      </Button>
                    );
                  })}
                </div>

                {selectedJob ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Selected job proposals</p>
                    <div className="flex flex-col gap-2">
                      {selectedJob.proposals.map((p) => (
                        <div
                          key={p.id}
                          className="rounded-lg border border-border bg-muted/30 p-3 font-mono text-xs"
                        >
                          <div className="font-semibold">{p.toolName}</div>
                          <div className="opacity-80">{p.id}</div>
                          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(p.args, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                    <Button
                      onClick={approveAndExecute}
                      disabled={selectedJob.proposals.length === 0}
                    >
                      Execute approved writes
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-4 min-w-0">
            <CardHeader>
              <CardTitle>Trigger Runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {triggersLoading ? (
                <p className="text-sm text-muted-foreground">Loading triggers...</p>
              ) : null}

              <div className="flex flex-col gap-2">
                {triggers.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border py-2"
                  >
                    <div>
                      <div className="font-semibold">{t.id}</div>
                      <div className="text-sm text-muted-foreground">
                        {t.schedule ? `schedule: ${t.schedule}` : "on-demand"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={triggerRunning}
                      onClick={() => runTriggerPropose(t.id)}
                    >
                      {triggerRunning ? "Running..." : "Run propose"}
                    </Button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Trigger output (streamed)</p>
                <div className="min-h-[180px] resize-y overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 font-mono text-sm">
                  {triggerOutput || "\u00a0"}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
