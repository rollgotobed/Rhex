import { GodCommentSource, Prisma } from "@/db/types"
import { prisma } from "@/db/client"
import { DEFAULT_GOD_COMMENT_AUTO_LIKE_THRESHOLD } from "@/lib/god-comment-settings"
import { revalidateUserSurfaceCache } from "@/lib/user-surface"

export interface GodCommentPromotionResult {
  changed: boolean
  commentId: string
  postId: string
  userId: number
  likeCount: number
  isGodComment: boolean
  affectedUserIds?: number[]
}

function normalizeLikeThreshold(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_GOD_COMMENT_AUTO_LIKE_THRESHOLD
  }

  return Math.max(1, Math.floor(value))
}

async function clearExistingGodCommentForPost(
  tx: Prisma.TransactionClient,
  input: {
    postId: string
    keepCommentId?: string
  },
): Promise<number[]> {
  const existing = await tx.comment.findMany({
    where: {
      postId: input.postId,
      parentId: null,
      isGodComment: true,
      ...(input.keepCommentId ? { NOT: { id: input.keepCommentId } } : {}),
    },
    select: {
      id: true,
      userId: true,
    },
  })

  if (existing.length === 0) {
    return []
  }

  await tx.comment.updateMany({
    where: {
      id: {
        in: existing.map((comment) => comment.id),
      },
    },
    data: {
      isGodComment: false,
      godCommentSource: null,
      godCommentedById: null,
      godCommentedAt: null,
    },
  })

  const countsByUserId = new Map<number, number>()
  for (const comment of existing) {
    countsByUserId.set(comment.userId, (countsByUserId.get(comment.userId) ?? 0) + 1)
  }

  for (const [userId, count] of countsByUserId.entries()) {
    await tx.$executeRaw`
      UPDATE "User"
      SET "godCommentCount" = GREATEST(0, "godCommentCount" - ${count})
      WHERE "id" = ${userId}
    `
  }

  return [...countsByUserId.keys()]
}

export async function promoteGodComment(input: {
  commentId: string
  source: GodCommentSource
  markerUserId?: number | null
}) {
  return prisma.$transaction(async (tx): Promise<GodCommentPromotionResult> => {
    const comment = await tx.comment.findUnique({
      where: { id: input.commentId },
      select: {
        id: true,
        postId: true,
        userId: true,
        parentId: true,
        status: true,
        likeCount: true,
        isGodComment: true,
      },
    })

    if (!comment || comment.status !== "NORMAL") {
      throw new Error("评论不存在或不可设为神评")
    }

    if (comment.parentId) {
      throw new Error("仅支持将一级评论设为神评")
    }

    if (comment.isGodComment) {
      return {
        changed: false,
        commentId: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        likeCount: comment.likeCount,
        isGodComment: true,
      }
    }

    const demotedUserIds: number[] = []

    if (input.source === GodCommentSource.ADMIN) {
      const clearedUserIds = await clearExistingGodCommentForPost(tx, {
        postId: comment.postId,
        keepCommentId: comment.id,
      })
      demotedUserIds.push(...clearedUserIds)
    } else {
      const existing = await tx.comment.findFirst({
        where: {
          postId: comment.postId,
          parentId: null,
          isGodComment: true,
        },
        select: {
          id: true,
        },
      })

      if (existing) {
        return {
          changed: false,
          commentId: comment.id,
          postId: comment.postId,
          userId: comment.userId,
          likeCount: comment.likeCount,
          isGodComment: false,
        }
      }
    }

    await tx.comment.update({
      where: { id: comment.id },
      data: {
        isGodComment: true,
        godCommentSource: input.source,
        godCommentedById: input.markerUserId ?? null,
        godCommentedAt: new Date(),
      },
    })

    await tx.user.update({
      where: { id: comment.userId },
      data: {
        godCommentCount: {
          increment: 1,
        },
      },
    })

    return {
      changed: true,
      commentId: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      likeCount: comment.likeCount,
      isGodComment: true,
      affectedUserIds: demotedUserIds,
    }
  }).then((result) => {
    if (result.changed) {
      for (const userId of new Set([result.userId, ...(result.affectedUserIds ?? [])])) {
        revalidateUserSurfaceCache(userId)
      }
    }

    return result
  })
}

export async function demoteGodComment(input: {
  commentId: string
}) {
  return prisma.$transaction(async (tx): Promise<GodCommentPromotionResult> => {
    const comment = await tx.comment.findUnique({
      where: { id: input.commentId },
      select: {
        id: true,
        postId: true,
        userId: true,
        parentId: true,
        status: true,
        likeCount: true,
        isGodComment: true,
      },
    })

    if (!comment || comment.status !== "NORMAL") {
      throw new Error("评论不存在或不可操作")
    }

    if (comment.parentId) {
      throw new Error("仅支持操作一级评论")
    }

    if (!comment.isGodComment) {
      return {
        changed: false,
        commentId: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        likeCount: comment.likeCount,
        isGodComment: false,
      }
    }

    await tx.comment.update({
      where: { id: comment.id },
      data: {
        isGodComment: false,
        godCommentSource: null,
        godCommentedById: null,
        godCommentedAt: null,
      },
    })

    await tx.$executeRaw`
      UPDATE "User"
      SET "godCommentCount" = GREATEST(0, "godCommentCount" - 1)
      WHERE "id" = ${comment.userId}
    `

    return {
      changed: true,
      commentId: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      likeCount: comment.likeCount,
      isGodComment: false,
    }
  }).then((result) => {
    if (result.changed) {
      revalidateUserSurfaceCache(result.userId)
    }

    return result
  })
}

export async function maybePromoteGodCommentByLikes(input: {
  commentId: string
  threshold?: number
}) {
  const threshold = normalizeLikeThreshold(input.threshold)
  const comment = await prisma.comment.findUnique({
    where: { id: input.commentId },
    select: {
      id: true,
      parentId: true,
      status: true,
      likeCount: true,
      isGodComment: true,
    },
  })

  if (!comment || comment.status !== "NORMAL" || comment.parentId || comment.isGodComment || comment.likeCount < threshold) {
    return null
  }

  try {
    return await promoteGodComment({
      commentId: comment.id,
      source: GodCommentSource.AUTO_LIKE,
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null
    }

    throw error
  }
}

export async function toggleGodCommentByAdmin(input: {
  commentId: string
  adminUserId: number
  action: "mark" | "unmark"
}) {
  return input.action === "mark"
    ? promoteGodComment({
        commentId: input.commentId,
        source: GodCommentSource.ADMIN,
        markerUserId: input.adminUserId,
      })
    : demoteGodComment({
        commentId: input.commentId,
      })
}
