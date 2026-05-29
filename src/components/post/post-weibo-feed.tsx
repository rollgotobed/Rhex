"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { Bookmark, Gift, MessageSquare, Paperclip, ThumbsUp, type LucideIcon } from "lucide-react"

import { LevelIcon } from "@/components/level-icon"
import { MarkdownContentClient } from "@/components/markdown-content-client"
import { PostListLink } from "@/components/post/post-list-link"
import {
  getPostTitleClassName,
  PostAccessBadges,
  PostPinBadge,
  PostRewardPoolIcon,
  PostTypeBadge,
} from "@/components/post/post-list-shared"
import { PostTipPanel } from "@/components/post/post-tip-panel"
import { TimeTooltip } from "@/components/time-tooltip"
import { toast } from "@/components/ui/toast"
import { Tooltip } from "@/components/ui/tooltip"
import { UserAvatar } from "@/components/user/user-avatar"
import { UserDisplayedBadges } from "@/components/user/user-displayed-badges"
import { UserProfilePreviewCardTrigger } from "@/components/user/user-profile-preview-card-trigger"
import { UserStatusBadge } from "@/components/user/user-status-badge"
import { VipNameTooltip } from "@/components/vip/vip-name-tooltip"
import type { PostStreamDisplayItem } from "@/lib/forum-post-stream-display"
import { omitPostListPreviewMediaFromMarkdown, type PostListPreviewMedia } from "@/lib/post-list-media"
import { getPostPath } from "@/lib/post-links"
import { cn } from "@/lib/utils"

interface PostWeiboFeedProps {
  items: PostStreamDisplayItem[]
  showBoard?: boolean
  postLinkDisplayMode?: "SLUG" | "ID"
  showPinBadge?: boolean
}

function getEmbedPreviewFrameStyle(src: string) {
  try {
    const url = new URL(src)
    if (url.hostname === "music.163.com") {
      const queryHeight = Number(url.searchParams.get("height"))
      const height = Number.isFinite(queryHeight)
        ? Math.min(180, Math.max(86, queryHeight + 20))
        : 110

      return {
        className: "block w-full",
        style: { height },
      }
    }
  } catch {
    // Use the standard video-like frame when the URL cannot be parsed.
  }

  return {
    className: "block aspect-video w-full",
    style: undefined,
  }
}

function getEmbedPreviewSrc(src: string) {
  try {
    const url = new URL(src)
    if (url.hostname === "music.163.com") {
      url.searchParams.set("auto", "0")
      return url.toString()
    }
  } catch {
    return src
  }

  return src
}

function PostNoteMedia({ href, media, title }: { href: string; media?: PostListPreviewMedia | null; title: string }) {
  const [hasLoadError, setHasLoadError] = useState(false)
  const normalizedSrc = media?.src.trim() ?? ""

  if (!normalizedSrc || hasLoadError) {
    return null
  }

  if (media?.type === "audio") {
    return (
      <div className="mt-4 rounded-md border border-border bg-secondary/40 p-3">
        <audio className="block w-full" controls preload="metadata" src={normalizedSrc} onError={() => setHasLoadError(true)} />
      </div>
    )
  }

  if (media?.type === "video") {
    return (
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-black">
        <video className="block max-h-[680px] w-full bg-black" controls preload="metadata" playsInline src={normalizedSrc} onError={() => setHasLoadError(true)} />
      </div>
    )
  }

  if (media?.type === "embed") {
    const frameStyle = getEmbedPreviewFrameStyle(normalizedSrc)
    const embedSrc = getEmbedPreviewSrc(normalizedSrc)

    return (
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-secondary">
        <iframe
          className={frameStyle.className}
          style={frameStyle.style}
          src={embedSrc}
          title={title}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          onError={() => setHasLoadError(true)}
        />
      </div>
    )
  }

  return (
    <PostListLink href={href} className="mt-4 block overflow-hidden rounded-md bg-secondary">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={normalizedSrc}
        alt={title}
        title={title}
        className="block max-h-[680px] w-full object-cover"
        loading="lazy"
        decoding="async"
        onError={() => setHasLoadError(true)}
      />
    </PostListLink>
  )
}

const iconActionClassName = "relative inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-full px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-60"

function IconActionLink({
  href,
  icon: Icon,
  value,
  label,
  badge,
  tone = "default",
}: {
  href: string
  icon: LucideIcon
  value?: number
  label: string
  badge?: number
  tone?: "default" | "gift"
}) {
  return (
    <Tooltip content={label}>
      <PostListLink
        href={href}
        className={cn(
          iconActionClassName,
          tone === "gift" && "bg-amber-100/70 text-amber-700 hover:bg-amber-100 dark:bg-amber-400/10 dark:text-amber-200 dark:hover:bg-amber-400/15",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {typeof value === "number" && value > 0 ? <span className="text-xs font-medium">{value}</span> : null}
        {typeof badge === "number" && badge > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {badge}
          </span>
        ) : null}
      </PostListLink>
    </Tooltip>
  )
}

function IconActionButton({
  icon: Icon,
  value,
  label,
  pressed,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  value?: number
  label: string
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        className={cn(iconActionClassName, pressed && "bg-accent text-foreground")}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
        {typeof value === "number" && value > 0 ? <span className="text-xs font-medium">{value}</span> : null}
      </button>
    </Tooltip>
  )
}

function PostNoteActions({ item, postPath }: { item: PostStreamDisplayItem; postPath: string }) {
  const [likes, setLikes] = useState(item.likeCount ?? 0)
  const [favorites, setFavorites] = useState(item.favoriteCount ?? 0)
  const [liked, setLiked] = useState(false)
  const [favored, setFavored] = useState(false)
  const [isPending, startTransition] = useTransition()

  function runAction(type: "like" | "favorite") {
    startTransition(async () => {
      try {
        const response = await fetch(type === "like" ? "/api/posts/like" : "/api/posts/favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId: item.id }),
        })
        const result = await response.json()

        if (!response.ok) {
          toast.error(result.message ?? (type === "like" ? "点赞失败" : "收藏失败"), type === "like" ? "帖子点赞失败" : "收藏失败")
          return
        }

        if (type === "like") {
          const nextLiked = Boolean(result.data?.liked)
          setLiked(nextLiked)
          setLikes((current) => Math.max(0, current + (nextLiked ? 1 : -1)))
          toast.success(result.message ?? (nextLiked ? "点赞成功" : "已取消点赞"), nextLiked ? "点赞成功" : "取消点赞成功")
          return
        }

        const nextFavored = Boolean(result.data?.favored)
        setFavored(nextFavored)
        setFavorites((current) => Math.max(0, current + (nextFavored ? 1 : -1)))
        toast.success(result.message ?? (nextFavored ? "收藏成功" : "已取消收藏"), nextFavored ? "收藏成功" : "取消收藏成功")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : (type === "like" ? "点赞失败，请稍后重试" : "收藏失败，请稍后重试"), type === "like" ? "帖子点赞失败" : "收藏失败")
      }
    })
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <IconActionButton icon={ThumbsUp} value={likes} label={liked ? "取消点赞" : "点赞"} pressed={liked} disabled={isPending} onClick={() => runAction("like")} />
        <IconActionButton icon={Bookmark} value={favorites} label={favored ? "取消收藏" : "收藏"} pressed={favored} disabled={isPending} onClick={() => runAction("favorite")} />
        {item.tipping ? (
          <PostTipPanel
            postId={item.id}
            postSlug={item.slug}
            loginRedirectTarget={postPath}
            enabled={item.tipping.enabled}
            isLoggedIn={item.tipping.isLoggedIn}
            pointName={item.tipping.pointName}
            currentUserPoints={item.tipping.currentUserPoints}
            gifts={item.tipping.gifts}
            giftStats={item.tipping.giftStats}
            recentGiftEvents={item.tipping.recentGiftEvents}
            allowedAmounts={item.tipping.allowedAmounts}
            dailyLimit={item.tipping.dailyLimit}
            perPostLimit={item.tipping.perPostLimit}
            usedDailyCount={item.tipping.usedDailyCount}
            usedPostCount={item.tipping.usedPostCount}
            totalCount={item.tipping.totalCount}
            totalPoints={item.tipping.totalPoints}
            topSupporters={item.tipping.topSupporters}
          />
        ) : (
          <IconActionLink href={postPath} icon={Gift} label={item.tipTotalPoints ? `打赏礼物 · 已收到 ${item.tipTotalPoints}` : "打赏礼物"} badge={item.tipCount} tone="gift" />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <PostListLink href={`${postPath}#comments`} className="inline-flex h-9 items-center gap-1 rounded-full px-2 transition-colors hover:opacity-90" style={{ backgroundColor: `${item.commentAccentColor}14`, color: item.commentAccentColor }}>
          <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{item.commentCount}</span>
        </PostListLink>
      </div>
    </div>
  )
}

export function PostWeiboFeed({ items, showBoard = true, postLinkDisplayMode = "SLUG", showPinBadge = true }: PostWeiboFeedProps) {
  return (
    <div className="flex flex-col gap-5 px-1.5 py-2 sm:px-2">
      {items.map((item) => {
        const postPath = getPostPath({ id: item.id, slug: item.slug }, { mode: postLinkDisplayMode })
        const isRestrictedAuthor = item.authorStatus === "BANNED" || item.authorStatus === "MUTED"
        const hasContentMarkdown = Boolean(item.contentMarkdown)
        const contentMarkdown = typeof item.contentPreviewMarkdown === "string"
          ? item.contentPreviewMarkdown
          : item.contentMarkdown
          ? omitPostListPreviewMediaFromMarkdown(item.contentMarkdown, item.previewMedia)
          : ""
        const contentHtml = typeof item.contentPreviewHtml === "string" ? item.contentPreviewHtml : undefined

        return (
          <article key={item.id} className="overflow-hidden rounded-md border border-border bg-card shadow-xs">
            <div className="px-4 pb-5 pt-4 sm:px-6 sm:pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <UserProfilePreviewCardTrigger
                    username={item.authorUsername}
                    displayName={item.authorName}
                    avatarPath={item.authorAvatarPath}
                    isVip={item.authorIsVip}
                    vipLevel={item.authorVipLevel}
                    triggerClassName={cn("shrink-0", isRestrictedAuthor && "grayscale")}
                    align="start"
                  >
                    <UserAvatar name={item.authorName} avatarPath={item.authorAvatarPath} size="md" isVip={item.authorIsVip} vipLevel={item.authorVipLevel} />
                  </UserProfilePreviewCardTrigger>

                  <div className={cn("flex min-w-0 items-center gap-1.5", isRestrictedAuthor && "grayscale")}>
                    <VipNameTooltip isVip={item.authorIsVip} level={item.authorVipLevel}>
                      <Link
                        href={`/users/${item.authorUsername}`}
                        className={cn("truncate text-sm font-semibold text-foreground hover:underline", item.authorIsVip ? item.authorNameClassName : item.authorNameClassName?.replace(/\bfont-semibold\b/g, "").trim())}
                      >
                        {item.authorName}
                      </Link>
                    </VipNameTooltip>
                    <UserDisplayedBadges badges={item.authorDisplayedBadges} compact appearance="plain" spacing="tight" />
                    {isRestrictedAuthor ? <UserStatusBadge status={item.authorStatus} compact /> : null}
                  </div>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 pt-1">
                  {showBoard && item.boardSlug ? (
                    <Link href={`/boards/${item.boardSlug}`} className="inline-flex max-w-36 items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground" title={item.boardName}>
                      <LevelIcon icon={item.boardIcon} className="h-3.5 w-3.5 shrink-0 text-xs" svgClassName="[&>svg]:block" />
                      <span className="truncate">{item.boardName}</span>
                    </Link>
                  ) : null}
                  <PostTypeBadge type={item.type} label={item.typeLabel} compact />
                  {showPinBadge ? <PostPinBadge scope={item.pinScope} label={item.pinLabel} compact /> : null}
                  {item.isFeatured ? <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">精华</span> : null}
                  <TimeTooltip value={item.metaPrimaryRaw}>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">{item.metaPrimary}</span>
                  </TimeTooltip>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <PostListLink href={postPath} visitedPath={postPath} dimWhenRead className="min-w-0 flex-1">
                    <h2 className={getPostTitleClassName({ isFeatured: item.isFeatured, pinScope: item.pinScope, compact: false })}>
                      {item.title}
                    </h2>
                  </PostListLink>
                  {item.hasRedPacket ? (
                    <Tooltip content={item.rewardMode === "JACKPOT" ? "聚宝盆帖" : "红包帖"}>
                      <span className="shrink-0" aria-label={item.rewardMode === "JACKPOT" ? "聚宝盆帖" : "红包帖"}>
                        <PostRewardPoolIcon mode={item.rewardMode} />
                      </span>
                    </Tooltip>
                  ) : null}
                  {item.hasAttachments ? (
                    <Tooltip content="含附件">
                      <span className="shrink-0 text-muted-foreground" aria-label="含附件">
                        <Paperclip className="h-4 w-4" />
                      </span>
                    </Tooltip>
                  ) : null}
                  <PostAccessBadges minViewLevel={item.minViewLevel} minViewVipLevel={item.minViewVipLevel} compact />
                </div>

                <PostNoteMedia href={postPath} media={item.previewMedia} title={item.title} />

                {contentMarkdown ? (
                  <MarkdownContentClient
                    content={contentMarkdown}
                    html={contentHtml}
                    className="mt-4 max-h-52 overflow-hidden text-sm leading-7 text-muted-foreground prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-foreground prose-blockquote:my-2 prose-pre:my-2"
                    collapseLongCodeBlocks
                  />
                ) : !hasContentMarkdown && item.excerpt ? (
                  <p className="mt-4 line-clamp-4 text-sm leading-7 text-muted-foreground">{item.excerpt}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-border px-4 py-3 sm:px-6">
              <PostNoteActions item={item} postPath={postPath} />
            </div>
          </article>
        )
      })}
    </div>
  )
}
