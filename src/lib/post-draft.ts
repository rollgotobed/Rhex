export type PostDraftMode = "create" | "edit"

export interface LocalPostDraft {
  title: string
  content: string
  isAnonymous: boolean
  coverPath: string
  boardSlug: string
  postType: string
  bountyPoints: string
  auctionMode: "SEALED_BID" | "OPEN_ASCENDING"
  auctionPricingRule: "FIRST_PRICE" | "SECOND_PRICE"
  auctionStartPrice: string
  auctionIncrementStep: string
  auctionStartsAt: string
  auctionEndsAt: string
  auctionWinnerOnlyContent: string
  auctionWinnerOnlyContentPreview: string
  pollOptions: string[]
  pollExpiresAt: string
  commentsVisibleToAuthorOnly: boolean
  loginUnlockContent: string
  replyUnlockContent: string
  purchaseUnlockContent: string
  purchasePrice: string
  minViewLevel: string
  minViewVipLevel: string
  manualTags: string[]
  lotteryStartsAt: string
  lotteryEndsAt: string
  lotteryParticipantGoal: string
  lotteryPrizes: Array<{ title: string; quantity: string; description: string; type: "MANUAL" | "POINTS" | "VIP" | "REDEEM_CODE"; pointsAmount: string; vipPlan: "MONTH" | "QUARTER" | "YEAR"; redemptionCodes: string }>
  lotteryConditions: Array<{ type: string; value: string; operator: string; description: string; groupKey: string }>
  redPacketEnabled: boolean
  redPacketMode: "RED_PACKET" | "JACKPOT"
  redPacketGrantMode: "FIXED" | "RANDOM"
  redPacketClaimOrderMode: "FIRST_COME_FIRST_SERVED" | "RANDOM"
  redPacketTriggerType: "REPLY" | "LIKE" | "FAVORITE"
  jackpotInitialPoints: string
  redPacketUnitPoints: string
  redPacketTotalPoints: string
  redPacketPacketCount: string
  attachments: Array<{
    id?: string
    sourceType: "UPLOAD" | "EXTERNAL_LINK"
    uploadId: string
    name: string
    externalUrl: string
    externalCode: string
    fileSize: number | null
    fileExt: string
    mimeType: string
    minDownloadLevel: string
    minDownloadVipLevel: string
    pointsCost: string
    requireReplyUnlock: boolean
  }>
}

export interface StoredLocalPostDraftEntry {
  id: string
  updatedAt: string
  source: "autosave" | "manual"
  data: LocalPostDraft
}

interface StoredLocalPostDraftBucket {
  version: 3
  mode: PostDraftMode
  postId: string | null
  drafts: StoredLocalPostDraftEntry[]
}

export interface SavedPostDraftResult {
  entry: StoredLocalPostDraftEntry
  drafts: StoredLocalPostDraftEntry[]
}

interface DeleteCurrentPostDraftFromStorageOptions {
  postId?: string
  draftId?: string | null
  drafts?: Array<LocalPostDraft | null | undefined>
}

const STORAGE_KEY_PREFIX = "rhex:post-draft-box"
const STORAGE_VERSION = 3
const MAX_DRAFT_BOX_ITEMS = 12

export function createEmptyLocalPostDraft(boardSlug = ""): LocalPostDraft {
  return {
    title: "",
    content: "",
    isAnonymous: false,
    coverPath: "",
    boardSlug,
    postType: "NORMAL",
    bountyPoints: "100",
    auctionMode: "SEALED_BID",
    auctionPricingRule: "FIRST_PRICE",
    auctionStartPrice: "100",
    auctionIncrementStep: "10",
    auctionStartsAt: "",
    auctionEndsAt: "",
    auctionWinnerOnlyContent: "",
    auctionWinnerOnlyContentPreview: "",
    pollOptions: ["", ""],
    pollExpiresAt: "",
    commentsVisibleToAuthorOnly: false,
    loginUnlockContent: "",
    replyUnlockContent: "",
    purchaseUnlockContent: "",
    purchasePrice: "20",
    minViewLevel: "0",
    minViewVipLevel: "0",
    manualTags: [],
    lotteryStartsAt: "",
    lotteryEndsAt: "",
    lotteryParticipantGoal: "",
    lotteryPrizes: [{ title: "一等奖", quantity: "1", description: "填写奖品描述", type: "MANUAL", pointsAmount: "100", vipPlan: "MONTH", redemptionCodes: "" }],
    lotteryConditions: [{ type: "REPLY_CONTENT_LENGTH", value: "10", operator: "GTE", description: "回帖内容至少 10 字", groupKey: "default" }],
    redPacketEnabled: false,
    redPacketMode: "RED_PACKET",
    redPacketGrantMode: "FIXED",
    redPacketClaimOrderMode: "FIRST_COME_FIRST_SERVED",
    redPacketTriggerType: "REPLY",
    jackpotInitialPoints: "100",
    redPacketUnitPoints: "10",
    redPacketTotalPoints: "10",
    redPacketPacketCount: "1",
    attachments: [],
  }
}

export function hasMeaningfulPostDraftContent(draft: LocalPostDraft, initialDraft: LocalPostDraft) {
  return JSON.stringify(draft) !== JSON.stringify(initialDraft)
}

function buildDraftStorageKey(mode: PostDraftMode, postId?: string) {
  if (mode === "edit" && postId) {
    return `${STORAGE_KEY_PREFIX}:edit:${postId}`
  }

  return `${STORAGE_KEY_PREFIX}:create`
}

export function getPostDraftStorageKey(mode: PostDraftMode, postId?: string) {
  return buildDraftStorageKey(mode, postId)
}

function createEmptyStoredDraftBucket(mode: PostDraftMode, postId?: string): StoredLocalPostDraftBucket {
  return {
    version: STORAGE_VERSION,
    mode,
    postId: mode === "edit" ? postId ?? null : null,
    drafts: [],
  }
}

function buildStoredDraftEntry(
  draft: LocalPostDraft,
  source: StoredLocalPostDraftEntry["source"],
  updatedAt = new Date().toISOString(),
  id = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): StoredLocalPostDraftEntry {
  return {
    id,
    updatedAt,
    source,
    data: draft,
  }
}

function normalizeStoredDraftData(draft: LocalPostDraft) {
  return {
    ...createEmptyLocalPostDraft(draft.boardSlug || ""),
    ...draft,
    manualTags: Array.isArray(draft.manualTags) ? draft.manualTags.filter((item): item is string => typeof item === "string") : [],
    lotteryPrizes: Array.isArray(draft.lotteryPrizes)
      ? draft.lotteryPrizes
          .filter((item): item is LocalPostDraft["lotteryPrizes"][number] => Boolean(item) && typeof item === "object" && !Array.isArray(item))
          .map((item) => ({
            title: typeof item.title === "string" ? item.title : "",
            quantity: typeof item.quantity === "string" ? item.quantity : "1",
            description: typeof item.description === "string" ? item.description : "",
            type: item.type === "POINTS" || item.type === "VIP" || item.type === "REDEEM_CODE" ? item.type : "MANUAL",
            pointsAmount: typeof item.pointsAmount === "string" ? item.pointsAmount : "100",
            vipPlan: item.vipPlan === "QUARTER" || item.vipPlan === "YEAR" ? item.vipPlan : "MONTH",
            redemptionCodes: typeof item.redemptionCodes === "string" ? item.redemptionCodes : "",
          }))
      : createEmptyLocalPostDraft(draft.boardSlug || "").lotteryPrizes,
    attachments: Array.isArray(draft.attachments)
      ? draft.attachments
          .filter((item): item is LocalPostDraft["attachments"][number] => Boolean(item) && typeof item === "object" && !Array.isArray(item))
          .map((item) => ({
            id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : undefined,
            sourceType: (item.sourceType === "EXTERNAL_LINK" ? "EXTERNAL_LINK" : "UPLOAD") as "UPLOAD" | "EXTERNAL_LINK",
            uploadId: typeof item.uploadId === "string" ? item.uploadId : "",
            name: typeof item.name === "string" ? item.name : "",
            externalUrl: typeof item.externalUrl === "string" ? item.externalUrl : "",
            externalCode: typeof item.externalCode === "string" ? item.externalCode : "",
            fileSize: typeof item.fileSize === "number" && Number.isFinite(item.fileSize) ? item.fileSize : null,
            fileExt: typeof item.fileExt === "string" ? item.fileExt : "",
            mimeType: typeof item.mimeType === "string" ? item.mimeType : "",
            minDownloadLevel: typeof item.minDownloadLevel === "string" ? item.minDownloadLevel : "0",
            minDownloadVipLevel: typeof item.minDownloadVipLevel === "string" ? item.minDownloadVipLevel : "0",
            pointsCost: typeof item.pointsCost === "string" ? item.pointsCost : "0",
            requireReplyUnlock: Boolean(item.requireReplyUnlock),
          }) satisfies LocalPostDraft["attachments"][number])
      : [],
  } satisfies LocalPostDraft
}

function normalizeStoredDraftEntry(
  value: unknown,
  source: StoredLocalPostDraftEntry["source"],
): StoredLocalPostDraftEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const raw = value as Partial<StoredLocalPostDraftEntry>
  if (!raw.data || typeof raw.data !== "object" || Array.isArray(raw.data)) {
    return null
  }

  return {
    id: typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt.trim()
        ? raw.updatedAt
        : new Date().toISOString(),
    source: raw.source === "manual" ? "manual" : source,
    data: normalizeStoredDraftData(raw.data as LocalPostDraft),
  }
}

function sortStoredDraftEntries(entries: StoredLocalPostDraftEntry[]) {
  return [...entries].sort((left, right) => {
    const leftTime = new Date(left.updatedAt).getTime()
    const rightTime = new Date(right.updatedAt).getTime()

    return rightTime - leftTime
  })
}

function buildStoredDraftStateKey(draft: LocalPostDraft) {
  return JSON.stringify(normalizeStoredDraftData(draft))
}

function readStoredDraftBucket(mode: PostDraftMode, postId?: string): StoredLocalPostDraftBucket {
  if (typeof window === "undefined") {
    return createEmptyStoredDraftBucket(mode, postId)
  }

  const raw = window.localStorage.getItem(buildDraftStorageKey(mode, postId))
  if (!raw) {
    return createEmptyStoredDraftBucket(mode, postId)
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredLocalPostDraftBucket>
    if (parsed?.version !== STORAGE_VERSION) {
      return createEmptyStoredDraftBucket(mode, postId)
    }

    const drafts = Array.isArray(parsed.drafts)
      ? sortStoredDraftEntries(
          parsed.drafts
            .map((item) => normalizeStoredDraftEntry(item, "manual"))
            .filter((item): item is StoredLocalPostDraftEntry => Boolean(item)),
        ).slice(0, MAX_DRAFT_BOX_ITEMS)
      : []

    return {
      version: STORAGE_VERSION,
      mode,
      postId: mode === "edit" ? postId ?? null : null,
      drafts,
    }
  } catch {
    return createEmptyStoredDraftBucket(mode, postId)
  }
}

function writeStoredDraftBucket(
  mode: PostDraftMode,
  postId: string | undefined,
  bucket: StoredLocalPostDraftBucket,
) {
  if (typeof window === "undefined") {
    return
  }

  const storageKey = buildDraftStorageKey(mode, postId)
  if (bucket.drafts.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }

  window.localStorage.setItem(storageKey, JSON.stringify(bucket))
}

function findMatchingDraftIndex(
  drafts: StoredLocalPostDraftEntry[],
  draft: LocalPostDraft,
  excludeDraftId?: string,
) {
  const nextStateKey = buildStoredDraftStateKey(draft)

  return drafts.findIndex((entry) => {
    if (excludeDraftId && entry.id === excludeDraftId) {
      return false
    }

    return buildStoredDraftStateKey(entry.data) === nextStateKey
  })
}

interface SavePostDraftToStorageOptions {
  draftId?: string
  source?: StoredLocalPostDraftEntry["source"]
}

export function savePostDraftToStorage(
  mode: PostDraftMode,
  draft: LocalPostDraft,
  initialDraft: LocalPostDraft,
  postId?: string,
  options?: SavePostDraftToStorageOptions,
) {
  if (typeof window === "undefined") {
    return null
  }

  const bucket = readStoredDraftBucket(mode, postId)
  if (!hasMeaningfulPostDraftContent(draft, initialDraft)) {
    if (options?.draftId) {
      writeStoredDraftBucket(mode, postId, {
        ...bucket,
        drafts: bucket.drafts.filter((entry) => entry.id !== options.draftId),
      })
    }
    return null
  }

  const updatedAt = new Date().toISOString()
  const source = options?.source ?? "autosave"
  const currentIndex = options?.draftId
    ? bucket.drafts.findIndex((entry) => entry.id === options.draftId)
    : -1
  const matchingStateIndex = findMatchingDraftIndex(bucket.drafts, draft, options?.draftId)
  const nextDrafts = [...bucket.drafts]

  let nextEntry: StoredLocalPostDraftEntry
  if (matchingStateIndex >= 0) {
    const matchingEntry = bucket.drafts[matchingStateIndex]
    nextEntry = buildStoredDraftEntry(
      draft,
      source,
      updatedAt,
      matchingEntry.id,
    )
    nextDrafts.splice(matchingStateIndex, 1)

    if (currentIndex >= 0 && currentIndex !== matchingStateIndex) {
      const currentEntryId = bucket.drafts[currentIndex]?.id
      if (currentEntryId) {
        const removableIndex = nextDrafts.findIndex((entry) => entry.id === currentEntryId)
        if (removableIndex >= 0) {
          nextDrafts.splice(removableIndex, 1)
        }
      }
    }
  } else if (currentIndex >= 0) {
    const currentEntry = bucket.drafts[currentIndex]
    nextEntry = buildStoredDraftEntry(
      draft,
      source,
      updatedAt,
      currentEntry.id,
    )
    nextDrafts.splice(currentIndex, 1)
  } else {
    nextEntry = buildStoredDraftEntry(draft, source, updatedAt)
  }

  const drafts = sortStoredDraftEntries([
    nextEntry,
    ...nextDrafts,
  ]).slice(0, MAX_DRAFT_BOX_ITEMS)

  writeStoredDraftBucket(mode, postId, {
    ...bucket,
    drafts,
  })

  return {
    entry: nextEntry,
    drafts,
  } satisfies SavedPostDraftResult
}

export function loadPostDraftFromStorage(mode: PostDraftMode, postId?: string): StoredLocalPostDraftEntry | null {
  return readStoredDraftBucket(mode, postId).drafts[0] ?? null
}

export function listPostDraftSnapshotsFromStorage(mode: PostDraftMode, postId?: string) {
  return readStoredDraftBucket(mode, postId).drafts
}

export function clearPostDraftFromStorage(mode: PostDraftMode, postId?: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem(buildDraftStorageKey(mode, postId))
}

export function deletePostDraftSnapshotFromStorage(
  mode: PostDraftMode,
  draftId: string,
  postId?: string,
) {
  if (typeof window === "undefined") {
    return []
  }

  const bucket = readStoredDraftBucket(mode, postId)
  const nextDrafts = bucket.drafts.filter((item) => item.id !== draftId)

  writeStoredDraftBucket(mode, postId, {
    ...bucket,
    drafts: nextDrafts,
  })

  return nextDrafts
}

export function deleteCurrentPostDraftFromStorage(
  mode: PostDraftMode,
  options: DeleteCurrentPostDraftFromStorageOptions = {},
) {
  if (typeof window === "undefined") {
    return []
  }

  const bucket = readStoredDraftBucket(mode, options.postId)
  const targetDraftId = options.draftId?.trim()
  const targetStateKeys = new Set(
    (options.drafts ?? [])
      .filter((draft): draft is LocalPostDraft => Boolean(draft))
      .map((draft) => buildStoredDraftStateKey(draft)),
  )

  const nextDrafts = bucket.drafts.filter((entry) => {
    if (targetDraftId && entry.id === targetDraftId) {
      return false
    }

    return !targetStateKeys.has(buildStoredDraftStateKey(entry.data))
  })

  if (nextDrafts.length === bucket.drafts.length) {
    return bucket.drafts
  }

  writeStoredDraftBucket(mode, options.postId, {
    ...bucket,
    drafts: nextDrafts,
  })

  return nextDrafts
}
