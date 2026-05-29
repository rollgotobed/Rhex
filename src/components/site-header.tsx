import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"

import { HeaderUserActions } from "@/components/header-user-actions"
import { HeaderTopAppNavigation } from "@/components/header-top-app-navigation"
import { MobileHeaderQuickActions } from "@/components/mobile-header-quick-actions"
import { ThemeToggle } from "@/components/theme-toggle"
import { getBoards } from "@/lib/boards"
import { SearchForm } from "@/components/search-form"
import { resolveSiteIconPath } from "@/lib/site-branding"
import { getSiteSettings } from "@/lib/site-settings"
import { getZones } from "@/lib/zones"
import { AddonSlotRenderer, AddonSurfaceRenderer } from "@/addons-host"

function SiteLogoMark({ logoPath, iconPath }: { logoPath?: string | null; iconPath?: string | null }) {
  if (logoPath) {
    return (
      <div className="flex h-8 shrink-0 items-center">
        <Image
          src={logoPath}
          alt="站点 Logo"
          width={160}
          height={32}
          sizes="160px"
          unoptimized
          className="h-8 w-auto max-w-none"
        />
      </div>
    )
  }

  return (
    <div className="flex h-8 shrink-0 items-center">
      <Image
        src={resolveSiteIconPath(iconPath)}
        alt=""
        width={32}
        height={32}
        unoptimized
        className="h-8 w-auto max-w-none"
      />
    </div>
  )
}

export async function SiteHeader() {
  const [settings, zones, boards] = await Promise.all([getSiteSettings(), getZones(), getBoards()])

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-sm supports-backdrop-filter:bg-background/60">
      <div className="mx-auto max-w-[1200px] px-1">
        <AddonSlotRenderer slot="layout.header.before" props={{ settings }} />
        <AddonSurfaceRenderer surface="layout.header" props={{ settings }}>
          <div className="grid h-14 grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="-mr-6 hidden h-14 items-center lg:col-span-2 lg:flex">
              <AddonSlotRenderer slot="layout.header.left" props={{ settings }} />
              <Link href="/" className="flex items-center gap-2 text-xl leading-none">
                <SiteLogoMark logoPath={settings.siteLogoPath} iconPath={settings.siteIconPath} />
                {settings.siteLogoText && settings.siteLogoText.trim() !== "" ? (
                  <div className="hidden font-bold tracking-tight sm:inline-block">{settings.siteLogoText}</div>
                ) : null}
              </Link>
            </div>

            <div className="flex h-14 items-center justify-between gap-3 lg:col-span-10">
              <div className="flex items-center gap-2 lg:hidden">
                <Link href="/" className="flex items-center gap-2 text-base font-bold leading-none">
                  <SiteLogoMark logoPath={settings.siteLogoPath} iconPath={settings.siteIconPath} />
                  <span className="sr-only">{settings.siteLogoText}</span>
                </Link>
                <Suspense fallback={null}>
                  <MobileHeaderQuickActions
                    checkInEnabled={settings.checkInEnabled}
                    appLinks={settings.headerAppLinks}
                    search={settings.search}
                    zones={zones}
                    boards={boards}
                  />
                </Suspense>
              </div>

              <div className="hidden flex-1 md:block">
                <div className="ml-4 max-w-md">
                  <Suspense fallback={<div className="h-9 w-full rounded-full border border-border bg-muted/50" aria-hidden="true" />}>
                    <SearchForm compact appLinks={settings.headerAppLinks} appIconName={settings.headerAppIconName} search={settings.search} />
                  </Suspense>
                </div>
                <AddonSlotRenderer slot="layout.header.center" props={{ settings }} />
              </div>

              <div className="ml-auto flex h-14 items-center gap-1.5">
                <AddonSlotRenderer slot="layout.header.right" props={{ settings }} />
                <Suspense fallback={null}>
                  <HeaderTopAppNavigation links={settings.topHeaderAppLinks} />
                </Suspense>
                <ThemeToggle />
                <Suspense fallback={null}>
                  <HeaderUserActions messageEnabled={settings.messageEnabled} />
                </Suspense>
              </div>
            </div>
          </div>
        </AddonSurfaceRenderer>
        <AddonSlotRenderer slot="layout.header.after" props={{ settings }} />
      </div>
    </header>
  )
}
