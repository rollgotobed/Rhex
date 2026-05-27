"use client"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Bold, Code2, Highlighter, ImageIcon, Quote, Strikethrough, Underline } from "lucide-react"

import { TOOLBAR_TIPS } from "@/components/refined-rich-post-editor/constants"
import { ToolButton } from "@/components/refined-rich-post-editor/toolbar-controls"
import type {
  EditorSelectionStore,
  SelectionToolbarPosition,
} from "@/components/refined-rich-post-editor/types"
import type { ClientPlatform } from "@/lib/client-platform"

type FloatingSelectionToolbarProps = {
  visible: boolean
  isClient: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  selectionStore: EditorSelectionStore
  platform: ClientPlatform
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  onMouseDown: (event: React.MouseEvent<HTMLButtonElement>) => void
  onBold: () => void
  onUnderline: () => void
  onStrike: () => void
  onHighlight: () => void
  onInlineCode: () => void
  onImageLink: () => void
  onQuote: () => void
}

type ViewportRect = {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

const VIEWPORT_PADDING = 16
const TOOLBAR_OFFSET = 12
const MIRROR_STYLE_KEYS = [
  "boxSizing",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "letterSpacing",
  "lineHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "tabSize",
  "textAlign",
  "textIndent",
  "textTransform",
  "whiteSpace",
  "wordSpacing",
] as const

function mapMirrorRectToViewport(
  rect: DOMRect,
  mirrorRect: DOMRect,
  textareaRect: DOMRect,
  textarea: HTMLTextAreaElement,
): ViewportRect {
  const top = textareaRect.top + (rect.top - mirrorRect.top) - textarea.scrollTop
  const left = textareaRect.left + (rect.left - mirrorRect.left) - textarea.scrollLeft
  const right = textareaRect.left + (rect.right - mirrorRect.left) - textarea.scrollLeft
  const bottom = textareaRect.top + (rect.bottom - mirrorRect.top) - textarea.scrollTop

  return {
    top,
    left,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function getTextareaSelectionRect(
  textarea: HTMLTextAreaElement,
  selectionStart: number,
  selectionEnd: number,
): ViewportRect | null {
  if (selectionEnd <= selectionStart) {
    return null
  }

  const selectedText = textarea.value.slice(selectionStart, selectionEnd)
  if (!selectedText) {
    return null
  }

  const computedStyle = window.getComputedStyle(textarea)
  const mirror = document.createElement("div")
  mirror.setAttribute("aria-hidden", "true")
  mirror.style.position = "fixed"
  mirror.style.top = "0"
  mirror.style.left = "-99999px"
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.visibility = "hidden"
  mirror.style.pointerEvents = "none"
  mirror.style.overflow = "hidden"
  mirror.style.whiteSpace = "pre-wrap"
  mirror.style.overflowWrap = "break-word"
  mirror.style.wordBreak = "break-word"

  MIRROR_STYLE_KEYS.forEach((styleKey) => {
    mirror.style[styleKey] = computedStyle[styleKey]
  })

  const beforeSelectionNode = document.createTextNode(textarea.value.slice(0, selectionStart))
  const selectionNode = document.createElement("span")
  selectionNode.textContent = selectedText
  const afterSelectionNode = document.createTextNode(textarea.value.slice(selectionEnd) || " ")

  mirror.append(beforeSelectionNode, selectionNode, afterSelectionNode)
  document.body.append(mirror)

  try {
    const mirrorRect = mirror.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()
    const selectionRects = Array.from(selectionNode.getClientRects())

    if (selectionRects.length === 0) {
      return null
    }

    const viewportRects = selectionRects.map((rect) =>
      mapMirrorRectToViewport(rect, mirrorRect, textareaRect, textarea),
    )
    const firstRect = viewportRects[0]
    const lastRect = viewportRects[viewportRects.length - 1]
    const multiline = viewportRects.length > 1
    const left = multiline
      ? firstRect.left
      : Math.min(...viewportRects.map((rect) => rect.left))
    const right = multiline
      ? firstRect.right
      : Math.max(...viewportRects.map((rect) => rect.right))

    return {
      top: firstRect.top,
      left,
      right,
      bottom: lastRect.bottom,
      width: right - left,
      height: lastRect.bottom - firstRect.top,
    }
  } finally {
    mirror.remove()
  }
}

export function FloatingSelectionToolbar({
  visible,
  isClient,
  textareaRef,
  selectionStore,
  platform,
  onPointerDown,
  onMouseDown,
  onBold,
  onUnderline,
  onStrike,
  onHighlight,
  onInlineCode,
  onImageLink,
  onQuote,
}: FloatingSelectionToolbarProps) {
  const selection = React.useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  )
  const toolbarRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const [position, setPosition] = useState<SelectionToolbarPosition | null>(null)

  const cancelScheduledPositionUpdate = useCallback(() => {
    if (frameRef.current === null) {
      return
    }

    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = null
  }, [])

  const updatePosition = useCallback(() => {
    const textarea = textareaRef.current
    if (!visible || !textarea || document.activeElement !== textarea) {
      setPosition(null)
      return
    }

    const selectionRect = getTextareaSelectionRect(textarea, selection.start, selection.end)
    if (!selectionRect) {
      setPosition(null)
      return
    }

    const textareaRect = textarea.getBoundingClientRect()
    if (selectionRect.bottom < textareaRect.top || selectionRect.top > textareaRect.bottom) {
      setPosition(null)
      return
    }

    const toolbarWidth = toolbarRef.current?.offsetWidth ?? 276
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 44
    const rawCenter = selectionRect.left + selectionRect.width / 2
    const maxLeft = Math.max(VIEWPORT_PADDING + toolbarWidth / 2, window.innerWidth - VIEWPORT_PADDING - toolbarWidth / 2)
    const left = Math.min(
      Math.max(rawCenter, VIEWPORT_PADDING + toolbarWidth / 2),
      maxLeft,
    )
    const canPlaceAbove = selectionRect.top - toolbarHeight - TOOLBAR_OFFSET > VIEWPORT_PADDING

    setPosition({
      top: canPlaceAbove ? selectionRect.top - TOOLBAR_OFFSET : selectionRect.bottom + TOOLBAR_OFFSET,
      left,
      placement: canPlaceAbove ? "above" : "below",
    })
  }, [selection.end, selection.start, textareaRef, visible])

  const schedulePositionUpdate = useCallback(() => {
    if (!isClient) {
      return
    }

    cancelScheduledPositionUpdate()
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      updatePosition()
    })
  }, [cancelScheduledPositionUpdate, isClient, updatePosition])

  useEffect(() => {
    if (!isClient || !visible) {
      cancelScheduledPositionUpdate()
      return
    }

    schedulePositionUpdate()

    return cancelScheduledPositionUpdate
  }, [cancelScheduledPositionUpdate, isClient, schedulePositionUpdate, visible])

  useEffect(() => {
    if (!isClient || !visible) {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    const handleReposition = () => {
      schedulePositionUpdate()
    }

    textarea.addEventListener("scroll", handleReposition, { passive: true })
    textarea.addEventListener("focus", handleReposition)
    textarea.addEventListener("blur", handleReposition)
    window.addEventListener("resize", handleReposition)
    window.addEventListener("scroll", handleReposition, true)

    return () => {
      cancelScheduledPositionUpdate()
      textarea.removeEventListener("scroll", handleReposition)
      textarea.removeEventListener("focus", handleReposition)
      textarea.removeEventListener("blur", handleReposition)
      window.removeEventListener("resize", handleReposition)
      window.removeEventListener("scroll", handleReposition, true)
    }
  }, [cancelScheduledPositionUpdate, isClient, schedulePositionUpdate, textareaRef, visible])

  if (!isClient || !visible || !position) {
    return null
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-[140] flex items-center gap-0.5 rounded-[18px] border border-slate-200/80 bg-background/96 p-1 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-slate-700/80"
      style={{
        top: position.top,
        left: position.left,
        transform: position.placement === "above"
          ? "translate(-50%, -100%)"
          : "translate(-50%, 0)",
      }}
    >
      <ToolButton tip={TOOLBAR_TIPS.bold} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onBold}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.underline} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onUnderline}>
        <Underline className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.strike} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onStrike}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.highlight} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onHighlight}>
        <Highlighter className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.code} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onInlineCode}>
        <Code2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.imageFromSelection} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onImageLink}>
        <ImageIcon className="h-4 w-4" />
      </ToolButton>
      <ToolButton tip={TOOLBAR_TIPS.quote} platform={platform} onPointerDown={onPointerDown} onMouseDown={onMouseDown} onClick={onQuote}>
        <Quote className="h-4 w-4" />
      </ToolButton>
    </div>,
    document.body,
  )
}
