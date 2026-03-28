/**
 * Cookie-based auth helpers.
 * These manage a client-readable cookie mirror alongside the HttpOnly cookie
 * set by the backend. The HttpOnly cookie is the source of truth for SSR/middleware,
 * while localStorage is kept as a fallback for API calls.
 */

const COOKIE_NAME = "mas_token";

/** Set auth token in both localStorage and a JS-readable cookie for middleware */
export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("mas_token", token);
  // Set a JS-readable cookie so Next.js middleware can check auth.
  // The HttpOnly cookie is set by the backend Set-Cookie header.
  document.cookie = `${COOKIE_NAME}=${token}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
}

/** Remove auth token from both localStorage and cookie */
export function removeAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("mas_token");
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}

/** Get auth token from localStorage (client-side only) */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("mas_token");
}
