import { BoardStatus, CommentStatus, Prisma } from "@/db/types"

import { prisma } from "@/db/client"

export function hideCommentById(commentId: string) {
  return prisma.comment.update({
    where: { id: commentId },
    data: { status: CommentStatus.HIDDEN },
  })
}

export function showCommentById(commentId: string) {
  return prisma.comment.update({
    where: { id: commentId },
    data: { status: CommentStatus.NORMAL },
  })
}

export function updateCommentModerationState(commentId: string, data: {
  status: CommentStatus
  reviewNote?: string | null
  reviewedById?: number | null
  reviewedAt?: Date | null
}) {
  return prisma.comment.update({
    where: { id: commentId },
    data: {
      status: data.status,
      reviewNote: data.reviewNote ?? null,
      reviewedById: data.reviewedById ?? null,
      reviewedAt: data.reviewedAt ?? null,
    },
  })
}

type CommentTreeRow = {
  id: string
  userId: number
  isAcceptedAnswer: boolean
  isGodComment: boolean
}

function buildAcceptedAnswerGroups(rows: CommentTreeRow[]) {
  const counts = new Map<number, number>()

  for (const row of rows) {
    if (!row.isAcceptedAnswer) {
      continue
    }

    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
  }

  return [...counts.entries()].map(([userId, count]) => ({ userId, count }))
}

function buildGodCommentGroups(rows: CommentTreeRow[]) {
  const counts = new Map<number, number>()

  for (const row of rows) {
    if (!row.isGodComment) {
      continue
    }

    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
  }

  return [...counts.entries()].map(([userId, count]) => ({ userId, count }))
}

function buildCommentAuthorGroups(rows: CommentTreeRow[]) {
  const counts = new Map<number, number>()

  for (const row of rows) {
    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
  }

  return [...counts.entries()].map(([userId, count]) => ({ userId, count }))
}

async function findCommentTreeRows(tx: Prisma.TransactionClient, commentId: string) {
  return tx.$queryRaw<CommentTreeRow[]>(Prisma.sql`
    WITH RECURSIVE "comment_tree" AS (
      SELECT id, "userId", "isAcceptedAnswer", "isGodComment"
      FROM "Comment"
      WHERE id = ${commentId}
      UNION ALL
      SELECT child.id, child."userId", child."isAcceptedAnswer", child."isGodComment"
      FROM "Comment" AS child
      INNER JOIN "comment_tree" AS parent ON child."parentId" = parent.id
    )
    SELECT id, "userId", "isAcceptedAnswer", "isGodComment"
    FROM "comment_tree"
  `)
}

export async function deleteCommentPermanently(commentId: string) {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        postId: true,
      },
    })

    if (!comment) {
      throw new Error("评论不存在")
    }

    const commentTree = await findCommentTreeRows(tx, commentId)
    const deletedIds = commentTree.map((row) => row.id)
    const acceptedAnswerIds = new Set(commentTree.filter((row) => row.isAcceptedAnswer).map((row) => row.id))
    const authorGroups = buildCommentAuthorGroups(commentTree)
    const acceptedAnswerGroups = buildAcceptedAnswerGroups(commentTree)
    const godCommentGroups = buildGodCommentGroups(commentTree)

    if (acceptedAnswerIds.size > 0) {
      const post = await tx.post.findUnique({
        where: { id: comment.postId },
        select: {
          acceptedCommentId: true,
        },
      })

      if (post?.acceptedCommentId && acceptedAnswerIds.has(post.acceptedCommentId)) {
        await tx.post.update({
          where: { id: comment.postId },
          data: {
            acceptedCommentId: null,
          },
        })
      }
    }

    await tx.comment.delete({
      where: { id: commentId },
    })

    await tx.post.update({
      where: { id: comment.postId },
      data: {
        commentCount: {
          decrement: deletedIds.length,
        },
      },
    })

    for (const group of authorGroups) {
      await tx.user.update({
        where: { id: group.userId },
        data: {
          commentCount: {
            decrement: group.count,
          },
        },
      })
    }

    for (const group of acceptedAnswerGroups) {
      await tx.user.update({
        where: { id: group.userId },
        data: {
          acceptedAnswerCount: {
            decrement: group.count,
          },
        },
      })
    }

    for (const group of godCommentGroups) {
      await tx.$executeRaw`
        UPDATE "User"
        SET "godCommentCount" = GREATEST(0, "godCommentCount" - ${group.count})
        WHERE "id" = ${group.userId}
      `
    }

    return {
      deletedIds,
    }
  })
}

export function findBoardPostingState(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    select: { allowPost: true },
  })
}

export function updateBoardPostingState(boardId: string, allowPost: boolean) {
  return prisma.board.update({
    where: { id: boardId },
    data: { allowPost },
  })
}

export function findBoardVisibilityState(boardId: string) {
  return prisma.board.findUnique({
    where: { id: boardId },
    select: { status: true },
  })
}

export function updateBoardVisibilityState(boardId: string, status: BoardStatus) {
  return prisma.board.update({
    where: { id: boardId },
    data: { status },
  })
}
