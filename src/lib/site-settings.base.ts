import type { PostListDisplayMode } from "@/lib/post-list-display"
import type { PostListLoadMode } from "@/lib/post-list-load-mode"
import type { CommentLoadMode } from "@/lib/comment-load-mode"
import type { FooterLinkItem } from "@/lib/shared/config-parsers"
import type { LeftSidebarDisplayMode, LeftSidebarHomeSettings, PostSlugGenerationMode } from "@/lib/site-settings-app-state"
import type { SiteSearchSettings } from "@/lib/site-search-settings"
import type { SiteHeaderAppLinkItem } from "@/lib/site-header-app-links"
import type { ThemeRuntimeSettings } from "@/lib/theme"

export type PostLinkDisplayMode = "SLUG" | "ID"

export interface SiteSettingsBaseData {
  siteName: string
  siteSlogan: string
  siteDescription: string
  siteLogoText: string
  siteLogoPath?: string | null
  siteIconPath?: string | null
  siteSeoKeywords: string[]
  pointName: string
  redeemCodeHelpEnabled: boolean
  redeemCodeHelpTitle: string
  redeemCodeHelpUrl: string
  postLinkDisplayMode: PostLinkDisplayMode
  homeFeedPostListDisplayMode: PostListDisplayMode
  homeFeedPostListLoadMode: PostListLoadMode
  homeFeedPostPageSize: number
  zonePostPageSize: number
  boardPostPageSize: number
  commentPageSize: number
  commentLoadMode: CommentLoadMode
  postTitleMinLength: number
  postTitleMaxLength: number
  postContentMinLength: number
  postContentMaxLength: number
  commentContentMinLength: number
  commentContentMaxLength: number
  homeSidebarHotTopicsCount: number
  postSidebarRelatedTopicsCount: number
  homeHotRecentWindowHours: number
  homeSidebarStatsCardEnabled: boolean
  homeSidebarAnnouncementsEnabled: boolean
  userProfileIpLocationEnabled: boolean
  leftSidebarDisplayMode: LeftSidebarDisplayMode
  leftSidebarHome: LeftSidebarHomeSettings
  postSlugGenerationMode: PostSlugGenerationMode
  footerCopyrightText: string
  footerBrandingVisible: boolean
  footerLinks: FooterLinkItem[]
  headerAppLinks: SiteHeaderAppLinkItem[]
  headerAppIconName: string
  topHeaderAppLinks: SiteHeaderAppLinkItem[]
  messageEnabled: boolean
  theme: ThemeRuntimeSettings
  search: SiteSearchSettings
  analyticsCode?: string | null
  friendLinksEnabled: boolean
  friendLinkApplicationEnabled: boolean
  friendLinkAnnouncement: string
}
