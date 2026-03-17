/**
 * Personal assistant agent built on LangGraph (via LangChain's createToolCallingAgent).
 * You can replace this with a raw StateGraph for custom control flow (e.g. approval nodes).
 */

import "../lib/load-env.js";

// Enable LangSmith tracing when API key is set (traces appear in LangSmith Studio)
if (process.env.LANGCHAIN_API_KEY) {
  process.env.LANGCHAIN_TRACING_V2 = process.env.LANGCHAIN_TRACING_V2 ?? "true";
  process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT ?? "shiel-personal-assistant";
}

import { createToolCallingAgent, AgentExecutor } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { assistantToolsExecute, makeAssistantTools, type AgentMode, type ProposalCollector } from "./tools.js";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o";

const model = new ChatOpenAI({
  model: OPENAI_MODEL,
  temperature: 0,
});

export const DEFAULT_SYSTEM_PROMPT = `You are a personal assistant that organises the user's whole life. You manage two contexts:
- **Personal** (patrick@shiel.io): personal calendar, tasks, notes, email.
- **Work** (patrick@xwave.ie): work calendar, tasks, notes, email.

When using tools, pass context: "personal" or "work" so the right account is used. For a full picture (e.g. "what's on today"), call calendar and tasks for BOTH contexts and present a unified view, clearly labelling which items are personal vs work.

You have access to:
- Calendar: list/create/update/delete events (context = personal or work).
- Todoist: list projects and tasks, add/update/complete (context = personal or work).
- Obsidian: list, read, write, search notes (context = personal or work; use Personal/ and Work/ folders or separate vaults).
- Email: list, read, draft replies (when implemented).
- save_memory: persist preferences and facts for future runs.

Be concise. Respect the user's privacy. When creating events or sending email, prefer confirmation for high-impact actions.`;

function buildPrompt(systemPrompt: string) {
  return ChatPromptTemplate.fromMessages([
    ["system", systemPrompt],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);
}

function createExecutor(systemPrompt: string, tools: any[]) {
  const prompt = buildPrompt(systemPrompt);
  const agent = createToolCallingAgent({ llm: model, tools, prompt });
  return AgentExecutor.fromAgentAndTools({
    agent,
    tools,
    maxIterations: 15,
    returnIntermediateSteps: false,
  });
}

export const assistantExecutor = createExecutor(DEFAULT_SYSTEM_PROMPT, assistantToolsExecute);

/**
 * Run the assistant with a single user message (default prompt).
 */
export async function runAssistant(userMessage: string) {
  const result = await assistantExecutor.invoke({
    input: userMessage,
    chat_history: [],
  });
  return result;
}

export type ChatHistoryEntry = { role: "human" | "ai"; content: string };

function toLangChainMessages(history: ChatHistoryEntry[]) {
  return history.map((h) =>
    h.role === "human" ? new HumanMessage(h.content) : new AIMessage(h.content)
  );
}

/**
 * Run the assistant with a custom system prompt (for orchestration triggers).
 * Optional memoryContext is injected into the system prompt so the agent has long-term context.
 * Optional chatHistory enables multi-turn conversation (e.g. task refinement).
 */
export async function runWithPrompt(
  systemPrompt: string,
  userMessage: string,
  options?: {
    memoryContext?: string;
    lastRunContext?: string;
    mode?: AgentMode;
    proposalCollector?: ProposalCollector;
    chatHistory?: ChatHistoryEntry[];
  }
) {
  let fullSystem = systemPrompt;
  if (options?.memoryContext) {
    fullSystem = `${systemPrompt}\n\n${options.memoryContext}`;
  }
  if (options?.lastRunContext) {
    fullSystem = `${fullSystem}\n\n${options.lastRunContext}`;
  }
  const mode = options?.mode ?? "execute";
  const tools = makeAssistantTools(mode, options?.proposalCollector);
  const executor = createExecutor(fullSystem, tools);
  const chat_history = options?.chatHistory?.length
    ? toLangChainMessages(options.chatHistory)
    : [];
  return executor.invoke({
    input: userMessage,
    chat_history,
  });
}
