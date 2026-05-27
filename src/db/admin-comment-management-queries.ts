import type { Prisma } from "@/db/types"

import { prisma } from "@/db/client"

export async function countAdminCommentSummary(where: Prisma.CommentWhereInput) {
  const [total, statusGroups, typeGroups, god] = await Promise.all([
    prisma.comment.count({ where }),
    prisma.comment.groupBy({
      by: ["status"],
      where,
      _count: {
        _all: true,
      },
    }),
    prisma.comment.groupBy({
      by: ["parentId"],
      where,
      _count: {
        _all: true,
      },
    }),
    prisma.comment.count({
      where: {
        ...where,
        isGodComment: true,
      },
    }),
  ])

  let pending = 0
  let normal = 0
  let hidden = 0

  for (const group of statusGroups) {
    if (group.status === "PENDING") {
      pending += group._count._all
    } else if (group.status === "NORMAL") {
      normal += group._count._all
    } else if (group.status === "HIDDEN") {
      hidden += group._count._all
    }
  }

  let root = 0
  let reply = 0

  for (const group of typeGroups) {
    if (group.parentId === null) {
      root += group._count._all
    } else {
      reply += group._count._all
    }
  }

  return {
    total,
    pending,
    normal,
    hidden,
    god,
    root,
    reply,
  }
}

export function findAdminCommentBoardOptions(where?: Prisma.BoardWhereInput) {
  return prisma.board.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: { slug: true, name: true, zone: { select: { name: true } } },
    take: 200,
  })
}

export function findAdminCommentsPage(where: Prisma.CommentWhereInput, orderBy: Prisma.CommentOrderByWithRelationInput[], skip: number, take: number) {
  return prisma.comment.findMany({
    where,
    orderBy,
    skip,
    take,
    include: {
      user: {
        select: {
          id: true,
          username: true,
          nickname: true,
        },
      },
      reviewer: {
        select: {
          username: true,
          nickname: true,
        },
      },
      post: {
        select: {
          id: true,
          title: true,
          slug: true,
          board: {
            select: {
              name: true,
              slug: true,
              zone: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  })
}
