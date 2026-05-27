import { prisma } from "@/db/client"

import type { Prisma } from "@/db/types"

const POST_SLUG_COUNTER_ID = "post-slug"

export function runPostCreateTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(callback)
}

export async function claimNextSequentialPostSlug() {
  const rows = await prisma.$queryRaw<Array<{ value: bigint }>>`
    INSERT INTO "PostSlugCounter" ("id", "nextValue", "updatedAt")
    VALUES (
      ${POST_SLUG_COUNTER_ID},
      (
        SELECT GREATEST(
          2,
          COALESCE(MAX("slug"::BIGINT) + 2, 2)
        )
        FROM "Post"
        WHERE "slug" ~ '^[0-9]{1,18}$'
      ),
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("id") DO UPDATE
    SET
      "nextValue" = GREATEST(
        "PostSlugCounter"."nextValue" + 1,
        (
          SELECT GREATEST(
            2,
            COALESCE(MAX("slug"::BIGINT) + 2, 2)
          )
          FROM "Post"
          WHERE "slug" ~ '^[0-9]{1,18}$'
        )
      ),
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "nextValue" - 1 AS "value"
  `
  const counter = rows[0]?.value

  if (typeof counter !== "bigint") {
    throw new Error("Failed to claim next sequential post slug")
  }

  return counter.toString()
}

export function createPostRecord(
  tx: Prisma.TransactionClient,
  data: Prisma.PostUncheckedCreateInput,
) {
  return tx.post.create({
    data: {
      ...data,
      activityAt: new Date(),
    },
  })
}

export function updateAuthorAfterPostCreated(
  tx: Prisma.TransactionClient,
  authorId: number,
  lastPostAt: Date,
) {
  return tx.user.update({
    where: { id: authorId },
    data: {
      postCount: { increment: 1 },
      lastPostAt,
    },
  })
}

export function incrementBoardPostCount(
  tx: Prisma.TransactionClient,
  boardId: string,
) {
  return tx.board.update({
    where: { id: boardId },
    data: {
      postCount: { increment: 1 },
    },
  })
}

export function updatePostContentAndSummary(
  tx: Prisma.TransactionClient,
  postId: string,
  content: string,
  summary: string,
) {
  return tx.post.update({
    where: { id: postId },
    data: {
      content,
      summary,
    },
  })
}
