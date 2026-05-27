import "server-only"

import { getRateLimitConfig } from "@/lib/ai/capabilities/rate-limit-config"
import { checkAndIncrementDaily } from "@/lib/ai/rate-limit"

import type {
  AiChatMessage,
  AiChatOptions,
  AiProvider,
} from "./provider/types"

export type AiTaskKind = "reply" | "summary" | "auto-categorize" | "chat"

export interface RunAiTaskInput {
  kind: AiTaskKind
  provider: AiProvider
  messages: AiChatMessage[]
  options: AiChatOptions
  /** 用于后续 rate-limit / usage 记账（本步占位，不实现） */
  appKey: string
}

export interface RunAiTaskOutput {
  text: string
  finishReason?: string
  usage?: { totalTokens?: number }
}

/**
 * 统一任务编排外壳（最小版）。
 * TODO(step 9): rate-limit 检查 + usage 增量记账
 * TODO(step X): 基于 kind 做 prompt/sanitizer 分派
 */
export async function runAiTask(input: RunAiTaskInput): Promise<RunAiTaskOutput> {
  // step 9: 前置日调用上限检查；超限抛 AiRateLimitError 由调用方短路重试
  const { dailyMax } = await getRateLimitConfig()
  await checkAndIncrementDaily(input.appKey, dailyMax)
  void input.kind

  const res = await input.provider.chat(input.messages, input.options)
  return {
    text: res.text,
    finishReason: res.finishReason,
    usage: { totalTokens: res.usage?.totalTokens },
  }
}
