import { proposeAssistant } from "../api/propose-run.js";
import { executeProposals } from "../api/execute-run.js";
import type { Proposal } from "../api/job-store.js";

function hasLLMKey() {
  return Boolean(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

async function testExecuteViaSaveMemory() {
  // This test does not require any external integrations (only local filesystem state/).
  const manualProposal: Proposal = {
    id: "prop_smoke_manual",
    toolName: "save_memory",
    args: { content: "Smoke test: approval-gated write pipeline works", type: "fact" },
  };

  const res = await executeProposals([manualProposal]);
  if (!res.ok) {
    throw new Error(`executeProposals(save_memory) failed: ${JSON.stringify(res.results)}`);
  }
}

async function testProposeAssistantIfLLMConfigured() {
  if (!hasLLMKey()) {
    console.log("Skipping proposeAssistant smoke test (no OPENAI/ANTHROPIC/Google API key set).");
    return;
  }

  const msg =
    "Use the save_memory tool to store a preference: 'Smoke test run happened on the backend'. Store it as type preference.";
  const propose = await proposeAssistant(msg);

  if (propose.proposals.length === 0) {
    throw new Error(`proposeAssistant returned no proposals. output=${propose.outputText}`);
  }

  // Execute only local save_memory proposals so we don't depend on Todoist/Calendar/Obsidian credentials.
  const memoryProposals = propose.proposals.filter((p) => p.toolName === "save_memory");
  if (memoryProposals.length === 0) {
    console.log("proposeAssistant produced proposals but none were save_memory; skipping execute step.");
    return;
  }

  const exec = await executeProposals(memoryProposals);
  if (!exec.ok) {
    throw new Error(`executeProposals(save_memory proposals) failed: ${JSON.stringify(exec.results)}`);
  }
}

async function main() {
  console.log("Running approval-flow smoke tests...");
  await testExecuteViaSaveMemory();
  await testProposeAssistantIfLLMConfigured();
  console.log("Smoke tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

