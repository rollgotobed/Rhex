import "server-only"

import { executeAddonAsyncWaterfallHook } from "@/addons-host/runtime/hooks"
import type { MarkdownEmojiItem } from "@/lib/markdown-emoji"
import { renderMarkdown } from "@/lib/markdown/render"
import { processInternalPostCardEmbeds } from "@/lib/post-card-embed.server"

export async function renderAddonPostContentHtml(input: {
  content: string
  markdownEmojiMap: MarkdownEmojiItem[]
  pathname?: string
  searchParams?: URLSearchParams
  allowedOrigins?: readonly string[]
  currentPostId?: string
}) {
  const normalizedContent = input.content.replace(/\r\n/g, "\n").trim()
  if (!normalizedContent) {
    return ""
  }

  const contentWithCards = await processInternalPostCardEmbeds(normalizedContent, {
    requestUrl: input.pathname,
    allowedOrigins: input.allowedOrigins,
    currentPostId: input.currentPostId,
  })
  const renderedHtml = renderMarkdown(contentWithCards, input.markdownEmojiMap)
  const result = await executeAddonAsyncWaterfallHook("post.content.render", renderedHtml, {
    pathname: input.pathname,
    searchParams: input.searchParams,
  })

  return typeof result.value === "string" ? result.value : renderedHtml
}
