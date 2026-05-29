import { NextResponse } from "next/server"

import { executeAddonActionHook } from "@/addons-host/runtime/hooks"
import { getCurrentUserRecord } from "@/db/current-user"
import { createRouteHandler, readJsonBody, readOptionalStringField } from "@/lib/api-route"
import { normalizeAuthRedirectTarget } from "@/lib/auth-redirect"
import { getSessionClearedCookieOptions, getSessionCookieName, readSessionTokenFromCookieHeader, revokeSessionToken } from "@/lib/session"

export const POST = createRouteHandler(async ({ request }) => {
  const requestUrl = new URL(request.url)
  const contentType = request.headers.get("content-type") ?? ""
  const body = contentType.toLowerCase().includes("application/json")
    ? await readJsonBody(request).catch(() => ({}))
    : {}
  const redirectTarget = normalizeAuthRedirectTarget(readOptionalStringField(body, "redirect"))
  const hookCtx = { request, pathname: requestUrl.pathname, searchParams: requestUrl.searchParams }

  const currentUser = await getCurrentUserRecord().catch(() => null)
  if (currentUser) {
    await executeAddonActionHook("auth.logout.before", {
      userId: currentUser.id,
      username: currentUser.username,
    }, hookCtx)
  }

  await revokeSessionToken(readSessionTokenFromCookieHeader(request.headers.get("cookie")))
  const response = NextResponse.json({ code: 0, data: { redirect: redirectTarget }, message: "success" })

  response.cookies.set(getSessionCookieName(), "", getSessionClearedCookieOptions({ request }))

  if (currentUser) {
    await executeAddonActionHook("auth.logout.after", {
      userId: currentUser.id,
      username: currentUser.username,
    }, hookCtx)
  }

  return response
}, {
  errorMessage: "退出登录失败",
  logPrefix: "[api/auth/logout] unexpected error",
})
