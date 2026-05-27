import "server-only"

// Ensure host AI capabilities are published before addon render/API handlers try
// to resolve globalThis[Symbol.for("bbs.ai.capabilities.v1")].
import "@/lib/ai/capabilities/bridge"

import {
  buildAddonExecutionContext,
  loadAddonsRegistry,
  type IndexedAddonSurfaceCandidate,
} from "@/addons-host/runtime/loader"
import { runWithAddonExecutionScope } from "@/addons-host/runtime/execution-scope"
import { executeAddonActionHook } from "@/addons-host/runtime/hooks"
import { findAddonApiRoute, findAddonPageRoute } from "@/addons-host/runtime/routes"
import {
  logRenderFailure,
  persistAddonRenderFailure,
  runAddonRenderCall,
  type AddonRenderExecutionInput,
} from "@/addons-host/runtime/internal/render-executor"
import type {
  AddonApiResult,
  AddonApiScope,
  AddonHttpMethod,
  AddonPageRenderResult,
  AddonPageScope,
  AddonRenderResult,
  AddonSlotProps,
  AddonSurfaceProps,
  AddonSurfaceRegistration,
  AddonSlotKey,
  LoadedAddonRuntime,
} from "@/addons-host/types"

export interface ExecutedAddonSlotResult {
  addon: LoadedAddonRuntime
  key: string
  order: number
  result: AddonRenderResult
}

export interface ExecutedAddonSurfaceResult<
  TProps extends AddonSurfaceProps = AddonSurfaceProps,
> {
  addon: LoadedAddonRuntime
  registration: AddonSurfaceRegistration<TProps>
  priority: number
  result: AddonRenderResult
}

function resolveAddonSurfaceClientModuleUrl(addon: LoadedAddonRuntime, input?: string) {
  const target = typeof input === "string" ? input.trim() : ""
  if (!target) {
    return ""
  }

  if (/^(https?:)?\/\//i.test(target) || target.startsWith("/")) {
    return target
  }

  return buildAddonExecutionContext(addon).asset(target)
}

async function collectAddonSurfaceCandidates<
  TProps extends AddonSurfaceProps = AddonSurfaceProps,
>(surface: string) {
  const registry = await loadAddonsRegistry()
  return (registry.surfaceCandidatesBySurface.get(surface) ??
    []) as Array<IndexedAddonSurfaceCandidate<TProps>>
}

export async function executeAddonSlot<
  TProps extends AddonSlotProps = AddonSlotProps,
>(
  slot: AddonSlotKey,
  props?: TProps,
  input?: AddonRenderExecutionInput,
) {
  const registry = await loadAddonsRegistry()
  const results: ExecutedAddonSlotResult[] = []

  for (const candidate of registry.slotCandidatesBySlot.get(slot) ?? []) {
    try {
      const result = await runAddonRenderCall({
        addon: candidate.addon,
        action: `slot:${slot}:${candidate.registration.key}`,
        input,
        call: (ctx) => candidate.registration.render({
          ...ctx,
          slot,
          props: (props ?? {}) as TProps,
        }),
      })

      if (!result) {
        continue
      }

      results.push({
        addon: candidate.addon,
        key: candidate.registration.key,
        order: candidate.order,
        result,
      })
    } catch (error) {
      await logRenderFailure({
        addon: candidate.addon,
        kind: "SLOT_RENDER",
        target: slot,
        key: candidate.registration.key,
        metadataJson: { slot, key: candidate.registration.key },
        error,
      })
      await persistAddonRenderFailure(candidate.addon, error)
    }
  }

  return results
}

export async function executeAddonSurface<
  TProps extends AddonSurfaceProps = AddonSurfaceProps,
>(
  surface: string,
  props: TProps,
  input?: AddonRenderExecutionInput,
) {
  const candidates = await collectAddonSurfaceCandidates<TProps>(surface)

  for (const candidate of candidates) {
    try {
      const result = candidate.registration.render
        ? await runAddonRenderCall({
            addon: candidate.addon,
            action: `surface:${surface}:${candidate.registration.key}`,
            input,
            call: (ctx) => candidate.registration.render?.({
              ...ctx,
              surface,
              props,
            }),
          })
        : {
            clientModule: resolveAddonSurfaceClientModuleUrl(
              candidate.addon,
              candidate.registration.clientModule,
            ),
            clientProps: props,
          }

      if (!result) {
        continue
      }

      return {
        addon: candidate.addon,
        registration: candidate.registration,
        priority: candidate.priority,
        result,
      } satisfies ExecutedAddonSurfaceResult<TProps>
    } catch (error) {
      await logRenderFailure({
        addon: candidate.addon,
        kind: "SURFACE_RENDER",
        target: surface,
        key: candidate.registration.key,
        metadataJson: { surface, key: candidate.registration.key },
        error,
      })
      await persistAddonRenderFailure(candidate.addon, error)
    }
  }

  return null
}

export async function executeAddonSurfaceRender<
  TProps extends AddonSurfaceProps = AddonSurfaceProps,
>(
  surface: string,
  props: TProps,
  input?: AddonRenderExecutionInput,
) {
  const candidates = await collectAddonSurfaceCandidates<TProps>(surface)

  for (const candidate of candidates) {
    const hasClientModule = Boolean(candidate.registration.clientModule?.trim())

    if (!candidate.registration.render) {
      return null
    }

    try {
      const result = await runAddonRenderCall({
        addon: candidate.addon,
        action: `surface:${surface}:${candidate.registration.key}`,
        input,
        call: (ctx) => candidate.registration.render?.({
          ...ctx,
          surface,
          props,
        }),
      })

      if (result) {
        return {
          addon: candidate.addon,
          registration: candidate.registration,
          priority: candidate.priority,
          result,
        } satisfies ExecutedAddonSurfaceResult<TProps>
      }

      if (hasClientModule) {
        return null
      }
    } catch (error) {
      await logRenderFailure({
        addon: candidate.addon,
        kind: "SURFACE_RENDER",
        target: surface,
        key: candidate.registration.key,
        metadataJson: { surface, key: candidate.registration.key },
        error,
      })
      await persistAddonRenderFailure(candidate.addon, error)

      if (hasClientModule) {
        return null
      }
    }
  }

  return null
}

export async function executeAddonPage(scope: AddonPageScope, addonId: string, routeSegments?: string[]) {
  return executeAddonPageWithInput(scope, addonId, routeSegments)
}

export async function executeAddonPageWithInput(
  scope: AddonPageScope,
  addonId: string,
  routeSegments?: string[],
  input?: AddonRenderExecutionInput,
) {
  const matched = await findAddonPageRoute(scope, addonId, routeSegments)
  if (!matched) {
    return null
  }

  const routePath = routeSegments?.filter(Boolean).join("/") ?? ""
  const result = await runAddonRenderCall({
    addon: matched.addon,
    action: `page:${scope}:${matched.registration.key}`,
    input,
    call: (ctx) => matched.registration.render({
      ...ctx,
      scope,
      routePath,
      routeSegments: routeSegments ?? [],
    }),
  })

  if (!result) {
    return null
  }

  return {
    addon: matched.addon,
    registration: matched.registration,
    result,
  }
}

export async function executeAddonApi(
  scope: AddonApiScope,
  addonId: string,
  routeSegments: string[] | undefined,
  method: AddonHttpMethod,
  request: Request,
) {
  const matched = await findAddonApiRoute(scope, addonId, routeSegments, method)
  if (!matched) {
    return null
  }

  const routePath = routeSegments?.filter(Boolean).join("/") ?? ""
  const requestUrl = new URL(request.url)
  const apiHookPayload = {
    scope,
    addonId,
    routePath,
    routeSegments: matched.normalizedSegments,
    method,
    pathname: requestUrl.pathname,
  }

  await executeAddonActionHook("addon.api.request.before", apiHookPayload, {
    request,
    pathname: requestUrl.pathname,
    searchParams: requestUrl.searchParams,
    throwOnError: true,
  })

  // api 路径的 handle 一定返回 AddonApiResult（非 undefined），保留直接 scope 调用，
  // 避免 runAddonRenderCall 的 `TResult | undefined` 返回污染下游 http.ts 类型。
  const result = await runWithAddonExecutionScope(matched.addon, {
    action: `api:${scope}:${matched.registration.key}`,
    request,
  }, async () => matched.registration.handle({
    ...buildAddonExecutionContext(matched.addon, {
      request,
      pathname: requestUrl.pathname,
      searchParams: requestUrl.searchParams,
    }),
    request,
    scope,
    routePath,
    routeSegments: matched.normalizedSegments,
    method,
  }))

  return {
    addon: matched.addon,
    registration: matched.registration,
    result,
  }
}

export function isAddonRedirectResult(result: AddonPageRenderResult): result is { redirectTo: string } {
  return typeof result === "object" && result !== null && "redirectTo" in result && typeof result.redirectTo === "string"
}

export function normalizeAddonApiResult(result: AddonApiResult) {
  if (result instanceof Response) {
    return result
  }

  const headers = new Headers(result.headers)
  const status = result.status ?? 200

  if (typeof result.text === "string") {
    headers.set("content-type", headers.get("content-type") ?? "text/plain; charset=utf-8")
    return new Response(result.text, { status, headers })
  }

  if (typeof result.html === "string") {
    headers.set("content-type", headers.get("content-type") ?? "text/html; charset=utf-8")
    return new Response(result.html, { status, headers })
  }

  headers.set("content-type", headers.get("content-type") ?? "application/json; charset=utf-8")
  return new Response(JSON.stringify(result.json ?? null), { status, headers })
}
