import { revalidateTag } from "next/cache"

export const BOARDS_CACHE_TAG = "taxonomy-boards"
export const ZONES_CACHE_TAG = "taxonomy-zones"
export const TAGS_CACHE_TAG = "taxonomy-tags"
export const TAXONOMY_CONTENT_CACHE_TAG = "taxonomy-content"

export const TAXONOMY_CACHE_TAGS = [BOARDS_CACHE_TAG, ZONES_CACHE_TAG, TAGS_CACHE_TAG] as const

function isMissingRevalidateStoreError(error: unknown) {
  return error instanceof Error
    && error.message.startsWith("Invariant: static generation store missing in revalidateTag")
}

function isRenderPhaseRevalidateError(error: unknown) {
  return error instanceof Error
    && error.message.includes('used "revalidateTag ')
    && error.message.includes("during render which is unsupported")
}

function revalidateTaxonomyTag(tag: string, profile: "max" | { expire: 0 }) {
  try {
    revalidateTag(tag, profile)
  } catch (error) {
    if (isMissingRevalidateStoreError(error) || isRenderPhaseRevalidateError(error)) {
      return
    }

    throw error
  }
}

function revalidateTaxonomyTags(profile: "max" | { expire: 0 }) {
  for (const tag of TAXONOMY_CACHE_TAGS) {
    revalidateTaxonomyTag(tag, profile)
  }
}

export function revalidateTaxonomyStructureCache() {
  revalidateTaxonomyTags("max")
  revalidateTaxonomyContentCache()
}

export function expireTaxonomyCacheImmediately() {
  revalidateTaxonomyTags({ expire: 0 })
  expireTaxonomyContentCacheImmediately()
}

export function revalidateTaxonomyContentCache() {
  revalidateTaxonomyTag(TAXONOMY_CONTENT_CACHE_TAG, "max")
}

export function expireTaxonomyContentCacheImmediately() {
  revalidateTaxonomyTag(TAXONOMY_CONTENT_CACHE_TAG, { expire: 0 })
}
