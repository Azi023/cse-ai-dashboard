import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware — runs on the Edge for every matched route.
 * Redirects unauthenticated users to /login by checking for the
 * access_token cookie. This is a lightweight gate — actual JWT
 * validation happens server-side on API calls.
 *
 * NOTE: This checks cookie existence only, not validity.
 * A tampered or expired cookie will pass middleware but fail
 * on the first API call, triggering a client-side redirect.
 */
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Public paths that don't require auth
  const publicPaths = ['/login', '/api', '/_next', '/favicon.ico', '/manifest.json'];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  if (isPublicPath) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get('access_token');

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files and api routes
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
};
