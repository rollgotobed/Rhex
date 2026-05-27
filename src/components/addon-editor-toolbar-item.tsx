"use client"

import type * as React from "react"

import { AddonClientComponentHost } from "@/addons-host/client/addon-client-component-host"
import type {
  AddonEditorTarget,
  AddonEditorToolbarApi,
  AddonEditorToolbarItemDescriptor,
} from "@/addons-host/editor-types"

export function AddonEditorToolbarItemHost({
  context,
  disabled,
  editor,
  item,
  onPointerDown,
  onMouseDown,
  selection,
  value,
}: {
  context: AddonEditorTarget
  disabled: boolean
  editor: AddonEditorToolbarApi
  item: AddonEditorToolbarItemDescriptor
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onMouseDown: (event: React.MouseEvent<HTMLElement>) => void
  selection: { start: number; end: number }
  value: string
}) {
  return (
    <div
      className="relative shrink-0"
      onMouseDownCapture={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-addon-editor-toolbar-allow-focus='true']")) {
          return
        }

        onMouseDown(event)
      }}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-addon-editor-toolbar-allow-focus='true']")) {
          return
        }

        onPointerDown(event)
      }}
    >
      <AddonClientComponentHost
        moduleUrl={item.clientModuleUrl}
        props={{
          context,
          disabled,
          editor,
          item,
          selection,
          value,
        }}
        fallback={null}
      />
    </div>
  )
}
