const TOKEN_STORAGE_KEY = "spa.cognito.accessToken";

function requiredPublicEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function isFrontendAuthEnabled(): boolean {
  return requiredPublicEnv("NEXT_PUBLIC_AUTH_ENABLED").toLowerCase() === "true";
}

export function readStoredAccessToken(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function saveAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  if (!token.trim()) return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export function captureTokenFromUrlHash(): string {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return "";
  const params = new URLSearchParams(hash);
  const token = params.get("access_token") ?? "";
  if (!token) return "";
  saveAccessToken(token);
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export function buildCognitoLoginUrl(): string {
  const domain = requiredPublicEnv("NEXT_PUBLIC_COGNITO_DOMAIN");
  const clientId = requiredPublicEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID");
  const redirectUri = requiredPublicEnv("NEXT_PUBLIC_COGNITO_REDIRECT_URI");
  const scope = requiredPublicEnv("NEXT_PUBLIC_COGNITO_SCOPE") || "openid email profile";
  if (!domain || !clientId || !redirectUri) return "";
  const query = new URLSearchParams({
    client_id: clientId,
    response_type: "token",
    scope,
    redirect_uri: redirectUri,
  });
  return `https://${domain}/login?${query.toString()}`;
}

export function buildCognitoLogoutUrl(): string {
  const domain = requiredPublicEnv("NEXT_PUBLIC_COGNITO_DOMAIN");
  const clientId = requiredPublicEnv("NEXT_PUBLIC_COGNITO_CLIENT_ID");
  const logoutUri = requiredPublicEnv("NEXT_PUBLIC_COGNITO_LOGOUT_URI") || requiredPublicEnv("NEXT_PUBLIC_COGNITO_REDIRECT_URI");
  if (!domain || !clientId || !logoutUri) return "";
  const query = new URLSearchParams({
    client_id: clientId,
    logout_uri: logoutUri,
  });
  return `https://${domain}/logout?${query.toString()}`;
}

export function withAuthHeader(headers: HeadersInit | undefined, token: string): Headers {
  const next = new Headers(headers ?? {});
  if (token.trim()) next.set("Authorization", `Bearer ${token.trim()}`);
  return next;
}
