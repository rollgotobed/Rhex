import { BoardStatus, PinScope, PostStatus, type Prisma } from "@/db/types"

import { prisma } from "@/db/client"

export function findPostFeatureState(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    select: { isFeatured: true },
  })
}

export function updatePostFeatureState(postId: string, isFeatured: boolean) {
  return prisma.post.update({
    where: { id: postId },
    data: { isFeatured },
  })
}

export function findPostPinState(postId: string) {
  return prisma.post.findUnique({
    where: { id: postId },
    select: { isPinned: true },
  })
}

export function updatePostPinState(postId: string, isPinned: boolean, pinScope: PinScope) {

  return prisma.post.update({
    where: { id: postId },
    data: { isPinned, pinScope },
  })
}

export function updatePostStatus(postId: string, status: PostStatus, reviewNote?: string | null, publishedAt?: Date) {
  return prisma.post.update({
    where: { id: postId },
    data: {
      status,
      reviewNote,
      publishedAt,
    },
  })
}

async function syncTagPostCounts(tx: Prisma.TransactionClient, tagIds: string[]) {
  const uniqueTagIds = [...new Set(tagIds.filter(Boolean))]

  if (uniqueTagIds.length === 0) {
    return
  }

  const groups = await tx.postTag.groupBy({
    by: ["tagId"],
    where: {
      tagId: {
        in: uniqueTagIds,
      },
    },
    _count: {
      _all: true,
    },
  })

  const countMap = new Map(groups.map((group) => [group.tagId, group._count._all]))

  await Promise.all(
    uniqueTagIds.map((tagId) => tx.tag.update({
      where: { id: tagId },
      data: {
        postCount: countMap.get(tagId) ?? 0,
      },
    })),
  )
}

async function syncFavoriteCollectionPostCounts(tx: Prisma.TransactionClient, collectionIds: string[]) {
  const uniqueCollectionIds = [...new Set(collectionIds.filter(Boolean))]

  if (uniqueCollectionIds.length === 0) {
    return
  }

  const groups = await tx.favoriteCollectionItem.groupBy({
    by: ["collectionId"],
    where: {
      collectionId: {
        in: uniqueCollectionIds,
      },
    },
    _count: {
      _all: true,
    },
  })

  const countMap = new Map(groups.map((group) => [group.collectionId, group._count._all]))

  await Promise.all(
    uniqueCollectionIds.map((collectionId) => tx.favoriteCollection.update({
      where: { id: collectionId },
      data: {
        postCount: countMap.get(collectionId) ?? 0,
      },
    })),
  )
}

export async function deletePostPermanently(postId: string) {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        boardId: true,
      },
    })

    if (!post) {
      throw new Error("帖子不存在")
    }

    const commentGroups = await tx.comment.groupBy({
      by: ["userId"],
      where: { postId },
      _count: {
        _all: true,
      },
    })

    const acceptedAnswerGroups = await tx.comment.groupBy({
      by: ["userId"],
      where: {
        postId,
        isAcceptedAnswer: true,
      },
      _count: {
        _all: true,
      },
    })

    const godCommentGroups = await tx.comment.groupBy({
      by: ["userId"],
      where: {
        postId,
        isGodComment: true,
      },
      _count: {
        _all: true,
      },
    })

    const favoriteCollectionItems = await tx.favoriteCollectionItem.findMany({
      where: { postId },
      select: {
        collectionId: true,
      },
    })

    const postTags = await tx.postTag.findMany({
      where: { postId },
      select: {
        tagId: true,
      },
    })

    await tx.post.delete({
      where: { id: postId },
    })

    await tx.user.update({
      where: { id: post.authorId },
      data: {
        postCount: {
          decrement: 1,
        },
      },
    })

    await tx.board.update({
      where: { id: post.boardId },
      data: {
        postCount: {
          decrement: 1,
        },
      },
    })

    for (const group of commentGroups) {
      await tx.user.update({
        where: { id: group.userId },
        data: {
          commentCount: {
            decrement: group._count._all,
          },
        },
      })
    }

    for (const group of acceptedAnswerGroups) {
      await tx.user.update({
        where: { id: group.userId },
        data: {
          acceptedAnswerCount: {
            decrement: group._count._all,
          },
        },
      })
    }

    for (const group of godCommentGroups) {
      await tx.$executeRaw`
        UPDATE "User"
        SET "godCommentCount" = GREATEST(0, "godCommentCount" - ${group._count._all})
        WHERE "id" = ${group.userId}
      `
    }

    await syncTagPostCounts(tx, postTags.map((item) => item.tagId))
    await syncFavoriteCollectionPostCounts(tx, favoriteCollectionItems.map((item) => item.collectionId))
  })
}

export function findPostMoveBoardContext(postId: string, boardSlug: string) {
  return Promise.all([
    prisma.post.findUnique({
      where: { id: postId },
      select: {
        id: true,
        slug: true,
        boardId: true,
        board: { select: { slug: true, name: true } },
      },
    }),

    prisma.board.findUnique({
      where: { slug: boardSlug },
      select: { id: true, slug: true, name: true, status: true },
    }),
  ])
}

export function movePostToBoard(postId: string, boardId: string) {
  return prisma.post.update({
    where: { id: postId },
    data: { boardId },
  })
}

export { BoardStatus }
