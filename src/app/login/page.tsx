import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import {
  AddonRenderBlock,
  AddonSlotRenderer,
  AddonSurfaceRenderer,
  executeAddonSlot,
} from "@/addons-host"
import { AuthPanelNotice, AuthShell } from "@/components/auth/auth-shell"
import { LoginForm } from "@/components/auth/login-form"
import { listAddonExternalAuthEntries } from "@/lib/addon-external-auth-providers"
import { getCurrentUser } from "@/lib/auth"
import { normalizeAuthRedirectTarget } from "@/lib/auth-redirect"
import { readSearchParam } from "@/lib/search-params"
import { getSiteSettings } from "@/lib/site-settings"
import { canSendSms } from "@/lib/sms"

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings()

  return {
    title: `登录 - ${settings.siteName}`,
    description: `使用邮箱或用户名登录 ${settings.siteName}，继续浏览帖子、参与讨论并管理你的账户。`,
  }
}

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams
  const [
    user,
    settings,
    addonExternalAuthEntries,
    addonBeforeFieldBlocks,
    addonCaptchaBlocks,
    addonAfterFieldBlocks,
    smsAvailable,
  ] = await Promise.all([
    getCurrentUser(),
    getSiteSettings(),
    listAddonExternalAuthEntries(),
    executeAddonSlot("auth.login.form.before"),
    executeAddonSlot("auth.login.captcha"),
    executeAddonSlot("auth.login.form.after"),
    canSendSms(),
  ])
  const authError = readSearchParam(searchParams?.authError) ?? ""
  const redirectTarget = normalizeAuthRedirectTarget(readSearchParam(searchParams?.redirect))

  if (user) {
    redirect(redirectTarget)
  }

  const authSlotProps = {
    authError,
    externalAuthEntries: addonExternalAuthEntries,
    settings,
  }
  const page = (
    <AuthShell
      showcaseName={settings.siteName}
      showShowcase={settings.authPageShowcaseEnabled}
      panelTitle="登录账户"
      panelDescription="输入邮箱或用户名和密码，继续你的社区浏览与互动。"
      beforeForm={authError ? <AuthPanelNotice tone="destructive" title="登录失败">{authError}</AuthPanelNotice> : null}
      panelBefore={<AddonSlotRenderer slot="auth.login.panel.before" props={authSlotProps} />}
      panelAfter={<AddonSlotRenderer slot="auth.login.panel.after" props={authSlotProps} />}
      panelSurface="auth.login.panel"
      surfaceProps={authSlotProps}
      footer={(
        <div className="grid w-full grid-cols-2 items-center gap-4 text-sm text-muted-foreground">
          <p>
            忘记密码？<Link href="/forgot-password" className="font-medium text-foreground hover:underline">找回密码</Link>
          </p>
          <p className="justify-self-end">
            还没有账户？<Link href="/register" className="font-medium text-foreground hover:underline">去注册</Link>
          </p>
        </div>
      )}
    >
      <AddonSurfaceRenderer surface="auth.login.form" props={authSlotProps}>
        <LoginForm
          settings={settings}
          smsAvailable={smsAvailable}
          redirectTarget={redirectTarget}
          addonBeforeFields={renderAddonBlocks(addonBeforeFieldBlocks)}
          addonCaptcha={renderAddonBlocks(addonCaptchaBlocks)}
          addonAfterFields={renderAddonBlocks(addonAfterFieldBlocks)}
          addonExternalAuthEntries={addonExternalAuthEntries}
        />
      </AddonSurfaceRenderer>
    </AuthShell>
  )

  return (
    <>
      <AddonSlotRenderer slot="auth.login.page.before" props={authSlotProps} />
      <AddonSurfaceRenderer surface="auth.login.page" props={authSlotProps}>
        {page}
      </AddonSurfaceRenderer>
      <AddonSlotRenderer slot="auth.login.page.after" props={authSlotProps} />
    </>
  )
}

function renderAddonBlocks(blocks: Awaited<ReturnType<typeof executeAddonSlot>>) {
  if (blocks.length === 0) {
    return null
  }

  return (
    <>
      {blocks.map((block) => {
        const blockKey = `${block.addon.manifest.id}:${block.key}`

        return (
          <AddonRenderBlock
            key={blockKey}
            addonId={block.addon.manifest.id}
            blockKey={blockKey}
            result={block.result}
          />
        )
      })}
    </>
  )
}
