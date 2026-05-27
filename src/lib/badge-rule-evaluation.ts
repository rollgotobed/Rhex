import {
  BadgeRuleOperator,
  BadgeRuleType,
  type BadgeRuleOperator as BadgeRuleOperatorValue,
  type BadgeRuleType as BadgeRuleTypeValue,
} from "@/lib/shared/badge-rule-enums"
import { serializeDate } from "@/lib/formatters"

export interface BadgeRuleItem {
  id: string
  badgeId: string
  ruleType: BadgeRuleTypeValue
  operator: BadgeRuleOperatorValue
  value: string
  extraValue?: string | null
  sortOrder: number
}

export interface BadgeEligibilitySnapshot {
  userId: number
  points: number
  registerDays: number
  createdAt: Date
  postCount: number
  commentCount: number
  receivedLikeCount: number
  godCommentCount: number
  inviteCount: number
  acceptedAnswerCount: number
  sentTipCount: number
  receivedTipCount: number
  followerCount: number
  level: number
  checkInDays: number
  currentCheckInStreak: number
  maxCheckInStreak: number
  vipLevel: number
}

const RULE_LABELS: Record<string, string> = {
  REGISTER_DAYS: "注册天数",
  REGISTER_TIME_RANGE: "注册时间",
  POST_COUNT: "发帖数",
  COMMENT_COUNT: "回复数",
  RECEIVED_LIKE_COUNT: "获赞数",
  GOD_COMMENT_COUNT: "神评数",
  INVITE_COUNT: "邀请人数",
  ACCEPTED_ANSWER_COUNT: "被采纳数",
  SENT_TIP_COUNT: "打赏次数",
  RECEIVED_TIP_COUNT: "被打赏次数",
  FOLLOWER_COUNT: "粉丝数",
  USER_ID: "UID",
  LEVEL: "等级",
  CHECK_IN_DAYS: "签到天数",
  CURRENT_CHECK_IN_STREAK: "连续签到天数",
  MAX_CHECK_IN_STREAK: "最高连续签到天数",
  VIP_LEVEL: "VIP 等级",
}

function toNonNegativeInt(value: string | number | null | undefined) {
  return Math.max(0, Number(value) || 0)
}

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function compareNumber(actual: number, operator: BadgeRuleOperatorValue, expected: number) {
  switch (operator) {
    case BadgeRuleOperator.GT:
      return actual > expected
    case BadgeRuleOperator.GTE:
      return actual >= expected
    case BadgeRuleOperator.EQ:
      return actual === expected
    case BadgeRuleOperator.LT:
      return actual < expected
    case BadgeRuleOperator.LTE:
      return actual <= expected
    default:
      return false
  }
}

function describeNumberRule(rule: BadgeRuleItem) {
  const label = RULE_LABELS[rule.ruleType]
  const value = toNonNegativeInt(rule.value)

  const operatorLabel: Record<string, string> = {
    [BadgeRuleOperator.GT]: "大于",
    [BadgeRuleOperator.GTE]: "大于等于",
    [BadgeRuleOperator.EQ]: "等于",
    [BadgeRuleOperator.LT]: "小于",
    [BadgeRuleOperator.LTE]: "小于等于",
  }

  return `${label}${operatorLabel[rule.operator] ?? "达到"}${value}`
}

export function describeBadgeRule(rule: BadgeRuleItem) {
  if (rule.ruleType === BadgeRuleType.REGISTER_TIME_RANGE) {
    const start = normalizeDate(rule.value)
    const end = normalizeDate(rule.extraValue ?? null)

    if (rule.operator === BadgeRuleOperator.BETWEEN && start && end) {
      return `注册时间在 ${serializeDate(start) ?? "-"} - ${serializeDate(end) ?? "-"}`
    }

    if (rule.operator === BadgeRuleOperator.AFTER && start) {
      return `注册时间晚于 ${serializeDate(start) ?? "-"}`
    }

    if (rule.operator === BadgeRuleOperator.BEFORE && start) {
      return `注册时间早于 ${serializeDate(start) ?? "-"}`
    }

    return "注册时间符合指定范围"
  }

  return describeNumberRule(rule)
}

export function describeBadgeRules(rules: BadgeRuleItem[]) {
  if (rules.length === 0) {
    return "无领取门槛"
  }

  return rules
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => describeBadgeRule(item))
    .join(" · ")
}

export function evaluateBadgeRuleForSnapshot(snapshot: BadgeEligibilitySnapshot, rule: BadgeRuleItem) {
  const numberMap: Partial<Record<BadgeRuleTypeValue, number>> = {
    REGISTER_DAYS: snapshot.registerDays,
    POST_COUNT: snapshot.postCount,
    COMMENT_COUNT: snapshot.commentCount,
    RECEIVED_LIKE_COUNT: snapshot.receivedLikeCount,
    GOD_COMMENT_COUNT: snapshot.godCommentCount,
    INVITE_COUNT: snapshot.inviteCount,
    ACCEPTED_ANSWER_COUNT: snapshot.acceptedAnswerCount,
    SENT_TIP_COUNT: snapshot.sentTipCount,
    RECEIVED_TIP_COUNT: snapshot.receivedTipCount,
    FOLLOWER_COUNT: snapshot.followerCount,
    USER_ID: snapshot.userId,
    LEVEL: snapshot.level,
    CHECK_IN_DAYS: snapshot.checkInDays,
    CURRENT_CHECK_IN_STREAK: snapshot.currentCheckInStreak,
    MAX_CHECK_IN_STREAK: snapshot.maxCheckInStreak,
    VIP_LEVEL: snapshot.vipLevel,
  }

  if (rule.ruleType === BadgeRuleType.REGISTER_TIME_RANGE) {
    const start = normalizeDate(rule.value)
    const end = normalizeDate(rule.extraValue ?? null)
    const actualTime = snapshot.createdAt.getTime()

    if (rule.operator === BadgeRuleOperator.AFTER && start) {
      return actualTime > start.getTime()
    }

    if (rule.operator === BadgeRuleOperator.BEFORE && start) {
      return actualTime < start.getTime()
    }

    if (rule.operator === BadgeRuleOperator.BETWEEN && start && end) {
      return actualTime >= start.getTime() && actualTime <= end.getTime()
    }

    return false
  }

  const actual = numberMap[rule.ruleType]
  if (typeof actual !== "number") {
    return false
  }

  return compareNumber(actual, rule.operator, toNonNegativeInt(rule.value))
}
