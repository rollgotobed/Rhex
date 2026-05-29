const AUTH_REDIRECT_FALLBACK = "/"
const AUTH_REDIRECT_BLOCKED_PATHS = new Set(["/login", "/register", "/forgot-password"])

export function normalizeAuthRedirectTarget(value: unknown, fallback = AUTH_REDIRECT_FALLBACK) {
  const rawValue = typeof value === "string" ? value.trim() : ""
  if (!rawValue || !rawValue.startsWith("/") || rawValue.startsWith("//")) {
    return fallback
  }

  let url: URL
  try {
    url = new URL(rawValue, "https://local.invalid")
  } catch {
    return fallback
  }

  if (url.origin !== "https://local.invalid") {
    return fallback
  }

  const pathname = url.pathname || "/"
  if (AUTH_REDIRECT_BLOCKED_PATHS.has(pathname)) {
    return fallback
  }

  return `${pathname}${url.search}${url.hash}` || fallback
}

export function buildLoginHrefWithRedirect(value: unknown, fallback = "/login") {
  const redirectTarget = normalizeAuthRedirectTarget(value, "")
  return redirectTarget
    ? `/login?redirect=${encodeURIComponent(redirectTarget)}`
    : fallback
}

export function getCurrentBrowserAuthRedirectTarget(fallback = AUTH_REDIRECT_FALLBACK) {
  if (typeof window === "undefined") {
    return fallback
  }

  return normalizeAuthRedirectTarget(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    fallback,
  )
}
