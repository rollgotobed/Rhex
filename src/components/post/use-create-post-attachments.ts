"use client"

import type { ChangeEvent } from "react"
import { useState } from "react"

import type { LocalPostDraft } from "@/lib/post-draft"
import { toast } from "@/components/ui/toast"

const MAX_POST_ATTACHMENTS = 20

interface UseCreatePostAttachmentsOptions {
  draft: LocalPostDraft
  canAddAttachments: boolean
  attachmentFeature: {
    uploadEnabled: boolean
    minUploadLevel: number
    minUploadVipLevel: number
    allowedExtensions: string[]
    maxFileSizeMb: number
  }
  setDraft: React.Dispatch<React.SetStateAction<LocalPostDraft>>
  updateDraftField: <Key extends keyof LocalPostDraft>(
    field: Key,
    value: LocalPostDraft[Key],
  ) => void
}

export function useCreatePostAttachments({
  draft,
  canAddAttachments,
  attachmentFeature,
  setDraft,
  updateDraftField,
}: UseCreatePostAttachmentsOptions) {
  const [coverUploading, setCoverUploading] = useState(false)
  const [attachmentUploading, setAttachmentUploading] = useState(false)

  function addExternalAttachment() {
    if (!canAddAttachments) {
      toast.error("当前账号暂不具备添加附件的权限", "无法添加网盘附件")
      return
    }

    if (draft.attachments.length >= MAX_POST_ATTACHMENTS) {
      toast.info(`单个帖子最多添加 ${MAX_POST_ATTACHMENTS} 个附件`, "附件数量已满")
      return
    }

    updateDraftField("attachments", [
      ...draft.attachments,
      {
        sourceType: "EXTERNAL_LINK",
        uploadId: "",
        name: "",
        externalUrl: "",
        externalCode: "",
        fileSize: null,
        fileExt: "",
        mimeType: "",
        minDownloadLevel: "0",
        minDownloadVipLevel: "0",
        pointsCost: "0",
        requireReplyUnlock: false,
      },
    ])
  }

  function updateAttachment(
    index: number,
    patch: Partial<LocalPostDraft["attachments"][number]>,
  ) {
    updateDraftField(
      "attachments",
      draft.attachments.map((attachment, currentIndex) => {
        if (currentIndex !== index) {
          return attachment
        }

        const nextAttachment = {
          ...attachment,
          ...patch,
        }

        if (
          ("sourceType" in patch
            && patch.sourceType
            && patch.sourceType !== attachment.sourceType)
          || ("uploadId" in patch
            && patch.uploadId !== undefined
            && patch.uploadId !== attachment.uploadId)
        ) {
          nextAttachment.id = undefined
        }

        return nextAttachment
      }),
    )
  }

  function removeAttachment(index: number) {
    updateDraftField(
      "attachments",
      draft.attachments.filter((_, currentIndex) => currentIndex !== index),
    )
  }

  function buildUploadErrorSummary(messages: string[]) {
    if (messages.length === 1) {
      return messages[0]
    }

    const visibleMessages = messages.slice(0, 3).join("；")
    return messages.length > 3
      ? `${visibleMessages}；另有 ${messages.length - 3} 个文件未上传`
      : visibleMessages
  }

  async function uploadSingleAttachment(file: File) {
    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/attachments/upload", {
      method: "POST",
      body: formData,
    })
    const result = await response.json()

    if (!response.ok || result.code !== 0) {
      throw new Error(result.message ?? "附件上传失败")
    }

    const uploadedAttachment = result.data?.upload as {
      id?: string
      originalName?: string
      fileSize?: number
      fileExt?: string
      mimeType?: string
    } | undefined

    if (!uploadedAttachment?.id || !uploadedAttachment.originalName) {
      throw new Error("附件上传成功，但返回数据不完整")
    }

    return {
      sourceType: "UPLOAD",
      uploadId: uploadedAttachment.id,
      name: uploadedAttachment.originalName,
      externalUrl: "",
      externalCode: "",
      fileSize:
        typeof uploadedAttachment.fileSize === "number"
          ? uploadedAttachment.fileSize
          : null,
      fileExt: uploadedAttachment.fileExt ?? "",
      mimeType: uploadedAttachment.mimeType ?? "",
      minDownloadLevel: "0",
      minDownloadVipLevel: "0",
      pointsCost: "0",
      requireReplyUnlock: false,
    } satisfies LocalPostDraft["attachments"][number]
  }

  async function uploadAttachmentFiles(files: File[] | FileList) {
    const selectedFiles = Array.from(files).filter((file) => file instanceof File)
    if (selectedFiles.length === 0) {
      return
    }

    const normalizedAttachmentMaxFileSizeMb = Math.max(1, attachmentFeature.maxFileSizeMb)
    const maxFileSizeBytes = normalizedAttachmentMaxFileSizeMb * 1024 * 1024
    const allowedAttachmentExtensions = attachmentFeature.allowedExtensions
      .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
      .filter(Boolean)

    if (attachmentUploading) {
      toast.info("请等待当前附件上传完成后再继续添加", "附件上传中")
      return
    }

    if (!canAddAttachments) {
      toast.error("当前账号暂不具备添加附件的权限", "附件上传失败")
      return
    }

    if (!attachmentFeature.uploadEnabled) {
      toast.error("当前站点已关闭站内附件上传，仍可添加网盘附件", "附件上传失败")
      return
    }

    const remainingSlots = MAX_POST_ATTACHMENTS - draft.attachments.length
    if (remainingSlots <= 0) {
      toast.info(`单个帖子最多添加 ${MAX_POST_ATTACHMENTS} 个附件`, "附件数量已满")
      return
    }

    const uploadCandidates = selectedFiles.slice(0, remainingSlots)
    if (selectedFiles.length > remainingSlots) {
      toast.info(
        `最多还能添加 ${remainingSlots} 个附件，已自动忽略多余文件`,
        "附件数量已满",
      )
    }

    const rejectedMessages: string[] = []
    const acceptedFiles = uploadCandidates.filter((file) => {
      const normalizedFileExtension = file.name.includes(".")
        ? file.name.slice(file.name.lastIndexOf(".") + 1).trim().toLowerCase()
        : ""

      if (
        !normalizedFileExtension
        || !allowedAttachmentExtensions.includes(normalizedFileExtension)
      ) {
        rejectedMessages.push(`${file.name} 格式不支持`)
        return false
      }

      if (file.size > maxFileSizeBytes) {
        rejectedMessages.push(`${file.name} 超过 ${normalizedAttachmentMaxFileSizeMb}MB`)
        return false
      }

      return true
    })

    if (rejectedMessages.length > 0) {
      toast.error(
        `${buildUploadErrorSummary(rejectedMessages)}。仅支持 ${allowedAttachmentExtensions.join(" / ")}，单文件不超过 ${normalizedAttachmentMaxFileSizeMb}MB。`,
        "附件上传失败",
      )
    }

    if (acceptedFiles.length === 0) {
      return
    }

    setAttachmentUploading(true)

    const uploadedDraftAttachments: LocalPostDraft["attachments"] = []
    const failedMessages: string[] = []

    try {
      for (const file of acceptedFiles) {
        try {
          uploadedDraftAttachments.push(await uploadSingleAttachment(file))
        } catch (error) {
          failedMessages.push(
            `${file.name}：${error instanceof Error ? error.message : "上传失败"}`,
          )
        }
      }

      if (uploadedDraftAttachments.length > 0) {
        setDraft((current) => {
          const availableSlots = MAX_POST_ATTACHMENTS - current.attachments.length
          if (availableSlots <= 0) {
            return current
          }

          return {
            ...current,
            attachments: [
              ...current.attachments,
              ...uploadedDraftAttachments.slice(0, availableSlots),
            ],
          }
        })
        toast.success(
          uploadedDraftAttachments.length === 1
            ? "附件已上传并加入帖子草稿"
            : `${uploadedDraftAttachments.length} 个附件已上传并加入帖子草稿`,
          "附件上传成功",
        )
      }

      if (failedMessages.length > 0) {
        toast.error(buildUploadErrorSummary(failedMessages), "附件上传失败")
      }
    } finally {
      setAttachmentUploading(false)
    }
  }

  async function handleAttachmentUpload(event: ChangeEvent<HTMLInputElement>) {
    await uploadAttachmentFiles(event.target.files ?? [])
    event.target.value = ""
  }

  async function handleCoverUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件后再上传", "封面上传失败")
      event.target.value = ""
      return
    }

    setCoverUploading(true)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("folder", "post-covers")

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()

      if (!response.ok || result.code !== 0) {
        throw new Error(result.message ?? "封面上传失败")
      }

      updateDraftField("coverPath", String(result.data?.urlPath ?? ""))
      toast.success("封面上传成功", "封面上传成功")
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "封面上传失败",
        "封面上传失败",
      )
    } finally {
      setCoverUploading(false)
      event.target.value = ""
    }
  }

  return {
    coverUploading,
    attachmentUploading,
    addExternalAttachment,
    updateAttachment,
    removeAttachment,
    uploadAttachmentFiles,
    handleAttachmentUpload,
    handleCoverUpload,
  }
}
