import type { RequestHandler } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { runWithContext } from "./request-context.js";

export type AuthenticatedUser = {
  userId: string;
  email?: string;
  tokenUse?: string;
};

function getCognitoConfig() {
  const region = process.env.COGNITO_REGION?.trim();
  const userPoolId = process.env.COGNITO_USER_POOL_ID?.trim();
  const appClientId = process.env.COGNITO_APP_CLIENT_ID?.trim();
  if (!region || !userPoolId || !appClientId) return null;
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  return { region, userPoolId, appClientId, issuer };
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksIssuer: string | null = null;

function getJwks(issuer: string) {
  if (jwksCache && jwksIssuer === issuer) return jwksCache;
  jwksIssuer = issuer;
  jwksCache = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return jwksCache;
}

function extractBearerToken(value: string | undefined): string | null {
  if (!value) return null;
  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return null;
  return token.trim() || null;
}

function readAudience(payload: JWTPayload): string | null {
  if (typeof payload.aud === "string") return payload.aud;
  if (Array.isArray(payload.aud)) return payload.aud.find((x) => typeof x === "string") ?? null;
  if (typeof payload.client_id === "string") return payload.client_id;
  return null;
}

export function authRequiredEnabled(): boolean {
  return process.env.AUTH_REQUIRED?.toLowerCase() === "true";
}

export function cognitoAuthMiddleware(): RequestHandler {
  return async (req, res, next) => {
    if (!authRequiredEnabled()) return next();
    if (req.path === "/api/health") return next();

    const cfg = getCognitoConfig();
    if (!cfg) {
      return res.status(500).json({ error: "Auth is enabled but Cognito configuration is missing" });
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    try {
      const jwks = getJwks(cfg.issuer);
      const verified = await jwtVerify(token, jwks, {
        issuer: cfg.issuer,
      });
      const audience = readAudience(verified.payload);
      if (!audience || audience !== cfg.appClientId) {
        return res.status(401).json({ error: "Token audience is invalid" });
      }
      if (typeof verified.payload.sub !== "string" || !verified.payload.sub) {
        return res.status(401).json({ error: "Token subject is missing" });
      }

      const user: AuthenticatedUser = {
        userId: verified.payload.sub,
        email: typeof verified.payload.email === "string" ? verified.payload.email : undefined,
        tokenUse: typeof verified.payload.token_use === "string" ? verified.payload.token_use : undefined,
      };
      res.locals.authUser = user;
      return runWithContext({ userId: user.userId }, () => next());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      return res.status(401).json({ error: message });
    }
  };
}
