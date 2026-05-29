import bcrypt from "bcryptjs"

import { BadgeGrantSource, Prisma, UserRole, UserStatus } from "@/db/types"
import { prisma } from "@/db/client"
import { countUnreadNotifications } from "@/db/notification-read-queries"
import {
  demoteUserToUser,
  findUserAvatarProfile,
  findUserUsername,
  findUserStatus,
  findUserVipState,
  promoteUserToAdmin,
  updateUserBasicProfile,
  updateUserAvatarPath,
  updateUserPasswordHash,
  updateUserRole,
  updateUserStatus,
  updateUserVip,
} from "@/db/admin-user-action-queries"
import { createGrantedUserBadge, findBadgeSummaryById, findGrantedUserBadge, runBadgeTransaction } from "@/db/badge-queries"
import { findUserByNicknameInsensitive } from "@/db/user-queries"
import { createSystemNotification } from "@/lib/notification-writes"
import { notificationEventBus } from "@/lib/notification-event-bus"
import { applyPointDelta } from "@/lib/point-center"
import { POINT_LOG_EVENT_TYPES } from "@/lib/point-log-events"

import { apiError } from "@/lib/api-route"
import {

  type AdminActionContext,
  defineAdminAction,
  normalizePositiveUserId,
  readAdminActionNumber,
  requireAdminActionString,
  readAdminActionString,
  writeAdminActionLog,
  type AdminActionDefinition,
} from "@/lib/admin-action-types"
import { getBlockedUserStatusChangeMessage, type RestrictiveUserStatus } from "@/lib/admin-user-status-guard"
import { formatBrowserLocalDateTimeInput, parseBrowserLocalDateTime } from "@/lib/browser-local-datetime"
import { enforceSensitiveText } from "@/lib/content-safety"
import { parseBusinessDateTime } from "@/lib/formatters"
import { ensureCanModerateUser, isScopedModerator, isSiteAdmin } from "@/lib/moderator-permissions"
import { getServerSiteSettings } from "@/lib/site-settings"
import { findUsernameSensitiveWord } from "@/lib/username-sensitive-words"
import { mergeUserProfileSettings } from "@/lib/user-profile-settings"
import { revalidateUserSurfaceCache } from "@/lib/user-surface"
import { validateProfilePayload } from "@/lib/validators"
import { normalizeConfigurableVipLevel } from "@/lib/vip-status"

function buildProfileUpdateDetail(context: AdminActionContext) {
  const changedFields: string[] = []

  if (readAdminActionString(context.body, "nickname")) changedFields.push("昵称")
  if (readAdminActionString(context.body, "email")) changedFields.push("邮箱")
  if (readAdminActionString(context.body, "phone")) changedFields.push("手机号")
  if (readAdminActionString(context.body, "bio")) changedFields.push("简介")
  if (readAdminActionString(context.body, "introduction")) changedFields.push("介绍")

  return changedFields.length > 0
    ? `管理员更新用户资料（${changedFields.join("、")}）`
    : "管理员更新用户资料"
}

function buildAvatarUpdateDetail(context: AdminActionContext) {
  return readAdminActionString(context.body, "avatarPath")
    ? "管理员更新用户头像"
    : "管理员删除用户头像"
}

type UserStatusRecord = NonNullable<Awaited<ReturnType<typeof findUserStatus>>>

function requireUserStatusRecord(user: UserStatusRecord | null) {
  if (!user) apiError(404, "用户不存在")
  return user
}

function ensureCanApplyRestrictiveStatus(user: UserStatusRecord, status: RestrictiveUserStatus) {
  const blockedMessage = getBlockedUserStatusChangeMessage(user, status)
  if (blockedMessage) apiError(403, blockedMessage)
}

interface StatusExpirationInput {
  expiresAt: Date
  displayText: string
}

function readStatusExpiration(context: AdminActionContext): StatusExpirationInput | null {
  const rawValue = readAdminActionString(context.body, "statusExpiresAt")

  if (!rawValue) {
    return null
  }

  const rawOffset = context.body.statusExpiresAtTimezoneOffsetMinutes
  const timezoneOffsetMinutes = readAdminActionNumber(context.body, "statusExpiresAtTimezoneOffsetMinutes")
  const parsedBrowserTime = typeof rawOffset === "undefined" || rawOffset === null || rawOffset === ""
    ? null
    : parseBrowserLocalDateTime(rawValue, timezoneOffsetMinutes ?? Number.NaN)
  if (rawOffset !== undefined && rawOffset !== null && rawOffset !== "" && !parsedBrowserTime) {
    apiError(400, "自动解除时间不合法")
  }

  const expiresAt = parsedBrowserTime?.date ?? parseBusinessDateTime(rawValue)

  if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
    apiError(400, "自动解除时间不合法")
  }

  if (expiresAt.getTime() <= Date.now()) {
    apiError(400, "自动解除时间必须晚于当前时间")
  }

  return {
    expiresAt,
    displayText: parsedBrowserTime?.displayText || formatBrowserLocalDateTimeInput(rawValue) || rawValue,
  }
}

function buildStatusActionMessage(actionText: string, expiration: StatusExpirationInput | null) {
  return expiration
    ? `${actionText}，将在 ${expiration.displayText} 解禁`
    : `${actionText}`
}

function buildAdminPointAdjustReason(message: string) {
  const trimmedMessage = message.trim()
  return trimmedMessage ? `管理员调整用户积分：${trimmedMessage}` : "管理员调整用户积分"
}

function buildAdminPointAdjustNotification(params: {
  pointName: string
  beforePoints: number
  afterPoints: number
  delta: number
  message: string
}) {
  const changeText = params.delta > 0
    ? `增加 ${params.delta} ${params.pointName}`
    : `减少 ${Math.abs(params.delta)} ${params.pointName}`
  const message = params.message.trim()

  return {
    title: `${params.pointName}已由管理员调整`,
    content: [
      `你的${params.pointName}余额已由管理员${changeText}，当前余额为 ${params.afterPoints} ${params.pointName}。`,
      `调整前余额：${params.beforePoints} ${params.pointName}。`,
      message ? `调整说明：${message}` : null,
    ].filter(Boolean).join("\n"),
  }
}

export const adminUserActionHandlers: Record<string, AdminActionDefinition> = {
  "user.mute": defineAdminAction({ targetType: "USER", buildDetail: (context) => buildStatusActionMessage("管理员禁言用户", readStatusExpiration(context)) }, async (context) => {
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const user = requireUserStatusRecord(await findUserStatus(userId))
    ensureCanApplyRestrictiveStatus(user, UserStatus.MUTED)
    const statusExpiration = readStatusExpiration(context)
    await ensureCanModerateUser(context.actor, {
      targetUserId: userId,
      postId: readAdminActionString(context.body, "postId") || undefined,
      commentId: readAdminActionString(context.body, "commentId") || undefined,
    })
    await updateUserStatus(userId, UserStatus.MUTED, statusExpiration?.expiresAt ?? null)

    await writeAdminActionLog(context, adminUserActionHandlers["user.mute"].metadata)
    return { message: "用户已禁言" }
  }),
  "user.activate": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员恢复用户状态" }, async (context) => {
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const user = requireUserStatusRecord(await findUserStatus(userId))
    if (isScopedModerator(context.actor) && user.status !== UserStatus.MUTED) {
      apiError(403, "版主只能解除禁言状态")
    }
    await ensureCanModerateUser(context.actor, {
      targetUserId: userId,
      postId: readAdminActionString(context.body, "postId") || undefined,
      commentId: readAdminActionString(context.body, "commentId") || undefined,
    })
    await updateUserStatus(userId, UserStatus.ACTIVE)

    await writeAdminActionLog(context, adminUserActionHandlers["user.activate"].metadata)
    return { message: "用户状态已恢复" }
  }),
  "user.ban": defineAdminAction({ targetType: "USER", buildDetail: (context) => buildStatusActionMessage("管理员拉黑用户", readStatusExpiration(context)) }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可封禁用户")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const user = requireUserStatusRecord(await findUserStatus(userId))
    ensureCanApplyRestrictiveStatus(user, UserStatus.BANNED)
    const statusExpiration = readStatusExpiration(context)
    await updateUserStatus(userId, UserStatus.BANNED, statusExpiration?.expiresAt ?? null)

    await writeAdminActionLog(context, adminUserActionHandlers["user.ban"].metadata)
    return { message: "用户已拉黑" }
  }),
  "user.promoteModerator": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员提升为版主" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可设置版主")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    await updateUserRole(userId, UserRole.MODERATOR, UserStatus.ACTIVE)

    await writeAdminActionLog(context, adminUserActionHandlers["user.promoteModerator"].metadata)
    return { message: "用户已设为版主" }
  }),
  "user.setAdmin": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员提升为管理员" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可设置管理员")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    await promoteUserToAdmin(userId)

    await writeAdminActionLog(context, adminUserActionHandlers["user.setAdmin"].metadata)
    return { message: "用户已设为管理员" }
  }),
  "user.demoteToUser": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员降级为普通用户" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可调整角色")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    await demoteUserToUser(userId)

    await writeAdminActionLog(context, adminUserActionHandlers["user.demoteToUser"].metadata)
    return { message: "用户角色已降级为普通用户" }
  }),
  "user.points.adjust": defineAdminAction({ targetType: "USER", buildDetail: (context) => `管理员将用户积分调整为 ${Math.max(0, readAdminActionNumber(context.body, "points") ?? 0)}` }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可调整积分")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const points = Math.max(0, readAdminActionNumber(context.body, "points") ?? 0)
    const settings = await getServerSiteSettings()
    const result = await prisma.$transaction(async (tx) => {
      const users = await tx.$queryRaw<Array<{ username: string; points: number }>>(Prisma.sql`
        SELECT "username", "points"
        FROM "User"
        WHERE "id" = ${userId}
        FOR UPDATE
      `)
      const user = users[0] ?? null
      if (!user) apiError(404, "用户不存在")

      const delta = points - user.points
      if (delta === 0) {
        return {
          username: user.username,
          delta,
          beforePoints: user.points,
          afterPoints: user.points,
        }
      }

      const applied = await applyPointDelta({
        tx,
        userId,
        beforeBalance: user.points,
        prepared: {
          scopeKey: "ALL_POINT_CHANGES",
          baseDelta: delta,
          finalDelta: delta,
          appliedRules: [],
        },
        reason: buildAdminPointAdjustReason(context.message),
        pointName: settings.pointName,
        eventType: POINT_LOG_EVENT_TYPES.ADMIN_POINTS_ADJUST,
        eventData: {
          adminUserId: context.adminUserId,
          adminUsername: context.actor.username,
          targetBalance: points,
          message: context.message || null,
        },
        relatedType: "USER",
        relatedId: String(userId),
      })

      const notification = buildAdminPointAdjustNotification({
        pointName: settings.pointName,
        beforePoints: user.points,
        afterPoints: applied.afterBalance,
        delta: applied.finalDelta,
        message: context.message,
      })
      await createSystemNotification({
        client: tx,
        userId,
        senderId: context.adminUserId,
        relatedType: "USER",
        relatedId: String(userId),
        title: notification.title,
        content: notification.content,
      })

      return {
        username: user.username,
        delta: applied.finalDelta,
        beforePoints: user.points,
        afterPoints: applied.afterBalance,
      }
    })
    if (result.delta !== 0) {
      await notificationEventBus.publish({
        type: "notification.count",
        userId,
        unreadNotificationCount: await countUnreadNotifications(userId),
        reason: "created",
        occurredAt: new Date().toISOString(),
      })
    }

    await writeAdminActionLog(context, adminUserActionHandlers["user.points.adjust"].metadata)
    return {
      message: result.delta === 0
        ? `用户 @${result.username} 的${settings.pointName}未变化`
        : `用户 @${result.username} 的${settings.pointName}已更新，并已写入记录与通知`,
    }
  }),
  "user.password.update": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员重置用户密码" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可重置密码")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const newPassword = String(context.body.newPassword ?? "")
    if (!newPassword) apiError(400, "新密码不能为空")
    if (newPassword.length < 6 || newPassword.length > 64) apiError(400, "新密码长度需为 6-64 位")
    const user = await findUserUsername(userId)
    if (!user) apiError(404, "用户不存在")
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await updateUserPasswordHash(userId, passwordHash)

    await writeAdminActionLog(context, adminUserActionHandlers["user.password.update"].metadata)
    return { message: `用户 @${user.username} 的密码已更新` }
  }),
  "user.profile.note": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员添加用户备注" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可记录用户备注")
    await writeAdminActionLog(context, adminUserActionHandlers["user.profile.note"].metadata)
    return { message: "备注已记录" }
  }),
  "user.avatar.update": defineAdminAction({ targetType: "USER", buildDetail: buildAvatarUpdateDetail }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可修改用户头像")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")

    const avatarPath = readAdminActionString(context.body, "avatarPath")
    if (avatarPath.length > 1024) {
      apiError(400, "头像地址过长")
    }

    const user = await findUserAvatarProfile(userId)
    if (!user) apiError(404, "用户不存在")

    await updateUserAvatarPath(userId, avatarPath || null)
    revalidateUserSurfaceCache(userId)

    await writeAdminActionLog(context, adminUserActionHandlers["user.avatar.update"].metadata)
    return { message: avatarPath ? `用户 @${user.username} 的头像已更新` : `用户 @${user.username} 的头像已删除` }
  }),
  "user.profile.update": defineAdminAction({ targetType: "USER", buildDetail: buildProfileUpdateDetail }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可修改基础资料")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")

    const [currentUser, settings] = await Promise.all([
      findUserUsername(userId),
      getServerSiteSettings(),
    ])
    if (!currentUser) apiError(404, "用户不存在")

    const validated = validateProfilePayload({
      nickname: readAdminActionString(context.body, "nickname"),
      bio: readAdminActionString(context.body, "bio"),
      introduction: readAdminActionString(context.body, "introduction"),
      email: readAdminActionString(context.body, "email"),
      gender: readAdminActionString(context.body, "gender"),
    }, {
      nicknameMinLength: settings.registerNicknameMinLength,
      nicknameMaxLength: settings.registerNicknameMaxLength,
    })
    if (!validated.success || !validated.data) {
      apiError(400, validated.message ?? "资料参数不正确")
    }

    const phone = readAdminActionString(context.body, "phone")
    if (phone && !/^1\d{10}$/.test(phone)) {
      apiError(400, "手机号格式不正确")
    }

    const nicknameSafety = await enforceSensitiveText({ scene: "profile.nickname", text: validated.data.nickname })
    const bioSafety = await enforceSensitiveText({ scene: "profile.bio", text: validated.data.bio })
    const introductionSafety = await enforceSensitiveText({ scene: "profile.introduction", text: validated.data.introduction })
    const currentNickname = (currentUser.nickname ?? "").trim()
    const nextNickname = nicknameSafety.sanitizedText

    if (currentNickname !== nextNickname) {
      const matchedNicknameSensitiveWord = findUsernameSensitiveWord(nextNickname, settings)
      if (matchedNicknameSensitiveWord) {
        apiError(400, `昵称包含敏感词：${matchedNicknameSensitiveWord}`)
      }
    }

    const existingNicknameUser = await findUserByNicknameInsensitive(nicknameSafety.sanitizedText, userId)

    if (existingNicknameUser) {
      apiError(409, "昵称已被使用")
    }

    try {
      await updateUserBasicProfile({
        userId,
        nickname: nicknameSafety.sanitizedText,
        email: validated.data.email || null,
        phone: phone || null,
        bio: bioSafety.sanitizedText || null,
        gender: validated.data.gender || "unknown",
        signature: mergeUserProfileSettings(currentUser.signature, {
          introduction: introductionSafety.sanitizedText,
        }),
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const targets = Array.isArray(error.meta?.target) ? error.meta.target.map(String) : []
        if (targets.includes("email")) apiError(409, "邮箱已被使用")
        if (targets.includes("phone")) apiError(409, "手机号已被使用")
        if (targets.includes("nickname")) apiError(409, "昵称已被使用")
        apiError(409, "资料存在重复字段，请检查后重试")
      }

      throw error
    }

    await writeAdminActionLog(context, adminUserActionHandlers["user.profile.update"].metadata)
    return { message: `用户 @${currentUser.username} 的基础资料已更新` }
  }),
  "user.vip": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员切换用户 VIP 状态" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可调整 VIP")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const user = await findUserVipState(userId)
    if (!user) apiError(404, "用户不存在")
    const isVipActive = Boolean(user.vipExpiresAt && new Date(user.vipExpiresAt).getTime() > Date.now())
    await updateUserVip(userId, isVipActive ? 0 : Math.max(1, user.vipLevel || 1), isVipActive ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))

    await writeAdminActionLog(context, adminUserActionHandlers["user.vip"].metadata)
    return { message: isVipActive ? "已取消 VIP" : "已设为 VIP1（月卡 30 天）" }
  }),
  "user.vip.configure": defineAdminAction({ targetType: "USER", buildDetail: () => "管理员配置用户 VIP 等级与到期时间" }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可配置 VIP")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const vipLevel = normalizeConfigurableVipLevel(readAdminActionNumber(context.body, "vipLevel"), 1)
    const vipExpiresAt = context.body.vipExpiresAt ? parseBusinessDateTime(String(context.body.vipExpiresAt)) : null

    if (vipExpiresAt && Number.isNaN(vipExpiresAt.getTime())) apiError(400, "VIP 到期时间不合法")
    await updateUserVip(userId, vipLevel, vipExpiresAt)

    await writeAdminActionLog(context, adminUserActionHandlers["user.vip.configure"].metadata)
    return { message: "VIP 设置已更新" }
  }),
  "user.badge.grant": defineAdminAction({ targetType: "USER", buildDetail: (context) => {
    const badgeName = readAdminActionString(context.body, "badgeName")
    return badgeName ? `管理员手动颁发勋章：${badgeName}` : "管理员手动颁发勋章"
  } }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可手动颁发勋章")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const badgeId = requireAdminActionString(context.body, "badgeId", "请选择要颁发的勋章")
    const badge = await findBadgeSummaryById(badgeId)
    if (!badge) apiError(404, "勋章不存在")

    const user = await findUserUsername(userId)
    if (!user) apiError(404, "用户不存在")

    const existing = await findGrantedUserBadge(userId, badgeId)
    if (existing) apiError(409, "该用户已经拥有这枚勋章")

    await runBadgeTransaction(async (tx) => {
      await createGrantedUserBadge({
        userId,
        badgeId,
        grantSource: BadgeGrantSource.ADMIN_GRANT,
        grantSnapshot: JSON.stringify({
          grantedByAdminUserId: context.adminUserId,
          grantedAt: new Date().toISOString(),
          note: context.message || null,
        }),
        client: tx,
      })

      await createSystemNotification({
        client: tx,
        userId,
        senderId: context.adminUserId,
        relatedType: "USER",
        relatedId: String(userId),
        title: `获得新勋章：${badge.name}`,
        content: `管理员已为你手动颁发勋章“${badge.name}”。你可以前往勋章中心查看并决定是否佩戴展示。`,
      })
    })

    await writeAdminActionLog(context, adminUserActionHandlers["user.badge.grant"].metadata)
    return { message: `已向 @${user.username} 颁发勋章：${badge.name}` }
  }),
  "user.notification.send": defineAdminAction({ targetType: "USER", buildDetail: (context) => {
    const title = readAdminActionString(context.body, "title")
    return title ? `管理员向用户发送通知：${title}` : "管理员向用户发送通知"
  } }, async (context) => {
    if (!isSiteAdmin(context.actor)) apiError(403, "仅管理员可手动发送通知")
    const userId = normalizePositiveUserId(context.targetId)
    if (!userId) apiError(400, "用户标识不合法")
    const title = requireAdminActionString(context.body, "title", "请填写通知标题")
    const content = requireAdminActionString(context.body, "content", "请填写通知内容")
    const user = await findUserUsername(userId)
    if (!user) apiError(404, "用户不存在")

    await createSystemNotification({
      userId,
      senderId: context.adminUserId,
      relatedType: "USER",
      relatedId: String(userId),
      title,
      content,
    })

    await writeAdminActionLog(context, adminUserActionHandlers["user.notification.send"].metadata)
    return { message: `通知已发送给 @${user.username}` }
  }),
}
