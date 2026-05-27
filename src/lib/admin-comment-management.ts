export interface AdminCommentListItem {
  id: string
  content: string
  postId: string
  postTitle: string
  postSlug: string
  boardName: string
  boardSlug: string
  zoneName: string | null
  authorId: number
  authorName: string
  authorUsername: string
  parentId: string | null
  likeCount: number
  isGodComment: boolean
  status: "NORMAL" | "HIDDEN" | "PENDING"
  statusLabel: string
  reviewNote: string | null
  reviewedAt: string | null
  reviewedByName: string | null
  createdAt: string
  updatedAt: string
}

export interface AdminCommentListResult {
  comments: AdminCommentListItem[]
  actorRole: "ADMIN" | "MODERATOR"
  boardOptions: Array<{
    slug: string
    name: string
    zoneName: string | null
  }>
  filters: {
    keyword: string
    status: string
    board: string
    sort: string
    review: string
    type: string
  }
  summary: {
    total: number
    pending: number
    normal: number
    hidden: number
    god: number
    root: number
    reply: number
  }
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    hasPrevPage: boolean
    hasNextPage: boolean
  }
}
