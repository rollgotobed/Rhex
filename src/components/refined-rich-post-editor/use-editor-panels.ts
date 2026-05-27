"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { Dispatch, MutableRefObject, SetStateAction } from "react"

import { useFloatingPanel } from "@/components/refined-rich-post-editor/floating-panels"
import type { EditorSelectionRange, FloatingPanelPosition, PrivateReplyRecipient, UploadSummary } from "@/components/refined-rich-post-editor/types"
import { encodeBase64, inferMediaInsert, inferRemoteImageInsert, normalizeRemoteUrl } from "@/components/refined-rich-post-editor/utils"
import type { UploadFileResult } from "@/hooks/use-image-upload"

type UseEditorPanelsOptions = {
  value: string
  markdownImageUploadEnabled: boolean
  selectionRef: MutableRefObject<EditorSelectionRange>
  uploadResults: UploadFileResult[]
  clearUploadResults: () => void
}

type FloatingPanelKey = "media" | "emoji" | "table" | "link" | "image" | "spoiler"

type OpenPanelsState = {
  media: boolean
  emoji: boolean
  table: boolean
  link: boolean
  image: boolean
  spoiler: boolean
  help: boolean
  base64: boolean
}

type PanelDraftState = {
  mediaUrl: string
  remoteImageUrl: string
  remoteImageAlt: string
  linkText: string
  linkUrl: string
  base64Text: string
  privateReplyText: string
  privateReplyRecipient: PrivateReplyRecipient | null
  encryptionMode: "base64" | "private"
}

const CLOSED_FLOATING_PANELS = {
  media: false,
  emoji: false,
  table: false,
  link: false,
  image: false,
  spoiler: false,
}

const DEFAULT_OPEN_PANELS: OpenPanelsState = {
  ...CLOSED_FLOATING_PANELS,
  help: false,
  base64: false,
}

const DEFAULT_PANEL_DRAFT: PanelDraftState = {
  mediaUrl: "",
  remoteImageUrl: "",
  remoteImageAlt: "",
  linkText: "",
  linkUrl: "",
  base64Text: "",
  privateReplyText: "",
  privateReplyRecipient: null,
  encryptionMode: "base64",
}

export function useEditorPanels({
  value,
  markdownImageUploadEnabled,
  selectionRef,
  uploadResults,
  clearUploadResults,
}: UseEditorPanelsOptions) {
  const [openPanels, setOpenPanels] = useState<OpenPanelsState>(DEFAULT_OPEN_PANELS)
  const [panelDraft, setPanelDraft] = useState<PanelDraftState>(DEFAULT_PANEL_DRAFT)
  const [message, setMessage] = useState("")

  const [mediaPanelPosition, setMediaPanelPosition, mediaPanelReady, setMediaPanelReady, mediaPanelRef] = useFloatingPanel()
  const [emojiPanelPosition, setEmojiPanelPosition, emojiPanelReady, setEmojiPanelReady, emojiPanelRef] = useFloatingPanel()
  const [tablePanelPosition, setTablePanelPosition, tablePanelReady, setTablePanelReady, tablePanelRef] = useFloatingPanel()
  const [linkPanelPosition, setLinkPanelPosition, linkPanelReady, setLinkPanelReady, linkPanelRef] = useFloatingPanel()
  const [imagePanelPosition, setImagePanelPosition, imagePanelReady, setImagePanelReady, imagePanelRef] = useFloatingPanel()
  const [spoilerPanelPosition, setSpoilerPanelPosition, spoilerPanelReady, setSpoilerPanelReady, spoilerPanelRef] = useFloatingPanel()

  const mediaButtonRef = useRef<HTMLDivElement | null>(null)
  const emojiButtonRef = useRef<HTMLDivElement | null>(null)
  const tableButtonRef = useRef<HTMLDivElement | null>(null)
  const linkButtonRef = useRef<HTMLDivElement | null>(null)
  const imageButtonRef = useRef<HTMLDivElement | null>(null)
  const spoilerButtonRef = useRef<HTMLDivElement | null>(null)

  const setPanelDraftValue = useCallback(<Key extends keyof PanelDraftState>(key: Key, nextValue: PanelDraftState[Key]) => {
    setPanelDraft((current) => (
      current[key] === nextValue
        ? current
        : {
            ...current,
            [key]: nextValue,
          }
    ))
  }, [])

  const closeTransientPanels = useCallback(() => {
    setOpenPanels((current) => (
      current.media || current.emoji || current.table || current.link || current.image || current.spoiler
        ? {
            ...current,
            ...CLOSED_FLOATING_PANELS,
          }
        : current
    ))
  }, [])

  const closeMediaPanel = useCallback(() => {
    setOpenPanels((current) => ({ ...current, media: false }))
    setPanelDraft((current) => (
      current.mediaUrl
        ? {
            ...current,
            mediaUrl: "",
          }
        : current
    ))
  }, [])

  const closeLinkPanel = useCallback(() => {
    setOpenPanels((current) => ({ ...current, link: false }))
    setPanelDraft((current) => (
      current.linkText || current.linkUrl
        ? {
            ...current,
            linkText: "",
            linkUrl: "",
          }
        : current
    ))
  }, [])

  const closeTablePanel = useCallback(() => {
    setOpenPanels((current) => ({ ...current, table: false }))
  }, [])

  const closeImagePanel = useCallback(() => {
    setOpenPanels((current) => ({ ...current, image: false }))
    setPanelDraft((current) => (
      current.remoteImageUrl || current.remoteImageAlt
        ? {
            ...current,
            remoteImageUrl: "",
            remoteImageAlt: "",
          }
        : current
    ))
  }, [])

  const closeSpoilerPanel = useCallback(() => {
    setOpenPanels((current) => ({ ...current, spoiler: false }))
  }, [])

  const toggleFloatingPanel = useCallback((key: FloatingPanelKey, nextOpen: boolean) => {
    setOpenPanels((current) => ({
      ...current,
      ...CLOSED_FLOATING_PANELS,
      [key]: nextOpen,
    }))
  }, [])

  const toggleMediaPanel = useCallback(() => {
    toggleFloatingPanel("media", !openPanels.media)
  }, [openPanels.media, toggleFloatingPanel])

  const toggleEmojiPanel = useCallback(() => {
    toggleFloatingPanel("emoji", !openPanels.emoji)
  }, [openPanels.emoji, toggleFloatingPanel])

  const toggleTablePanel = useCallback(() => {
    toggleFloatingPanel("table", !openPanels.table)
  }, [openPanels.table, toggleFloatingPanel])

  const toggleLinkPanel = useCallback(() => {
    const nextOpen = !openPanels.link
    if (nextOpen) {
      const { start, end } = selectionRef.current
      const selectedText = value.slice(start, end).trim()

      setPanelDraft((current) => ({
        ...current,
        linkText: selectedText && !/^https?:\/\//i.test(selectedText) ? selectedText : "",
        linkUrl: /^https?:\/\//i.test(selectedText) ? selectedText : "",
      }))
    }

    toggleFloatingPanel("link", nextOpen)
  }, [openPanels.link, selectionRef, toggleFloatingPanel, value])

  const toggleImagePanel = useCallback(() => {
    const nextOpen = !openPanels.image

    if (nextOpen && !markdownImageUploadEnabled) {
      const { start, end } = selectionRef.current
      const selectedText = value.slice(start, end).trim()
      const selectedUrl = normalizeRemoteUrl(selectedText)

      setPanelDraft((current) => ({
        ...current,
        remoteImageUrl: selectedUrl ? selectedText : "",
        remoteImageAlt: selectedUrl ? "" : selectedText,
      }))
    }

    toggleFloatingPanel("image", nextOpen)
  }, [markdownImageUploadEnabled, openPanels.image, selectionRef, toggleFloatingPanel, value])

  const toggleSpoilerPanel = useCallback(() => {
    toggleFloatingPanel("spoiler", !openPanels.spoiler)
  }, [openPanels.spoiler, toggleFloatingPanel])

  const openBase64Dialog = useCallback(() => {
    closeTransientPanels()
    const { start, end } = selectionRef.current
    setMessage("")
    setPanelDraft((current) => ({
      ...current,
      base64Text: value.slice(start, end),
      privateReplyText: value.slice(start, end),
      encryptionMode: "base64",
    }))
    setOpenPanels((current) => ({ ...current, base64: true }))
  }, [closeTransientPanels, selectionRef, value])

  const closeBase64Dialog = useCallback(() => {
    setOpenPanels((current) => ({ ...current, base64: false }))
    setPanelDraft((current) => (
      current.base64Text || current.privateReplyText || current.privateReplyRecipient
        ? {
            ...current,
            base64Text: "",
            privateReplyText: "",
            privateReplyRecipient: null,
            encryptionMode: "base64",
          }
        : current
    ))
  }, [])

  const dismissBase64Dialog = useCallback(() => {
    setMessage("")
    closeBase64Dialog()
  }, [closeBase64Dialog])

  const openHelpDialog = useCallback(() => {
    setOpenPanels((current) => ({ ...current, help: true }))
  }, [])

  const closeHelpDialog = useCallback(() => {
    setOpenPanels((current) => ({ ...current, help: false }))
  }, [])

  const uploadSummary = useMemo<UploadSummary>(() => {
    const totalCount = uploadResults.length
    const queuedCount = uploadResults.filter((item) => item.status === "queued").length
    const activeCount = uploadResults.filter((item) => item.status === "uploading").length
    const successCount = uploadResults.filter((item) => item.status === "success").length
    const errorCount = uploadResults.filter((item) => item.status === "error").length
    const completedCount = successCount + errorCount

    return {
      totalCount,
      queuedCount,
      activeCount,
      successCount,
      errorCount,
      completedCount,
    }
  }, [uploadResults])

  const mediaHint = useMemo(() => {
    if (!panelDraft.mediaUrl.trim()) {
      return "粘贴视频或音频地址，将插入可解析媒体标记。"
    }

    return inferMediaInsert(panelDraft.mediaUrl)?.message ?? "请输入有效的媒体地址"
  }, [panelDraft.mediaUrl])

  const linkHint = useMemo(() => {
    if (!panelDraft.linkUrl.trim()) {
      return ""
    }

    return /^https?:\/\//i.test(panelDraft.linkUrl.trim()) ? "" : "建议输入完整链接，例如 https://example.com"
  }, [panelDraft.linkUrl])

  const remoteImageHint = useMemo(() => {
    if (!panelDraft.remoteImageUrl.trim()) {
      return "填写可公开访问的图片地址，编辑器会插入标准 Markdown 图片语法。"
    }

    return inferRemoteImageInsert(panelDraft.remoteImageUrl, panelDraft.remoteImageAlt)
      ? "将以远程图片地址插入到当前光标位置。"
      : "请输入有效的 HTTP/HTTPS 图片地址"
  }, [panelDraft.remoteImageAlt, panelDraft.remoteImageUrl])

  const base64Preview = useMemo(() => (
    panelDraft.base64Text ? encodeBase64(panelDraft.base64Text) : ""
  ), [panelDraft.base64Text])

  const updateFloatingPanelPosition = useCallback((anchor: HTMLDivElement | null, panel: HTMLDivElement | null, width: number): FloatingPanelPosition | null => {
    if (!anchor) {
      return null
    }

    const rect = anchor.getBoundingClientRect()
    const viewportPadding = 12
    const gap = 12
    const maxWidth = Math.min(width, window.innerWidth - viewportPadding * 2)
    const maxLeft = Math.max(viewportPadding, window.innerWidth - maxWidth - viewportPadding)
    const left = Math.min(Math.max(rect.left, viewportPadding), maxLeft)
    const availableAbove = Math.max(120, rect.top - viewportPadding - gap)
    const availableBelow = Math.max(120, window.innerHeight - rect.bottom - viewportPadding - gap)
    const measuredPanelHeight = panel?.offsetHeight ?? 0
    const preferTop = availableAbove > availableBelow && measuredPanelHeight <= availableAbove
    const placeAbove = preferTop || (availableAbove > availableBelow && availableBelow < 180)
    const maxHeight = Math.max(120, Math.min(placeAbove ? availableAbove : availableBelow, window.innerHeight - viewportPadding * 2))
    const panelHeight = Math.min(measuredPanelHeight || maxHeight, maxHeight)
    const rawTop = placeAbove ? rect.top - gap - panelHeight : rect.bottom + gap
    const top = Math.min(Math.max(rawTop, viewportPadding), window.innerHeight - panelHeight - viewportPadding)

    return {
      left,
      width: maxWidth,
      top,
      maxHeight,
    }
  }, [])

  const syncFloatingPanel = useCallback((
    show: boolean,
    anchor: HTMLDivElement | null,
    width: number,
    panelRef: MutableRefObject<HTMLDivElement | null>,
    setPanelPosition: Dispatch<SetStateAction<FloatingPanelPosition | null>>,
    setPanelReady: Dispatch<SetStateAction<boolean>>,
  ) => {
    if (!show) {
      setPanelPosition(null)
      setPanelReady(false)
      return
    }

    const nextPosition = updateFloatingPanelPosition(anchor, panelRef.current, width)
    setPanelPosition(nextPosition)
    setPanelReady(Boolean(nextPosition && panelRef.current?.offsetHeight))
  }, [updateFloatingPanelPosition])

  const syncFloatingPanels = useCallback(() => {
    syncFloatingPanel(openPanels.media, mediaButtonRef.current, 320, mediaPanelRef, setMediaPanelPosition, setMediaPanelReady)
    syncFloatingPanel(openPanels.emoji, emojiButtonRef.current, 440, emojiPanelRef, setEmojiPanelPosition, setEmojiPanelReady)
    syncFloatingPanel(openPanels.table, tableButtonRef.current, 292, tablePanelRef, setTablePanelPosition, setTablePanelReady)
    syncFloatingPanel(openPanels.link, linkButtonRef.current, 320, linkPanelRef, setLinkPanelPosition, setLinkPanelReady)
    syncFloatingPanel(openPanels.image, imageButtonRef.current, 320, imagePanelRef, setImagePanelPosition, setImagePanelReady)
    syncFloatingPanel(openPanels.spoiler, spoilerButtonRef.current, 300, spoilerPanelRef, setSpoilerPanelPosition, setSpoilerPanelReady)
  }, [
    emojiPanelRef,
    imagePanelRef,
    linkPanelRef,
    mediaPanelRef,
    openPanels.emoji,
    openPanels.image,
    openPanels.link,
    openPanels.media,
    openPanels.spoiler,
    openPanels.table,
    setEmojiPanelPosition,
    setEmojiPanelReady,
    setImagePanelPosition,
    setImagePanelReady,
    setLinkPanelPosition,
    setLinkPanelReady,
    setMediaPanelPosition,
    setMediaPanelReady,
    setSpoilerPanelPosition,
    setSpoilerPanelReady,
    setTablePanelPosition,
    setTablePanelReady,
    syncFloatingPanel,
    spoilerPanelRef,
    tablePanelRef,
  ])

  useLayoutEffect(() => {
    if (!openPanels.media && !openPanels.emoji && !openPanels.table && !openPanels.link && !openPanels.image && !openPanels.spoiler) {
      return
    }

    syncFloatingPanels()
    const frameId = window.requestAnimationFrame(() => {
      syncFloatingPanels()
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [openPanels.emoji, openPanels.image, openPanels.link, openPanels.media, openPanels.spoiler, openPanels.table, syncFloatingPanels])

  useEffect(() => {
    if (!openPanels.media && !openPanels.emoji && !openPanels.table && !openPanels.link && !openPanels.image && !openPanels.spoiler) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node

      if (openPanels.media && !mediaButtonRef.current?.contains(target) && !mediaPanelRef.current?.contains(target)) {
        closeMediaPanel()
      }

      if (openPanels.emoji && !emojiButtonRef.current?.contains(target) && !emojiPanelRef.current?.contains(target)) {
        setOpenPanels((current) => ({ ...current, emoji: false }))
      }

      if (openPanels.table && !tableButtonRef.current?.contains(target) && !tablePanelRef.current?.contains(target)) {
        closeTablePanel()
      }

      if (openPanels.link && !linkButtonRef.current?.contains(target) && !linkPanelRef.current?.contains(target)) {
        closeLinkPanel()
      }

      if (openPanels.image && !imageButtonRef.current?.contains(target) && !imagePanelRef.current?.contains(target)) {
        closeImagePanel()
      }

      if (openPanels.spoiler && !spoilerButtonRef.current?.contains(target) && !spoilerPanelRef.current?.contains(target)) {
        closeSpoilerPanel()
      }
    }

    function handleViewportChange() {
      syncFloatingPanels()
    }

    window.addEventListener("resize", handleViewportChange)
    window.addEventListener("scroll", handleViewportChange, true)
    document.addEventListener("pointerdown", handlePointerDown)

    return () => {
      window.removeEventListener("resize", handleViewportChange)
      window.removeEventListener("scroll", handleViewportChange, true)
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [
    closeImagePanel,
    closeLinkPanel,
    closeMediaPanel,
    closeSpoilerPanel,
    closeTablePanel,
    emojiPanelRef,
    imagePanelRef,
    linkPanelRef,
    mediaPanelRef,
    openPanels.emoji,
    openPanels.image,
    openPanels.link,
    openPanels.media,
    openPanels.spoiler,
    openPanels.table,
    spoilerPanelRef,
    syncFloatingPanels,
    tablePanelRef,
  ])

  const handleContinueUpload = useCallback(() => {
    clearUploadResults()
    setOpenPanels((current) => ({ ...current, image: false }))
  }, [clearUploadResults])

  return {
    message,
    setMessage,
    helpDialog: {
      open: openPanels.help,
      openDialog: openHelpDialog,
      closeDialog: closeHelpDialog,
    },
    base64Dialog: {
      open: openPanels.base64,
      value: panelDraft.base64Text,
      preview: base64Preview,
      mode: panelDraft.encryptionMode,
      privateValue: panelDraft.privateReplyText,
      privateRecipient: panelDraft.privateReplyRecipient,
      setValue: (nextValue: string) => setPanelDraftValue("base64Text", nextValue),
      setMode: (nextValue: "base64" | "private") => setPanelDraftValue("encryptionMode", nextValue),
      setPrivateValue: (nextValue: string) => setPanelDraftValue("privateReplyText", nextValue),
      setPrivateRecipient: (nextValue: PrivateReplyRecipient | null) => setPanelDraftValue("privateReplyRecipient", nextValue),
      openDialog: openBase64Dialog,
      closeDialog: closeBase64Dialog,
      dismissDialog: dismissBase64Dialog,
    },
    mediaPanel: {
      open: openPanels.media,
      position: mediaPanelPosition,
      ready: mediaPanelReady,
      panelRef: mediaPanelRef,
      buttonRef: mediaButtonRef,
      value: panelDraft.mediaUrl,
      hint: mediaHint,
      setValue: (nextValue: string) => setPanelDraftValue("mediaUrl", nextValue),
      toggle: toggleMediaPanel,
      close: closeMediaPanel,
    },
    emojiPanel: {
      open: openPanels.emoji,
      position: emojiPanelPosition,
      ready: emojiPanelReady,
      panelRef: emojiPanelRef,
      buttonRef: emojiButtonRef,
      toggle: toggleEmojiPanel,
      close: () => setOpenPanels((current) => ({ ...current, emoji: false })),
    },
    tablePanel: {
      open: openPanels.table,
      position: tablePanelPosition,
      ready: tablePanelReady,
      panelRef: tablePanelRef,
      buttonRef: tableButtonRef,
      toggle: toggleTablePanel,
      close: closeTablePanel,
    },
    linkPanel: {
      open: openPanels.link,
      position: linkPanelPosition,
      ready: linkPanelReady,
      panelRef: linkPanelRef,
      buttonRef: linkButtonRef,
      text: panelDraft.linkText,
      url: panelDraft.linkUrl,
      hint: linkHint,
      setText: (nextValue: string) => setPanelDraftValue("linkText", nextValue),
      setUrl: (nextValue: string) => setPanelDraftValue("linkUrl", nextValue),
      toggle: toggleLinkPanel,
      close: closeLinkPanel,
    },
    imagePanel: {
      open: openPanels.image,
      position: imagePanelPosition,
      ready: imagePanelReady,
      panelRef: imagePanelRef,
      buttonRef: imageButtonRef,
      remoteImageUrl: panelDraft.remoteImageUrl,
      remoteImageAlt: panelDraft.remoteImageAlt,
      remoteImageHint,
      setRemoteImageUrl: (nextValue: string) => setPanelDraftValue("remoteImageUrl", nextValue),
      setRemoteImageAlt: (nextValue: string) => setPanelDraftValue("remoteImageAlt", nextValue),
      uploadSummary,
      continueUpload: handleContinueUpload,
      openPanel: () => toggleFloatingPanel("image", true),
      toggle: toggleImagePanel,
      close: closeImagePanel,
    },
    spoilerPanel: {
      open: openPanels.spoiler,
      position: spoilerPanelPosition,
      ready: spoilerPanelReady,
      panelRef: spoilerPanelRef,
      buttonRef: spoilerButtonRef,
      toggle: toggleSpoilerPanel,
      close: closeSpoilerPanel,
    },
  }
}
