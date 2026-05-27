DO $$
BEGIN
  IF to_regclass('public."Post"') IS NULL OR to_regclass('public."Comment"') IS NULL THEN
    RAISE NOTICE 'Skip legacy DELETED cleanup because core tables do not exist yet.';
    RETURN;
  END IF;

  EXECUTE 'DELETE FROM "Post" WHERE "status"::text = ''DELETED''';
  EXECUTE 'UPDATE "Post" SET "acceptedCommentId" = NULL WHERE "acceptedCommentId" IN (SELECT id FROM "Comment" WHERE "status"::text = ''DELETED'')';
  EXECUTE 'DELETE FROM "Comment" WHERE "status"::text = ''DELETED''';

  IF to_regclass('public."User"') IS NOT NULL THEN
    EXECUTE 'UPDATE "User" SET "postCount" = 0, "commentCount" = 0, "acceptedAnswerCount" = 0, "godCommentCount" = 0';
    EXECUTE 'UPDATE "User" AS "user" SET "postCount" = "post_counts"."count" FROM (SELECT "authorId" AS "userId", COUNT(*)::integer AS "count" FROM "Post" GROUP BY "authorId") AS "post_counts" WHERE "user"."id" = "post_counts"."userId"';
    EXECUTE 'UPDATE "User" AS "user" SET "commentCount" = "comment_counts"."count" FROM (SELECT "userId", COUNT(*)::integer AS "count" FROM "Comment" GROUP BY "userId") AS "comment_counts" WHERE "user"."id" = "comment_counts"."userId"';
    EXECUTE 'UPDATE "User" AS "user" SET "acceptedAnswerCount" = "accepted_counts"."count" FROM (SELECT "userId", COUNT(*)::integer AS "count" FROM "Comment" WHERE "isAcceptedAnswer" = true GROUP BY "userId") AS "accepted_counts" WHERE "user"."id" = "accepted_counts"."userId"';
    EXECUTE 'UPDATE "User" AS "user" SET "godCommentCount" = "god_counts"."count" FROM (SELECT "userId", COUNT(*)::integer AS "count" FROM "Comment" WHERE "isGodComment" = true GROUP BY "userId") AS "god_counts" WHERE "user"."id" = "god_counts"."userId"';
  END IF;

  IF to_regclass('public."Board"') IS NOT NULL THEN
    EXECUTE 'UPDATE "Board" SET "postCount" = 0';
    EXECUTE 'UPDATE "Board" AS "board" SET "postCount" = "post_counts"."count" FROM (SELECT "boardId", COUNT(*)::integer AS "count" FROM "Post" GROUP BY "boardId") AS "post_counts" WHERE "board"."id" = "post_counts"."boardId"';
  END IF;

  IF to_regclass('public."Tag"') IS NOT NULL AND to_regclass('public."PostTag"') IS NOT NULL THEN
    EXECUTE 'UPDATE "Tag" SET "postCount" = 0';
    EXECUTE 'UPDATE "Tag" AS "tag" SET "postCount" = "tag_counts"."count" FROM (SELECT "tagId", COUNT(*)::integer AS "count" FROM "PostTag" GROUP BY "tagId") AS "tag_counts" WHERE "tag"."id" = "tag_counts"."tagId"';
  END IF;

  IF to_regclass('public.favorite_collection') IS NOT NULL AND to_regclass('public.favorite_collection_item') IS NOT NULL THEN
    EXECUTE 'UPDATE "favorite_collection" SET "postCount" = 0';
    EXECUTE 'UPDATE "favorite_collection" AS "collection" SET "postCount" = "item_counts"."count" FROM (SELECT "collectionId", COUNT(*)::integer AS "count" FROM "favorite_collection_item" GROUP BY "collectionId") AS "item_counts" WHERE "collection"."id" = "item_counts"."collectionId"';
  END IF;

  EXECUTE 'UPDATE "Post" SET "commentCount" = 0, "lastCommentedAt" = NULL';
  EXECUTE 'UPDATE "Post" AS "post" SET "commentCount" = "comment_counts"."count", "lastCommentedAt" = "comment_counts"."lastCommentedAt" FROM (SELECT "postId", COUNT(*)::integer AS "count", MAX("createdAt") AS "lastCommentedAt" FROM "Comment" GROUP BY "postId") AS "comment_counts" WHERE "post"."id" = "comment_counts"."postId"';
  EXECUTE 'UPDATE "Post" SET "acceptedCommentId" = NULL WHERE "acceptedCommentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "Comment" WHERE "Comment"."id" = "Post"."acceptedCommentId")';
  EXECUTE 'UPDATE "Post" SET "activityAt" = GREATEST("createdAt", COALESCE("lastAppendedAt", "createdAt"), COALESCE("lastCommentedAt", "createdAt"))';
END $$;
