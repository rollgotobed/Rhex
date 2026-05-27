"use client"

import React from "react"
import { Bold, CircleHelp, EyeOff, Highlighter, ImageIcon, Link2, Lock, Maximize2, Minimize2, Quote, SeparatorHorizontal, Smile, Strikethrough, Table2, Underline, Video, X } from "lucide-react"

import { AddonEditorToolbarItemHost } from "@/components/addon-editor-toolbar-item"
import { EDITOR_LINE_HEIGHT_REM, EDITOR_LINE_NUMBER_GUTTER_WIDTH_CLASS, TOOLBAR_TIPS } from "@/components/refined-rich-post-editor/constants"
import { AlignmentSelect, CodeFormatSelect, HeadingSelect, ListSelect, ToolButton } from "@/components/refined-rich-post-editor/toolbar-controls"
import type {
  EditorSelectionRange,
  EditorSelectionStore,
  ToolbarTipDefinition,
  PrivateReplyRecipient,
} from "@/components/refined-rich-post-editor/types"
import { MarkdownContentClient as MarkdownContent } from "@/components/markdown-content-client"
import type {
  AddonEditorTarget,
  AddonEditorToolbarApi,
  AddonEditorToolbarItemDescriptor,
} from "@/addons-host/editor-types"
import type { ClientPlatform } from "@/lib/client-platform"
import type { MarkdownEmojiItem } from "@/lib/markdown-emoji"
import { cn } from "@/lib/utils"

type EditorHeaderProps = {
  activeTab: "write" | "live-preview" | "preview"
  disabled: boolean
  isFullscreen: boolean
  uploading: boolean
  valueLength: number
  onTabChange: (tab: "write" | "live-preview" | "preview") => void
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
}

export function EditorHeader({
  activeTab,
  disabled,
  isFullscreen,
  uploading,
  valueLength,
  onTabChange,
  onEnterFullscreen,
  onExitFullscreen,
}: EditorHeaderProps) {
  return (
    <>
      {isFullscreen ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-3 py-3 backdrop-blur-sm sm:px-5">
          <div>
            <p className="text-sm font-medium text-foreground">全屏编辑器</p>
            <p className="text-xs text-muted-foreground">可按 Esc 快速退出全屏</p>
          </div>
          <button
            type="button"
            onClick={onExitFullscreen}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Minimize2 className="h-4 w-4" />
            退出全屏
          </button>
        </div>
      ) : null}
      <div className="border-b border-border px-3 sm:px-5">
        <div className="flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2 sm:flex-nowrap sm:py-0">
          <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => onTabChange("write")}
              className={activeTab === "write" ? "border-b-2 border-foreground pb-2 text-sm font-medium text-foreground transition-colors" : "pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"}
            >
              正文
            </button>
            <button
              type="button"
              onClick={() => onTabChange("live-preview")}
              className={activeTab === "live-preview" ? "border-b-2 border-foreground pb-2 text-sm font-medium text-foreground transition-colors" : "pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"}
            >
              实时预览
            </button>
            <button
              type="button"
              onClick={() => onTabChange("preview")}
              className={activeTab === "preview" ? "border-b-2 border-foreground pb-2 text-sm font-medium text-foreground transition-colors" : "pb-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"}
            >
              预览
            </button>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <p className="hidden text-xs text-muted-foreground sm:block">{valueLength} 字符{uploading ? " · 上传中" : ""}</p>
            {!disabled && !isFullscreen ? (
              <button
                type="button"
                onClick={onEnterFullscreen}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="进入全屏"
                title="进入全屏"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  )
}

type EditorBodyProps = {
  activeTab: "write" | "live-preview" | "preview"
  isFullscreen: boolean
  contentMinHeight: number | string
  value: string
  placeholder?: string
  disabled: boolean
  markdownEmojiMap: MarkdownEmojiItem[]
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  lineMeasureContainerRef: React.RefObject<HTMLDivElement | null>
  lineMeasureRefs: React.MutableRefObject<Array<HTMLDivElement | null>>
  logicalLines: string[]
  lineNumbers: number[]
  lineHeights: number[]
  activeLineNumber: number
  editorScrollTop: number
  onChange: (value: string, selection?: EditorSelectionRange) => void
  onEditorScrollSync: (scrollTop: number) => void
  onScroll: (event: React.UIEvent<HTMLTextAreaElement>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => void
  onPaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => Promise<void>
}

export function EditorBody({
  activeTab,
  isFullscreen,
  contentMinHeight,
  value,
  placeholder,
  disabled,
  markdownEmojiMap,
  textareaRef,
  lineMeasureContainerRef,
  lineMeasureRefs,
  logicalLines,
  lineNumbers,
  lineHeights,
  activeLineNumber,
  editorScrollTop,
  onChange,
  onEditorScrollSync,
  onScroll,
  onKeyDown,
  onSelect,
  onPaste,
}: EditorBodyProps) {
  const isLivePreview = activeTab === "live-preview"
  const previewPanelRef = React.useRef<HTMLDivElement | null>(null)
  const scrollSyncSourceRef = React.useRef<"editor" | "preview" | null>(null)
  const writeContainerClassName = isFullscreen
    ? "relative flex min-h-0 flex-1 overflow-hidden rounded-xl bg-transparent"
    : "relative flex overflow-hidden rounded-xl bg-transparent"
  const writeContainerStyle = isFullscreen
    ? { minHeight: 0, height: "100%" }
    : { minHeight: contentMinHeight, maxHeight: contentMinHeight }
  const textareaStyle = isFullscreen
    ? { minHeight: 0, height: "100%", maxHeight: "none" as const }
    : { minHeight: contentMinHeight, maxHeight: contentMinHeight }
  const previewStyle = isFullscreen
    ? { minHeight: 0, height: "100%" }
    : { minHeight: contentMinHeight, maxHeight: contentMinHeight }

  const writePanel = (
    <div
      key="write-panel"
      className={writeContainerClassName}
      style={writeContainerStyle}
    >
      <div
        aria-hidden="true"
        className={cn(
          "hidden flex-none select-none overflow-hidden pr-1 pt-1 text-right font-mono text-[10px] text-muted-foreground/45 sm:block",
          EDITOR_LINE_NUMBER_GUTTER_WIDTH_CLASS,
        )}
      >
        <div style={{ transform: `translateY(-${editorScrollTop}px)` }}>
          {lineNumbers.map((lineNumber) => (
            <div
              key={lineNumber}
              className={lineNumber === activeLineNumber ? "leading-7 text-foreground/85" : "leading-7 text-muted-foreground/45"}
              style={{ height: lineHeights[lineNumber - 1] ?? `${EDITOR_LINE_HEIGHT_REM}rem` }}
            >
              {lineNumber}
            </div>
          ))}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => {
          onChange(event.target.value, {
            start: event.currentTarget.selectionStart,
            end: event.currentTarget.selectionEnd,
          })
        }}
        onScroll={(event) => {
          if (scrollSyncSourceRef.current === "preview") {
            return
          }

          onScroll(event)
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onSelect}
        onClick={onSelect}
        onSelect={onSelect}
        onPaste={onPaste}
        disabled={disabled}
        className="w-full resize-none overflow-y-auto rounded-none border-0 bg-transparent pl-2 pr-0 py-1 font-mono text-sm leading-7 outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={placeholder}
        style={textareaStyle}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 -z-10 overflow-hidden opacity-0"
      >
        <div
          ref={lineMeasureContainerRef}
          className="box-border whitespace-pre-wrap wrap-break-word"
        >
          {logicalLines.map((line, index) => (
            <div
              key={`line-measure-${index}`}
              ref={(node) => {
                lineMeasureRefs.current[index] = node
              }}
              style={{ minHeight: `${EDITOR_LINE_HEIGHT_REM}rem` }}
            >
              {line.length > 0 ? line : " "}
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const previewPanel = (
    <div
      ref={previewPanelRef}
      key="preview-panel"
      className="min-h-0 min-w-0 overflow-y-auto"
      style={previewStyle}
      onScroll={(event) => {
        if (!isLivePreview || scrollSyncSourceRef.current === "editor") {
          return
        }

        const textarea = textareaRef.current
        const previewPanelElement = event.currentTarget
        if (!textarea) {
          return
        }

        const previewScrollableHeight = previewPanelElement.scrollHeight - previewPanelElement.clientHeight
        const editorScrollableHeight = textarea.scrollHeight - textarea.clientHeight
        if (previewScrollableHeight <= 0 || editorScrollableHeight <= 0) {
          textarea.scrollTop = 0
          onEditorScrollSync(0)
          return
        }

        const scrollRatio = previewPanelElement.scrollTop / previewScrollableHeight
        const nextEditorScrollTop = editorScrollableHeight * scrollRatio

        scrollSyncSourceRef.current = "preview"
        textarea.scrollTop = nextEditorScrollTop
        onEditorScrollSync(nextEditorScrollTop)

        window.requestAnimationFrame(() => {
          if (scrollSyncSourceRef.current === "preview") {
            scrollSyncSourceRef.current = null
          }
        })
      }}
    >
      <MarkdownContent content={value} emptyText="暂无预览内容" markdownEmojiMap={markdownEmojiMap} />
    </div>
  )

  React.useEffect(() => {
    if (!isLivePreview) {
      return
    }

    const textarea = textareaRef.current
    const previewPanelElement = previewPanelRef.current
    if (!textarea || !previewPanelElement) {
      return
    }

    const editorScrollableHeight = textarea.scrollHeight - textarea.clientHeight
    const previewScrollableHeight = previewPanelElement.scrollHeight - previewPanelElement.clientHeight
    if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) {
      previewPanelElement.scrollTop = 0
      return
    }

    const scrollRatio = textarea.scrollTop / editorScrollableHeight
    scrollSyncSourceRef.current = "editor"
    previewPanelElement.scrollTop = previewScrollableHeight * scrollRatio

    window.requestAnimationFrame(() => {
      if (scrollSyncSourceRef.current === "editor") {
        scrollSyncSourceRef.current = null
      }
    })
  }, [editorScrollTop, isLivePreview, textareaRef, value])

  return (
    <div
      className={activeTab === "live-preview"
        ? (isFullscreen ? "grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden px-3 pb-4 pt-3 sm:px-5 sm:pb-8 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] xl:gap-0" : "grid grid-cols-1 gap-4 px-3 pb-4 pt-3 sm:px-5 xl:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] xl:gap-0")
        : activeTab === "write"
          ? (isFullscreen ? "flex min-h-0 flex-1 flex-col px-3 pt-3 sm:px-5" : "pl-1 pr-3 pt-3 sm:pl-1 sm:pr-5")
          : (isFullscreen ? "flex min-h-0 flex-1 flex-col px-3 pb-4 pt-3 sm:px-5 sm:pb-8" : "px-3 pb-4 pt-3 sm:px-5")}
    >
      {isLivePreview ? (
        <>
          <div className={cn("min-w-0 xl:pr-5", isFullscreen && "min-h-0 overflow-hidden")}>
            {writePanel}
          </div>
          <div className={cn("hidden bg-border xl:block", isFullscreen && "min-h-0")} aria-hidden="true" />
          <div className={cn("min-w-0 border-t border-border pt-4 xl:border-t-0 xl:pl-5 xl:pt-0", isFullscreen && "min-h-0 overflow-hidden")}>
            {previewPanel}
          </div>
        </>
      ) : activeTab === "write" ? writePanel : previewPanel}
    </div>
  )
}

type EditorToolbarProps = {
  context: AddonEditorTarget
  visible: boolean
  disabled: boolean
  toolbarItems: AddonEditorToolbarItemDescriptor[]
  toolbarApi: AddonEditorToolbarApi
  selectionStore: EditorSelectionStore
  value: string
  isFullscreen: boolean
  platform: ClientPlatform
  imageToolbarTip: ToolbarTipDefinition
  markdownImageUploadEnabled: boolean
  uploading: boolean
  showMediaPanel: boolean
  showEmojiPanel: boolean
  showTablePanel: boolean
  showLinkPanel: boolean
  showImagePanel: boolean
  showSpoilerPanel: boolean
  showBase64Dialog: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  mediaButtonRef: React.RefObject<HTMLDivElement | null>
  emojiButtonRef: React.RefObject<HTMLDivElement | null>
  tableButtonRef: React.RefObject<HTMLDivElement | null>
  linkButtonRef: React.RefObject<HTMLDivElement | null>
  imageButtonRef: React.RefObject<HTMLDivElement | null>
  spoilerButtonRef: React.RefObject<HTMLDivElement | null>
  onToolbarPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onToolbarMouseDown: (event: React.MouseEvent<HTMLElement>) => void
  onToolbarSelectMouseDown: () => void
  onToolbarSelectOpenChange: (open: boolean) => void
  onSetHeadingLevel: (level: 1 | 2 | 3) => void
  onBold: () => void
  onUnderline: () => void
  onStrike: () => void
  onHighlight: () => void
  onCodeFormat: (value: "inline-code" | "code-block") => void
  onQuote: () => void
  onListFormat: (value: "unordered" | "unordered-star" | "ordered" | "task") => void
  onToggleLinkPanel: () => void
  onToggleTablePanel: () => void
  onToggleSpoilerPanel: () => void
  onInsertDivider: () => void
  onAlign: (value: "left" | "center" | "right") => void
  onToggleMediaPanel: () => void
  onToggleEmojiPanel: () => void
  onTriggerImageShortcut: () => void
  onOpenBase64Dialog: () => void
  onOpenHelpDialog: () => void
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>
  privateReplyRecipient?: PrivateReplyRecipient | null
}

export function EditorToolbar({
  context,
  visible,
  disabled,
  toolbarItems,
  toolbarApi,
  selectionStore,
  value,
  isFullscreen,
  platform,
  imageToolbarTip,
  markdownImageUploadEnabled,
  uploading,
  showMediaPanel,
  showEmojiPanel,
  showTablePanel,
  showLinkPanel,
  showImagePanel,
  showSpoilerPanel,
  showBase64Dialog,
  fileInputRef,
  mediaButtonRef,
  emojiButtonRef,
  tableButtonRef,
  linkButtonRef,
  imageButtonRef,
  spoilerButtonRef,
  onToolbarPointerDown,
  onToolbarMouseDown,
  onToolbarSelectMouseDown,
  onToolbarSelectOpenChange,
  onSetHeadingLevel,
  onBold,
  onUnderline,
  onStrike,
  onHighlight,
  onCodeFormat,
  onQuote,
  onListFormat,
  onToggleLinkPanel,
  onToggleTablePanel,
  onToggleSpoilerPanel,
  onInsertDivider,
  onAlign,
  onToggleMediaPanel,
  onToggleEmojiPanel,
  onTriggerImageShortcut,
  onOpenBase64Dialog,
  onOpenHelpDialog,
  onUpload,
  privateReplyRecipient,
}: EditorToolbarProps) {
  const selection = React.useSyncExternalStore(
    selectionStore.subscribe,
    selectionStore.getSnapshot,
    selectionStore.getSnapshot,
  )

  if (!visible) {
    return null
  }

  return (
    <div className={`relative flex min-w-0 max-w-full flex-col gap-3 border-t border-border ${isFullscreen ? "" : "mt-2 pt-2"} sm:flex-row sm:items-center sm:justify-between`}>
      <div className="-mx-1 flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-auto sm:px-0 sm:pb-0">
        <HeadingSelect
          disabled={disabled}
          platform={platform}
          onMouseDown={onToolbarSelectMouseDown}
          onOpenChange={onToolbarSelectOpenChange}
          onSelect={onSetHeadingLevel}
        />
        <ToolButton tip={TOOLBAR_TIPS.bold} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onBold} disabled={disabled}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton tip={TOOLBAR_TIPS.underline} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onUnderline} disabled={disabled}>
          <Underline className="h-4 w-4" />
        </ToolButton>
        <ToolButton tip={TOOLBAR_TIPS.strike} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onStrike} disabled={disabled}>
          <Strikethrough className="h-4 w-4" />
        </ToolButton>
        <ToolButton tip={TOOLBAR_TIPS.highlight} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onHighlight} disabled={disabled}>
          <Highlighter className="h-4 w-4" />
        </ToolButton>
        <CodeFormatSelect
          disabled={disabled}
          platform={platform}
          onMouseDown={onToolbarSelectMouseDown}
          onOpenChange={onToolbarSelectOpenChange}
          onSelect={onCodeFormat}
        />
        <ToolButton tip={TOOLBAR_TIPS.quote} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onQuote} disabled={disabled}>
          <Quote className="h-4 w-4" />
        </ToolButton>
        <div className="relative" ref={spoilerButtonRef}>
          <ToolButton tip={TOOLBAR_TIPS.spoiler} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onToggleSpoilerPanel} disabled={disabled} active={showSpoilerPanel}>
            <EyeOff className="h-4 w-4" />
          </ToolButton>
        </div>
        <ListSelect
          disabled={disabled}
          platform={platform}
          onMouseDown={onToolbarSelectMouseDown}
          onOpenChange={onToolbarSelectOpenChange}
          onSelect={onListFormat}
        />
        <div className="relative" ref={linkButtonRef}>
          <ToolButton tip={TOOLBAR_TIPS.link} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onToggleLinkPanel} disabled={disabled} active={showLinkPanel}>
            <Link2 className="h-4 w-4" />
          </ToolButton>
        </div>
        <div className="relative" ref={tableButtonRef}>
          <ToolButton tip={TOOLBAR_TIPS.table} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onToggleTablePanel} disabled={disabled} active={showTablePanel}>
            <Table2 className="h-4 w-4" />
          </ToolButton>
        </div>
        <ToolButton tip={TOOLBAR_TIPS.divider} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onInsertDivider} disabled={disabled}>
          <SeparatorHorizontal className="h-4 w-4" />
        </ToolButton>
        <AlignmentSelect
          disabled={disabled}
          platform={platform}
          onMouseDown={onToolbarSelectMouseDown}
          onOpenChange={onToolbarSelectOpenChange}
          onSelect={onAlign}
        />
        <div className="relative" ref={mediaButtonRef}>
          <ToolButton tip={TOOLBAR_TIPS.media} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onToggleMediaPanel} disabled={disabled} active={showMediaPanel}>
            <Video className="h-4 w-4" />
          </ToolButton>
        </div>
        <div className="relative" ref={emojiButtonRef}>
          <ToolButton tip={TOOLBAR_TIPS.emoji} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onToggleEmojiPanel} disabled={disabled} active={showEmojiPanel}>
            <Smile className="h-4 w-4" />
          </ToolButton>
        </div>
        <div className="relative" ref={imageButtonRef}>
          <ToolButton
            tip={imageToolbarTip}
            platform={platform}
            onPointerDown={onToolbarPointerDown}
            onMouseDown={onToolbarMouseDown}
            onClick={onTriggerImageShortcut}
            disabled={disabled || (markdownImageUploadEnabled && uploading)}
            active={showImagePanel}
          >
            <ImageIcon className="h-4 w-4" />
          </ToolButton>
          <input ref={fileInputRef} accept="image/*" multiple className="hidden" type="file" onChange={onUpload} disabled={disabled || !markdownImageUploadEnabled || uploading} />
        </div>
        <ToolButton tip={TOOLBAR_TIPS.base64} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onOpenBase64Dialog} disabled={disabled} active={showBase64Dialog || Boolean(privateReplyRecipient)}>
          <Lock className="h-4 w-4" />
        </ToolButton>
        <ToolButton tip={TOOLBAR_TIPS.help} platform={platform} onPointerDown={onToolbarPointerDown} onMouseDown={onToolbarMouseDown} onClick={onOpenHelpDialog} disabled={disabled}>
          <CircleHelp className="h-4 w-4" />
        </ToolButton>
        {toolbarItems.map((item) => (
          <AddonEditorToolbarItemHost
            key={`${item.addonId}:${item.providerCode}:${item.key}`}
            context={context}
            disabled={disabled}
            editor={toolbarApi}
            item={item}
            onPointerDown={onToolbarPointerDown}
            onMouseDown={onToolbarMouseDown}
            selection={selection}
            value={value}
          />
        ))}
      </div>
    </div>
  )
}

export function PrivateReplyDraftBanner({
  recipient,
  onClear,
}: {
  recipient?: PrivateReplyRecipient | null
  onClear?: () => void
}) {
  if (!recipient) {
    return null
  }

  return (
    <div className="px-3 pt-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
        <Lock className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          私密回复给 <strong>{recipient.displayName}</strong>
        </span>
        {onClear ? (
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onClick={onClear}
            aria-label="取消私密回复"
            title="取消私密回复"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
