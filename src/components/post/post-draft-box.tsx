"use client"

import { Trash2 } from "lucide-react"

import { POST_TYPE_OPTIONS } from "@/components/post/create-post-form.shared"
import { Button } from "@/components/ui/rbutton"
import { formatDateTime } from "@/lib/formatters"
import type { StoredLocalPostDraftEntry } from "@/lib/post-draft"
import { cn } from "@/lib/utils"

interface PostDraftBoxProps {
  entries: StoredLocalPostDraftEntry[]
  onRestore: (draftId: string) => void
  onDelete: (draftId: string) => void
  onClearAll?: () => void
  className?: string
}

const postTypeLabelMap = Object.fromEntries(
  POST_TYPE_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>

function buildDraftPreview(entry: StoredLocalPostDraftEntry) {
  const compactContent = entry.data.content.replace(/\s+/g, " ").trim()
  if (compactContent) {
    return compactContent.slice(0, 96)
  }

  if (entry.data.manualTags.length > 0) {
    return `标签：${entry.data.manualTags.join(" / ")}`
  }

  return "这份草稿还没有正文预览，可以直接恢复后继续编辑。"
}

export function PostDraftBox({
  entries,
  onRestore,
  onDelete,
  onClearAll,
  className,
}: PostDraftBoxProps) {
  return (
    <section className={cn("bg-card/70", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">草稿箱</p>
          <p className="text-xs text-muted-foreground">
            草稿按最近更新时间排序；自动保存和手动保存都会更新对应草稿，当前共 {entries.length} 份。
          </p>
        </div>
        {entries.length > 0 && onClearAll ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="shrink-0"
            onClick={onClearAll}
          >
            <Trash2 data-icon="inline-start" />
            清空
          </Button>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border/80 bg-background/70 px-3 py-6 text-center text-sm text-muted-foreground">
          当前还没有可恢复的草稿。
        </div>
      ) : null}
      <div className="mt-3 flex flex-col gap-2">
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-border/80 bg-background/80 px-3 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {entry.data.title.trim() || "无标题草稿"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatDateTime(entry.updatedAt)}
                  {entry.data.boardSlug ? ` · ${entry.data.boardSlug}` : ""}
                  {entry.data.postType ? ` · ${postTypeLabelMap[entry.data.postType] ?? entry.data.postType}` : ""}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {buildDraftPreview(entry)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => onRestore(entry.id)}
                >
                  恢复
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="flex-1 sm:flex-none"
                  onClick={() => onDelete(entry.id)}
                >
                  删除
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
