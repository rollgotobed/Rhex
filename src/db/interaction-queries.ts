import { Prisma, TargetType } from "@/db/types"
import { prisma } from "@/db/client"



function isPrismaKnownError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
}

export async function toggleCommentLike(params: {
  userId: number
  commentId: string
  senderName: string
}) {
  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
    select: {
      id: true,
      userId: true,
      content: true,
      likeCount: true,
    },
  })

  const targetUserId = comment?.userId ?? null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.like.delete({
        where: {
          userId_targetType_targetId: {
            userId: params.userId,
            targetType: TargetType.COMMENT,
            targetId: params.commentId,
          },
        },
      })

      await tx.comment.update({ where: { id: params.commentId }, data: { likeCount: { decrement: 1 } } })
    })

    return {
      liked: false,
      targetUserId,
      notificationTargetUserId: comment && comment.userId !== params.userId ? comment.userId : null,
      commentPreview: comment?.content.slice(0, 80) ?? "",
      likeCount: Math.max(0, (comment?.likeCount ?? 1) - 1),
    }
  } catch (error) {
    if (!isPrismaKnownError(error, "P2025")) {
      throw error
    }
  }

  let nextLikeCount = comment?.likeCount ?? 0

  await prisma.$transaction(async (tx) => {
    try {
      await tx.like.create({
        data: {
          userId: params.userId,
          targetType: TargetType.COMMENT,
          targetId: params.commentId,
          commentId: params.commentId,
        },
      })
    } catch (error) {
      if (!isPrismaKnownError(error, "P2002")) {
        throw error
      }

      return
    }

    const updatedComment = await tx.comment.update({
      where: { id: params.commentId },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    })
    nextLikeCount = updatedComment.likeCount
  })

  return {
    liked: true,
    targetUserId,
    notificationTargetUserId: comment && comment.userId !== params.userId ? comment.userId : null,
    commentPreview: comment?.content.slice(0, 80) ?? "",
    likeCount: nextLikeCount,
  }
}




export async function togglePostLike(params: {
  userId: number
  postId: string
  senderName: string
}) {
  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    select: {
      id: true,
      authorId: true,
      title: true,
    },
  })

  const targetUserId = post?.authorId ?? null

  try {
    await prisma.$transaction(async (tx) => {
      await tx.like.delete({
        where: {
          userId_targetType_targetId: {
            userId: params.userId,
            targetType: TargetType.POST,
            targetId: params.postId,
          },
        },
      })

      await tx.post.update({ where: { id: params.postId }, data: { likeCount: { decrement: 1 } } })
    })

    return {
      liked: false,
      targetUserId,
      notificationTargetUserId: post && post.authorId !== params.userId ? post.authorId : null,
      postTitle: post?.title ?? "",
    }
  } catch (error) {
    if (!isPrismaKnownError(error, "P2025")) {
      throw error
    }
  }

  await prisma.$transaction(async (tx) => {
    try {
      await tx.like.create({
        data: {
          userId: params.userId,
          targetType: TargetType.POST,
          targetId: params.postId,
          postId: params.postId,
        },
      })
    } catch (error) {
      if (!isPrismaKnownError(error, "P2002")) {
        throw error
      }

      return
    }

    await tx.post.update({ where: { id: params.postId }, data: { likeCount: { increment: 1 } } })
  })

  return {
    liked: true,
    targetUserId,
    notificationTargetUserId: post && post.authorId !== params.userId ? post.authorId : null,
    postTitle: post?.title ?? "",
  }
}



export async function togglePostFavorite(params: {
  userId: number
  postId: string
}) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.favorite.delete({
        where: {
          userId_postId: {
            userId: params.userId,
            postId: params.postId,
          },
        },
      })

      await tx.post.update({ where: { id: params.postId }, data: { favoriteCount: { decrement: 1 } } })
    })

    return {
      favored: false,
    }
  } catch (error) {
    if (!isPrismaKnownError(error, "P2025")) {
      throw error
    }
  }

  await prisma.$transaction(async (tx) => {
    try {
      await tx.favorite.create({
        data: {
          userId: params.userId,
          postId: params.postId,
        },
      })
    } catch (error) {
      if (!isPrismaKnownError(error, "P2002")) {
        throw error
      }

      return
    }

    await tx.post.update({ where: { id: params.postId }, data: { favoriteCount: { increment: 1 } } })
  })

  return {
    favored: true,
  }
}



