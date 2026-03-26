import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { getContextUserId } from "./request-context.js";

export function usingDynamoState(): boolean {
  return process.env.STATE_STORE_BACKEND?.toLowerCase() === "dynamodb";
}

let docClient: DynamoDBDocumentClient | null = null;

function getDocClient() {
  if (docClient) return docClient;
  const client = new DynamoDBClient({});
  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return docClient;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when STATE_STORE_BACKEND=dynamodb`);
  return value;
}

export function getJobsTableName(): string {
  return requiredEnv("JOBS_TABLE_NAME");
}

export function getOrchestratorTableName(): string {
  return requiredEnv("ORCHESTRATOR_TABLE_NAME");
}

export function getMemoryTableName(): string {
  return requiredEnv("MEMORY_TABLE_NAME");
}

export function getUserPartitionKey(): string {
  return getContextUserId() ?? process.env.USER_PARTITION_KEY?.trim() ?? "default";
}

export async function ddbPut(params: ConstructorParameters<typeof PutCommand>[0]): Promise<void> {
  await getDocClient().send(new PutCommand(params));
}

export async function ddbGet<T>(params: ConstructorParameters<typeof GetCommand>[0]): Promise<T | null> {
  const res = await getDocClient().send(new GetCommand(params));
  return (res.Item as T | undefined) ?? null;
}

export async function ddbDelete(params: ConstructorParameters<typeof DeleteCommand>[0]): Promise<void> {
  await getDocClient().send(new DeleteCommand(params));
}

export async function ddbQuery<T>(params: ConstructorParameters<typeof QueryCommand>[0]): Promise<T[]> {
  const res = await getDocClient().send(new QueryCommand(params));
  return (res.Items as T[] | undefined) ?? [];
}
