import { CommentStatus, NotificationType, Prisma } from "@/db/types"
import { incrementBoardTreasuryPoints } from "@/db/board-treasury-queries"
import { prisma } from "@/db/client"
import { applyPointDelta, type PreparedPointDelta } from "@/lib/point-center"
import { getBoardTreasuryCreditFromConfiguredCharge } from "@/lib/board-treasury"
import { createNotifications } from "@/lib/notification-writes"
import { POINT_LOG_EVENT_TYPES } from "@/lib/point-log-events"


const commentViewerLikeSelect = {
  userId: true,
} as const

function parseNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "bigint") {
    return Number(value)
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

const commentDisplayedBadgesInclude = {
  where: {
    isDisplayed: true,
    badge: {
      status: true,
    },
  },
  orderBy: [{ displayOrder: "asc" }, { grantedAt: "desc" }],
  take: 3,
  include: {
    badge: true,
  },
} satisfies Prisma.User$userBadgesArgs

const commentUserSelect = {
  id: true,
  username: true,
  nickname: true,
  avatarPath: true,
  role: true,
  status: true,
  vipLevel: true,
  vipExpiresAt: true,
  userBadges: commentDisplayedBadgesInclude,
  verificationApplications: {
    where: {
      status: "APPROVED",
    },
    orderBy: [{ reviewedAt: "desc" }, { submittedAt: "desc" }] as Prisma.UserVerificationOrderByWithRelationInput[],
    take: 1,
    include: {
      type: true,
    },
  },
} satisfies Prisma.UserSelect



export function findCommentAuthorByUserId(userId: number) {
  return prisma.user.findUnique({ where: { id: userId } })
}

export function findCommentParentById(parentId: string) {
  return prisma.comment.findUnique({
    where: { id: parentId },
    select: {
      id: true,
      postId: true,
      status: true,
      parentId: true,
      userId: true,
      useAnonymousIdentity: true,
      user: {
        select: {
          username: true,
          nickname: true,
        },
      },
    },
  })
}

export function findEditableCommentById(commentId: string) {
  return prisma.comment.findUnique({
    where: { id: commentId },
    select: {
      id: true,
      postId: true,
      userId: true,
      status: true,
      content: true,
      createdAt: true,
    },
  })
}

export function buildCommentViewerLikesInclude(viewerUserId?: number) {
  if (!viewerUserId) {
    return false as const
  }

  return {
    where: {
      userId: viewerUserId,
    },
    select: commentViewerLikeSelect,
  }
}

export function buildCommentListInclude(viewerUserId?: number) {
  return {
    user: {
      select: commentUserSelect,
    },
    privateRecipient: {
      select: commentUserSelect,
    },
    likes: buildCommentViewerLikesInclude(viewerUserId),
  }
}

export function buildCommentReplyInclude(viewerUserId?: number) {
  return {
    user: {
      select: commentUserSelect,
    },
    replyToComment: {
      select: {
        id: true,
        status: true,
        userId: true,
        useAnonymousIdentity: true,
        privateRecipientUserId: true,
        content: true,
        createdAt: true,
        privateRecipient: {
          select: commentUserSelect,
        },
        user: {
          select: commentUserSelect,
        },
      },
    },
    replyToUser: {
      select: commentUserSelect,
    },
    privateRecipient: {
      select: commentUserSelect,
    },
    likes: buildCommentViewerLikesInclude(viewerUserId),
  }
}

export function buildFlatCommentInclude(viewerUserId?: number) {
  return {
    user: {
      select: commentUserSelect,
    },
    parent: {
      select: {
        id: true,
        status: true,
        userId: true,
        useAnonymousIdentity: true,
        privateRecipientUserId: true,
        content: true,
        createdAt: true,
        privateRecipient: {
          select: commentUserSelect,
        },
      },
    },
    replyToComment: {
      select: {
        id: true,
        status: true,
        userId: true,
        useAnonymousIdentity: true,
        privateRecipientUserId: true,
        content: true,
        createdAt: true,
        privateRecipient: {
          select: commentUserSelect,
        },
        user: {
          select: commentUserSelect,
        },
      },
    },
    replyToUser: {
      select: commentUserSelect,
    },
    privateRecipient: {
      select: commentUserSelect,
    },
    likes: buildCommentViewerLikesInclude(viewerUserId),
  }
}

export function findPrivateCommentRecipientById(userId: number) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      nickname: true,
      status: true,
    },
  })
}

function buildCommentVisibilityWhere(params: {
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}): Prisma.CommentWhereInput {
  const visibleStatuses: CommentStatus[] = [CommentStatus.NORMAL]

  if (params.includeHidden) {
    visibleStatuses.push(CommentStatus.HIDDEN)
  }

  const conditions: Prisma.CommentWhereInput[] = [
    {
      status: {
        in: visibleStatuses,
      },
    },
  ]

  if (params.includePendingAll) {
    conditions.push({ status: CommentStatus.PENDING })
  } else if (params.includePendingOwn && params.viewerUserId) {
    conditions.push({
      status: CommentStatus.PENDING,
      userId: params.viewerUserId,
    })
  }

  return conditions.length === 1 ? conditions[0] : { OR: conditions }
}

function buildCommentBlockVisibilityWhere(viewerUserId?: number): Prisma.CommentWhereInput {
  if (!viewerUserId) {
    return {}
  }

  return {
    user: {
      blocksInitiated: {
        none: {
          blockedId: viewerUserId,
        },
      },
      blocksReceived: {
        none: {
          blockerId: viewerUserId,
        },
      },
    },
  }
}

type CommentRankAlias = "c" | "t"
type CommentPositionOrder = "root-oldest" | "visible-oldest" | "flat-oldest" | "flat-newest"

export interface CommentPositionRow {
  id: string
  position: number
  page: number
}

export interface FlatCommentPositionLookup {
  rootPositions: CommentPositionRow[]
  visiblePositions: CommentPositionRow[]
  flatPositions: CommentPositionRow[]
}

interface CommentPositionQueryParams {
  postId: string
  commentIds: string[]
  pageSize: number
  order: CommentPositionOrder
  parentOnly?: boolean
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}

function commentRankStatusColumnSql(alias: CommentRankAlias) {
  return alias === "c" ? Prisma.sql`c."status"` : Prisma.sql`t."status"`
}

function commentRankUserIdColumnSql(alias: CommentRankAlias) {
  return alias === "c" ? Prisma.sql`c."userId"` : Prisma.sql`t."userId"`
}

function buildCommentRankVisibilitySql(alias: CommentRankAlias, params: {
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  const statusColumn = commentRankStatusColumnSql(alias)
  const userIdColumn = commentRankUserIdColumnSql(alias)
  const visibleStatusSql = params.includeHidden
    ? Prisma.sql`${statusColumn} IN ('NORMAL', 'HIDDEN')`
    : Prisma.sql`${statusColumn} = 'NORMAL'`

  if (params.includePendingAll) {
    return Prisma.sql`(${visibleStatusSql} OR ${statusColumn} = 'PENDING')`
  }

  if (params.includePendingOwn && params.viewerUserId) {
    return Prisma.sql`(${visibleStatusSql} OR (${statusColumn} = 'PENDING' AND ${userIdColumn} = ${params.viewerUserId}))`
  }

  return visibleStatusSql
}

function buildCommentRankBlockVisibilitySql(alias: CommentRankAlias, viewerUserId?: number) {
  if (!viewerUserId) {
    return Prisma.empty
  }

  const userIdColumn = commentRankUserIdColumnSql(alias)

  return Prisma.sql`
    AND NOT EXISTS (
      SELECT 1
      FROM "UserBlock" AS block_source
      WHERE block_source."blockerId" = ${userIdColumn}
        AND block_source."blockedId" = ${viewerUserId}
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "UserBlock" AS block_target
      WHERE block_target."blockerId" = ${viewerUserId}
        AND block_target."blockedId" = ${userIdColumn}
    )
  `
}

function buildCommentRankWhereSql(alias: CommentRankAlias, params: CommentPositionQueryParams) {
  const postIdColumn = alias === "c" ? Prisma.sql`c."postId"` : Prisma.sql`t."postId"`
  const parentIdColumn = alias === "c" ? Prisma.sql`c."parentId"` : Prisma.sql`t."parentId"`

  return Prisma.sql`
    ${postIdColumn} = ${params.postId}
    AND ${buildCommentRankVisibilitySql(alias, params)}
    ${params.parentOnly ? Prisma.sql`AND ${parentIdColumn} IS NULL` : Prisma.empty}
    ${buildCommentRankBlockVisibilitySql(alias, params.viewerUserId)}
  `
}

function buildCommentPositionOrderSql(order: CommentPositionOrder) {
  if (order === "visible-oldest") {
    return Prisma.sql`
      (
        c."createdAt" < t."createdAt"
        OR (c."createdAt" = t."createdAt" AND c."id" <= t."id")
      )
    `
  }

  const samePinnedOldestSql = Prisma.sql`
    c."isGodComment" = t."isGodComment"
    AND c."isPinnedByAuthor" = t."isPinnedByAuthor"
    AND (
      c."createdAt" < t."createdAt"
      OR (c."createdAt" = t."createdAt" AND c."id" <= t."id")
    )
  `

  if (order === "flat-newest") {
    return Prisma.sql`
      (
        (c."isGodComment" = TRUE AND t."isGodComment" = FALSE)
        OR (
          c."isGodComment" = t."isGodComment"
          AND c."isPinnedByAuthor" = TRUE
          AND t."isPinnedByAuthor" = FALSE
        )
        OR (
          c."isGodComment" = t."isGodComment"
          AND c."isPinnedByAuthor" = t."isPinnedByAuthor"
          AND (
            c."createdAt" > t."createdAt"
            OR (c."createdAt" = t."createdAt" AND c."id" >= t."id")
          )
        )
      )
    `
  }

  if (order === "root-oldest" || order === "flat-oldest") {
    return Prisma.sql`
      (
        (c."isGodComment" = TRUE AND t."isGodComment" = FALSE)
        OR (
          c."isGodComment" = t."isGodComment"
          AND c."isPinnedByAuthor" = TRUE
          AND t."isPinnedByAuthor" = FALSE
        )
        OR (${samePinnedOldestSql})
      )
    `
  }
}

async function findCommentPositionsByPostId(params: CommentPositionQueryParams): Promise<CommentPositionRow[]> {
  const normalizedCommentIds = Array.from(new Set(params.commentIds.map((commentId) => commentId.trim()).filter(Boolean)))
  if (normalizedCommentIds.length === 0) {
    return []
  }

  const normalizedPageSize = Math.min(Math.max(1, params.pageSize), 50)
  const rows = await prisma.$queryRaw<Array<{
    id: string
    position: number | string | bigint
    page: number | string | bigint
  }>>(Prisma.sql`
    WITH target AS (
      SELECT
        t."id",
        t."createdAt",
        t."isGodComment",
        t."isPinnedByAuthor"
      FROM "Comment" AS t
      WHERE ${buildCommentRankWhereSql("t", params)}
        AND t."id" IN (${Prisma.join(normalizedCommentIds)})
    )
    SELECT
      t."id",
      COUNT(c."id")::int AS "position",
      CEIL(COUNT(c."id")::numeric / ${normalizedPageSize})::int AS "page"
    FROM target AS t
    INNER JOIN "Comment" AS c
      ON ${buildCommentRankWhereSql("c", params)}
      AND ${buildCommentPositionOrderSql(params.order)}
    GROUP BY t."id"
  `)

  return rows.map((row) => ({
    id: row.id,
    position: parseNumberValue(row.position),
    page: parseNumberValue(row.page),
  }))
}

export async function findFlatCommentPositionLookupsByPostId(params: {
  postId: string
  rootCommentIds: string[]
  visibleCommentIds: string[]
  flatCommentIds: string[]
  sort: "oldest" | "newest"
  pageSize: number
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}): Promise<FlatCommentPositionLookup> {
  const sharedParams = {
    postId: params.postId,
    pageSize: params.pageSize,
    viewerUserId: params.viewerUserId,
    includeHidden: params.includeHidden,
    includePendingOwn: params.includePendingOwn,
    includePendingAll: params.includePendingAll,
  }

  const [rootPositions, visiblePositions, flatPositions] = await Promise.all([
    findCommentPositionsByPostId({
      ...sharedParams,
      commentIds: params.rootCommentIds,
      order: "root-oldest",
      parentOnly: true,
    }),
    findCommentPositionsByPostId({
      ...sharedParams,
      commentIds: params.visibleCommentIds,
      order: "visible-oldest",
    }),
    findCommentPositionsByPostId({
      ...sharedParams,
      commentIds: params.flatCommentIds,
      order: params.sort === "newest" ? "flat-newest" : "flat-oldest",
    }),
  ])

  return {
    rootPositions,
    visiblePositions,
    flatPositions,
  }
}

export async function findCommentPositionByPostId(params: {
  postId: string
  commentId: string
  sort: "oldest" | "newest"
  pageSize: number
  parentOnly?: boolean
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}): Promise<CommentPositionRow | null> {
  const [position] = await findCommentPositionsByPostId({
    postId: params.postId,
    commentIds: [params.commentId],
    pageSize: params.pageSize,
    order: params.sort === "newest" ? "flat-newest" : "flat-oldest",
    parentOnly: params.parentOnly,
    viewerUserId: params.viewerUserId,
    includeHidden: params.includeHidden,
    includePendingOwn: params.includePendingOwn,
    includePendingAll: params.includePendingAll,
  })

  return position ?? null
}

export function countRootCommentsByPostId(params: {
  postId: string
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  return prisma.comment.count({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      parentId: null,
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
  })
}

export function countVisibleCommentsByPostId(params: {
  postId: string
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  return prisma.comment.count({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
  })
}

export async function findRootCommentPageById(params: {
  postId: string
  rootCommentId: string
  pageSize: number
  sort: "oldest" | "newest"
}) {
  const normalizedPageSize = Math.min(Math.max(1, params.pageSize), 50)

  const rootComment = await prisma.comment.findFirst({
    where: {
      id: params.rootCommentId,
      postId: params.postId,
      status: CommentStatus.NORMAL,
      parentId: null,
    },
    select: {
      id: true,
      createdAt: true,
      isGodComment: true,
      isPinnedByAuthor: true,
    },
  })

  if (!rootComment) {
    return 1
  }

  const precedingCount = await prisma.comment.count({
    where: {
      postId: params.postId,
      status: CommentStatus.NORMAL,
      parentId: null,
      OR: [
        ...(rootComment.isGodComment ? [] : [{ isGodComment: true }]),
        ...(rootComment.isPinnedByAuthor ? [] : [{ isGodComment: rootComment.isGodComment, isPinnedByAuthor: true }]),
        {
          isGodComment: rootComment.isGodComment,
          isPinnedByAuthor: rootComment.isPinnedByAuthor,
          createdAt: params.sort === "newest" ? { gt: rootComment.createdAt } : { lt: rootComment.createdAt },
        },
        {
          isGodComment: rootComment.isGodComment,
          isPinnedByAuthor: rootComment.isPinnedByAuthor,
          createdAt: rootComment.createdAt,
          id: params.sort === "newest" ? { gt: rootComment.id } : { lt: rootComment.id },
        },
      ],
    },
  })

  return Math.max(1, Math.ceil((precedingCount + 1) / normalizedPageSize))
}

export function findRootCommentsByPostId(params: {

  postId: string
  sort: "oldest" | "newest"
  page: number
  pageSize: number
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  const normalizedPageSize = Math.min(Math.max(1, params.pageSize), 50)

  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      parentId: null,
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    include: buildCommentListInclude(params.viewerUserId),
    orderBy: [
      { isGodComment: "desc" },
      { isPinnedByAuthor: "desc" },
      { createdAt: params.sort === "newest" ? "desc" : "asc" },
      { id: params.sort === "newest" ? "desc" : "asc" },
    ],
    skip: (params.page - 1) * normalizedPageSize,
    take: normalizedPageSize,
  })
}

export function findAllRootCommentIdsByPostId(params: {
  postId: string
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      parentId: null,
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    select: {
      id: true,
    },
    orderBy: [
      { isGodComment: "desc" },
      { isPinnedByAuthor: "desc" },
      { createdAt: "asc" },
      { id: "asc" },
    ],
  })
}

export function findAllVisibleCommentIdsByPostId(params: {
  postId: string
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    select: {
      id: true,
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
  })
}

export function findAllFlatCommentIdsByPostId(params: {
  postId: string
  sort: "oldest" | "newest"
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    select: {
      id: true,
    },
    orderBy: [
      { isGodComment: "desc" },
      { isPinnedByAuthor: "desc" },
      { createdAt: params.sort === "newest" ? "desc" : "asc" },
      { id: params.sort === "newest" ? "desc" : "asc" },
    ],
  })
}

export function findRepliesByParentIds(params: {
  postId: string
  parentIds: string[]
  sort: "oldest" | "newest"
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  if (params.parentIds.length === 0) {
    return Promise.resolve([])
  }

  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      parentId: { in: params.parentIds },
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    include: buildCommentReplyInclude(params.viewerUserId),
    orderBy: [{ createdAt: params.sort === "newest" ? "desc" : "asc" }],
  })
}

export function findFlatCommentsByPostId(params: {
  postId: string
  sort: "oldest" | "newest"
  page: number
  pageSize: number
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  const normalizedPageSize = Math.min(Math.max(1, params.pageSize), 50)

  return prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...buildCommentVisibilityWhere(params),
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    include: buildFlatCommentInclude(params.viewerUserId),
    orderBy: [
      { isGodComment: "desc" },
      { isPinnedByAuthor: "desc" },
      { createdAt: params.sort === "newest" ? "desc" : "asc" },
      { id: params.sort === "newest" ? "desc" : "asc" },
    ],
    skip: (params.page - 1) * normalizedPageSize,
    take: normalizedPageSize,
  })
}

export function findCommentsByIds(params: {
  commentIds: string[]
  viewerUserId?: number
  includeHidden?: boolean
  includePendingOwn?: boolean
  includePendingAll?: boolean
}) {
  if (params.commentIds.length === 0) {
    return Promise.resolve([])
  }

  return prisma.comment.findMany({
    where: {
      id: {
        in: params.commentIds,
      },
      ...buildCommentVisibilityWhere(params),
      ...buildCommentBlockVisibilityWhere(params.viewerUserId),
    },
    include: buildCommentListInclude(params.viewerUserId),
  })
}

export function findCommentRewardClaimsByCommentIds(postId: string, commentIds: string[]) {
  if (commentIds.length === 0) {
    return Promise.resolve([])
  }

  return prisma.postRedPacketClaim.findMany({
    where: {
      postId,
      triggerType: "REPLY",
      triggerCommentId: {
        in: commentIds,
      },
    },
    select: {
      triggerCommentId: true,
      amount: true,
      redPacket: {
        select: {
          packetCount: true,
        },
      },
    },
  })
}

export function countUserRepliesByPostId(postId: string, userId: number) {
  return prisma.comment.count({
    where: {
      postId,
      userId,
      status: "NORMAL",
    },
  })
}

export function updateCommentContentById(commentId: string, data: { content: string; reviewNote: string | null }) {
  return prisma.comment.update({
    where: { id: commentId },
    data: {
      content: data.content,
      status: data.reviewNote ? CommentStatus.PENDING : CommentStatus.NORMAL,
      reviewNote: data.reviewNote,
      reviewedById: null,
      reviewedAt: null,
    },
    select: {
      id: true,
      postId: true,
      parentId: true,
      replyToUserId: true,
    },
  })
}

export function createCommentMentionNotifications(params: {
  commentId: string
  senderId: number
  senderName: string
  content: string
  mentionUserIds: number[]
  excludeUserIds?: number[]
}) {
  const excludeUserIds = new Set([params.senderId, ...(params.excludeUserIds ?? [])])
  const notificationTargets = [...new Set(params.mentionUserIds)].filter((userId) => !excludeUserIds.has(userId))

  if (notificationTargets.length === 0) {
    return Promise.resolve({ count: 0 })
  }

  return createNotifications({
    notifications: notificationTargets.map((userId) => ({
      userId,
      type: NotificationType.MENTION,
      senderId: params.senderId,
      relatedType: "COMMENT" as const,
      relatedId: params.commentId,
      title: "你被提及了",
      content: `${params.senderName} 在评论中提到了你：${params.content.slice(0, 80)}`,
    })),
  })
}

export async function createCommentWithRelations(params: {
  postId: string
  userId: number
  content: string
  status: "PENDING" | "NORMAL"
  reviewNote?: string | null
  useAnonymousIdentity?: boolean
  parentId?: string
  replyToUserId?: number
  replyToCommentId?: string
  privateRecipientUserId?: number
  replyPointDelta: number
  replyPointDeltaPrepared: PreparedPointDelta
  pointName: string
  senderName: string
  postAuthorId: number
  mentionUsers: Array<{ id: number }>
  normalizedParentId?: string
  normalizedReplyToUserId?: number | null
  boardId: string
}) {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        postId: params.postId,
        userId: params.userId,
        content: params.content,
        useAnonymousIdentity: Boolean(params.useAnonymousIdentity),
        parentId: params.parentId || undefined,
        replyToUserId: params.replyToUserId ?? undefined,
        replyToCommentId: params.replyToCommentId ?? undefined,
        privateRecipientUserId: params.privateRecipientUserId ?? undefined,
        status: params.status,
        reviewNote: params.status === "PENDING" ? (params.reviewNote ?? "评论已进入审核") : null,
      },
    })

    const updatedUser = await tx.user.update({
      where: { id: params.userId },
      data: {
        commentCount: {
          increment: 1,
        },
        lastCommentAt: new Date(),
      },
      select: {
        points: true,
      },
    })

    if (params.replyPointDeltaPrepared.finalDelta !== 0) {
      const replyPointDeltaResult = await applyPointDelta({
        tx,
        userId: params.userId,
        beforeBalance: updatedUser.points,
        prepared: params.replyPointDeltaPrepared,
        pointName: params.pointName,
        reason: "在指定节点回复",
        eventType: POINT_LOG_EVENT_TYPES.BOARD_REPLY_CHARGE,
        eventData: {
          boardId: params.boardId,
          postId: params.postId,
          commentId: comment.id,
          configuredCharge: params.replyPointDelta,
          appliedFinalDelta: params.replyPointDeltaPrepared.finalDelta,
        },
        relatedType: "COMMENT",
        relatedId: comment.id,
      })

      const treasuryCredit = getBoardTreasuryCreditFromConfiguredCharge(
        params.replyPointDelta,
        replyPointDeltaResult.finalDelta,
      )
      if (treasuryCredit > 0) {
        await incrementBoardTreasuryPoints(tx, params.boardId, treasuryCredit)
      }
    }

    const commentedAt = new Date()

    await tx.post.update({
      where: { id: params.postId },
      data: {
        commentCount: {
          increment: 1,
        },
        lastCommentedAt: commentedAt,
        activityAt: commentedAt,
      },
    })
    return comment
  })
}
