import { CommentStatus } from "@/db/types"

import type { Prisma } from "@/db/types"
import type { findAdminCommentBoardOptions, findAdminCommentsPage } from "@/db/admin-comment-management-queries"
import type { AdminCommentListItem, AdminCommentListResult } from "@/lib/admin-comment-management"
import type { AdminActor } from "@/lib/moderator-permissions"

import { normalizePageSize, normalizePositiveInteger } from "@/lib/shared/normalizers"
import { buildManagedCommentWhereInput } from "@/lib/moderator-permissions"
import { serializeDateTime } from "@/lib/formatters"

export interface AdminCommentQuery {
  keyword?: string
  status?: string
  boardSlug?: string
  sort?: string
  review?: string
  type?: string
  page?: number
  pageSize?: number
}

export type AdminCommentSort = "newest" | "oldest" | "mostLikes"
export type AdminCommentReviewFilter = "ALL" | "reviewed" | "unreviewed"
export type AdminCommentTypeFilter = "ALL" | "ROOT" | "REPLY"
const ADMIN_COMMENT_STATUSES = new Set<CommentStatus>(["NORMAL", "HIDDEN", "PENDING"])

export interface NormalizedAdminCommentQuery {
  keyword: string
  status: string
  boardSlug: string
  sort: AdminCommentSort
  review: AdminCommentReviewFilter
  type: AdminCommentTypeFilter
  page: number
  pageSize: number
}

type AdminCommentPageRecord = Awaited<ReturnType<typeof findAdminCommentsPage>>[number]
type AdminCommentBoardOptionRecord = Awaited<ReturnType<typeof findAdminCommentBoardOptions>>[number]

export function getCommentStatusLabel(status: CommentStatus) {
  switch (status) {
    case "PENDING":
      return "待审核"
    case "HIDDEN":
      return "已下线"
    default:
      return "正常"
  }
}

export function normalizeAdminCommentSort(sort?: string): AdminCommentSort {
  switch (sort) {
    case "oldest":
    case "mostLikes":
      return sort
    default:
      return "newest"
  }
}

export function normalizeAdminCommentQuery(query: AdminCommentQuery = {}): NormalizedAdminCommentQuery {
  const normalizedStatus = query.status?.trim().toUpperCase() ?? ""

  return {
    keyword: query.keyword?.trim() ?? "",
    status: ADMIN_COMMENT_STATUSES.has(normalizedStatus as CommentStatus) ? normalizedStatus : "ALL",
    boardSlug: query.boardSlug?.trim() ?? "",
    sort: normalizeAdminCommentSort(query.sort),
    review: query.review === "reviewed" || query.review === "unreviewed" ? query.review : "ALL",
    type: query.type === "ROOT" || query.type === "REPLY" ? query.type : "ALL",
    page: normalizePositiveInteger(query.page, 1),
    pageSize: normalizePageSize(query.pageSize),
  }
}

export function buildAdminCommentWhere(actor: AdminActor, query: NormalizedAdminCommentQuery): Prisma.CommentWhereInput {
  const and: Prisma.CommentWhereInput[] = []

  if (query.review === "reviewed") {
    and.push({ NOT: { reviewNote: null } })
  } else if (query.review === "unreviewed") {
    and.push({ reviewNote: null })
  }

  if (query.type === "ROOT") {
    and.push({ parentId: null })
  } else if (query.type === "REPLY") {
    and.push({ NOT: { parentId: null } })
  }

  return {
    ...(buildManagedCommentWhereInput(actor) ?? {}),
    ...(query.status !== "ALL" && ADMIN_COMMENT_STATUSES.has(query.status as CommentStatus) ? { status: query.status as CommentStatus } : {}),
    ...(query.boardSlug ? { post: { board: { slug: query.boardSlug } } } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
    ...(query.keyword
      ? {
          OR: [
            { content: { contains: query.keyword, mode: "insensitive" } },
            { post: { title: { contains: query.keyword, mode: "insensitive" } } },
            { user: { username: { contains: query.keyword, mode: "insensitive" } } },
            { user: { nickname: { contains: query.keyword, mode: "insensitive" } } },
          ],
        }
      : {}),
  }
}

export function buildAdminCommentOrderBy(sort: AdminCommentSort): Prisma.CommentOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" }]
    case "mostLikes":
      return [{ likeCount: "desc" }, { createdAt: "desc" }]
    default:
      return [{ status: "asc" }, { createdAt: "desc" }]
  }
}

export function mapAdminCommentListItem(comment: AdminCommentPageRecord): AdminCommentListItem {
  return {
    id: comment.id,
    content: comment.content,
    postId: comment.post.id,
    postTitle: comment.post.title,
    postSlug: comment.post.slug,
    boardName: comment.post.board.name,
    boardSlug: comment.post.board.slug,
    zoneName: comment.post.board.zone?.name ?? null,
    authorId: comment.user.id,
    authorName: comment.user.nickname ?? comment.user.username,
    authorUsername: comment.user.username,
    parentId: comment.parentId,
    likeCount: comment.likeCount,
    isGodComment: comment.isGodComment,
    status: comment.status,
    statusLabel: getCommentStatusLabel(comment.status),
    reviewNote: comment.reviewNote ?? null,
    reviewedAt: serializeDateTime(comment.reviewedAt) ?? null,
    reviewedByName: comment.reviewer ? (comment.reviewer.nickname ?? comment.reviewer.username) : null,
    createdAt: serializeDateTime(comment.createdAt) ?? comment.createdAt.toISOString(),
    updatedAt: serializeDateTime(comment.updatedAt) ?? comment.updatedAt.toISOString(),
  }
}

export function mapAdminCommentBoardOption(board: AdminCommentBoardOptionRecord): AdminCommentListResult["boardOptions"][number] {
  return {
    slug: board.slug,
    name: board.name,
    zoneName: board.zone?.name ?? null,
  }
}

export function buildAdminCommentFilters(query: NormalizedAdminCommentQuery): AdminCommentListResult["filters"] {
  return {
    keyword: query.keyword,
    status: query.status,
    board: query.boardSlug,
    sort: query.sort,
    review: query.review,
    type: query.type,
  }
}
