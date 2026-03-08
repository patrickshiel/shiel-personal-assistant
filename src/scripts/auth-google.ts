#!/usr/bin/env node
/**
 * One-time Google OAuth: open browser, get authorization code, exchange for tokens.
 * Use --personal for patrick@shiel.io or --work for patrick@xwave.ie; prints the env var to add to .env.
 *
 * Prerequisites: .env with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
 */

import "dotenv/config";
import http from "node:http";
import { google } from "googleapis";

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

type Context = "personal" | "work";

function main() {
  const args = process.argv.slice(2);
  const context: Context = args.includes("--work") ? "work" : "personal";
  const envVar = context === "work" ? "GOOGLE_REFRESH_TOKEN_WORK" : "GOOGLE_REFRESH_TOKEN_PERSONAL";

  // Work can use a separate OAuth client (different Google org); personal uses default
  const clientId =
    context === "work"
      ? (process.env.GOOGLE_CLIENT_ID_WORK ?? process.env.GOOGLE_CLIENT_ID)
      : process.env.GOOGLE_CLIENT_ID;
  const clientSecret =
    context === "work"
      ? (process.env.GOOGLE_CLIENT_SECRET_WORK ?? process.env.GOOGLE_CLIENT_SECRET)
      : process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    if (context === "work") {
      console.error("For work: set GOOGLE_CLIENT_ID_WORK and GOOGLE_CLIENT_SECRET_WORK in .env (from a GCP project in your work org), or use GOOGLE_CLIENT_ID/SECRET.");
    } else {
      console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
    }
    console.error("See docs/SETUP.md for how to create OAuth credentials in Google Cloud Console.");
    process.exit(1);
  }

  if (context === "work" && process.env.GOOGLE_CLIENT_ID_WORK) {
    console.log("Using work OAuth client (GOOGLE_CLIENT_ID_WORK).");
  }
  console.log(`Sign in with your ${context} Google account (${context === "work" ? "patrick@xwave.ie" : "patrick@shiel.io"}).\n`);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:3000`);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    if (!code) {
      res.writeHead(400).end("Missing code in callback");
      return;
    }
    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <h1>Success</h1>
        <p>You can close this tab and return to the terminal.</p>
        <script>setTimeout(() => window.close(), 2000);</script>
      `);
      server.close();
      if (tokens.refresh_token) {
        console.log("\nAdd this to your .env file:\n");
        console.log(envVar + "=" + tokens.refresh_token);
        console.log("");
      } else {
        console.log("\nNo refresh_token in response. Try revoking app access and run again, or ensure prompt=consent.");
        if (tokens.access_token) {
          console.log("Access token received; you may need to run again with a fresh consent to get refresh_token.");
        }
      }
    } catch (err) {
      console.error(err);
      res.writeHead(500).end("Token exchange failed: " + (err instanceof Error ? err.message : String(err)));
      server.close();
    }
  });

  const port = new URL(REDIRECT_URI).port || "3000";
  server.listen(Number(port), () => {
    console.log("Opening browser for Google sign-in...");
    console.log("If it doesn't open, go to:", authUrl);
    import("node:child_process").then(({ exec }) => {
      const open = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${open} "${authUrl}"`, () => {});
    });
  });
}

main();
