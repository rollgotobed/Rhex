import "server-only"

import { findPostCardEmbedSourceByRouteSegment } from "@/db/post-card-embed-queries"
import { buildInlinePostCardEmbedToken, buildPostCardEmbedToken, extractInternalPostUrlsFromLine, type EmbeddedPostCardSnapshot, type InternalPostUrlInlineMatch } from "@/lib/post-card-embed"
import { extractSummaryFromContent } from "@/lib/content"
import { getAllPostContentText } from "@/lib/post-content"
import { getUserAvatarPath, getUserDisplayName } from "@/lib/user-display"
import { resolvePostCoverImage } from "@/lib/post-cover"
import { getPostPath } from "@/lib/post-links"
import { getConfiguredSiteOrigin, normalizeSiteOrigin } from "@/lib/site-origin-config"

const MAX_POST_CARD_EMBEDS_PER_CONTENT = 20

interface ProcessInternalPostCardEmbedsOptions {
  requestUrl?: string
  requestHeaders?: Headers
  currentPostId?: string
  allowedOrigins?: readonly string[]
}

function buildPostCardSummary(post: { summary?: string | null; content: string }) {
  const summary = post.summary?.trim() || extractSummaryFromContent(getAllPostContentText(post.content))
  return summary ? summary.slice(0, 160) : null
}

function buildPostCardSnapshot(post: Awaited<ReturnType<typeof findPostCardEmbedSourceByRouteSegment>>): EmbeddedPostCardSnapshot | null {
  if (!post) {
    return null
  }

  const publishedAt = post.publishedAt ?? post.createdAt

  return {
    version: 1,
    postId: post.id,
    slug: post.slug,
    url: getPostPath({ id: post.id, slug: post.slug }, "ID"),
    title: post.title,
    authorName: getUserDisplayName(post.author, "用户"),
    authorAvatarPath: getUserAvatarPath(post.author),
    publishedAt: publishedAt.toISOString(),
    coverImage: resolvePostCoverImage(post.content, post.coverPath),
    summary: buildPostCardSummary(post),
    commentCount: post.commentCount,
    likeCount: post.likeCount,
    viewCount: post.viewCount,
  }
}

function appendOrigin(origins: string[], value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return
  }

  try {
    const normalized = normalizeSiteOrigin(trimmed)
    const url = new URL(normalized)
    if ((url.protocol === "http:" || url.protocol === "https:") && !origins.includes(normalized)) {
      origins.push(normalized)
    }
  } catch {
    // Invalid deployment headers or environment variables should not break posting.
  }
}

function resolveForwardedOrigin(headers?: Headers) {
  const host = headers?.get("x-forwarded-host")?.split(",")[0]?.trim() || headers?.get("host")?.trim()
  if (!host) {
    return null
  }

  const proto = headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https"
  return `${proto}://${host}`
}

function isLocalRequestOrigin(origin: string | null | undefined) {
  if (!origin) {
    return false
  }

  try {
    const hostname = new URL(origin).hostname.toLowerCase()
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  } catch {
    return false
  }
}

function resolveHeaderOrigin(value: string | null | undefined) {
  const trimmed = value?.split(",")[0]?.trim()
  if (!trimmed || trimmed === "null") {
    return null
  }

  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function resolveRequestOrigin(requestUrl?: string) {
  if (!requestUrl) {
    return null
  }

  try {
    return new URL(requestUrl).origin
  } catch {
    return null
  }
}

function resolvePostCardAllowedOrigins(options: ProcessInternalPostCardEmbedsOptions) {
  const origins: string[] = []

  appendOrigin(origins, resolveRequestOrigin(options.requestUrl))
  appendOrigin(origins, getConfiguredSiteOrigin())
  appendOrigin(origins, resolveForwardedOrigin(options.requestHeaders))

  if (isLocalRequestOrigin(resolveRequestOrigin(options.requestUrl))) {
    appendOrigin(origins, resolveHeaderOrigin(options.requestHeaders?.get("origin")))
    appendOrigin(origins, resolveHeaderOrigin(options.requestHeaders?.get("referer")))
  }

  for (const origin of options.allowedOrigins ?? []) {
    appendOrigin(origins, origin)
  }

  return origins
}

export async function processInternalPostCardEmbeds(content: string, options: ProcessInternalPostCardEmbedsOptions = {}) {
  const normalizedContent = content.replace(/\r\n/g, "\n")
  const lines = normalizedContent.split("\n")
  const routeSegments = new Set<string>()
  const extractionOptions = {
    requestUrl: options.requestUrl,
    allowedOrigins: resolvePostCardAllowedOrigins(options),
  }
  let inFence = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }

    if (inFence || routeSegments.size >= MAX_POST_CARD_EMBEDS_PER_CONTENT) {
      continue
    }

    for (const matched of extractInternalPostUrlsFromLine(line, extractionOptions)) {
      routeSegments.add(matched.routeSegment)
    }
  }

  if (routeSegments.size === 0) {
    return content
  }

  const tokenByRouteSegment = new Map<string, { normal: string; inline: string }>()
  await Promise.all(Array.from(routeSegments).map(async (routeSegment) => {
    const post = await findPostCardEmbedSourceByRouteSegment(routeSegment)
    if (!post || post.id === options.currentPostId) {
      return
    }

    const snapshot = buildPostCardSnapshot(post)
    if (!snapshot) {
      return
    }

    tokenByRouteSegment.set(routeSegment, {
      normal: buildPostCardEmbedToken(snapshot),
      inline: buildInlinePostCardEmbedToken(snapshot),
    })
  }))

  if (tokenByRouteSegment.size === 0) {
    return content
  }

  inFence = false
  function appendLinePostCards(line: string, matches: InternalPostUrlInlineMatch[]) {
    const inlineTokenSet = new Set<string>()
    for (const matched of matches) {
      const tokens = tokenByRouteSegment.get(matched.routeSegment)
      if (tokens) {
        inlineTokenSet.add(tokens.inline)
      }
    }

    const inlineTokens = Array.from(inlineTokenSet)
    if (inlineTokens.length === 0) {
      return line
    }

    if (matches.length === 1 && line.trim() === matches[0]?.url) {
      return tokenByRouteSegment.get(matches[0].routeSegment)?.normal ?? line
    }

    return [line, ...inlineTokens].join("\n")
  }

  return lines
    .map((line) => {
      const trimmed = line.trim()
      if (/^```/.test(trimmed)) {
        inFence = !inFence
        return line
      }

      if (inFence) {
        return line
      }

      return appendLinePostCards(line, extractInternalPostUrlsFromLine(line, extractionOptions))
    })
    .join("\n")
}
