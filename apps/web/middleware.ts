import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/favicon.ico") {
    return NextResponse.redirect(new URL("/icon.png", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/favicon.ico"]
};
