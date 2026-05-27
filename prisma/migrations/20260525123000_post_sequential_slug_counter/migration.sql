CREATE TABLE "PostSlugCounter" (
  "id" TEXT NOT NULL,
  "nextValue" BIGINT NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PostSlugCounter_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PostSlugCounter" ("id", "nextValue")
VALUES (
  'post-slug',
  GREATEST(
    1,
    COALESCE(
      (
        SELECT MAX("slug"::BIGINT) + 1
        FROM "Post"
        WHERE "slug" ~ '^[0-9]{1,18}$'
      ),
      1
    )
  )
)
ON CONFLICT ("id") DO NOTHING;
