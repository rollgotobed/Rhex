import { escapeHtml } from "@/lib/markdown/shared"

export const POST_CARD_EMBED_PREFIX = "::post-card"
const POST_CARD_EMBED_INLINE_PREFIX = "::post-card-inline"
const POST_CARD_EMBED_VERSION = 1
const MAX_POST_CARD_EMBED_PAYLOAD_LENGTH = 12000

export interface InternalPostUrlMatch {
  routeSegment: string
}

export interface InternalPostUrlInlineMatch extends InternalPostUrlMatch {
  url: string
  startIndex: number
  endIndex: number
}

export interface InternalPostUrlExtractionOptions {
  requestUrl?: string
  allowedOrigins?: readonly string[]
}

export interface EmbeddedPostCardSnapshot {
  version: 1
  postId: string
  slug: string
  url: string
  title: string
  authorName: string
  authorAvatarPath?: string | null
  publishedAt: string
  coverImage?: string | null
  summary?: string | null
  commentCount: number
  likeCount: number
  viewCount: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized
}

function normalizeString(value: unknown, maxLength: number) {
  return typeof value === "string" ? truncateText(value, maxLength) : ""
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  const normalized = normalizeString(value, maxLength)
  return normalized || null
}

function normalizeCount(value: unknown) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0
  }

  return Math.min(999999999, Math.floor(numberValue))
}

function normalizeUrlPath(value: unknown) {
  const normalized = normalizeString(value, 2048)
  if (!normalized) {
    return ""
  }

  if (normalized.startsWith("/") || normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized
  }

  return ""
}

function encodeUtf8Base64Url(value: string) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "utf8").toString("base64url")
  }

  const bytes = new TextEncoder().encode(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeUtf8Base64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_POST_CARD_EMBED_PAYLOAD_LENGTH) {
    return null
  }

  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(value, "base64url").toString("utf8")
    }

    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

function normalizePostCardSnapshot(value: unknown): EmbeddedPostCardSnapshot | null {
  if (!isRecord(value) || value.version !== POST_CARD_EMBED_VERSION) {
    return null
  }

  const postId = normalizeString(value.postId, 128)
  const slug = normalizeString(value.slug, 240)
  const title = normalizeString(value.title, 140)
  const authorName = normalizeString(value.authorName, 80)
  const url = normalizeUrlPath(value.url) || (slug ? `/posts/${encodeURIComponent(slug)}` : "")
  const publishedAt = normalizeString(value.publishedAt, 64)

  if (!postId || !slug || !title || !authorName || !url) {
    return null
  }

  return {
    version: POST_CARD_EMBED_VERSION,
    postId,
    slug,
    url,
    title,
    authorName,
    authorAvatarPath: normalizeOptionalString(value.authorAvatarPath, 2048),
    publishedAt,
    coverImage: normalizeOptionalString(value.coverImage, 2048),
    summary: normalizeOptionalString(value.summary, 180),
    commentCount: normalizeCount(value.commentCount),
    likeCount: normalizeCount(value.likeCount),
    viewCount: normalizeCount(value.viewCount),
  }
}

export function buildPostCardEmbedToken(snapshot: EmbeddedPostCardSnapshot) {
  const normalized = normalizePostCardSnapshot(snapshot)
  if (!normalized) {
    throw new Error("Invalid post card snapshot")
  }

  return `${POST_CARD_EMBED_PREFIX} ${encodeUtf8Base64Url(JSON.stringify(normalized))}`
}

export function buildInlinePostCardEmbedToken(snapshot: EmbeddedPostCardSnapshot) {
  const normalized = normalizePostCardSnapshot(snapshot)
  if (!normalized) {
    throw new Error("Invalid post card snapshot")
  }

  return `${POST_CARD_EMBED_INLINE_PREFIX} ${encodeUtf8Base64Url(JSON.stringify(normalized))}`
}

function parsePostCardEmbedTokenWithMode(line: string) {
  const trimmed = line.trim()
  const inline = trimmed.startsWith(`${POST_CARD_EMBED_INLINE_PREFIX} `)
  const prefix = inline ? POST_CARD_EMBED_INLINE_PREFIX : POST_CARD_EMBED_PREFIX
  if (!trimmed.startsWith(`${prefix} `)) {
    return null
  }

  const payload = trimmed.slice(prefix.length).trim()
  const json = decodeUtf8Base64Url(payload)
  if (!json) {
    return null
  }

  try {
    const snapshot = normalizePostCardSnapshot(JSON.parse(json))
    return snapshot ? { snapshot, inline } : null
  } catch {
    return null
  }
}

export function parsePostCardEmbedToken(line: string) {
  return parsePostCardEmbedTokenWithMode(line)?.snapshot ?? null
}

function isInlinePostCardEmbedTokenLine(line: string) {
  return parsePostCardEmbedTokenWithMode(line)?.inline ?? false
}

export function isPostCardEmbedTokenLine(line: string) {
  return parsePostCardEmbedTokenWithMode(line) !== null
}

function stripTrailingSlash(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/g, "") : pathname
}

function normalizeRouteSegment(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function isSameOrigin(url: URL, baseUrl: URL) {
  const urlHost = url.host.toLowerCase()
  const baseHost = baseUrl.host.toLowerCase()

  if (urlHost === baseHost) {
    return true
  }

  return (
    (urlHost === "localhost" || urlHost === "127.0.0.1")
    && (baseHost === "localhost" || baseHost === "127.0.0.1")
    && url.port === baseUrl.port
  )
}

function parseUrl(value: string | undefined, fallback: string) {
  try {
    return new URL(value || fallback)
  } catch {
    return new URL(fallback)
  }
}

function parseAllowedOrigin(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function resolveExtractionOptions(options?: string | InternalPostUrlExtractionOptions) {
  if (typeof options === "string") {
    return { requestUrl: options, allowedOrigins: [] as readonly string[] }
  }

  return {
    requestUrl: options?.requestUrl,
    allowedOrigins: options?.allowedOrigins ?? [],
  }
}

function extractInternalPostUrlFromValue(value: string, options?: string | InternalPostUrlExtractionOptions): InternalPostUrlMatch | null {
  const extractionOptions = resolveExtractionOptions(options)
  const baseUrl = parseUrl(extractionOptions.requestUrl, "http://localhost")
  const allowedOrigins = [
    baseUrl,
    ...extractionOptions.allowedOrigins
      .map((origin) => parseAllowedOrigin(origin))
      .filter((origin): origin is URL => origin !== null),
  ]
  let url: URL

  try {
    if (value.startsWith("/")) {
      url = new URL(value, baseUrl)
    } else if (/^https?:\/\//i.test(value)) {
      url = new URL(value)
      if (!allowedOrigins.some((origin) => isSameOrigin(url, origin))) {
        return null
      }
    } else {
      return null
    }
  } catch {
    return null
  }

  const pathname = stripTrailingSlash(url.pathname)
  const matched = pathname.match(/^\/posts\/([^/]+)$/)
  if (!matched?.[1]) {
    return null
  }

  const routeSegment = normalizeRouteSegment(matched[1]).trim()
  return routeSegment ? { routeSegment } : null
}

function previousNonWhitespaceIndex(value: string, index: number) {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (!/\s/.test(value[cursor] ?? "")) {
      return cursor
    }
  }

  return -1
}

function isEscaped(value: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 1
}

function isInsideInlineCode(value: string, index: number) {
  let inCode = false
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (value[cursor] === "`" && !isEscaped(value, cursor)) {
      inCode = !inCode
    }
  }

  return inCode
}

function isMarkdownLinkDestination(value: string, startIndex: number) {
  const openParenIndex = previousNonWhitespaceIndex(value, startIndex)
  if (value[openParenIndex] !== "(") {
    return false
  }

  const closeBracketIndex = previousNonWhitespaceIndex(value, openParenIndex)
  return value[closeBracketIndex] === "]"
}

function isMarkdownReferenceDestination(value: string, startIndex: number) {
  return /^\s{0,3}\[[^\]\n]+\]:\s*(?:<\s*)?$/u.test(value.slice(0, startIndex))
}

function trimUrlCandidate(value: string) {
  return value.replace(/[),.;:!?，。；：！？、\]}]+$/u, "")
}

const INLINE_INTERNAL_POST_URL_PATTERN = /(^|[\s([{])((?:https?:\/\/[^\s<>"']+)|(?:\/posts\/[^\s<>"']+))/giu

export function extractInternalPostUrlsFromLine(line: string, options?: string | InternalPostUrlExtractionOptions): InternalPostUrlInlineMatch[] {
  const trimmed = line.trim()
  if (!trimmed || isPostCardEmbedTokenLine(trimmed)) {
    return []
  }

  const matches: InternalPostUrlInlineMatch[] = []
  INLINE_INTERNAL_POST_URL_PATTERN.lastIndex = 0

  for (const matched of line.matchAll(INLINE_INTERNAL_POST_URL_PATTERN)) {
    const prefix = matched[1] ?? ""
    const rawUrl = matched[2] ?? ""
    const rawStartIndex = (matched.index ?? 0) + prefix.length
    const url = trimUrlCandidate(rawUrl)
    const startIndex = rawStartIndex
    const endIndex = rawStartIndex + url.length

    if (
      !url
      || isInsideInlineCode(line, startIndex)
      || isMarkdownLinkDestination(line, startIndex)
      || isMarkdownReferenceDestination(line, startIndex)
    ) {
      continue
    }

    const postUrlMatch = extractInternalPostUrlFromValue(url, options)
    if (!postUrlMatch) {
      continue
    }

    matches.push({
      ...postUrlMatch,
      url,
      startIndex,
      endIndex,
    })
  }

  return matches
}

export function extractInternalPostUrlFromLine(line: string, options?: string | InternalPostUrlExtractionOptions): InternalPostUrlMatch | null {
  const matched = extractInternalPostUrlsFromLine(line, options)[0]
  return matched ? { routeSegment: matched.routeSegment } : null
}

export function replacePostCardEmbedTokensWithUrls(content: string) {
  const lines: string[] = []
  for (const line of content
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const snapshot = parsePostCardEmbedToken(line)
    if (!snapshot) {
      lines.push(line)
      continue
    }

    if (!isInlinePostCardEmbedTokenLine(line)) {
      lines.push(snapshot.url)
    }
  }

  return lines.join("\n")
}

export function replacePostCardEmbedTokensForSummary(content: string) {
  const lines: string[] = []
  for (const line of content
    .replace(/\r\n/g, "\n")
    .split("\n")) {
    const snapshot = parsePostCardEmbedToken(line)
    if (!snapshot) {
      lines.push(line)
      continue
    }

    if (!isInlinePostCardEmbedTokenLine(line)) {
      lines.push(`站内帖子：${snapshot.title}`)
    }
  }

  return lines.join("\n")
}

function formatMetric(value: number) {
  if (value >= 10000) {
    const formatted = (value / 10000).toFixed(value >= 100000 ? 0 : 1).replace(/\.0$/, "")
    return `${formatted}万`
  }

  return String(value)
}

function formatPublishedAt(value: string) {
  const time = new Date(value).getTime()
  if (!Number.isFinite(time)) {
    return value.slice(0, 10)
  }

  const diffMs = Date.now() - time
  if (diffMs < 0) {
    return value.slice(0, 10)
  }

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const month = 30 * day
  const year = 365 * day

  if (diffMs < minute) {
    return "刚刚"
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}分钟前`
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}小时前`
  }
  if (diffMs < month) {
    return `${Math.floor(diffMs / day)}天前`
  }
  if (diffMs < year) {
    return `${Math.floor(diffMs / month)}个月前`
  }

  return `${Math.floor(diffMs / year)}年前`
}

function renderCover(snapshot: EmbeddedPostCardSnapshot) {
  if (snapshot.coverImage) {
    return `<div class="md-post-card-cover aspect-[4/3] w-full overflow-hidden rounded-md bg-background"><img class="md-post-card-cover-image block size-full object-cover" src="${escapeHtml(snapshot.coverImage)}" alt="" loading="lazy" decoding="async" /></div>`
  }

  return '<div class="md-post-card-cover md-post-card-cover-placeholder flex aspect-[4/3] w-full items-center justify-center rounded-md bg-background text-lg font-semibold text-muted-foreground" aria-hidden="true">文</div>'
}

function renderAvatar(snapshot: EmbeddedPostCardSnapshot) {
  if (!snapshot.authorAvatarPath) {
    return ""
  }

  return `<img class="md-post-card-avatar inline-block size-5 rounded-full border border-background object-cover" src="${escapeHtml(snapshot.authorAvatarPath)}" alt="" loading="lazy" decoding="async" />`
}

function renderMetricIcon(type: "comment" | "view" | "like") {
  if (type === "comment") {
    return '<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
  }

  if (type === "view") {
    return '<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>'
  }

  return '<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>'
}

function renderMetric(type: "comment" | "view" | "like", value: number, label: string) {
  const formatted = formatMetric(value)
  return `<span class="inline-flex items-center gap-1 whitespace-nowrap" aria-label="${escapeHtml(`${label} ${formatted}`)}">${renderMetricIcon(type)}<span>${formatted}</span></span>`
}

export function renderPostCardEmbedHtml(line: string) {
  const snapshot = parsePostCardEmbedTokenWithMode(line)?.snapshot ?? null
  if (!snapshot) {
    return null
  }

  const title = escapeHtml(snapshot.title)
  const authorName = escapeHtml(snapshot.authorName)
  const url = escapeHtml(snapshot.url)
  const publishedAt = snapshot.publishedAt ? escapeHtml(formatPublishedAt(snapshot.publishedAt)) : ""

  return [
    '<div class="md-post-card my-4 overflow-hidden rounded-lg bg-muted/50 p-2 shadow-xs transition-colors hover:bg-muted/70 dark:bg-muted/30 dark:hover:bg-muted/40">',
    `<a\nclass="md-post-card-link block no-underline" href="${url}" data-post-card-link="true">`,
    '<div class="md-post-card-grid grid grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[144px_minmax(0,1fr)] sm:gap-4">',
    renderCover(snapshot),
    '<div class="md-post-card-main flex min-w-0 flex-col justify-between py-0.5">',
    '<div class="md-post-card-title-row flex min-w-0 items-start gap-2">',
    '<span class="md-post-card-badge inline-flex shrink-0 items-center rounded bg-orange-100 px-1.5 py-0.5 text-xs font-semibold leading-4 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">站内</span>',
    `<div class="md-post-card-title line-clamp-2 min-w-0 text-base font-semibold leading-6 text-foreground sm:text-lg sm:leading-7">${title}</div>`,
    "</div>",
    '<div class="md-post-card-meta mt-2 flex min-w-0 flex-col gap-2 text-xs font-medium text-muted-foreground sm:flex-row sm:items-end sm:justify-between sm:text-sm">',
    '<span class="inline-flex min-w-0 items-center gap-2">',
    renderAvatar(snapshot),
    `<span class="truncate">${authorName}</span>`,
    publishedAt ? `<span class="shrink-0">${publishedAt}</span>` : "",
    "</span>",
    '<span class="inline-flex shrink-0 items-center gap-3 text-muted-foreground/80">',
    renderMetric("comment", snapshot.commentCount, "评论"),
    renderMetric("view", snapshot.viewCount, "浏览"),
    renderMetric("like", snapshot.likeCount, "点赞"),
    "</span>",
    "</div>",
    "</div>",
    "</div>",
    "</a>",
    "</div>",
  ].join("")
}
