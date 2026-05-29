import type { MediaInsertResult } from "@/components/refined-rich-post-editor/types"
import { AUDIO_EXTENSIONS, MARKDOWN_EMBED_HOST_SET, VIDEO_EXTENSIONS, normalizeMarkdownMediaSrc, normalizeMarkdownMediaUrl } from "@/lib/markdown/media"
import { buildRemoteImageMarkdown } from "@/lib/markdown-editor-shortcuts"

export type PastedHtmlMarkdownSegment =
  | { type: "text"; text: string }
  | { type: "image"; src: string; alt: string; index: number }

export function inferMediaInsert(input: string): MediaInsertResult | null {
  const url = normalizeMarkdownMediaUrl(input)
  const originalSrc = normalizeMarkdownMediaSrc(input)
  if (!url) {
    return null
  }

  const pathname = url.pathname.toLowerCase()
  if (!originalSrc) {
    return null
  }

  if (VIDEO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return {
      template: `MEDIA::video::${originalSrc}`,
      message: "已识别为视频地址，将按 video 标签渲染",
    }
  }

  if (AUDIO_EXTENSIONS.some((ext) => pathname.endsWith(ext))) {
    return {
      template: `MEDIA::audio::${originalSrc}`,
      message: "已识别为音频地址，将按 audio 标签渲染",
    }
  }

  if (MARKDOWN_EMBED_HOST_SET.has(url.hostname)) {
    return {
      template: `MEDIA::iframe::${originalSrc}`,
      message: "已识别为站点媒体链接，将按 iframe 渲染",
    }
  }

  return {
    template: `MEDIA::iframe::${originalSrc}`,
    message: "无法判断直链格式，将按 iframe 渲染",
  }
}

export function normalizeRemoteUrl(input: string) {
  return normalizeMarkdownMediaUrl(input)
}

export function normalizeMarkdownAltText(input: string) {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\]/g, "\\]")
}

export function inferRemoteImageInsert(urlInput: string, altInput: string): MediaInsertResult | null {
  const url = normalizeRemoteUrl(urlInput)
  const originalSrc = normalizeMarkdownMediaSrc(urlInput)
  if (!url) {
    return null
  }

  if (!originalSrc) {
    return null
  }
  const altText = normalizeMarkdownAltText(altInput) || "image"

  return {
    template: buildRemoteImageMarkdown(altText, originalSrc),
    message: "已插入远程图片地址",
  }
}

export function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ""

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function decodeHtmlEntities(value: string) {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  }

  return value.replace(/&(#x[\da-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, body: string) => {
    const normalizedBody = body.toLowerCase()

    if (normalizedBody.startsWith("#x")) {
      const codePoint = Number.parseInt(normalizedBody.slice(2), 16)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    if (normalizedBody.startsWith("#")) {
      const codePoint = Number.parseInt(normalizedBody.slice(1), 10)
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity
    }

    return namedEntities[normalizedBody] ?? entity
  })
}

function readHtmlAttributes(tag: string) {
  const attributes: Record<string, string> = {}
  const attributePattern = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null

  while ((match = attributePattern.exec(tag)) !== null) {
    const name = match[1]?.trim().toLowerCase()
    if (!name || name === "img") {
      continue
    }

    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "")
  }

  return attributes
}

function readFirstSrcSetUrl(srcset: string) {
  return srcset
    .split(",")
    .map((item) => item.trim().split(/\s+/)[0]?.trim() ?? "")
    .find(Boolean)
    ?? ""
}

function getImageSrcFromAttributes(attributes: Record<string, string>) {
  const directSrc = attributes.src
    || attributes["data-src"]
    || attributes["data-original"]
    || attributes["data-original-src"]

  if (directSrc) {
    return directSrc.trim()
  }

  return readFirstSrcSetUrl(attributes.srcset ?? "")
}

function getImageAltFromAttributes(attributes: Record<string, string>) {
  return attributes.alt
    || attributes.title
    || attributes["aria-label"]
    || ""
}

function appendTextSegment(segments: PastedHtmlMarkdownSegment[], text: string) {
  const normalizedText = decodeHtmlEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")

  if (!normalizedText) {
    return
  }

  const previous = segments[segments.length - 1]
  if (previous?.type === "text") {
    previous.text += normalizedText
    return
  }

  segments.push({ type: "text", text: normalizedText })
}

function appendBreakSegment(segments: PastedHtmlMarkdownSegment[], breakText: "\n" | "\n\n") {
  const previous = segments[segments.length - 1]
  if (previous?.type === "text") {
    previous.text += breakText
    return
  }

  segments.push({ type: "text", text: breakText })
}

function normalizePastedMarkdownWhitespace(markdown: string) {
  return markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
}

export function parsePastedHtmlToMarkdownSegments(html: string): PastedHtmlMarkdownSegment[] {
  const normalizedHtml = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .trim()

  if (!normalizedHtml) {
    return []
  }

  const segments: PastedHtmlMarkdownSegment[] = []
  const tokenPattern = /<img\b[^>]*>|<br\s*\/?>|<\/?(?:address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>|<[^>]+>|[^<]+/gi
  let match: RegExpExecArray | null
  let imageIndex = 0

  while ((match = tokenPattern.exec(normalizedHtml)) !== null) {
    const token = match[0]
    const lowerToken = token.toLowerCase()

    if (lowerToken.startsWith("<img")) {
      const attributes = readHtmlAttributes(token)
      const src = getImageSrcFromAttributes(attributes)
      if (src) {
        segments.push({
          type: "image",
          src,
          alt: normalizeMarkdownAltText(getImageAltFromAttributes(attributes)) || `image-${imageIndex + 1}`,
          index: imageIndex,
        })
        imageIndex += 1
      }
      continue
    }

    if (lowerToken.startsWith("<br") || /^<\/?(?:address|article|aside|blockquote|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b/i.test(token)) {
      appendBreakSegment(segments, lowerToken.startsWith("<br") ? "\n" : "\n\n")
      continue
    }

    if (token.startsWith("<")) {
      continue
    }

    appendTextSegment(segments, token)
  }

  return segments.filter((segment) => segment.type !== "text" || segment.text.trim().length > 0)
}

export function getPastedHtmlImageSegments(segments: PastedHtmlMarkdownSegment[]) {
  return segments.filter((segment): segment is Extract<PastedHtmlMarkdownSegment, { type: "image" }> => segment.type === "image")
}

export function buildPastedHtmlMarkdown(
  segments: PastedHtmlMarkdownSegment[],
  resolveImageSrc: (segment: Extract<PastedHtmlMarkdownSegment, { type: "image" }>) => string | null | undefined,
) {
  const markdown = segments.map((segment) => {
    if (segment.type === "text") {
      return segment.text
    }

    const resolvedSrc = resolveImageSrc(segment)?.trim()
    if (!resolvedSrc) {
      return ""
    }

    return `\n\n${buildRemoteImageMarkdown(segment.alt, resolvedSrc)}\n\n`
  }).join("")

  return normalizePastedMarkdownWhitespace(markdown)
}
