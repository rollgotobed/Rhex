"use client"

import { useMemo, useState } from "react"
import { ImageUp, Loader2 } from "lucide-react"

import { LevelIcon } from "@/components/level-icon"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const DEFAULT_ICON_PRESETS = [
  "🌱",
  "⭐",
  "🔥",
  "⚡",
  "💎",
  "👑",
  "🛡️",
  "🚀",
  "🎯",
  "🏆",
  "🌈",
  "🧠",
  "📚",
  "💬",
  "📷",
  "🌿",
] as const

interface IconPickerProps {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  presets?: readonly string[]
  previewColor?: string
  triggerClassName?: string
  containerClassName?: string
  textareaRows?: number
  description?: string
  popoverTitle?: string
  uploadFolder?: "avatars" | "posts" | "comments" | "friend-links" | "site-logo" | "icon"
  hideLabel?: boolean
  triggerMode?: "full" | "icon" | "input"
  allowEmpty?: boolean
  displayText?: string
}

export function IconPicker({
  value,
  onChange,
  label = "图标",
  placeholder = "输入 emoji、SVG、图片 URL，或上传后的本地路径",
  presets = DEFAULT_ICON_PRESETS,
  previewColor,
  triggerClassName,
  containerClassName,
  textareaRows = 4,
  description = "支持 emoji、内联 SVG、远程图片 URL 和上传后的本地资源路径。",
  popoverTitle,
  uploadFolder = "icon",
  hideLabel = false,
  triggerMode = "full",
  allowEmpty = false,
  displayText,
}: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const normalizedValue = useMemo(() => value.trim(), [value])

  async function uploadIcon(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件后再上传", `${label}上传失败`)
      return
    }

    setUploading(true)
    const formData = new FormData()
    formData.append("file", file)
    formData.append("folder", uploadFolder)

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()

      if (!response.ok || result.code !== 0) {
        toast.error(result.message ?? `${label}上传失败`, `${label}上传失败`)
        return
      }

      const uploadedPath = String(result.data?.urlPath ?? "").trim()
      if (!uploadedPath) {
        toast.error("上传成功，但未返回可用地址", `${label}上传失败`)
        return
      }

      onChange(uploadedPath)
      toast.success("图片已上传并回填到当前图标", `${label}上传成功`)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `${label}上传失败，请稍后重试`,
        `${label}上传失败`,
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={cn("min-w-0 space-y-2", containerClassName)}>
      {hideLabel ? null : <p className="text-sm font-medium">{label}</p>}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className={cn(
            triggerMode === "icon"
              ? "flex h-9 w-9 items-center justify-center rounded-2xl border border-border bg-background text-left text-sm transition-colors hover:bg-accent"
              : triggerMode === "input"
                ? "flex h-11 w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-input bg-background px-4 text-left text-sm transition-colors hover:bg-accent focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                : "flex h-11 w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-full border border-border bg-background px-4 text-left text-sm transition-colors hover:bg-accent",
            triggerClassName,
          )}
        >
          <span
            className={
              triggerMode === "icon"
                ? "inline-flex h-4 w-4 shrink-0 items-center justify-center text-foreground/80"
                : triggerMode === "input"
                  ? "inline-flex h-5 w-5 shrink-0 items-center justify-center text-foreground/80"
                  : "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground/80"
            }
          >
            {allowEmpty && !normalizedValue ? (
              <span className="text-[10px] text-muted-foreground">无</span>
            ) : (
              <LevelIcon
                icon={normalizedValue}
                color={previewColor}
                className="h-4 w-4 text-sm"
                emojiClassName="text-inherit"
                svgClassName="[&>svg]:block"
              />
            )}
          </span>
          {triggerMode === "icon" ? null : (
            <span className="min-w-0 flex-1 truncate">
              {displayText || normalizedValue || placeholder}
            </span>
          )}
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={8}
          className={cn(
            triggerMode === "icon"
              ? "w-80 max-w-[calc(100vw-2rem)] space-y-3 p-3"
              : "w-[min(36rem,calc(100vw-2rem))] space-y-3 p-3",
          )}
        >
          <PopoverHeader>
            <PopoverTitle className="text-xs">
              {popoverTitle ?? `选择${label}`}
            </PopoverTitle>
          </PopoverHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-medium text-muted-foreground">
                自定义图标
              </p>
              {allowEmpty && !normalizedValue ? (
                <span className="text-[11px] text-muted-foreground">无图标</span>
              ) : (
                <LevelIcon
                  icon={normalizedValue}
                  color={previewColor}
                  className="h-4 w-4 text-sm"
                  emojiClassName="text-inherit"
                  svgClassName="[&>svg]:block"
                />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium transition-colors hover:bg-accent">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ImageUp className="h-3.5 w-3.5" />
                )}
                {uploading ? "上传中..." : "上传图片"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void uploadIcon(file)
                    }
                    event.target.value = ""
                  }}
                />
              </label>
              <span className="text-[11px] leading-5 text-muted-foreground">
                上传后会自动回填资源路径，也可继续手动改成 emoji、SVG 或 URL。
              </span>
            </div>

            <Textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              rows={textareaRows}
              className="h-28 min-h-28 max-h-28 w-full resize-none overflow-y-auto rounded-2xl bg-background px-3 py-2 text-xs leading-5 [field-sizing:fixed]"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              预设图标
            </p>
            <div className="-mx-1 overflow-x-auto pb-1">
              <div className="flex min-w-max items-center gap-1.5 px-1">
                {presets.map((preset) => {
                  const active = normalizedValue === preset

                  return (
                    <button
                      key={preset}
                      type="button"
                      className={cn(
                        "flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background px-2 text-base transition-colors hover:bg-accent",
                        active ? "border-foreground/20 bg-accent shadow-xs" : "",
                      )}
                      onClick={() => {
                        onChange(preset)
                        setOpen(false)
                      }}
                      aria-label={`使用图标 ${preset}`}
                    >
                      {preset}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <p className="text-[11px] leading-5 text-muted-foreground">
            {description}
          </p>
        </PopoverContent>
      </Popover>
    </div>
  )
}
