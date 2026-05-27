"use client"

import { useSyncExternalStore, type ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

const MOBILE_POINTER_QUERY = "(hover: none), (pointer: coarse)"

function subscribeMobilePointer(callback: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined
  }

  const mediaQuery = window.matchMedia(MOBILE_POINTER_QUERY)
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", callback)
    return () => mediaQuery.removeEventListener("change", callback)
  }

  mediaQuery.addListener(callback)
  return () => mediaQuery.removeListener(callback)
}

function getMobilePointerSnapshot() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia(MOBILE_POINTER_QUERY).matches
}

function getServerMobilePointerSnapshot() {
  return false
}

function useShouldSkipTooltipForMobile(enableMobileTap?: boolean) {
  const isMobilePointer = useSyncExternalStore(
    subscribeMobilePointer,
    getMobilePointerSnapshot,
    getServerMobilePointerSnapshot,
  )

  return isMobilePointer && !enableMobileTap
}

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function TooltipRoot({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-[230]"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-[230] inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[slot=kbd]:**:relative data-[slot=kbd]:**:isolate data-[slot=kbd]:**:z-[230] data-[slot=kbd]:**:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-[230] size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

type LegacyTooltipProps = {
  content?: ReactNode
  children: ReactNode
  side?: "top" | "right" | "bottom" | "left"
  align?: "start" | "center" | "end"
  offset?: number
  openDelay?: number
  closeDelay?: number
  disabled?: boolean
  className?: string
  contentClassName?: string
  enableMobileTap?: boolean
}

function Tooltip({
  content,
  children,
  side = "top",
  align = "center",
  offset = 4,
  disabled = false,
  className,
  contentClassName,
  enableMobileTap = false,
}: LegacyTooltipProps) {
  const shouldSkipMobileTooltip = useShouldSkipTooltipForMobile(enableMobileTap)

  if (
    disabled ||
    shouldSkipMobileTooltip ||
    content === undefined ||
    content === null ||
    content === false ||
    content === ""
  ) {
    return <>{children}</>
  }

  return (
    <TooltipRoot>
      <TooltipTrigger
        render={<span className={cn("inline-flex align-middle", className)} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        align={align}
        side={side}
        sideOffset={offset}
        className={contentClassName}
      >
        {content}
      </TooltipContent>
    </TooltipRoot>
  )
}

export {
  Tooltip,
  TooltipRoot,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
}
