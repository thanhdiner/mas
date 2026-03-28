import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Public paths that don't require authentication */
const PUBLIC_PATHS = ["/login", "/register"];

/** Prefixes that should never be intercepted */
const BYPASS_PREFIXES = ["/_next", "/api", "/favicon", "/icon", "/opengraph", "/twitter", "/robots", "/sitemap"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static assets, API routes, and Next.js internals
  if (BYPASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Skip for public pages
  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  // Check for auth token in cookies
  const token = request.cookies.get("mas_token")?.value;

  if (!token) {
    // Redirect unauthenticated users to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match all paths except static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$|.*\\.jpg$).*)"],
};
