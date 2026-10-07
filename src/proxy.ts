import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Authentication boundary.
 *
 * Requests pass through today. When authentication is added, session checks
 * belong here. Domain services keep depending on `getCurrentActor()` rather
 * than on cookies or a particular identity provider.
 */
export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
