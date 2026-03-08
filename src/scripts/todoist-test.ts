#!/usr/bin/env node
/**
 * Test Todoist REST API token (no SDK). Use to verify your token works.
 *   npm run todoist-test
 *   npm run todoist-test -- work   # use TODOIST_API_TOKEN_WORK
 *
 * You need a **personal API token** from Todoist → Settings → Integrations
 * (copy the token there). Do NOT use Client ID/Secret from the Developer Console.
 */

import "dotenv/config";

const context = process.argv.includes("work") ? "work" : "personal";
const token =
  context === "work"
    ? process.env.TODOIST_API_TOKEN_WORK
    : process.env.TODOIST_API_TOKEN_PERSONAL ?? process.env.TODOIST_API_TOKEN;

if (!token) {
  console.error(
    context === "work"
      ? "TODOIST_API_TOKEN_WORK not set in .env"
      : "TODOIST_API_TOKEN_PERSONAL or TODOIST_API_TOKEN not set in .env"
  );
  process.exit(1);
}

const url = "https://api.todoist.com/api/v1/projects";
console.log(`Testing Todoist REST API (${context}), base /api/v1/...`);
console.log(`GET ${url}`);

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${token}` },
});

console.log(`Status: ${res.status} ${res.statusText}`);

if (!res.ok) {
  const body = await res.text();
  console.error("Response:", body || "(empty)");
  if (res.status === 410) {
    console.error("\n410 Gone: /rest/v2/ is deprecated. This app uses /api/v1/.");
    console.error("If you still see 410, get a personal API token from: https://app.todoist.com/app/settings/integrations");
  }
  process.exit(1);
}

const data = await res.json();
console.log(`OK. Projects: ${Array.isArray(data) ? data.length : 0}`);
if (Array.isArray(data) && data.length > 0) {
  console.log("First project:", (data[0] as { name?: string }).name ?? data[0]);
}
