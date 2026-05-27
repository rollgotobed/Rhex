"use client"

import { useState } from "react"

import { Button } from "@/components/ui/rbutton"
import { toast } from "@/components/ui/toast"
import { normalizeAuthRedirectTarget } from "@/lib/auth-redirect"
import type { PendingExternalAuthState } from "@/lib/external-auth-types"

interface PendingExternalAuthPanelProps {
  state: PendingExternalAuthState
}

export function PendingExternalAuthPanel({ state }: PendingExternalAuthPanelProps) {
  const [username, setUsername] = useState(state.usernameSuggestions[0] ?? state.usernameCandidate ?? "")
  const [inviteCode, setInviteCode] = useState("")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  async function submitUsername() {
    setLoading(true)

    try {
      const response = await fetch("/api/auth/external/username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, inviteCode }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "提交用户名失败")
      }

      window.location.replace(normalizeAuthRedirectTarget(result.data?.redirectTo))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交用户名失败", "认证失败")
    } finally {
      setLoading(false)
    }
  }

  async function submitBind() {
    setLoading(true)

    try {
      const response = await fetch("/api/auth/external/bind", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, password }),
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message ?? "绑定已有账户失败")
      }

      window.location.replace(normalizeAuthRedirectTarget(result.data?.redirectTo))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "绑定已有账户失败", "绑定失败")
    } finally {
      setLoading(false)
    }
  }

  if (state.kind === "email_bind_required") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
          <p>当前 {state.providerLabel} 返回的邮箱 <span className="font-medium text-foreground">{state.conflictEmail}</span> 已命中现有账户。</p>
          <p className="mt-2">请输入该站内账户的用户名/邮箱和密码，完成绑定后即可继续使用 {state.providerLabel} 登录。</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">用户名或邮箱</p>
          <input
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-hidden"
            placeholder="请输入该邮箱对应的站内账户"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">密码</p>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-hidden"
            placeholder="请输入账户密码"
          />
        </div>

        <Button className="w-full" disabled={loading} onClick={submitBind}>
          {loading ? "绑定中..." : `绑定已有账户并继续`}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <p>{state.providerLabel} 返回的用户名无法直接使用，请为当前账户指定一个站内用户名。</p>
        <p className="mt-2">系统已预生成几组可用候选名，你也可以自行输入符合规范的用户名。</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">可用候选名</p>
        <div className="flex flex-wrap gap-2">
          {state.usernameSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setUsername(item)}
              className={username === item ? "rounded-full bg-foreground px-3 py-2 text-xs font-medium text-background" : "rounded-full border border-border bg-card px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">用户名</p>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-hidden"
          placeholder="请输入 3-20 位字母、数字或下划线"
        />
      </div>

      {state.inviteCodeRequired ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">邀请码</p>
          <input
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
            className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-hidden"
            placeholder="请输入邀请码"
          />
        </div>
      ) : null}

      <Button className="w-full" disabled={loading} onClick={submitUsername}>
        {loading ? "提交中..." : "确认用户名并完成登录"}
      </Button>
    </div>
  )
}
