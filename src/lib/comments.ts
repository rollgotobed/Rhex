import { findCommentEffectFeedbackByCommentIds } from "@/db/comment-effect-feedback-queries"
import { countRootCommentsByPostId, countUserRepliesByPostId, countVisibleCommentsByPostId, findCommentRewardClaimsByCommentIds, findCommentsByIds, findFlatCommentPositionLookupsByPostId, findFlatCommentsByPostId, findRepliesByParentIds, findRootCommentsByPostId } from "@/db/comment-queries"
import { countPostGiftEventsBySenderForCommentIds, listCommentGiftStatsByCommentIds, listCommentGiftSupportAggregatesByCommentIds, listRecentCommentGiftEventsByCommentIds, type PostGiftRecentEventItem, type PostGiftStatItem } from "@/db/post-gift-queries"
import { countPostTipEventsBySenderForCommentIds, findPostTipSupportersByIds, listCommentTipSupportAggregatesByCommentIds } from "@/db/post-tip-queries"
import { getAiAgentUserId } from "@/lib/ai-agent"
import { formatRelativeTime } from "@/lib/formatters"
import type { AnonymousDisplayIdentity } from "@/lib/post-anonymous"
import type { PostTipLeaderboardItem } from "@/lib/post-tips"
import type { PostRewardPoolEffectFeedback } from "@/lib/post-reward-effect-feedback"
import type { PostRewardPoolMode } from "@/lib/post-reward-pool-config"
import {
  applyHookedUserPresentationToCommentThreads,
  applyHookedUserPresentationToFlatCommentItems,
} from "@/lib/user-presentation-server"
import { getUserDisplayName } from "@/lib/users"
import { getVipLevel, isVipActive } from "@/lib/vip-status"

const AUTHOR_ONLY_COMMENT_PLACEHOLDER = "此评论仅楼主可看"
const PRIVATE_COMMENT_PLACEHOLDER_PREFIX = "此回复仅"

interface SiteCommentRewardClaim {
  amount: number
  rewardMode: PostRewardPoolMode
}

function parseRewardEffectFeedback(rawValue: string) {
  try {
    const parsed = JSON.parse(rawValue) as PostRewardPoolEffectFeedback
    return parsed && Array.isArray(parsed.events) ? parsed : null
  } catch {
    return null
  }
}

export interface SiteCommentReplyItem {
  id: string
  status: "NORMAL" | "HIDDEN" | "PENDING"
  reviewNote?: string | null
  author: string
  authorIsAnonymous?: boolean
  authorIsAiAgent?: boolean
  authorId: number
  authorUsername: string
  authorAvatarPath?: string | null
  authorRole: "USER" | "MODERATOR" | "ADMIN"
  authorStatus: "ACTIVE" | "MUTED" | "BANNED" | "INACTIVE"
  authorIsVip?: boolean
  authorVipLevel?: number
  authorVerification?: {
    id: string
    name: string
    color: string
    iconText?: string | null
    customIconText?: string | null
    description?: string | null
    customDescription?: string | null
  } | null
  authorDisplayedBadges?: Array<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    color: string
    iconText?: string | null
  }>
  isPostAuthor: boolean
  postId: string
  replyToAuthor?: string
  isPrivate?: boolean
  canViewPrivateContent?: boolean
  privateRecipientName?: string | null
  privateRecipientUserId?: number | null
  content: string
  createdAt: string
  createdAtRaw: string
  likes: number
  viewerLiked?: boolean
  parentCommentId?: string
  parentCommentAuthor?: string
  parentCommentFloor?: number
  parentCommentExcerpt?: string
  parentCommentPage?: number
  replyToCommentId?: string
  replyToCommentAuthor?: string
  replyToCommentExcerpt?: string
  replyToCommentPage?: number
  flatFloor?: number
  rewardClaim?: SiteCommentRewardClaim
  rewardEffectFeedback?: PostRewardPoolEffectFeedback
  tipping?: {
    totalCount: number
    totalPoints: number
    usedCount?: number
    giftStats?: PostGiftStatItem[]
    recentGiftEvents?: PostGiftRecentEventItem[]
    topSupporters?: PostTipLeaderboardItem[]
  }
}

export interface SiteCommentItem {
  id: string
  status: "NORMAL" | "HIDDEN" | "PENDING"
  reviewNote?: string | null
  author: string
  authorIsAnonymous?: boolean
  authorIsAiAgent?: boolean
  authorId: number
  authorUsername: string
  authorAvatarPath?: string | null
  authorRole: "USER" | "MODERATOR" | "ADMIN"
  authorStatus: "ACTIVE" | "MUTED" | "BANNED" | "INACTIVE"
  authorIsVip?: boolean
  authorVipLevel?: number
  authorVerification?: {
    id: string
    name: string
    color: string
    iconText?: string | null
    customIconText?: string | null
    description?: string | null
    customDescription?: string | null
  } | null
  authorDisplayedBadges?: Array<{
    id: string
    code?: string | null
    name: string
    description?: string | null
    color: string
    iconText?: string | null
  }>
  isPostAuthor: boolean
  postId: string
  isPrivate?: boolean
  canViewPrivateContent?: boolean
  privateRecipientName?: string | null
  privateRecipientUserId?: number | null
  content: string
  createdAt: string
  createdAtRaw: string
  likes: number
  viewerLiked?: boolean
  rewardClaim?: SiteCommentRewardClaim
  rewardEffectFeedback?: PostRewardPoolEffectFeedback
  tipping?: {
    totalCount: number
    totalPoints: number
    usedCount?: number
    giftStats?: PostGiftStatItem[]
    recentGiftEvents?: PostGiftRecentEventItem[]
    topSupporters?: PostTipLeaderboardItem[]
  }
  floor: number
  isAcceptedAnswer: boolean
  isPinnedByAuthor: boolean
  isGodComment: boolean
  replies: SiteCommentReplyItem[]
}

export interface GetCommentsOptions {
  sort?: "oldest" | "newest"
  page?: number
  pageSize?: number
  viewMode?: "tree" | "flat"
}

export type SiteFlatCommentItem = {
  type: "comment"
  comment: SiteCommentItem
} | {
  type: "reply"
  reply: SiteCommentReplyItem
}

export interface SiteCommentListResult {
  items: SiteCommentItem[]
  flatItems: SiteFlatCommentItem[]
  total: number
  page: number
  pageSize: number
  viewMode: "tree" | "flat"
}

interface CommentQueryUser {
  id: number
  username: string
  nickname: string | null
  avatarPath: string | null
  role: "USER" | "MODERATOR" | "ADMIN"
  status: "ACTIVE" | "MUTED" | "BANNED" | "INACTIVE"
  vipLevel: number | null
  vipExpiresAt: Date | null
  userBadges?: Array<{
    isDisplayed?: boolean
    displayOrder?: number
    badge: {
      id: string
      code: string
      name: string
      description?: string | null
      color: string
      iconText?: string | null
      status: boolean
    }
  }>
  verificationApplications?: Array<{
    customIconText?: string | null
    customDescription?: string | null
    type: {
      id: string
      name: string
      color: string
      iconText?: string | null
      description?: string | null
    }
  }>
}

interface CommentQueryLike {
  userId: number
}

function getVipState(user: CommentQueryUser) {
  return {
    authorIsVip: Boolean(user.vipExpiresAt && new Date(user.vipExpiresAt).getTime() > Date.now()),
    authorVipLevel: user.vipLevel ?? 0,
  }
}

function mapDisplayedBadges(user: CommentQueryUser) {
  return (user.userBadges ?? [])
    .filter((item) => Boolean(item.isDisplayed) && item.badge.status)
    .slice(0, 3)
    .map((item) => ({
      id: item.badge.id,
      code: item.badge.code,
      name: item.badge.name,
      description: item.badge.description,
      color: item.badge.color,
      iconText: item.badge.iconText,
    }))
}

function mapVerification(user: CommentQueryUser) {
  const item = user.verificationApplications?.[0]
  if (!item) {
    return null
  }

  return {
    id: item.type.id,
    name: item.type.name,
    color: item.type.color,
    iconText: item.type.iconText,
    customIconText: item.customIconText,
    description: item.type.description,
    customDescription: item.customDescription,
  }
}

function getAnonymousCommentIdentity(identity?: AnonymousDisplayIdentity | null) {
  return {
    author: identity?.name ?? identity?.username ?? "匿名用户",
    authorUsername: identity?.username ?? "anonymous-user",
    authorAvatarPath: identity?.avatarPath ?? null,
    authorRole: "USER" as const,
    authorStatus: identity?.status ?? "ACTIVE" as const,
    authorIsVip: false,
    authorVipLevel: 0,
    authorVerification: null,
    authorDisplayedBadges: [],
  }
}

function buildCommentExcerpt(content: string, limit = 56) {
  const normalized = content.replace(/\s+/g, " ").trim()
  if (!normalized) {
    return "原评论内容为空"
  }

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

function buildPrivateCommentPlaceholder(recipientName?: string | null) {
  return recipientName
    ? `${PRIVATE_COMMENT_PLACEHOLDER_PREFIX} ${recipientName} 可见`
    : "此回复为私密回复"
}

export async function getCommentsByPostId(
  postId: string,
  options: GetCommentsOptions = {},
  viewer?: {
    userId?: number
    isAdmin?: boolean
    postAuthorId?: number
    postIsAnonymous?: boolean
    commentsVisibleToAuthorOnly?: boolean
    anonymousPostAuthor?: AnonymousDisplayIdentity | null
  },
): Promise<SiteCommentListResult> {
  const sort = options.sort ?? "oldest"
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10))
  const viewMode = options.viewMode ?? "tree"
  try {
    const aiAgentUserId = await getAiAgentUserId()

    const shouldMaskComment = (authorId: number) => {
      if (!viewer?.commentsVisibleToAuthorOnly) {
        return false
      }
      if (viewer.isAdmin) {
        return false
      }
      if (!viewer.userId) {
        return true
      }
      return viewer.userId !== viewer.postAuthorId && viewer.userId !== authorId
    }

    type RawCommentRecord = {
      id: string
      status: "NORMAL" | "HIDDEN" | "PENDING"
      reviewNote: string | null
      userId: number
      useAnonymousIdentity: boolean
      parentId: string | null
      privateRecipientUserId: number | null
      content: string
      likeCount: number
      tipCount: number
      tipTotalPoints: number
      isAcceptedAnswer: boolean
      isPinnedByAuthor: boolean
      isGodComment: boolean
      createdAt: Date
      user: CommentQueryUser
      privateRecipient?: CommentQueryUser | null
      replyToUser?: CommentQueryUser | null
      parent?: {
        id: string
        status: "NORMAL" | "HIDDEN" | "PENDING"
        userId: number
        useAnonymousIdentity: boolean
        privateRecipientUserId: number | null
        privateRecipient?: CommentQueryUser | null
        content: string
        createdAt: Date
      } | null
      replyToComment?: {
        id: string
        status: "NORMAL" | "HIDDEN" | "PENDING"
        userId: number
        useAnonymousIdentity: boolean
        privateRecipientUserId: number | null
        privateRecipient?: CommentQueryUser | null
        content: string
        createdAt: Date
        user: CommentQueryUser
      } | null
      likes?: CommentQueryLike[]
    }

    const getPrivateRecipientName = (comment: Pick<RawCommentRecord, "privateRecipientUserId" | "privateRecipient">) => (
      comment.privateRecipientUserId
        ? comment.privateRecipient
          ? getUserDisplayName(comment.privateRecipient)
          : "指定用户"
        : null
    )

    const canViewPrivateCommentContent = (comment: Pick<RawCommentRecord, "userId" | "privateRecipientUserId">) => {
      if (!comment.privateRecipientUserId) {
        return true
      }

      return Boolean(viewer?.userId && (viewer.userId === comment.userId || viewer.userId === comment.privateRecipientUserId))
    }

    const resolveCommentContentForViewer = (comment: Pick<RawCommentRecord, "userId" | "privateRecipientUserId" | "privateRecipient" | "content">) => {
      if (!canViewPrivateCommentContent(comment)) {
        return buildPrivateCommentPlaceholder(getPrivateRecipientName(comment))
      }

      return shouldMaskComment(comment.userId) ? AUTHOR_ONLY_COMMENT_PLACEHOLDER : comment.content
    }

    const mapReplyItem = (
      comment: RawCommentRecord,
      extra?: {
        parentCommentAuthor?: string
        parentCommentFloor?: number
        parentCommentPage?: number
        parentCommentExcerpt?: string
        replyToCommentId?: string
        replyToCommentAuthor?: string
        replyToCommentExcerpt?: string
        replyToCommentPage?: number
        flatFloor?: number
      },
    ): SiteCommentReplyItem => {
      const replyVipState = getVipState(comment.user)
      const displayAsAnonymous = Boolean(viewer?.postIsAnonymous && comment.useAnonymousIdentity)
      const isVisiblePostAuthor = Boolean(comment.userId === viewer?.postAuthorId && !displayAsAnonymous)
      const displayIdentity = displayAsAnonymous ? viewer?.anonymousPostAuthor : null
      const anonymousCommentIdentity = getAnonymousCommentIdentity(displayIdentity)
      const replyToAuthor = viewer?.postIsAnonymous && comment.replyToComment?.useAnonymousIdentity
        ? (viewer.anonymousPostAuthor?.name ?? viewer.anonymousPostAuthor?.username ?? "匿名用户")
        : (comment.replyToUser ? comment.replyToUser.nickname ?? comment.replyToUser.username : undefined)
      const privateRecipientName = getPrivateRecipientName(comment)
      const canViewPrivateContent = canViewPrivateCommentContent(comment)

      return {
        id: comment.id,
        status: comment.status,
        reviewNote: comment.reviewNote,
        postId,
        author: displayAsAnonymous ? anonymousCommentIdentity.author : (comment.user.nickname ?? comment.user.username),
        authorIsAnonymous: displayAsAnonymous,
        authorIsAiAgent: !displayAsAnonymous && comment.userId === aiAgentUserId,
        authorId: comment.userId,
        authorUsername: displayAsAnonymous ? anonymousCommentIdentity.authorUsername : comment.user.username,
        authorAvatarPath: displayAsAnonymous ? anonymousCommentIdentity.authorAvatarPath : comment.user.avatarPath,
        authorRole: displayAsAnonymous ? anonymousCommentIdentity.authorRole : comment.user.role,
        authorStatus: displayAsAnonymous ? anonymousCommentIdentity.authorStatus : comment.user.status,
        authorIsVip: displayAsAnonymous ? anonymousCommentIdentity.authorIsVip : replyVipState.authorIsVip,
        authorVipLevel: displayAsAnonymous ? anonymousCommentIdentity.authorVipLevel : replyVipState.authorVipLevel,
        authorVerification: displayAsAnonymous ? anonymousCommentIdentity.authorVerification : mapVerification(comment.user),
        authorDisplayedBadges: displayAsAnonymous ? anonymousCommentIdentity.authorDisplayedBadges : mapDisplayedBadges(comment.user),
        isPostAuthor: isVisiblePostAuthor,
        replyToAuthor,
        isPrivate: Boolean(comment.privateRecipientUserId),
        canViewPrivateContent,
        privateRecipientName,
        privateRecipientUserId: comment.privateRecipientUserId,
        content: resolveCommentContentForViewer(comment),
        createdAt: formatRelativeTime(comment.createdAt),
        createdAtRaw: comment.createdAt.toISOString(),
        likes: comment.likeCount,
        viewerLiked: Boolean(viewer?.userId && comment.likes?.some((item) => item.userId === viewer.userId)),
        parentCommentId: comment.parentId ?? undefined,
        parentCommentAuthor: extra?.parentCommentAuthor,
        parentCommentFloor: extra?.parentCommentFloor,
        parentCommentPage: extra?.parentCommentPage,
        parentCommentExcerpt: extra?.parentCommentExcerpt,
        replyToCommentId: extra?.replyToCommentId,
        replyToCommentAuthor: extra?.replyToCommentAuthor,
        replyToCommentExcerpt: extra?.replyToCommentExcerpt,
        replyToCommentPage: extra?.replyToCommentPage,
        flatFloor: extra?.flatFloor,
        tipping: {
          totalCount: comment.tipCount,
          totalPoints: comment.tipTotalPoints,
          usedCount: 0,
          giftStats: [],
          recentGiftEvents: [],
          topSupporters: [],
        },
      }
    }

    const mapRootCommentItem = (comment: RawCommentRecord, floor: number, replies: SiteCommentReplyItem[] = []): SiteCommentItem => {
      const displayAsAnonymous = Boolean(viewer?.postIsAnonymous && comment.useAnonymousIdentity)
      const isVisiblePostAuthor = Boolean(comment.userId === viewer?.postAuthorId && !displayAsAnonymous)
      const displayIdentity = displayAsAnonymous ? viewer?.anonymousPostAuthor : null
      const anonymousCommentIdentity = getAnonymousCommentIdentity(displayIdentity)
      const privateRecipientName = getPrivateRecipientName(comment)
      const canViewPrivateContent = canViewPrivateCommentContent(comment)

      return {
        id: comment.id,
        status: comment.status,
        reviewNote: comment.reviewNote,
        postId,
        author: displayAsAnonymous ? anonymousCommentIdentity.author : getUserDisplayName(comment.user),
        authorIsAnonymous: displayAsAnonymous,
        authorIsAiAgent: !displayAsAnonymous && comment.userId === aiAgentUserId,
        authorId: comment.userId,
        authorUsername: displayAsAnonymous ? anonymousCommentIdentity.authorUsername : comment.user.username,
        authorAvatarPath: displayAsAnonymous ? anonymousCommentIdentity.authorAvatarPath : comment.user.avatarPath,
        authorRole: displayAsAnonymous ? anonymousCommentIdentity.authorRole : comment.user.role,
        authorStatus: displayAsAnonymous ? anonymousCommentIdentity.authorStatus : comment.user.status,
        authorIsVip: displayAsAnonymous ? anonymousCommentIdentity.authorIsVip : isVipActive(comment.user),
        authorVipLevel: displayAsAnonymous ? anonymousCommentIdentity.authorVipLevel : getVipLevel(comment.user),
        authorVerification: displayAsAnonymous ? anonymousCommentIdentity.authorVerification : mapVerification(comment.user),
        authorDisplayedBadges: displayAsAnonymous ? anonymousCommentIdentity.authorDisplayedBadges : mapDisplayedBadges(comment.user),
        isPostAuthor: isVisiblePostAuthor,
        isPrivate: Boolean(comment.privateRecipientUserId),
        canViewPrivateContent,
        privateRecipientName,
        privateRecipientUserId: comment.privateRecipientUserId,
        content: resolveCommentContentForViewer(comment),
        createdAt: formatRelativeTime(comment.createdAt),
        createdAtRaw: comment.createdAt.toISOString(),
        likes: comment.likeCount,
        viewerLiked: Boolean(viewer?.userId && comment.likes?.some((item) => item.userId === viewer.userId)),
        tipping: {
          totalCount: comment.tipCount,
          totalPoints: comment.tipTotalPoints,
          usedCount: 0,
          giftStats: [],
          recentGiftEvents: [],
          topSupporters: [],
        },
        rewardClaim: undefined,
        rewardEffectFeedback: undefined,
        floor,
        isAcceptedAnswer: comment.isAcceptedAnswer,
        isPinnedByAuthor: comment.isPinnedByAuthor,
        isGodComment: comment.isGodComment,
        replies,
      }
    }

    const getCommentDisplayAuthor = (comment: Pick<RawCommentRecord, "userId" | "useAnonymousIdentity" | "user">) => {
      const displayAsAnonymous = Boolean(viewer?.postIsAnonymous && comment.useAnonymousIdentity)
      if (displayAsAnonymous) {
        return viewer?.anonymousPostAuthor?.name ?? viewer?.anonymousPostAuthor?.username ?? "匿名用户"
      }

      return getUserDisplayName(comment.user)
    }

    const attachGiftStats = async <TComment extends SiteCommentItem | SiteCommentReplyItem>(items: TComment[]) => {
      const commentIds = Array.from(new Set(items.map((item) => item.id).filter(Boolean)))
      if (commentIds.length === 0) {
        return
      }

      const [
        giftStatsRows,
        recentGiftEventRows,
        rawTipSupporters,
        giftSupporters,
        rawUsedRows,
        giftUsedRows,
      ] = await Promise.all([
        listCommentGiftStatsByCommentIds(commentIds),
        listRecentCommentGiftEventsByCommentIds(commentIds),
        listCommentTipSupportAggregatesByCommentIds(commentIds, 20),
        listCommentGiftSupportAggregatesByCommentIds(commentIds, 20),
        viewer?.userId
          ? countPostTipEventsBySenderForCommentIds({ senderId: viewer.userId, commentIds })
          : Promise.resolve([]),
        viewer?.userId
          ? countPostGiftEventsBySenderForCommentIds({ senderId: viewer.userId, commentIds })
          : Promise.resolve([]),
      ])

      const giftStatsByCommentId = new Map<string, PostGiftStatItem[]>()
      for (const { commentId, ...giftStat } of giftStatsRows) {
        const current = giftStatsByCommentId.get(commentId) ?? []
        current.push(giftStat)
        giftStatsByCommentId.set(commentId, current)
      }

      const recentGiftEventsByCommentId = new Map<string, PostGiftRecentEventItem[]>()
      for (const { commentId, ...recentGiftEvent } of recentGiftEventRows) {
        const current = recentGiftEventsByCommentId.get(commentId) ?? []
        current.push(recentGiftEvent)
        recentGiftEventsByCommentId.set(commentId, current)
      }

      const usedTipCountByCommentId = new Map(rawUsedRows.map((row) => [row.commentId, row.count]))
      const usedGiftCountByCommentId = new Map(giftUsedRows.map((row) => [row.commentId, row.count]))
      const supporterTotalsByCommentId = new Map<string, Map<number, number>>()

      const addSupporterTotal = (commentId: string, senderId: number, totalAmount: number) => {
        const supporterTotals = supporterTotalsByCommentId.get(commentId) ?? new Map<number, number>()
        supporterTotals.set(senderId, (supporterTotals.get(senderId) ?? 0) + totalAmount)
        supporterTotalsByCommentId.set(commentId, supporterTotals)
      }

      for (const row of rawTipSupporters) {
        addSupporterTotal(row.commentId, row.senderId, row.totalAmount)
      }

      for (const row of giftSupporters) {
        addSupporterTotal(row.commentId, row.senderId, row.totalAmount)
      }

      const supporterRowsByCommentId = new Map<string, Array<{ senderId: number; totalAmount: number }>>()
      const supporterIds = new Set<number>()
      for (const [commentId, supporterTotals] of supporterTotalsByCommentId.entries()) {
        const supporterRows = Array.from(supporterTotals.entries())
          .map(([senderId, totalAmount]) => ({ senderId, totalAmount }))
          .sort((left, right) => right.totalAmount - left.totalAmount)
          .slice(0, 20)

        supporterRows.forEach((row) => supporterIds.add(row.senderId))
        supporterRowsByCommentId.set(commentId, supporterRows)
      }

      const supporterProfiles = await findPostTipSupportersByIds(Array.from(supporterIds))
      const supporterMap = new Map(supporterProfiles.map((profile) => [profile.id, profile]))

      for (const item of items) {
        const supporterRows = supporterRowsByCommentId.get(item.id) ?? []
        const topSupporters: PostTipLeaderboardItem[] = supporterRows.flatMap((row) => {
          const supporter = supporterMap.get(row.senderId)
          if (!supporter) {
            return []
          }

          return [{
            userId: supporter.id,
            username: supporter.username,
            nickname: supporter.nickname,
            avatarPath: supporter.avatarPath,
            totalAmount: row.totalAmount,
          }]
        })

        item.tipping = {
          totalCount: item.tipping?.totalCount ?? 0,
          totalPoints: item.tipping?.totalPoints ?? 0,
          usedCount: (usedTipCountByCommentId.get(item.id) ?? 0) + (usedGiftCountByCommentId.get(item.id) ?? 0),
          giftStats: giftStatsByCommentId.get(item.id) ?? [],
          recentGiftEvents: recentGiftEventsByCommentId.get(item.id) ?? [],
          topSupporters,
        }
      }
    }

    if (viewMode === "flat") {
      const [total, rawComments] = await Promise.all([
        countVisibleCommentsByPostId({
          postId,
          viewerUserId: viewer?.userId,
          includeHidden: true,
          includePendingOwn: Boolean(viewer?.userId),
          includePendingAll: Boolean(viewer?.isAdmin),
        }),
        findFlatCommentsByPostId({
          postId,
          sort,
          page,
          pageSize,
          viewerUserId: viewer?.userId,
          includeHidden: true,
          includePendingOwn: Boolean(viewer?.userId),
          includePendingAll: Boolean(viewer?.isAdmin),
        }),
      ])

      const flatComments = rawComments as unknown as RawCommentRecord[]
      const commentIds = flatComments.map((comment) => comment.id)
      const parentIds = [...new Set(flatComments.map((comment) => comment.parentId).filter((commentId): commentId is string => Boolean(commentId)))]
      const replyToCommentIds = [...new Set(flatComments.map((comment) => comment.replyToComment?.id).filter((commentId): commentId is string => Boolean(commentId)))]
      const flatPositionCommentIds = [...new Set([
        ...commentIds,
        ...parentIds,
        ...replyToCommentIds,
      ])]
      const missingParentIds = parentIds.filter((parentId) => !flatComments.some((comment) => comment.id === parentId))
      const [parentComments, positionLookups, rewardClaims, rewardEffectFeedbackRows] = await Promise.all([
        findCommentsByIds({
          commentIds: missingParentIds,
          viewerUserId: viewer?.userId,
          includeHidden: true,
          includePendingOwn: Boolean(viewer?.userId),
          includePendingAll: Boolean(viewer?.isAdmin),
        }) as Promise<RawCommentRecord[]>,
        findFlatCommentPositionLookupsByPostId({
          postId,
          rootCommentIds: parentIds,
          visibleCommentIds: commentIds,
          flatCommentIds: flatPositionCommentIds,
          sort,
          pageSize,
          viewerUserId: viewer?.userId,
          includeHidden: true,
          includePendingOwn: Boolean(viewer?.userId),
          includePendingAll: Boolean(viewer?.isAdmin),
        }),
        findCommentRewardClaimsByCommentIds(postId, commentIds),
        findCommentEffectFeedbackByCommentIds(postId, commentIds),
      ])
      const rootFloorMap = new Map(positionLookups.rootPositions.map((row) => [row.id, row.position]))
      const flatCommentPageMap = new Map(positionLookups.flatPositions.map((row) => [row.id, row.page]))
      const flatCommentFloorMap = new Map(positionLookups.visiblePositions.map((row) => [row.id, row.position]))
      const parentCommentEntries: Array<[string, RawCommentRecord]> = [
        ...flatComments
          .filter((comment) => comment.parentId === null)
          .map((comment): [string, RawCommentRecord] => [comment.id, comment]),
        ...parentComments.map((comment): [string, RawCommentRecord] => [comment.id, comment]),
      ]
      const parentCommentMap = new Map<string, RawCommentRecord>(parentCommentEntries)

      const rewardClaimMap = new Map<string, SiteCommentRewardClaim>()
      const rewardEffectFeedbackMap = new Map<string, PostRewardPoolEffectFeedback>()

      rewardClaims.forEach((claim) => {
        if (!claim.triggerCommentId) {
          return
        }

        rewardClaimMap.set(claim.triggerCommentId, {
          amount: claim.amount,
          rewardMode: claim.redPacket.packetCount > 0 ? "RED_PACKET" : "JACKPOT",
        })
      })

      rewardEffectFeedbackRows.forEach((row) => {
        const parsed = parseRewardEffectFeedback(row.feedbackJson)
        if (parsed) {
          rewardEffectFeedbackMap.set(row.commentId, parsed)
        }
      })

      const flatItems: SiteFlatCommentItem[] = flatComments.map((comment) => {
        if (!comment.parentId) {
          const floor = flatCommentFloorMap.get(comment.id) ?? 0
          const mappedComment = mapRootCommentItem(comment, floor)
          mappedComment.rewardClaim = rewardClaimMap.get(comment.id)
          mappedComment.rewardEffectFeedback = rewardEffectFeedbackMap.get(comment.id)

          return {
            type: "comment",
            comment: mappedComment,
          }
        }

        const parentComment = parentCommentMap.get(comment.parentId)
        const parentCommentIsVisible = parentComment
          ? !(parentComment.status === "HIDDEN" && !viewer?.isAdmin)
          : false
        const parentCommentExcerpt = parentComment
          ? !canViewPrivateCommentContent(parentComment)
            ? buildPrivateCommentPlaceholder(getPrivateRecipientName(parentComment))
            : shouldMaskComment(parentComment.userId)
              ? AUTHOR_ONLY_COMMENT_PLACEHOLDER
              : parentCommentIsVisible
              ? buildCommentExcerpt(parentComment.content)
              : "原评论当前不可见"
          : "原评论不存在或已不可见"
        const referenceComment = comment.replyToComment ?? parentComment
        const referenceCommentIsVisible = referenceComment
          ? !(referenceComment.status === "HIDDEN" && !viewer?.isAdmin)
          : false
        const referenceCommentExcerpt = referenceComment
          ? !canViewPrivateCommentContent(referenceComment)
            ? buildPrivateCommentPlaceholder(getPrivateRecipientName(referenceComment))
            : shouldMaskComment(referenceComment.userId)
              ? AUTHOR_ONLY_COMMENT_PLACEHOLDER
              : referenceCommentIsVisible
              ? buildCommentExcerpt(referenceComment.content)
              : "原评论当前不可见"
          : "原评论不存在或已不可见"
        const mappedReply = mapReplyItem(comment, {
          parentCommentAuthor: parentComment ? getCommentDisplayAuthor(parentComment) : undefined,
          parentCommentFloor: rootFloorMap.get(comment.parentId) ?? 0,
          parentCommentPage: flatCommentPageMap.get(comment.parentId) ?? 1,
          parentCommentExcerpt,
          replyToCommentId: referenceComment?.id,
          replyToCommentAuthor: referenceComment ? getCommentDisplayAuthor(referenceComment) : undefined,
          replyToCommentExcerpt: referenceCommentExcerpt,
          replyToCommentPage: referenceComment ? flatCommentPageMap.get(referenceComment.id) ?? 1 : undefined,
          flatFloor: flatCommentFloorMap.get(comment.id),
        })
        mappedReply.rewardClaim = rewardClaimMap.get(comment.id)
        mappedReply.rewardEffectFeedback = rewardEffectFeedbackMap.get(comment.id)

        return {
          type: "reply",
          reply: mappedReply,
        }
      })

      const flatGiftTargets: Array<SiteCommentItem | SiteCommentReplyItem> = flatItems.map((item) => (
        item.type === "comment" ? item.comment : item.reply
      ))
      await attachGiftStats(flatGiftTargets)

      return {
        items: [],
        flatItems: await applyHookedUserPresentationToFlatCommentItems(flatItems),
        total,
        page,
        pageSize,
        viewMode,
      }
    }

    const [total, rawRootComments] = await Promise.all([
      countRootCommentsByPostId({
        postId,
        viewerUserId: viewer?.userId,
        includeHidden: true,
        includePendingOwn: Boolean(viewer?.userId),
        includePendingAll: Boolean(viewer?.isAdmin),
      }),
      findRootCommentsByPostId({
        postId,
        sort,
        page,
        pageSize,
        viewerUserId: viewer?.userId,
        includeHidden: true,
        includePendingOwn: Boolean(viewer?.userId),
        includePendingAll: Boolean(viewer?.isAdmin),
      }),
    ])

    const rootComments = rawRootComments as unknown as RawCommentRecord[]
    const rootIds = rootComments.map((comment) => comment.id)
    const floorStart = sort === "newest" ? Math.max(total - (page - 1) * pageSize, 0) : (page - 1) * pageSize + 1
    const rootFloorMap = new Map<string, number>(rootComments.map((comment, index) => [
      comment.id,
      sort === "newest" ? floorStart - index : floorStart + index,
    ]))
    const rootPageMap = new Map<string, number>(rootComments.map((comment) => [comment.id, page]))
    const replies = await findRepliesByParentIds({
      postId,
      parentIds: rootIds,
      sort,
      viewerUserId: viewer?.userId,
      includeHidden: true,
      includePendingOwn: Boolean(viewer?.userId),
      includePendingAll: Boolean(viewer?.isAdmin),
    }) as unknown as RawCommentRecord[]
    const commentIds = [
      ...rootIds,
      ...replies.map((comment) => comment.id),
    ]
    const [rewardClaims, rewardEffectFeedbackRows] = await Promise.all([
      findCommentRewardClaimsByCommentIds(postId, commentIds),
      findCommentEffectFeedbackByCommentIds(postId, commentIds),
    ])
    const rewardClaimMap = new Map<string, SiteCommentRewardClaim>()
    const rewardEffectFeedbackMap = new Map<string, PostRewardPoolEffectFeedback>()

    rewardClaims.forEach((claim) => {
      if (!claim.triggerCommentId) {
        return
      }

      rewardClaimMap.set(claim.triggerCommentId, {
        amount: claim.amount,
        rewardMode: claim.redPacket.packetCount > 0 ? "RED_PACKET" : "JACKPOT",
      })
    })

    rewardEffectFeedbackRows.forEach((row) => {
      const parsed = parseRewardEffectFeedback(row.feedbackJson)
      if (parsed) {
        rewardEffectFeedbackMap.set(row.commentId, parsed)
      }
    })

    const repliesByParentId = new Map<string, SiteCommentReplyItem[]>()

    replies.forEach((comment) => {
      const parentId = comment.parentId as string
      const currentReplies = repliesByParentId.get(parentId) ?? []
      const mappedReply = mapReplyItem(comment, {
        parentCommentFloor: rootFloorMap.get(parentId) ?? 0,
        parentCommentPage: rootPageMap.get(parentId) ?? 1,
      })
      mappedReply.rewardClaim = rewardClaimMap.get(comment.id)
      mappedReply.rewardEffectFeedback = rewardEffectFeedbackMap.get(comment.id)
      currentReplies.push(mappedReply)

      repliesByParentId.set(parentId, currentReplies)
    })

    const normalizedComments: SiteCommentItem[] = rootComments.map((comment, index) => {
      const repliesForComment = repliesByParentId.get(comment.id) ?? []
      const floor = sort === "newest" ? floorStart - index : floorStart + index
      const mappedComment = mapRootCommentItem(comment, floor, repliesForComment)
      mappedComment.rewardClaim = rewardClaimMap.get(comment.id)
      mappedComment.rewardEffectFeedback = rewardEffectFeedbackMap.get(comment.id)
      return mappedComment
    })

    await attachGiftStats(normalizedComments.flatMap((comment) => [comment, ...comment.replies]))

    return {
      items: await applyHookedUserPresentationToCommentThreads(normalizedComments),
      flatItems: [],
      total,
      page,
      pageSize,
      viewMode,
    }
  } catch (error) {
    console.error(error)
    return {
      items: [],
      flatItems: [],
      total: 0,
      page,
      pageSize,
      viewMode,
    }
  }
}

export async function getUserReplyCountByPost(postId: string, userId?: number) {
  if (!userId) {
    return 0
  }

  try {
    return await countUserRepliesByPostId(postId, userId)
  } catch (error) {
    console.error(error)
    return 0
  }
}
