/**
 * @file execution-facades.ts
 * @responsibility buildAddonDomainFacades —— 为 addon 执行态注入 7 个 domain Facade
 *   (posts/comments/messages/notifications/emails/follows/points/data)
 * @scope Phase E 抽出自 internal/execution-context.ts（降其行数 422→≤400）；
 *   execution-context 聚焦 core context (URL/helper/config/secret/backgroundJobs/scheduler)，
 *   本文件聚焦业务域 Facade 的统一"权限校验 + 委派 runtime/{domain}.ts"模板。
 * @exports buildAddonDomainFacades
 */
import "server-only"

import {
  clearAddonDataCollection,
  cleanupAddonDataCollection,
  ensureAddonDataCollection,
  getAddonDataRecord,
  getAddonDataSchemaVersion,
  putAddonDataRecord,
  queryAddonDataRecords,
  deleteAddonDataRecord,
} from "@/addons-host/runtime/data"
import {
  createAddonComment,
  likeAddonComment,
  queryAddonComments,
} from "@/addons-host/runtime/comments"
import { followAddonUser } from "@/addons-host/runtime/follows"
import { sendAddonMessage } from "@/addons-host/runtime/messages"
import { sendAddonEmail } from "@/addons-host/runtime/emails"
import { sendAddonSms } from "@/addons-host/runtime/sms"
import {
  createAddonNotification,
  createAddonNotifications,
} from "@/addons-host/runtime/notifications"
import {
  getAddonGrantedBadgeIds,
  grantAddonBadge,
  listAddonBadges,
} from "@/addons-host/runtime/badges"
import { adjustAddonPoints } from "@/addons-host/runtime/points"
import { saveAddonFile } from "@/addons-host/runtime/files"
import {
  createAddonPost,
  likeAddonPost,
  queryAddonPosts,
  tipAddonPost,
} from "@/addons-host/runtime/posts"
import type {
  AddonExecutionContextBase,
  LoadedAddonRuntime,
} from "@/addons-host/types"

export type AddonDomainFacades = Pick<
  AddonExecutionContextBase,
  "posts" | "comments" | "messages" | "notifications" | "emails" | "sms" | "follows" | "points" | "badges" | "files" | "data"
>

interface DomainFacadeBuildInput {
  request?: Request
}

type AssertPermission = (permission: string, message?: string) => void

export function buildAddonDomainFacades(
  addon: LoadedAddonRuntime,
  input: DomainFacadeBuildInput | undefined,
  assertRuntimePermission: AssertPermission,
): AddonDomainFacades {
  const addonId = addon.manifest.id
  return {
    posts: {
      create: async (postInput) => {
        assertRuntimePermission("post:create", `addon "${addonId}" is not allowed to create posts`)
        return createAddonPost(addon, postInput, input?.request)
      },
      query: async (options) => {
        assertRuntimePermission("post:query", `addon "${addonId}" is not allowed to query posts`)
        return queryAddonPosts(options)
      },
      like: async (likeInput) => {
        assertRuntimePermission("post:like", `addon "${addonId}" is not allowed to like posts`)
        return likeAddonPost(addon, likeInput, input?.request)
      },
      tip: async (tipInput) => {
        assertRuntimePermission("post:tip", `addon "${addonId}" is not allowed to tip posts`)
        return tipAddonPost(addon, tipInput)
      },
    },
    comments: {
      create: async (commentInput) => {
        assertRuntimePermission("comment:create", `addon "${addonId}" is not allowed to create comments`)
        return createAddonComment(addon, commentInput, input?.request)
      },
      query: async (options) => {
        assertRuntimePermission("comment:query", `addon "${addonId}" is not allowed to query comments`)
        return queryAddonComments(options)
      },
      like: async (likeInput) => {
        assertRuntimePermission("comment:like", `addon "${addonId}" is not allowed to like comments`)
        return likeAddonComment(addon, likeInput, input?.request)
      },
    },
    messages: {
      send: async (messageInput) => {
        assertRuntimePermission("message:send", `addon "${addonId}" is not allowed to send direct messages`)
        return sendAddonMessage(addon, messageInput, input?.request)
      },
    },
    notifications: {
      create: async (notificationInput) => {
        assertRuntimePermission("notification:create", `addon "${addonId}" is not allowed to create notifications`)
        return createAddonNotification(notificationInput)
      },
      createMany: async (notificationInputs) => {
        assertRuntimePermission("notification:create", `addon "${addonId}" is not allowed to create notifications`)
        return createAddonNotifications(notificationInputs)
      },
    },
    emails: {
      send: async (emailInput) => {
        assertRuntimePermission("email:send", `addon "${addonId}" is not allowed to send emails`)
        return sendAddonEmail(emailInput)
      },
    },
    sms: {
      send: async (smsInput) => {
        assertRuntimePermission("sms:send", `addon "${addonId}" is not allowed to send SMS messages`)
        return sendAddonSms(smsInput)
      },
    },
    follows: {
      followUser: async (followInput) => {
        assertRuntimePermission("follow:user", `addon "${addonId}" is not allowed to follow users`)
        return followAddonUser(addon, followInput)
      },
    },
    points: {
      adjust: async (pointInput) => {
        assertRuntimePermission("points:adjust", `addon "${addonId}" is not allowed to adjust points`)
        return adjustAddonPoints(pointInput)
      },
    },
    badges: {
      list: async (options) => {
        assertRuntimePermission("badge:query", `addon "${addonId}" is not allowed to query badges`)
        return listAddonBadges(options)
      },
      getGrantedIds: async (badgeLookupInput) => {
        assertRuntimePermission("badge:query", `addon "${addonId}" is not allowed to query badge grants`)
        return getAddonGrantedBadgeIds(badgeLookupInput)
      },
      grant: async (badgeGrantInput) => {
        assertRuntimePermission("badge:grant", `addon "${addonId}" is not allowed to grant badges`)
        return grantAddonBadge(badgeGrantInput)
      },
    },
    files: {
      save: async (fileInput) => {
        assertRuntimePermission("file:write", `addon "${addonId}" is not allowed to write files through system storage`)
        return saveAddonFile(addon, fileInput, input?.request)
      },
    },
    data: {
      ensureCollection: async (definition) => {
        assertRuntimePermission("data:write", `addon "${addonId}" is not allowed to create or update data collections`)
        return ensureAddonDataCollection(addonId, definition)
      },
      get: async (collectionName, recordId) => {
        assertRuntimePermission("data:read", `addon "${addonId}" is not allowed to read plugin data`)
        return getAddonDataRecord(addonId, collectionName, recordId)
      },
      put: async (collectionName, record) => {
        assertRuntimePermission("data:write", `addon "${addonId}" is not allowed to write plugin data`)
        return putAddonDataRecord(addonId, collectionName, record)
      },
      delete: async (collectionName, recordId) => {
        assertRuntimePermission("data:delete", `addon "${addonId}" is not allowed to delete plugin data`)
        return deleteAddonDataRecord(addonId, collectionName, recordId)
      },
      query: async (collectionName, options) => {
        assertRuntimePermission("data:read", `addon "${addonId}" is not allowed to query plugin data`)
        return queryAddonDataRecords(addonId, collectionName, options)
      },
      cleanup: async (collectionName) => {
        assertRuntimePermission("data:delete", `addon "${addonId}" is not allowed to clean plugin data`)
        return cleanupAddonDataCollection(addonId, collectionName)
      },
      clear: async (collectionName) => {
        assertRuntimePermission("data:delete", `addon "${addonId}" is not allowed to clear plugin data`)
        return clearAddonDataCollection(addonId, collectionName)
      },
      getSchemaVersion: async () => {
        assertRuntimePermission("data:read", `addon "${addonId}" is not allowed to read plugin data schema version`)
        return getAddonDataSchemaVersion(addonId)
      },
    },
  }
}
