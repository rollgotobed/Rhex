import { prisma } from "@/db/client"
import { PUBLIC_READABLE_POST_STATUSES } from "@/lib/post-types"

function extractPostRouteIdentifier(segment: string) {
  const trimmed = segment.trim()

  if (!trimmed) {
    return null
  }

  return trimmed.match(/-([a-z0-9]+)$/i)?.[1] ?? trimmed.match(/^[a-z0-9]+$/i)?.[0] ?? null
}

export async function findPostCardEmbedSourceByRouteSegment(segment: string) {
  const routeSegment = segment.trim()
  const identifier = extractPostRouteIdentifier(routeSegment)

  if (!routeSegment) {
    return null
  }

  return prisma.post.findFirst({
    where: {
      status: { in: [...PUBLIC_READABLE_POST_STATUSES] },
      OR: [
        { slug: routeSegment },
        { id: routeSegment },
        ...(identifier && identifier !== routeSegment
          ? [
              { id: identifier },
              { slug: { endsWith: `-${identifier}` } },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      content: true,
      coverPath: true,
      publishedAt: true,
      createdAt: true,
      commentCount: true,
      likeCount: true,
      viewCount: true,
      author: {
        select: {
          username: true,
          nickname: true,
          avatarPath: true,
          status: true,
        },
      },
    },
  })
}
