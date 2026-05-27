import { findCommentPositionByPostId } from "@/db/comment-queries"
import { apiError, apiSuccess, createAdminRouteHandler, readJsonBody, readOptionalNumberField, requireStringField } from "@/lib/api-route"
import { toggleGodCommentByAdmin } from "@/lib/god-comments"
import { getSiteSettings } from "@/lib/site-settings"
import { ensureCanManageComment } from "@/lib/moderator-permissions"

export const POST = createAdminRouteHandler(async ({ request, adminUser }) => {
  const body = await readJsonBody(request)
  const commentId = requireStringField(body, "commentId", "缺少必要参数")
  const action = body.action === "unmark" ? "unmark" : "mark"
  const viewMode = body.view === "flat" ? "flat" : "tree"
  const sort = body.sort === "newest" ? "newest" : "oldest"
  const comment = await ensureCanManageComment(adminUser, commentId)

  if (comment.parentId) {
    apiError(400, "仅支持将一级评论设为神评")
  }

  const result = await toggleGodCommentByAdmin({
    commentId,
    adminUserId: adminUser.id,
    action,
  })

  const requestPageSize = readOptionalNumberField(body, "pageSize")
  const settings = requestPageSize ? null : await getSiteSettings()
  const pageSize = Math.min(50, Math.max(1, requestPageSize ?? settings?.commentPageSize ?? 15))
  const position = await findCommentPositionByPostId({
    postId: comment.postId,
    commentId,
    sort,
    pageSize,
    parentOnly: viewMode === "tree",
    viewerUserId: adminUser.id,
    includeHidden: true,
    includePendingAll: true,
  })

  return apiSuccess({
    commentId,
    changed: result.changed,
    isGodComment: result.isGodComment,
    page: position?.page ?? 1,
  }, action === "mark" ? "评论已设为神评" : "已取消神评")
}, {
  errorMessage: "神评操作失败",
  logPrefix: "[api/posts/god-comment] unexpected error",
  unauthorizedMessage: "无权操作神评",
  allowModerator: true,
})
