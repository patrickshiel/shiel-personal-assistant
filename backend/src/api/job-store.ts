import fs from "node:fs/promises";
import path from "node:path";
import { getStateDir } from "../lib/paths.js";
import {
  ddbGet,
  ddbPut,
  ddbQuery,
  getJobsTableName,
  getUserPartitionKey,
  usingDynamoState,
} from "../lib/aws-state.js";

export type ProposalId = string;

export interface Proposal {
  id: ProposalId;
  toolName: string;
  args: unknown;
}

export type JobType = "assistant" | "trigger" | "weekly_prep" | "debrief";

export interface JobRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  type: JobType;
  triggerId?: string;
  inputOverride?: string;
  message?: string;
  status: "pending" | "approved" | "executed" | "failed";
  outputText?: string;
  proposals: Proposal[];
  approvedProposalIds?: ProposalId[];
  executedAt?: string;
  executionResults?: { proposalId: ProposalId; ok: boolean; output: unknown; error?: string }[];
}

const JOB_DIR = path.join(getStateDir(), "jobs");

function jobPath(jobId: string) {
  return path.join(JOB_DIR, `${jobId}.json`);
}

async function ensureJobDir() {
  await fs.mkdir(JOB_DIR, { recursive: true });
}

export async function createJob(partial: Omit<JobRecord, "createdAt" | "updatedAt">): Promise<JobRecord> {
  const now = new Date().toISOString();
  const job: JobRecord = {
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
  if (usingDynamoState()) {
    await ddbPut({
      TableName: getJobsTableName(),
      Item: {
        userId: getUserPartitionKey(),
        jobId: job.id,
        ...job,
      },
    });
    return job;
  }
  await ensureJobDir();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2), "utf-8");
  return job;
}

export async function saveJob(job: JobRecord): Promise<void> {
  job.updatedAt = new Date().toISOString();
  if (usingDynamoState()) {
    await ddbPut({
      TableName: getJobsTableName(),
      Item: {
        userId: getUserPartitionKey(),
        jobId: job.id,
        ...job,
      },
    });
    return;
  }
  await ensureJobDir();
  await fs.writeFile(jobPath(job.id), JSON.stringify(job, null, 2), "utf-8");
}

export async function loadJob(jobId: string): Promise<JobRecord | null> {
  if (usingDynamoState()) {
    const item = await ddbGet<(JobRecord & { userId: string; jobId: string; createdAt: string })>({
      TableName: getJobsTableName(),
      Key: {
        userId: getUserPartitionKey(),
        jobId,
      },
    });
    if (!item) return null;
    const { userId: _userId, jobId: _jobId, ...job } = item;
    return job;
  }
  try {
    const raw = await fs.readFile(jobPath(jobId), "utf-8");
    return JSON.parse(raw) as JobRecord;
  } catch {
    return null;
  }
}

export async function listJobs(status?: JobRecord["status"]): Promise<JobRecord[]> {
  if (usingDynamoState()) {
    const items = await ddbQuery<(JobRecord & { userId: string; jobId: string })>({
      TableName: getJobsTableName(),
      IndexName: "gsi_createdAt",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": getUserPartitionKey(),
      },
      ScanIndexForward: false,
    });
    const out = items
      .map((item) => {
        const { userId: _userId, jobId: _jobId, ...job } = item;
        return job;
      })
      .filter((job) => (status ? job.status === status : true));
    return out;
  }
  await ensureJobDir();
  const files = await fs.readdir(JOB_DIR).catch(() => []);
  const out: JobRecord[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const jobId = f.slice(0, -5);
    const job = await loadJob(jobId);
    if (!job) continue;
    if (status && job.status !== status) continue;
    out.push(job);
  }
  out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return out;
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

