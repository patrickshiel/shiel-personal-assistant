/**
 * Google OAuth2 client for Calendar (and later Gmail).
 * Supports personal (patrick@shiel.io) and work (patrick@xwave.ie).
 *
 * When both accounts are in different Google organisations (e.g. personal vs work Workspace),
 * you can use a separate OAuth client for work: set GOOGLE_CLIENT_ID_WORK and
 * GOOGLE_CLIENT_SECRET_WORK (from a GCP project in the work org) and run
 * npm run auth-google -- --work to get GOOGLE_REFRESH_TOKEN_WORK for that client.
 * Personal continues to use GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 */

import { google } from "googleapis";
import type { Context } from "../config/contexts.js";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

function getRefreshToken(context: Context | undefined): string | undefined {
  if (context === "personal") return process.env.GOOGLE_REFRESH_TOKEN_PERSONAL ?? process.env.GOOGLE_REFRESH_TOKEN;
  if (context === "work") return process.env.GOOGLE_REFRESH_TOKEN_WORK;
  return process.env.GOOGLE_REFRESH_TOKEN_PERSONAL ?? process.env.GOOGLE_REFRESH_TOKEN_WORK ?? process.env.GOOGLE_REFRESH_TOKEN;
}

/** Client credentials: personal uses default; work uses _WORK if set, else default. */
function getClientCredentials(context: Context): { clientId: string; clientSecret: string } | null {
  if (context === "work" && process.env.GOOGLE_CLIENT_ID_WORK && process.env.GOOGLE_CLIENT_SECRET_WORK) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID_WORK,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET_WORK,
    };
  }
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isGoogleConfigured(context?: Context): boolean {
  if (context === "personal") {
    const creds = getClientCredentials("personal");
    return !!(creds && getRefreshToken("personal"));
  }
  if (context === "work") {
    const creds = getClientCredentials("work");
    return !!(creds && getRefreshToken("work"));
  }
  return !!(getRefreshToken("personal") && getClientCredentials("personal")) ||
    !!(getRefreshToken("work") && getClientCredentials("work"));
}

export function getGoogleAuth(context?: Context) {
  const ctx = context ?? "personal";
  const creds = getClientCredentials(ctx);
  const refreshToken = context != null ? getRefreshToken(context) : getRefreshToken("personal") ?? getRefreshToken("work");
  if (!creds || !refreshToken) return null;
  const oauth2Client = new google.auth.OAuth2(
    creds.clientId,
    creds.clientSecret,
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/oauth2callback"
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export function getCalendarClient(context?: Context) {
  const auth = context != null ? getGoogleAuth(context) : getGoogleAuth("personal");
  if (!auth) return null;
  return google.calendar({ version: "v3", auth });
}
