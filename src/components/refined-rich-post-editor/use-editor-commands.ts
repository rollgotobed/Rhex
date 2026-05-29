"use client"

import { useCallback, useRef } from "react"
import type * as React from "react"
import type { MutableRefObject, RefObject } from "react"

import type { EditorSelectionRange, PrivateReplyRecipient } from "@/components/refined-rich-post-editor/types"
import {
  buildPastedHtmlMarkdown,
  getPastedHtmlImageSegments,
  inferMediaInsert,
  inferRemoteImageInsert,
  normalizeRemoteUrl,
  parsePastedHtmlToMarkdownSegments,
  type PastedHtmlMarkdownSegment,
} from "@/components/refined-rich-post-editor/utils"
import {
  applyAlignment,
  applyCodeFormat,
  applyListFormat,
  buildInlineHighlightMarkdown,
  buildLinkMarkdown,
  buildScratchMaskMarkdown,
  buildSpoilerMarkdown,
  buildSizedTableMarkdown,
  getMarkdownEditorKeydownResult,
  insertLinePrefix,
  insertSelection,
  setHeadingLevel,
  wrapSelection,
  type MarkdownAlignment,
  type MarkdownCodeFormat,
  type MarkdownEditorState,
  type MarkdownEditorUpdate,
  type MarkdownListType,
} from "@/lib/markdown-editor-shortcuts"

type UseEditorCommandsOptions = {
  value: string
  disabled: boolean
  markdownImageUploadEnabled: boolean
  uploading: boolean
  uploadFolder: string
  fileInputRef: RefObject<HTMLInputElement | null>
  selectionRef: MutableRefObject<EditorSelectionRange>
  getEditorState: (element?: HTMLTextAreaElement | null) => MarkdownEditorState
  applyEditorUpdate: (update: MarkdownEditorUpdate) => void
  insertMarkdownTemplate: (template: string) => void
  syncSelection: () => EditorSelectionRange
  uploadImageFilesForMarkdown: (files: File[]) => Promise<Array<{ status: "queued" | "uploading" | "success" | "error"; urlPath?: string; errorMessage?: string }>>
  uploadImageFiles: (files: File[]) => Promise<number>
  mediaUrl: string
  remoteImageUrl: string
  remoteImageAlt: string
  linkText: string
  linkUrl: string
  base64Preview: string
  privateReplyText: string
  privateReplyRecipient: PrivateReplyRecipient | null
  onPrivateReplyInsert?: (payload: { recipient: PrivateReplyRecipient; content: string }) => void
  setMessage: (message: string) => void
  toggleLinkPanel: () => void
  toggleTablePanel: () => void
  toggleImagePanel: () => void
  openImagePanel: () => void
  closeImagePanel: () => void
  closeMediaPanel: () => void
  closeLinkPanel: () => void
  closeTablePanel: () => void
  closeBase64Dialog: () => void
}

export function useEditorCommands({
  value,
  disabled,
  markdownImageUploadEnabled,
  uploading,
  uploadFolder,
  fileInputRef,
  selectionRef,
  getEditorState,
  applyEditorUpdate,
  insertMarkdownTemplate,
  syncSelection,
  uploadImageFilesForMarkdown,
  uploadImageFiles,
  mediaUrl,
  remoteImageUrl,
  remoteImageAlt,
  linkText,
  linkUrl,
  base64Preview,
  privateReplyText,
  privateReplyRecipient,
  onPrivateReplyInsert,
  setMessage,
  toggleLinkPanel,
  toggleTablePanel,
  toggleImagePanel,
  openImagePanel,
  closeImagePanel,
  closeMediaPanel,
  closeLinkPanel,
  closeTablePanel,
  closeBase64Dialog,
}: UseEditorCommandsOptions) {
  const touchToolbarPointerDownAtRef = useRef(0)

  const applyWrap = useCallback((before: string, after = "") => {
    applyEditorUpdate(wrapSelection(getEditorState(), before, after))
  }, [applyEditorUpdate, getEditorState])

  const applySelectionTransform = useCallback((transform: (selectedText: string) => string) => {
    applyEditorUpdate(insertSelection(getEditorState(), transform))
  }, [applyEditorUpdate, getEditorState])

  const applyLinePrefix = useCallback((prefix: string) => {
    applyEditorUpdate(insertLinePrefix(getEditorState(), prefix))
  }, [applyEditorUpdate, getEditorState])

  const applyListFormatByType = useCallback((listType: MarkdownListType) => {
    applyEditorUpdate(applyListFormat(getEditorState(), listType))
  }, [applyEditorUpdate, getEditorState])

  const applyCodeFormatByType = useCallback((codeType: MarkdownCodeFormat) => {
    applyEditorUpdate(applyCodeFormat(getEditorState(), codeType))
  }, [applyEditorUpdate, getEditorState])

  const triggerImageShortcut = useCallback(() => {
    if (!markdownImageUploadEnabled) {
      toggleImagePanel()
      return
    }

    if (uploading) {
      openImagePanel()
      return
    }

    fileInputRef.current?.click()
  }, [fileInputRef, markdownImageUploadEnabled, openImagePanel, toggleImagePanel, uploading])

  const handleToolbarPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (disabled) {
      return
    }

    if (event.pointerType !== "mouse") {
      touchToolbarPointerDownAtRef.current = Date.now()
      syncSelection()
    }
  }, [disabled, syncSelection])

  const handleToolbarMouseDown = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (disabled) {
      return
    }

    syncSelection()

    const nativeEvent = event.nativeEvent as MouseEvent & {
      sourceCapabilities?: {
        firesTouchEvents?: boolean
      }
    }
    const isTouchGeneratedMouseEvent =
      nativeEvent.sourceCapabilities?.firesTouchEvents === true
      || Date.now() - touchToolbarPointerDownAtRef.current < 700
    if (isTouchGeneratedMouseEvent) {
      return
    }

    event.preventDefault()
  }, [disabled, syncSelection])

  const handleToolbarSelectMouseDown = useCallback(() => {
    if (!disabled) {
      syncSelection()
    }
  }, [disabled, syncSelection])

  const handleToolbarSelectOpenChange = useCallback((open: boolean) => {
    if (open) {
      handleToolbarSelectMouseDown()
    }
  }, [handleToolbarSelectMouseDown])

  const handleTextareaKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) {
      return
    }

    const result = getMarkdownEditorKeydownResult(event, getEditorState(event.currentTarget))
    if (!result) {
      return
    }

    event.preventDefault()
    if (result.kind === "update") {
      applyEditorUpdate(result.update)
      return
    }

    if (result.action === "open-link-panel") {
      toggleLinkPanel()
      return
    }

    if (result.action === "toggle-table-panel") {
      toggleTablePanel()
      return
    }

    triggerImageShortcut()
  }, [applyEditorUpdate, disabled, getEditorState, toggleLinkPanel, toggleTablePanel, triggerImageShortcut])

  const handleInsertRemoteImage = useCallback(() => {
    const result = inferRemoteImageInsert(remoteImageUrl, remoteImageAlt)
    if (!result) {
      setMessage("请输入有效的远程图片地址")
      return
    }

    insertMarkdownTemplate(result.template)
    closeImagePanel()
  }, [closeImagePanel, insertMarkdownTemplate, remoteImageAlt, remoteImageUrl, setMessage])

  const handleInsertMedia = useCallback(() => {
    const result = inferMediaInsert(mediaUrl)
    if (!result) {
      setMessage("请输入有效的音频或视频地址")
      return
    }

    insertMarkdownTemplate(result.template)
    setMessage(result.message)
    closeMediaPanel()
  }, [closeMediaPanel, insertMarkdownTemplate, mediaUrl, setMessage])

  const handleInsertLink = useCallback(() => {
    if (!linkUrl.trim()) {
      setMessage("请输入有效的链接地址")
      return
    }

    applySelectionTransform(() => buildLinkMarkdown(linkText, linkUrl))
    closeLinkPanel()
  }, [applySelectionTransform, closeLinkPanel, linkText, linkUrl, setMessage])

  const handleConvertSelectionToImageMarkdown = useCallback(() => {
    const state = getEditorState()
    const selectedText = state.value.slice(state.selectionStart, state.selectionEnd).trim()
    const result = inferRemoteImageInsert(selectedText, "")
    if (!result) {
      setMessage("请先选择一个有效的图片链接")
      return
    }

    applyEditorUpdate(insertSelection(state, () => result.template))
    setMessage("已转换为 Markdown 图片语法")
  }, [applyEditorUpdate, getEditorState, setMessage])

  const handleInsertTable = useCallback((rows: number, columns: number) => {
    insertMarkdownTemplate(buildSizedTableMarkdown(rows, columns))
    closeTablePanel()
  }, [closeTablePanel, insertMarkdownTemplate])

  const handleInsertBase64 = useCallback(() => {
    if (!base64Preview) {
      setMessage("请输入需要编码的文本")
      return
    }

    const { start, end } = selectionRef.current
    setMessage("")
    applyEditorUpdate(insertSelection({
      value,
      selectionStart: start,
      selectionEnd: end,
    }, () => base64Preview))
    closeBase64Dialog()
  }, [applyEditorUpdate, base64Preview, closeBase64Dialog, selectionRef, setMessage, value])

  const handleInsertPrivateReply = useCallback(() => {
    if (!onPrivateReplyInsert) {
      setMessage("当前编辑器不支持私密回复")
      return
    }

    if (!privateReplyRecipient) {
      setMessage("请选择私密回复可见人")
      return
    }

    const normalizedContent = privateReplyText.trim()
    if (!normalizedContent) {
      setMessage("请输入私密回复内容")
      return
    }

    onPrivateReplyInsert({
      recipient: privateReplyRecipient,
      content: normalizedContent,
    })
    setMessage(`已设置为仅 ${privateReplyRecipient.displayName} 可见`)
    closeBase64Dialog()
  }, [closeBase64Dialog, onPrivateReplyInsert, privateReplyRecipient, privateReplyText, setMessage])

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!markdownImageUploadEnabled) {
      event.target.value = ""
      return
    }

    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    const invalidFile = files.find((file) => !file.type.startsWith("image/"))
    if (invalidFile) {
      setMessage(`仅支持上传图片文件，${invalidFile.name} 不符合要求`)
      event.target.value = ""
      return
    }

    setMessage("")
    openImagePanel()
    await uploadImageFiles(files)
    event.target.value = ""
  }, [markdownImageUploadEnabled, openImagePanel, setMessage, uploadImageFiles])

  const localizeRemotePastedImage = useCallback(async (
    segment: Extract<PastedHtmlMarkdownSegment, { type: "image" }>,
  ) => {
    const url = normalizeRemoteUrl(segment.src)
    if (!url) {
      return null
    }

    const response = await fetch("/api/upload/remote-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: url.toString(),
        folder: uploadFolder,
        fileName: segment.alt,
      }),
    })
    const result = await response.json().catch(() => null) as {
      code?: number
      message?: string
      data?: {
        urlPath?: string
      }
    } | null

    if (!response.ok || result?.code !== 0 || !result.data?.urlPath) {
      throw new Error(result?.message ?? "远程图片本地化失败")
    }

    return result.data.urlPath
  }, [uploadFolder])

  const createPastedImageFile = useCallback(async (
    segment: Extract<PastedHtmlMarkdownSegment, { type: "image" }>,
  ) => {
    const src = segment.src.trim()
    if (!src.startsWith("data:image/") && !src.startsWith("blob:")) {
      return null
    }

    const response = await fetch(src)
    if (!response.ok) {
      throw new Error("剪贴板图片读取失败")
    }

    const blob = await response.blob()
    if (!blob.type.startsWith("image/")) {
      throw new Error("剪贴板内容不是图片")
    }

    const extension = blob.type.split("/")[1]?.split("+")[0]?.trim() || "png"
    const normalizedExtension = extension === "jpeg" ? "jpg" : extension
    const fileName = `${segment.alt || `pasted-image-${segment.index + 1}`}.${normalizedExtension}`
      .replace(/[/\\\r\n\t]+/g, "_")

    return new File([blob], fileName, { type: blob.type })
  }, [])

  const getSameOriginImageSrc = useCallback((src: string) => {
    const value = src.trim()
    if (!value || value.startsWith("//") || value.startsWith("data:") || value.startsWith("blob:")) {
      return null
    }

    if (value.startsWith("/")) {
      return value
    }

    try {
      const url = new URL(value)
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`
      }
    } catch {
      return null
    }

    return null
  }, [])

  const handlePastedHtmlSegments = useCallback(async (
    segments: PastedHtmlMarkdownSegment[],
    imageSegments: Array<Extract<PastedHtmlMarkdownSegment, { type: "image" }>>,
    clipboardImageFiles: File[],
  ) => {
    if (!markdownImageUploadEnabled) {
      const markdown = buildPastedHtmlMarkdown(segments, (segment) => {
        const sameOriginSrc = getSameOriginImageSrc(segment.src)
        if (sameOriginSrc) {
          return sameOriginSrc
        }

        const remoteUrl = normalizeRemoteUrl(segment.src)
        return remoteUrl?.toString() ?? null
      })

      if (!markdown) {
        setMessage("后台已关闭 Markdown 图片上传，请使用图片按钮插入远程图片地址")
        openImagePanel()
        return
      }

      insertMarkdownTemplate(markdown)
      setMessage("后台已关闭 Markdown 图片上传，已保留可用的远程图片地址")
      return
    }

    setMessage("正在本地化粘贴内容中的图片...")
    openImagePanel()

    const resolvedImageSrcByIndex = new Map<number, string>()
    const fallbackImageSrcByIndex = new Map<number, string>()
    const localFileItems: Array<{
      segmentIndex: number
      file: File
    }> = []
    let fallbackFileIndex = 0
    let failedCount = 0

    for (const segment of imageSegments) {
      const sameOriginSrc = getSameOriginImageSrc(segment.src)
      if (sameOriginSrc) {
        resolvedImageSrcByIndex.set(segment.index, sameOriginSrc)
        continue
      }

      const remoteUrl = normalizeRemoteUrl(segment.src)
      if (remoteUrl) {
        fallbackImageSrcByIndex.set(segment.index, remoteUrl.toString())
        try {
          const localizedSrc = await localizeRemotePastedImage(segment)
          if (localizedSrc) {
            resolvedImageSrcByIndex.set(segment.index, localizedSrc)
          }
        } catch {
          failedCount += 1
        }
        continue
      }

      try {
        const pastedImageFile = await createPastedImageFile(segment)
        if (pastedImageFile) {
          localFileItems.push({
            segmentIndex: segment.index,
            file: pastedImageFile,
          })
          continue
        }
      } catch {
        failedCount += 1
      }

      const fallbackFile = clipboardImageFiles[fallbackFileIndex]
      fallbackFileIndex += 1
      if (fallbackFile) {
        localFileItems.push({
          segmentIndex: segment.index,
          file: fallbackFile,
        })
      } else {
        failedCount += 1
      }
    }

    if (localFileItems.length > 0) {
      const uploadResults = await uploadImageFilesForMarkdown(localFileItems.map((item) => item.file))
      uploadResults.forEach((result, index) => {
        const item = localFileItems[index]
        if (!item) {
          return
        }

        if (result.status === "success" && result.urlPath) {
          resolvedImageSrcByIndex.set(item.segmentIndex, result.urlPath)
        } else {
          failedCount += 1
        }
      })
    }

    const markdown = buildPastedHtmlMarkdown(segments, (segment) => (
      resolvedImageSrcByIndex.get(segment.index)
      ?? fallbackImageSrcByIndex.get(segment.index)
      ?? null
    ))

    if (markdown) {
      insertMarkdownTemplate(markdown)
    }

    const localizedCount = imageSegments.filter((segment) => resolvedImageSrcByIndex.has(segment.index)).length
    if (localizedCount > 0 && failedCount > 0) {
      setMessage(`已本地化 ${localizedCount} 张图片，${failedCount} 张保留原地址或已忽略`)
    } else if (localizedCount > 0) {
      setMessage(`已本地化 ${localizedCount} 张图片`)
    } else if (failedCount > 0) {
      setMessage("未能本地化粘贴内容中的图片，已尽量保留可用的远程地址")
    } else {
      setMessage("")
    }

  }, [
    createPastedImageFile,
    getSameOriginImageSrc,
    insertMarkdownTemplate,
    localizeRemotePastedImage,
    markdownImageUploadEnabled,
    openImagePanel,
    setMessage,
    uploadImageFilesForMarkdown,
  ])

  const handlePaste = useCallback(async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    const html = event.clipboardData.getData("text/html")
    if (html) {
      const segments = parsePastedHtmlToMarkdownSegments(html)
      const imageSegments = getPastedHtmlImageSegments(segments)
      if (imageSegments.length > 0) {
        event.preventDefault()
        if (uploading) {
          setMessage("图片正在上传中，请稍后再粘贴")
          openImagePanel()
          return
        }

        void handlePastedHtmlSegments(segments, imageSegments, imageFiles)
        return
      }
    }

    if (imageFiles.length === 0) {
      return
    }

    if (!markdownImageUploadEnabled) {
      event.preventDefault()
      setMessage("后台已关闭 Markdown 图片上传，请使用图片按钮插入远程图片地址")
      openImagePanel()
      return
    }

    if (uploading) {
      event.preventDefault()
      setMessage("图片正在上传中，请稍后再粘贴")
      openImagePanel()
      return
    }

    event.preventDefault()
    setMessage("")
    openImagePanel()
    await uploadImageFiles(imageFiles)
  }, [handlePastedHtmlSegments, markdownImageUploadEnabled, openImagePanel, setMessage, uploadImageFiles, uploading])

  const handleEmojiSelect = useCallback((shortcode: string) => {
    applyWrap(`:${shortcode}: `)
  }, [applyWrap])

  return {
    handleToolbarPointerDown,
    handleToolbarMouseDown,
    handleToolbarSelectMouseDown,
    handleToolbarSelectOpenChange,
    handleTextareaKeyDown,
    triggerImageShortcut,
    handleUpload,
    handlePaste,
    handleEmojiSelect,
    handleInsertRemoteImage,
    handleInsertMedia,
    handleInsertLink,
    handleInsertTable,
    handleInsertBase64,
    handleInsertPrivateReply,
    toolbarActions: {
      setHeadingLevel: (level: 1 | 2 | 3) => applyEditorUpdate(setHeadingLevel(getEditorState(), level)),
      bold: () => applyWrap("**", "**"),
      underline: () => applyWrap("<u>", "</u>"),
      strike: () => applyWrap("~~", "~~"),
      highlight: () => applySelectionTransform(buildInlineHighlightMarkdown),
      codeFormat: applyCodeFormatByType,
      quote: () => applyLinePrefix("> "),
      convertSelectionToImageMarkdown: handleConvertSelectionToImageMarkdown,
      insertSpoiler: () => applySelectionTransform(buildSpoilerMarkdown),
      insertScratchMask: () => applySelectionTransform(buildScratchMaskMarkdown),
      listFormat: applyListFormatByType,
      insertDivider: () => insertMarkdownTemplate("---"),
      align: (alignment: MarkdownAlignment) => applyEditorUpdate(applyAlignment(getEditorState(), alignment)),
    },
  }
}
