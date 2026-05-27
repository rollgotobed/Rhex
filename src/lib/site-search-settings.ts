export interface ExternalSearchEngine {
  id: string
  label: string
  urlTemplate: string
}

export interface SiteSearchSettings {
  enabled: boolean
  externalEngines: ExternalSearchEngine[]
}

const SITE_SETTINGS_STATE_KEY = "__siteSettings"
const SEARCH_SETTINGS_KEY = "search"

const DEFAULT_EXTERNAL_SEARCH_ENGINES: ExternalSearchEngine[] = [
  {
    id: "google",
    label: "Google 搜索",
    urlTemplate: "https://www.google.com/search?q={keyword}",
  },
  {
    id: "bing",
    label: "Bing 搜索",
    urlTemplate: "https://www.bing.com/search?q={keyword}",
  },
]

function readFirstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || null
}

function stripIpv6Brackets(value: string) {
  return value.replace(/^\[(.*)\]$/, "$1")
}

function parseHostname(value: string | null | undefined) {
  const firstValue = readFirstHeaderValue(value)
  if (!firstValue) {
    return null
  }

  try {
    const parsed = new URL(firstValue.includes("://") ? firstValue : `https://${firstValue}`)
    return stripIpv6Brackets(parsed.hostname).toLowerCase()
  } catch {
    return null
  }
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [first = 0, second = 0] = parts
  return (
    first === 0
    || first === 10
    || first === 127
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "::"
    || normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe8")
    || normalized.startsWith("fe9")
    || normalized.startsWith("fea")
    || normalized.startsWith("feb")
    || normalized.startsWith("::ffff:127.")
    || normalized.startsWith("::ffff:10.")
    || normalized.startsWith("::ffff:192.168.")
  )
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname.endsWith(".local")
    || hostname.endsWith(".lan")
    || hostname.endsWith(".internal")
  )
}

export function normalizeExternalSearchSiteHost(value: string | null | undefined) {
  const hostname = parseHostname(value)
  if (!hostname || isLocalHostname(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return null
  }

  return hostname
}

export function resolveExternalSearchSiteHost(input: {
  configuredOrigin?: string | null
  forwardedHost?: string | null
  host?: string | null
}) {
  return (
    normalizeExternalSearchSiteHost(input.configuredOrigin)
    ?? normalizeExternalSearchSiteHost(input.forwardedHost)
    ?? normalizeExternalSearchSiteHost(input.host)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseAppStateRoot(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function readSiteSettingsState(raw: string | null | undefined) {
  const root = parseAppStateRoot(raw)
  const siteSettingsState = root[SITE_SETTINGS_STATE_KEY]
  return isRecord(siteSettingsState) ? siteSettingsState : {}
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase()
    if (normalizedValue === "true" || normalizedValue === "1" || normalizedValue === "on") {
      return true
    }
    if (normalizedValue === "false" || normalizedValue === "0" || normalizedValue === "off") {
      return false
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true
    }
    if (value === 0) {
      return false
    }
  }

  return fallback
}

function getDefaultExternalSearchEngines() {
  return DEFAULT_EXTERNAL_SEARCH_ENGINES.map((item) => ({ ...item }))
}

function normalizeExternalSearchUrlTemplate(value: unknown, fallback?: string) {
  if (typeof value !== "string") {
    return fallback ?? null
  }

  const rawValue = value.trim()
  if (!rawValue.includes("{keyword}")) {
    return fallback ?? null
  }

  const candidate = rawValue.startsWith("//")
    ? `https:${rawValue}`
    : /^[a-z][a-z\d+.-]*:\/\//i.test(rawValue)
      ? rawValue
      : rawValue.includes(".")
        ? `https://${rawValue}`
        : rawValue

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback ?? null
    }

    return parsed.toString().replaceAll("%7Bkeyword%7D", "{keyword}")
  } catch {
    return fallback ?? null
  }
}

function normalizeExternalSearchEngines(value: unknown) {
  if (!Array.isArray(value)) {
    return getDefaultExternalSearchEngines()
  }

  const normalized = value.flatMap((item, index) => {
    if (!isRecord(item)) {
      return []
    }

    const fallback = DEFAULT_EXTERNAL_SEARCH_ENGINES[index]
    const id = typeof item.id === "string" && item.id.trim() ? item.id.trim() : fallback?.id
    const label = typeof item.label === "string" && item.label.trim() ? item.label.trim() : fallback?.label
    const urlTemplate = normalizeExternalSearchUrlTemplate(item.urlTemplate, fallback?.urlTemplate)

    if (!id || !label || !urlTemplate) {
      return []
    }

    return [{ id, label, urlTemplate }]
  })

  if (normalized.length === 0) {
    return getDefaultExternalSearchEngines()
  }

  return normalized.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index)
}

export function resolveSiteSearchSettings(appStateJson?: string | null, enabledFallback = true): SiteSearchSettings {
  const siteSettingsState = readSiteSettingsState(appStateJson)
  const searchSettings = isRecord(siteSettingsState[SEARCH_SETTINGS_KEY])
    ? siteSettingsState[SEARCH_SETTINGS_KEY]
    : {}

  return {
    enabled: normalizeBoolean(searchSettings.enabled, enabledFallback),
    externalEngines: normalizeExternalSearchEngines(searchSettings.externalEngines),
  }
}

export function mergeSiteSearchSettings(
  appStateJson: string | null | undefined,
  input: Pick<SiteSearchSettings, "enabled"> & Partial<Pick<SiteSearchSettings, "externalEngines">>,
) {
  const root = parseAppStateRoot(appStateJson)
  const siteSettingsState = readSiteSettingsState(appStateJson)
  const current = resolveSiteSearchSettings(appStateJson)

  root[SITE_SETTINGS_STATE_KEY] = {
    ...siteSettingsState,
    [SEARCH_SETTINGS_KEY]: {
      enabled: normalizeBoolean(input.enabled, current.enabled),
      externalEngines: normalizeExternalSearchEngines(input.externalEngines ?? current.externalEngines),
    },
  }

  return JSON.stringify(root)
}

export function buildExternalSearchUrl(urlTemplate: string, keyword: string) {
  const normalizedKeyword = keyword.trim()
  const normalizedTemplate = normalizeExternalSearchUrlTemplate(urlTemplate, DEFAULT_EXTERNAL_SEARCH_ENGINES[0]!.urlTemplate)

  return normalizedTemplate!.replaceAll("{keyword}", encodeURIComponent(normalizedKeyword))
}
