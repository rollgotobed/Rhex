import { NextResponse, type NextRequest } from "next/server"

import { buildUnauthorizedResponse, getSessionFromRequest, isProtectedPath } from "@/lib/auth-guards"
import { getSessionClearedCookieOptions, getSessionCookieName } from "@/lib/session"

const REQUEST_PATHNAME_HEADER = "x-rhex-pathname"

function nextWithRequestPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_PATHNAME_HEADER, request.nextUrl.pathname)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(getSessionCookieName())?.value
  const protectedPath = isProtectedPath(request.nextUrl.pathname)

  if (!token) {
    if (!protectedPath) {
      return nextWithRequestPathname(request)
    }

    return buildUnauthorizedResponse(request)
  }

  const session = await getSessionFromRequest(request)
  if (session) {
    return nextWithRequestPathname(request)
  }

  if (protectedPath) {
    const response = buildUnauthorizedResponse(request)
    response.cookies.set(getSessionCookieName(), "", getSessionClearedCookieOptions({ request }))
    return response
  }

  const response = nextWithRequestPathname(request)
  response.cookies.set(getSessionCookieName(), "", getSessionClearedCookieOptions({ request }))
  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"],
}
