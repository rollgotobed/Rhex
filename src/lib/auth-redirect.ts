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
