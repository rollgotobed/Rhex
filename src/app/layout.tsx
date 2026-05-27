import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Suspense, type CSSProperties } from "react"

import { BackToTopButton } from "@/components/back-to-top-button"
import { ConditionalSiteFooter } from "@/components/conditional-site-footer"
import { CurrentUserInboxProvider, CurrentUserProvider } from "@/components/current-user-provider"
import { GlobalNavigationProgress } from "@/components/global-navigation-progress"
import { RootBootstrap } from "@/components/root-bootstrap"
import { SiteFooter } from "@/components/site-footer"
import { SiteSettingsProvider } from "@/components/site-settings-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { DeferredToaster } from "@/components/deferred-toaster"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AddonRuntimeProvider } from "@/addons-host/client/addon-runtime-provider"
import { RhexGlobalSdkBootstrap } from "@/addons-host/client/rhex-global-sdk"
import {
  listAddonEditorProviderDescriptors,
  listAddonEditorToolbarItemDescriptors,
} from "@/lib/addon-editor-providers"
import { listAddonSurfaceOverrideDescriptors } from "@/lib/addon-surface-overrides"


import { getRssFeedUrl } from "@/lib/rss"

import { resolveSiteIconPath } from "@/lib/site-branding"
import { resolveSiteOrigin } from "@/lib/site-origin"
import { getSidebarNavigationDisplayModeAttribute } from "@/lib/sidebar-navigation-preference"
import { getPublishedCustomPageFooterHiddenPaths } from "@/lib/custom-pages"
import { getSiteSettings } from "@/lib/site-settings"
import { resolveThemeDocumentPropsFromCookieString } from "@/lib/theme"
import { buildVipNameColorStyleVariables } from "@/lib/vip-name-colors"
import { executeAddonSlot } from "@/addons-host/runtime/execute"
import { AddonRenderBlock } from "@/addons-host/runtime/render"





import "./globals.css"
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const noScriptRootInitStyles = `
  html[data-root-init="pending"] {
    overflow: auto;
  }

  html[data-root-init="pending"] body {
    visibility: visible;
    overflow: visible;
  }

  html[data-root-init="pending"]::before,
  html[data-root-init="pending"]::after {
    display: none;
  }
`

export async function generateMetadata(): Promise<Metadata> {
  const [settings, rssUrl, siteOrigin] = await Promise.all([getSiteSettings(), getRssFeedUrl(), resolveSiteOrigin()])
  const resolvedSiteIconPath = resolveSiteIconPath(settings.siteIconPath)
  const supportsAppleIcon = !/\.svg(?:$|[?#])/i.test(resolvedSiteIconPath)

  return {
    metadataBase: new URL(siteOrigin),
    title: `${settings.siteName} - ${settings.siteSlogan}`,
    description: settings.siteDescription,
    keywords: settings.siteSeoKeywords,
    icons: supportsAppleIcon
      ? {
          icon: resolvedSiteIconPath,
          shortcut: resolvedSiteIconPath,
          apple: resolvedSiteIconPath,
        }
      : {
          icon: resolvedSiteIconPath,
          shortcut: resolvedSiteIconPath,
        },
    alternates: {
      types: {
        "application/rss+xml": rssUrl,
      },
    },
  }
}



export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStorePromise = cookies()
  const headerStorePromise = headers()
  const [settings, editorProviders, editorToolbarItems, addonSurfaceOverrides, footerHiddenPaths, cookieStore, headerStore] = await Promise.all([
    getSiteSettings(),
    listAddonEditorProviderDescriptors(),
    listAddonEditorToolbarItemDescriptors(),
    listAddonSurfaceOverrideDescriptors(),
    getPublishedCustomPageFooterHiddenPaths(),
    cookieStorePromise,
    headerStorePromise,
  ])
  const requestPathname = headerStore.get("x-rhex-pathname") ?? undefined
  const globalLayoutSlotProps = {
    pathname: requestPathname,
    userAgent: headerStore.get("user-agent") ?? "",
  }
  const [headBeforeBlocks, headAfterBlocks, bodyStartBlocks, bodyEndBlocks] = await Promise.all([
    executeAddonSlot("layout.head.before", globalLayoutSlotProps, { pathname: requestPathname }),
    executeAddonSlot("layout.head.after", globalLayoutSlotProps, { pathname: requestPathname }),
    executeAddonSlot("layout.body.start", globalLayoutSlotProps, { pathname: requestPathname }),
    executeAddonSlot("layout.body.end", globalLayoutSlotProps, { pathname: requestPathname }),
  ])
  const vipNameColorStyle = buildVipNameColorStyleVariables(settings.vipNameColors) as CSSProperties
  const sidebarDisplayMode = getSidebarNavigationDisplayModeAttribute(settings.leftSidebarDisplayMode)
  const themeRuntime = settings.theme
  const themeDocument = resolveThemeDocumentPropsFromCookieString(cookieStore.toString(), themeRuntime)
  const rhexSession = {
    isAuthenticated: false,
    user: null,
  }
  const rhexSite = settings

  return (

    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn("font-sans", geist.variable, themeDocument.rootClassName)}
      style={themeDocument.rootStyle as CSSProperties}
      data-root-init={themeDocument.requiresBootGuard ? "pending" : "ready"}
      data-sidebar-display-mode={sidebarDisplayMode}
      data-theme-preset={themeDocument.dataThemePreset}
      data-font-size-preset={themeDocument.dataFontSizePreset}
    >
      <head>
        {headBeforeBlocks.map((block) => (
          <AddonRenderBlock
            key={`${block.addon.manifest.id}:${block.key}:head-before`}
            addonId={block.addon.manifest.id}
            blockKey={`${block.addon.manifest.id}:${block.key}:head-before`}
            result={block.result}
          />
        ))}
        <noscript>
          <style>{noScriptRootInitStyles}</style>
        </noscript>
        {headAfterBlocks.map((block) => (
          <AddonRenderBlock
            key={`${block.addon.manifest.id}:${block.key}:head-after`}
            addonId={block.addon.manifest.id}
            blockKey={`${block.addon.manifest.id}:${block.key}:head-after`}
            result={block.result}
          />
        ))}
      </head>
      <body style={vipNameColorStyle}>
        <RhexGlobalSdkBootstrap session={rhexSession} site={rhexSite} />
        <RootBootstrap />
        {bodyStartBlocks.map((block) => (
          <AddonRenderBlock
            key={`${block.addon.manifest.id}:${block.key}:body-start`}
            addonId={block.addon.manifest.id}
            blockKey={`${block.addon.manifest.id}:${block.key}:body-start`}
            result={block.result}
          />
        ))}
        <ThemeProvider settings={themeRuntime}>
          <CurrentUserProvider>
            <CurrentUserInboxProvider messageEnabled={settings.messageEnabled} messagePromptAudioPath={settings.messagePromptAudioPath}>
            <SiteSettingsProvider
              markdownEmojiMap={settings.markdownEmojiMap}
              markdownImageUploadEnabled={settings.markdownImageUploadEnabled}
              leftSidebarDisplayMode={settings.leftSidebarDisplayMode}
              leftSidebarHome={settings.leftSidebarHome}
              vipLevelIcons={settings.vipLevelIcons}
            >
              <AddonRuntimeProvider editorProviders={editorProviders} editorToolbarItems={editorToolbarItems} surfaceOverrides={addonSurfaceOverrides}>
                <TooltipProvider>
                  <Suspense fallback={null}>
                    <GlobalNavigationProgress />
                  </Suspense>
                  {children}
                  <ConditionalSiteFooter hiddenPaths={footerHiddenPaths}>
                    <>
                      <SiteFooter />
                      {bodyEndBlocks.map((block) => (
                        <AddonRenderBlock
                          key={`${block.addon.manifest.id}:${block.key}:body-end`}
                          addonId={block.addon.manifest.id}
                          blockKey={`${block.addon.manifest.id}:${block.key}:body-end`}
                          result={block.result}
                        />
                      ))}
                    </>
                  </ConditionalSiteFooter>
                  <BackToTopButton />
                  <DeferredToaster />
                </TooltipProvider>
              </AddonRuntimeProvider>
            </SiteSettingsProvider>
            </CurrentUserInboxProvider>
          </CurrentUserProvider>
        </ThemeProvider>




      </body>

    </html>
  )
}
