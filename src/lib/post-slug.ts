import { pinyin } from "pinyin-pro"

import type { PostSlugGenerationMode } from "@/lib/site-settings"

const MAX_SLUG_BASE_LENGTH = 50

function normalizeSlugBase(value: string, allowChinese: boolean) {
  const normalized = value
    .toLowerCase()
    .replace(allowChinese ? /[^a-z0-9\u4e00-\u9fa5\s-]/g : /[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, MAX_SLUG_BASE_LENGTH)

  return normalized.replace(/^-+|-+$/g, "")
}

function convertChineseToPinyinPreservingAscii(value: string) {
  let result = ""

  for (const char of value) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      const syllables = pinyin(char, { toneType: "none", type: "array" }).filter(Boolean)
      result += syllables.join(" ")
      result += " "
      continue
    }

    result += char
  }

  return result
}

function buildTitleSlugBase(title: string) {
  return normalizeSlugBase(title, true) || "post"
}

function buildPinyinSlugBase(title: string) {
  const normalized = normalizeSlugBase(convertChineseToPinyinPreservingAscii(title), false)
  return normalized || "post"
}

export function buildPostSlug(title: string, mode: PostSlugGenerationMode, options?: { now?: number }) {
  const now = options?.now ?? Date.now()
  const secondBasedSuffix = Math.floor(now / 1000).toString(36)

  switch (mode) {
    case "TIME36":
      return now.toString(36)
    case "PINYIN_TIME36":
      return `${buildPinyinSlugBase(title)}-${secondBasedSuffix}`
    case "TITLE_TIME36":
      return `${buildTitleSlugBase(title)}-${secondBasedSuffix}`
    case "TITLE_TIMESTAMP":
    default:
      return `${buildTitleSlugBase(title)}-${now}`
  }
}
