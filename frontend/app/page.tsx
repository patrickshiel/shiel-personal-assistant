"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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
import { ArrowUpIcon, CalendarIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, Loader2Icon, MessageSquare, PencilIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";

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

/** Format due for display: date + time when available, else date only (optionally note no time). */
function formatDueForDisplay(task: TaskItem): string {
  const due = task.due;
  const dateStr = due?.date ?? task.due_string ?? "";
  if (!dateStr) return "—";
  const datetime = due && "datetime" in due ? (due as { datetime?: string }).datetime : undefined;
  if (datetime) {
    try {
      const d = new Date(datetime);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      return `${dateStr.slice(0, 10)} ${String(datetime).slice(11, 16)}`;
    }
  }
  // Fallback: parse due_string (or date string) when it contains a time (e.g. "2026-03-18 14:00" or ISO)
  const strToParse = task.due_string ?? dateStr;
  const hasTimeInString =
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(strToParse) || /\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(strToParse);
  if (hasTimeInString) {
    try {
      const d = new Date(strToParse);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
    } catch {
      // fall through to date only
    }
  }
  const dateOnly = dateStr.slice(0, 10);
  return dateOnly ? `${dateOnly} (no time)` : dateStr;
}

function dueDateOnly(task: TaskItem): string {
  const d = task.due?.date ?? task.due_string ?? "";
  if (!d) return "";
  return d.slice(0, 10);
}

function splitUpcoming(upcoming: TaskItem[]): {
  nextThreeDays: TaskItem[];
  greaterThanThreeDays: TaskItem[];
} {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const end = new Date(today);
  end.setDate(end.getDate() + 3);
  const nextThreeDaysEnd = end.toISOString().slice(0, 10);

  const nextThreeDays: TaskItem[] = [];
  const greaterThanThreeDays: TaskItem[] = [];

  for (const task of upcoming) {
    const due = dueDateOnly(task);
    if (!due) {
      greaterThanThreeDays.push(task);
      continue;
    }
    if (due <= nextThreeDaysEnd) nextThreeDays.push(task);
    else greaterThanThreeDays.push(task);
  }

  const byDue = (a: TaskItem, b: TaskItem) =>
    dueDateOnly(a).localeCompare(dueDateOnly(b));
  nextThreeDays.sort(byDue);
  greaterThanThreeDays.sort(byDue);

  return { nextThreeDays, greaterThanThreeDays };
}

function TasksSection({
  title,
  count,
  tasks,
  defaultOpen = true,
  open,
  onOpenChange,
  renderTaskRow,
}: {
  title: string;
  count: number;
  tasks: TaskItem[];
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderTaskRow: (task: TaskItem) => ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <Collapsible
        defaultOpen={defaultOpen}
        {...(open !== undefined && onOpenChange ? { open, onOpenChange } : {})}
        className="flex h-full min-h-0 flex-col"
      >
        <CollapsibleTrigger className="group flex shrink-0 items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-left text-sm font-medium hover:bg-muted/80">
          <ChevronDownIcon className="size-4 shrink-0 hidden group-data-[panel-open]:block" />
          <ChevronRightIcon className="size-4 shrink-0 block group-data-[panel-open]:hidden" />
          {title} ({count})
        </CollapsibleTrigger>
        <CollapsibleContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden">
            <ScrollArea className="h-full min-h-[60px]">
              <div className="space-y-1.5 p-1.5">
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">None</p>
                ) : (
                  tasks.map(renderTaskRow)
                )}
              </div>
            </ScrollArea>
          </div>
        </CollapsibleContent>
      </Collapsible>
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
  const [refineMessages, setRefineMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [refineInput, setRefineInput] = useState("");
  const [refineRunning, setRefineRunning] = useState(false);
  const [refineProposals, setRefineProposals] = useState<Proposal[]>([]);
  const [refineStreamingContent, setRefineStreamingContent] = useState("");
  const [greaterThanThreeDaysOpen, setGreaterThanThreeDaysOpen] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatOutput, setChatOutput] = useState("");
  const [chatRunning, setChatRunning] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

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
    if (activeTab === "tasks") refreshTasks();
  }, [activeTab, refreshTasks]);

  useEffect(() => {
    setRefineMessages([]);
    setRefineProposals([]);
    setRefineStreamingContent("");
  }, [selectedTask?.id]);

  const startEditTask = (task: TaskItem) => {
    setEditingTaskId(task.id);
    setTaskEditContent(task.content);
    setTaskEditDue(task.due?.date ?? task.due_string ?? "");
    setTaskActionError(null);
  };

  const cancelEditTask = () => {
    setEditingTaskId(null);
    setTaskEditContent("");
    setTaskEditDue("");
    setTaskActionError(null);
  };

  const saveTask = async (taskId: string, context: TaskContext) => {
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
      cancelEditTask();
      await refreshTasks();
    } catch (e) {
      setTaskActionError(e instanceof Error ? e.message : String(e));
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
    const args = p.args as { context?: TaskContext; taskId?: string; content?: string; dueString?: string; priority?: number };
    const taskId = args?.taskId ?? selectedTask.id;
    const context = (args?.context as TaskContext) ?? selectedTask.context;
    try {
      const res = await fetch(`${backendUrl}/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context,
          ...(args?.content != null && { content: args.content }),
          ...(args?.dueString != null && { dueString: args.dueString }),
          ...(args?.priority != null && { priority: args.priority }),
        }),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => "Update failed"));
      setRefineProposals((prev) => prev.filter((x) => x.id !== p.id));
      await refreshTasks();
      setSelectedTask((prev) => {
        if (!prev || prev.id !== taskId) return prev;
        return {
          ...prev,
          content: args?.content ?? prev.content,
          due_string: args?.dueString ?? prev.due_string,
          priority: args?.priority ?? prev.priority,
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
          className="flex items-center gap-2 rounded-md border border-border bg-card p-2 text-card-foreground"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Input
              value={taskEditContent}
              onChange={(e) => setTaskEditContent(e.target.value)}
              placeholder="Task content"
              className="h-8 bg-background text-xs"
            />
            <Input
              value={taskEditDue}
              onChange={(e) => setTaskEditDue(e.target.value)}
              placeholder="Due (e.g. today, 2025-03-20)"
              className="h-8 bg-background text-xs"
            />
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={() => saveTask(task.id, task.context)}>
              Save
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={cancelEditTask}>
              Cancel
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
        onClick={() => setSelectedTask(task)}
        onKeyDown={(e) => e.key === "Enter" && setSelectedTask(task)}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-card-foreground transition-colors",
          isSelected ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted/50"
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

  return (
    <div className={cn(activeTab === "tasks" ? "mx-auto w-full max-w-7xl px-4" : "container")}>
      <Tabs value={activeTab} onValueChange={(v) => v != null && setActiveTab(v)} className="w-full">
        <TabsList variant="line" className="mb-5 w-fit">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-0 h-[calc(100vh-8rem)]">
          <div className="grid h-full gap-4 md:grid-cols-[1fr_2fr]">
            <Card className="flex h-full min-h-0 flex-col">
              <CardHeader className="shrink-0">
                <div className="flex items-center gap-2">
                  <CardTitle>Tasks</CardTitle>
                  {tasksRefreshing ? (
                    <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-label="Updating tasks" />
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">Click a task to refine it with the assistant.</p>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                <div className="shrink-0 space-y-2">
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
                    const { nextThreeDays, greaterThanThreeDays } = splitUpcoming(tasksData.upcoming);
                    return (
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden pt-2">
                        <div className="grid h-full min-h-0 grid-rows-[repeat(4,minmax(0,1fr))] gap-2">
                          <TasksSection title="Overdue" count={tasksData.overdue.length} tasks={tasksData.overdue} renderTaskRow={renderTaskRow} />
                          <TasksSection title="Today" count={tasksData.dueToday.length} tasks={tasksData.dueToday} renderTaskRow={renderTaskRow} />
                          <TasksSection title="Next three days" count={nextThreeDays.length} tasks={nextThreeDays} renderTaskRow={renderTaskRow} />
                          <TasksSection
                            title="Greater than three days"
                            count={greaterThanThreeDays.length}
                            tasks={greaterThanThreeDays}
                            defaultOpen={false}
                            open={greaterThanThreeDaysOpen}
                            onOpenChange={setGreaterThanThreeDaysOpen}
                            renderTaskRow={renderTaskRow}
                          />
                        </div>
                      </div>
                    );
                  })()
                ) : null}
              </CardContent>
            </Card>

            <Card className="flex h-full min-h-0 flex-col overflow-hidden">
              <CardHeader className="shrink-0">
                <CardTitle className="text-base">Refine with assistant</CardTitle>
                {selectedTask ? (
                  <>
                    <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-2">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</p>
                        <p className="font-medium mt-0.5">{selectedTask.content}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Due</p>
                          <Badge variant="outline" className="text-xs font-normal mt-0.5">
                            <CalendarIcon className="mr-1 size-3" />
                            {formatDueForDisplay(selectedTask)}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Priority</p>
                          <span className="text-xs mt-0.5 inline-block">
                            {PRIORITY_LABELS[selectedTask.priority] ?? `P${selectedTask.priority}`}
                          </span>
                        </div>
                      </div>
                      {selectedTask.description ? (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</p>
                          <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">{selectedTask.description}</p>
                        </div>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ask for more context or suggest improvements; the assistant can update the task. Prefer due date and time when refining.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Select a task from the list to refine it with the assistant.
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                {selectedTask ? (
                  <>
                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card">
                      <Conversation className="min-h-0 flex-1 overflow-y-auto">
                        <ConversationContent className="gap-4 p-3">
                          {refineMessages.length === 0 && !refineStreamingContent ? (
                            <div className="flex flex-col gap-2">
                              <ConversationEmptyState
                                icon={<MessageSquare className="size-12 text-muted-foreground" />}
                                title="Refine this task"
                                description="Send a message or use the button below to get an analysis and suggested updates."
                              />
                              <Button
                                type="button"
                                variant="secondary"
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
                            <Button size="sm" variant="secondary" onClick={() => applyRefineProposal(p)}>
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
                  </>
                ) : (
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-border bg-muted/20 p-6 text-center">
                    <MessageSquare className="size-12 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      Select a task from the list to refine it with the assistant.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-4 md:grid-cols-[1.2fr_0.9fr]">
            <Card className="flex max-w-4xl flex-col overflow-hidden">
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
                    className="relative mx-auto mt-4 w-full max-w-2xl"
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

            <Card>
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

          <Card className="mt-4">
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
