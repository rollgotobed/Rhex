ALTER TYPE "BadgeRuleType" ADD VALUE IF NOT EXISTS 'GOD_COMMENT_COUNT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GodCommentSource') THEN
    CREATE TYPE "GodCommentSource" AS ENUM ('AUTO_LIKE', 'ADMIN');
  END IF;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "godCommentCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "isGodComment" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "godCommentSource" "GodCommentSource",
  ADD COLUMN IF NOT EXISTS "godCommentedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "godCommentedAt" TIMESTAMPTZ(3);

ALTER TABLE "Comment"
  ADD CONSTRAINT "Comment_godCommentedById_fkey"
  FOREIGN KEY ("godCommentedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "comment_thread_order_idx";
DROP INDEX IF EXISTS "comment_flat_order_idx";

CREATE INDEX "comment_thread_order_idx"
  ON "Comment" ("postId", "status", "parentId", "isGodComment", "isPinnedByAuthor", "createdAt", "id");

CREATE INDEX "comment_flat_order_idx"
  ON "Comment" ("postId", "status", "isGodComment", "isPinnedByAuthor", "createdAt", "id");

CREATE INDEX "Comment_godCommentedById_godCommentedAt_idx"
  ON "Comment" ("godCommentedById", "godCommentedAt");

CREATE UNIQUE INDEX "god_comment_unique_per_post_idx"
  ON "Comment" ("postId")
  WHERE "isGodComment" = TRUE AND "parentId" IS NULL;

UPDATE "User" AS "user"
SET "godCommentCount" = "god_counts"."count"
FROM (
  SELECT "userId", COUNT(*)::integer AS "count"
  FROM "Comment"
  WHERE "isGodComment" = TRUE
  GROUP BY "userId"
) AS "god_counts"
WHERE "user"."id" = "god_counts"."userId";
