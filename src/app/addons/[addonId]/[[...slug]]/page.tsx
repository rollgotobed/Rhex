import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { AddonRenderBlock, AddonSlotRenderer, AddonSurfaceRenderer, executeAddonPage, executeAddonPageWithInput, isAddonRedirectResult } from "@/addons-host"
import { HomeSidebarPanels } from "@/components/home/home-sidebar-panels"
import { SidebarNavigation } from "@/components/sidebar-navigation"
import { SiteFooter } from "@/components/site-footer"
import { SiteHeader } from "@/components/site-header"
import { SiteSettingsProvider } from "@/components/site-settings-provider"
import { getHomeAnnouncements } from "@/lib/announcements"
import { getCurrentUser } from "@/lib/auth"
import { getBoards } from "@/lib/boards"
import { getFriendLinkListData } from "@/lib/friend-links"
import { getHomeSidebarHotTopics, resolveSidebarUser } from "@/lib/home-sidebar"
import { getHomeSidebarStats } from "@/lib/home-sidebar-stats"
import { getSiteSettings } from "@/lib/site-settings"
import { getZones } from "@/lib/zones"

interface AddonPageProps {
  params: Promise<{
    addonId: string
    slug?: string[]
  }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: AddonPageProps): Promise<Metadata> {
  const [{ addonId, slug }, settings] = await Promise.all([params, getSiteSettings()])
  const resolved = await executeAddonPage("public", addonId, slug)

  if (!resolved) {
    return {
      title: `插件页面不存在 - ${settings.siteName}`,
    }
  }

  return {
    title: `${resolved.registration.title || resolved.addon.manifest.name} - ${settings.siteName}`,
    description: resolved.registration.description || resolved.addon.manifest.description,
  }
}

function toUrlSearchParams(input: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item)
      }
      continue
    }

    if (typeof value === "string") {
      params.set(key, value)
    }
  }

  return params
}

export default async function AddonPublicPage({ params, searchParams }: AddonPageProps) {
  const { addonId, slug } = await params
  const resolvedSearchParams = searchParams ? toUrlSearchParams(await searchParams) : undefined
  const resolved = await executeAddonPageWithInput("public", addonId, slug, {
    pathname: `/addons/${addonId}/${(slug ?? []).join("/")}`.replace(/\/+$/g, ""),
    searchParams: resolvedSearchParams,
  })

  if (!resolved) {
    notFound()
  }

  if (isAddonRedirectResult(resolved.result)) {
    redirect(resolved.result.redirectTo)
  }

  const renderResult = resolved.result
  const renderBlockKey = `${resolved.addon.manifest.id}:${resolved.registration.key}:page`
  const routeSegments = slug ?? []
  const routePath = routeSegments.filter(Boolean).join("/")
  const addonPageSlotProps = {
    scope: "public",
    addonId: resolved.addon.manifest.id,
    addonName: resolved.addon.manifest.name,
    pageKey: resolved.registration.key,
    routePath,
    routeSegments,
  }
  const chrome = resolved.registration.chrome ?? {}
  const showHeader = chrome.header === true
  const showFooter = chrome.footer === true
  const showLeftSidebar = chrome.leftSidebar === true
  const showRightSidebar = chrome.rightSidebar === true
  const showPageHeading = chrome.pageHeading !== false
  const standaloneMainClassName = chrome.contentLayout === "wide"
    ? "mx-auto flex w-full max-w-none flex-col gap-6 py-4"
    : "mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6"
  const needsShellData = showLeftSidebar || showRightSidebar
  const settingsPromise = needsShellData ? getSiteSettings() : Promise.resolve(null)
  const currentUserPromise = showRightSidebar ? getCurrentUser() : Promise.resolve(null)
  const [settings, zones, boards, currentUser, hotTopics, announcements, friendLinks, stats] = await Promise.all([
    settingsPromise,
    showLeftSidebar ? getZones() : Promise.resolve([]),
    showLeftSidebar ? getBoards() : Promise.resolve([]),
    currentUserPromise,
    showRightSidebar && settingsPromise
      ? settingsPromise.then((siteSettings) => siteSettings ? getHomeSidebarHotTopics(siteSettings.homeSidebarHotTopicsCount) : [])
      : Promise.resolve([]),
    showRightSidebar ? getHomeAnnouncements(3) : Promise.resolve([]),
    showRightSidebar ? getFriendLinkListData() : Promise.resolve(null),
    showRightSidebar ? getHomeSidebarStats() : Promise.resolve(null),
  ])
  const sidebarUser = showRightSidebar && settings
    ? await resolveSidebarUser(currentUser, settings)
    : null
  const mainContent = (
    <main className={showLeftSidebar || showRightSidebar ? "py-1 pb-12 mt-6 min-w-0" : standaloneMainClassName}>
      <AddonSlotRenderer slot="addon.page.before" props={addonPageSlotProps} />
      <AddonSurfaceRenderer surface="addon.page" props={addonPageSlotProps}>
        <>
          {showPageHeading ? (
            <section className="space-y-2">
              <AddonSlotRenderer slot="addon.page.header.before" props={addonPageSlotProps} />
              <AddonSurfaceRenderer surface="addon.page.header" props={addonPageSlotProps}>
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{resolved.addon.manifest.id}</p>
                  <h1 className="text-3xl font-semibold tracking-tight">{resolved.registration.title || resolved.addon.manifest.name}</h1>
                  {resolved.registration.description || resolved.addon.manifest.description ? (
                    <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                      {resolved.registration.description || resolved.addon.manifest.description}
                    </p>
                  ) : null}
                </>
              </AddonSurfaceRenderer>
              <AddonSlotRenderer slot="addon.page.header.after" props={addonPageSlotProps} />
            </section>
          ) : null}

          <AddonSlotRenderer slot="addon.page.content.before" props={addonPageSlotProps} />
          <AddonSurfaceRenderer surface="addon.page.content" props={{ ...addonPageSlotProps, renderBlockKey }}>
            <AddonRenderBlock addonId={resolved.addon.manifest.id} blockKey={renderBlockKey} result={renderResult} />
          </AddonSurfaceRenderer>
          <AddonSlotRenderer slot="addon.page.content.after" props={addonPageSlotProps} />
        </>
      </AddonSurfaceRenderer>
      <AddonSlotRenderer slot="addon.page.after" props={addonPageSlotProps} />
    </main>
  )

  const shellClassName = showLeftSidebar && showRightSidebar
    ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)_minmax(280px,320px)]"
    : showLeftSidebar
      ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)]"
      : showRightSidebar
        ? "grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]"
        : ""

  return (
    <div className="min-h-screen bg-background text-foreground">
      {showHeader ? <SiteHeader /> : null}
      <div className={showLeftSidebar || showRightSidebar || showHeader || showFooter ? "mx-auto max-w-[1200px] px-1" : ""}>
        {showLeftSidebar || showRightSidebar ? (
          <div className={shellClassName}>
            {showLeftSidebar ? (
              <SiteSettingsProvider
                leftSidebarHome={settings?.leftSidebarHome}
                leftSidebarDisplayMode={settings?.leftSidebarDisplayMode ?? "DEFAULT"}
              >
                <SidebarNavigation
                  zones={zones}
                  boards={boards}
                  displayMode={settings?.leftSidebarDisplayMode ?? "DEFAULT"}
                />
              </SiteSettingsProvider>
            ) : null}
            <div className="min-w-0">
              {mainContent}
            </div>
            {showRightSidebar && settings ? (
              <aside className="mt-6 hidden pb-12 lg:block">
                <HomeSidebarPanels
                  user={sidebarUser}
                  hotTopics={hotTopics}
                  announcements={announcements}
                  showAnnouncements={settings.homeSidebarAnnouncementsEnabled}
                  friendLinks={friendLinks?.compact ?? []}
                  friendLinksEnabled={friendLinks?.compact?.length ? settings.friendLinksEnabled : settings.friendLinksEnabled}
                  createPostHref="/write"
                  stats={stats}
                  siteName={settings.siteName}
                  siteDescription={settings.siteDescription}
                  siteLogoPath={settings.siteLogoPath}
                  siteIconPath={settings.siteIconPath}
                />
              </aside>
            ) : null}
          </div>
        ) : (
          mainContent
        )}
        {showFooter ? <SiteFooter /> : null}
      </div>
    </div>
  )
}
