"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bell, Gem, LayoutDashboard, LogOut, Medal, MessageSquareMore, Settings, TrendingUp, User, Wallet } from "lucide-react"

import { useInboxRealtime } from "@/components/inbox-realtime-provider"
import { useCurrentUser, type CurrentUserClient } from "@/components/current-user-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/rbutton"
import { UserAvatar } from "@/components/user/user-avatar"
import { buildLoginHrefWithRedirect, getCurrentBrowserAuthRedirectTarget } from "@/lib/auth-redirect"
import { cn } from "@/lib/utils"
import { getVipLevel, isVipActive } from "@/lib/vip-status"

interface HeaderUserActionsProps {
  user?: (CurrentUserClient & { canAccessAdmin?: boolean }) | null
  messageEnabled?: boolean
}

type UserMenuSettingsTab = "level" | "points" | "badges"

function formatUnreadBadge(count: number) {
  if (count <= 0) {
    return null
  }

  return count > 99 ? "99+" : String(count)
}

function HeaderUnreadBadge({ count, className }: { count: number; className?: string }) {
  const label = formatUnreadBadge(count)

  if (!label) {
    return null
  }

  const isOverflowLabel = label.length > 2

  return (
    <span
      className={cn(
        "absolute flex min-h-4 min-w-4 items-center justify-center whitespace-nowrap rounded-full border border-background bg-rose-500 px-1.5 text-[10px] font-semibold leading-none tabular-nums text-white shadow-[0_4px_12px_rgba(244,63,94,0.22)] dark:border-background dark:bg-rose-300 dark:text-rose-950 dark:shadow-none",
        className,
        isOverflowLabel && "min-w-6 translate-x-1",
      )}
    >
      {label}
    </span>
  )
}

function UserMenuContent({
  user,
  showIdentity,
  includeVip,
  includeAdminEntry,
  buildSettingsHref,
  onLogout,
  className,
}: {
  user: NonNullable<HeaderUserActionsProps["user"]>
  showIdentity?: boolean
  includeVip?: boolean
  includeAdminEntry?: boolean
  buildSettingsHref?: (tab?: UserMenuSettingsTab) => string
  onLogout: () => Promise<void>
  className?: string
}) {
  const userDisplayName = user.nickname ?? user.username
  const resolveSettingsHref = buildSettingsHref ?? ((tab?: UserMenuSettingsTab) => (tab ? `/settings?tab=${tab}` : "/settings"))

  return (
    <DropdownMenuContent align="end" className={className}>
      {showIdentity ? (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5">
              <div className="flex flex-col gap-0.5">
                <span className="truncate">{userDisplayName}</span>
                <span className="truncate">UID:{user.id} @{user.username}</span>
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link href={`/users/${user.username}`} />}>
          <User />
          个人主页
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={resolveSettingsHref("level")} />}>
          <TrendingUp />
          我的等级
        </DropdownMenuItem>

        <DropdownMenuItem render={<Link href={resolveSettingsHref("points")} />}>
          <Wallet />
          积分明细
          <DropdownMenuShortcut>账单</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem render={<Link href={resolveSettingsHref()} />}>
          <Settings />
          设置
        </DropdownMenuItem>
        {includeVip ? (
          <DropdownMenuItem render={<Link href="/vip" />}>
            <Gem />
            VIP
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={resolveSettingsHref("badges")} />}>
          <Medal />
          勋章
        </DropdownMenuItem>
        {includeAdminEntry ? (
          <DropdownMenuItem render={<Link href="/admin" />}>
            <LayoutDashboard />
            后台
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            void onLogout()
          }}
        >
          <LogOut />
          退出
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  )
}

export function HeaderUserActions({ user: userOverride, messageEnabled = true }: HeaderUserActionsProps = {}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user: currentUser, loading, refresh } = useCurrentUser()
  const user = userOverride ?? (currentUser
    ? {
        ...currentUser,
        canAccessAdmin: currentUser.role === "ADMIN" || currentUser.role === "MODERATOR",
      }
    : null)
  const { unreadMessageCount, unreadNotificationCount } = useInboxRealtime()
  const buildMobileSettingsHref = (tab?: UserMenuSettingsTab) => (
    tab ? `/settings?tab=${tab}&mobile=detail` : "/settings"
  )
  const currentSearch = searchParams.toString()
  const currentPath = `${pathname}${currentSearch ? `?${currentSearch}` : ""}`
  const loginHref = buildLoginHrefWithRedirect(currentPath)

  async function handleLogout() {
    const redirectTarget = getCurrentBrowserAuthRedirectTarget()
    await fetch("/api/auth/logout", {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redirect: redirectTarget }),
    })
    await refresh()
    router.replace(redirectTarget)
    router.refresh()
  }

  if (!user && loading) {
    return (
      <div className="size-8 rounded-md bg-muted/60" aria-hidden="true" />
    )
  }

  if (!user) {
    return (
      <>
        <Link href={loginHref} className="block sm:hidden">
          <Button variant="ghost" size="icon" className="size-8 rounded-md">
            <User className="h-4 w-4" />
          </Button>
        </Link>
        <Link href={loginHref} className="hidden sm:block">
          <Button variant="ghost" size="icon" className="size-8 rounded-md">
            <User className="h-4 w-4" />
          </Button>
        </Link>
      </>
    )
  }

  const vipActive = isVipActive(user)
  const vipLevel = getVipLevel(user)
  const canAccessAdmin = Boolean(user.canAccessAdmin)
  const userDisplayName = user.nickname ?? user.username

  return (
    <>
      <div className="flex items-center gap-1 sm:hidden">
        <Link href="/notifications" className="relative">
          <Button variant="ghost" size="icon" className="size-8 rounded-md">
            <Bell className={unreadNotificationCount > 0 ? "h-4 w-4 text-rose-600 dark:text-rose-300" : "h-4 w-4"} />
          </Button>
          <HeaderUnreadBadge count={unreadNotificationCount} className="right-0.5 top-0.5" />
        </Link>

        {messageEnabled ? (
          <Link href="/messages" className="relative">
            <Button variant="ghost" size="icon" className="size-8 rounded-md">
              <MessageSquareMore className={unreadMessageCount > 0 ? "h-4 w-4 text-rose-600 dark:text-rose-300" : "h-4 w-4"} />
            </Button>
            <HeaderUnreadBadge count={unreadMessageCount} className="right-0.5 top-0.5" />
          </Link>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-8 rounded-md px-1.5" aria-label="打开用户菜单" />}
          >
            <UserAvatar name={userDisplayName} avatarPath={user.avatarPath} size="sm" isVip={vipActive} vipLevel={vipLevel} />
          </DropdownMenuTrigger>
          <UserMenuContent
            user={user}
            includeVip
            includeAdminEntry={canAccessAdmin}
            buildSettingsHref={buildMobileSettingsHref}
            onLogout={handleLogout}
            className="w-48"
          />
        </DropdownMenu>
      </div>

      <div className="hidden items-center gap-1.5 sm:flex">
        <Link href="/notifications" className="relative">
          <Button variant="ghost" size="icon" className="size-8 rounded-md">
            <Bell className={unreadNotificationCount > 0 ? "h-4 w-4 text-rose-600 dark:text-rose-300" : "h-4 w-4"} />
          </Button>
          <HeaderUnreadBadge count={unreadNotificationCount} className="right-0.5 top-0.5" />
        </Link>

        {messageEnabled ? (
          <Link href="/messages" className="relative">
            <Button variant="ghost" className="h-8 rounded-md px-3 gap-1.5">
              <MessageSquareMore className={unreadMessageCount > 0 ? "h-4 w-4 text-rose-600 dark:text-rose-300" : "h-4 w-4"} />
            </Button>
            <HeaderUnreadBadge count={unreadMessageCount} className="right-1 top-0.5" />
          </Link>
        ) : null}

  

  
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="size-8 rounded-md p-0" aria-label="打开用户菜单" />}
          >
            <UserAvatar name={userDisplayName} avatarPath={user.avatarPath} size="sm" isVip={vipActive} vipLevel={vipLevel} />
          </DropdownMenuTrigger>
          <UserMenuContent
            user={user}
            showIdentity
            includeVip
            includeAdminEntry={canAccessAdmin}
            onLogout={handleLogout}
            className="w-56"
          />
        </DropdownMenu>
      </div>
    </>
  )
}
