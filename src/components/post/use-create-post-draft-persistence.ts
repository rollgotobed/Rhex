"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"

import {
  clearPostDraftFromStorage,
  deleteCurrentPostDraftFromStorage,
  deletePostDraftSnapshotFromStorage,
  hasMeaningfulPostDraftContent,
  loadPostDraftFromStorage,
  listPostDraftSnapshotsFromStorage,
  savePostDraftToStorage,
  type LocalPostDraft,
  type StoredLocalPostDraftEntry,
} from "@/lib/post-draft"
import { toast } from "@/components/ui/toast"
import { normalizeDraftData } from "@/components/post/create-post-form.shared"
import {
  getEffectiveRewardPoolOptions,
  resolveAvailableRewardPoolMode,
} from "@/components/post/use-create-post-draft.shared"

interface UseCreatePostDraftPersistenceOptions {
  draft: LocalPostDraft
  initialDraftData: LocalPostDraft
  storageMode: "create" | "edit"
  postId?: string
  pointName: string
  postRedPacketEnabled: boolean
  postJackpotEnabled: boolean
  setDraft: React.Dispatch<React.SetStateAction<LocalPostDraft>>
}

interface StoredDraftStateSnapshot {
  draftBoxEntries: StoredLocalPostDraftEntry[]
  lastSavedDraftAt: string | null
  pendingDraftToRestore: StoredLocalPostDraftEntry | null
}

function getStoredDraftStateSnapshot({
  storageMode,
  postId,
  showPending = false,
  activeDraftId,
  draft,
  initialDraftData,
}: {
  storageMode: "create" | "edit"
  postId?: string
  showPending?: boolean
  activeDraftId: string | null
  draft: LocalPostDraft
  initialDraftData: LocalPostDraft
}): StoredDraftStateSnapshot {
  const drafts = listPostDraftSnapshotsFromStorage(storageMode, postId)

  return {
    draftBoxEntries: drafts,
    lastSavedDraftAt: drafts[0]?.updatedAt ?? null,
    pendingDraftToRestore:
      showPending
      && !activeDraftId
      && !hasMeaningfulPostDraftContent(draft, initialDraftData)
        ? loadPostDraftFromStorage(storageMode, postId)
        : null,
  }
}

function buildAutosaveSuppressionKey(draft: LocalPostDraft) {
  return JSON.stringify(draft)
}

export function useCreatePostDraftPersistence({
  draft,
  initialDraftData,
  storageMode,
  postId,
  pointName,
  postRedPacketEnabled,
  postJackpotEnabled,
  setDraft,
}: UseCreatePostDraftPersistenceOptions) {
  const [pendingDraftToRestore, setPendingDraftToRestore] =
    useState<StoredLocalPostDraftEntry | null>(null)
  const [draftBoxEntries, setDraftBoxEntries] = useState<StoredLocalPostDraftEntry[]>([])
  const [draftRestored, setDraftRestored] = useState(false)
  const [lastSavedDraftAt, setLastSavedDraftAt] = useState<string | null>(null)
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)
  const hasHydratedDraftsRef = useRef(false)
  const submitSucceededRef = useRef(false)
  const suppressedAutosaveKeyRef = useRef<string | null>(null)

  function syncStoredDraftState({
    showPending = false,
    activeDraftId: nextActiveDraftId = activeDraftId,
    draft: nextDraft = draft,
    initialDraftData: nextInitialDraftData = initialDraftData,
  }: {
    showPending?: boolean
    activeDraftId?: string | null
    draft?: LocalPostDraft
    initialDraftData?: LocalPostDraft
  } = {}) {
    const snapshot = getStoredDraftStateSnapshot({
      storageMode,
      postId,
      showPending,
      activeDraftId: nextActiveDraftId,
      draft: nextDraft,
      initialDraftData: nextInitialDraftData,
    })

    setLastSavedDraftAt(snapshot.lastSavedDraftAt)
    setDraftBoxEntries(snapshot.draftBoxEntries)
    setPendingDraftToRestore(snapshot.pendingDraftToRestore)
  }

  const syncStoredDraftStateEffect = useEffectEvent(
    (showPending = false, nextActiveDraftId: string | null = activeDraftId) => {
      syncStoredDraftState({
        showPending,
        activeDraftId: nextActiveDraftId,
      })
    },
  )

  useEffect(() => {
    if (typeof window === "undefined" || hasHydratedDraftsRef.current) {
      return
    }

    hasHydratedDraftsRef.current = true
    const timer = window.setTimeout(() => {
      syncStoredDraftStateEffect(true)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [postId, storageMode])

  useEffect(() => {
    if (
      typeof window === "undefined"
      || !hasHydratedDraftsRef.current
      || submitSucceededRef.current
    ) {
      return
    }

    const autosaveKey = buildAutosaveSuppressionKey(draft)
    if (suppressedAutosaveKeyRef.current === autosaveKey) {
      return
    }
    suppressedAutosaveKeyRef.current = null

    const timer = window.setTimeout(() => {
      const result = savePostDraftToStorage(
        storageMode,
        draft,
        initialDraftData,
        postId,
        {
          draftId: activeDraftId ?? undefined,
          source: "autosave",
        },
      )

      if (!result) {
        if (activeDraftId) {
          setActiveDraftId(null)
        }
        syncStoredDraftStateEffect(true, null)
        return
      }

      setActiveDraftId(result.entry.id)
      setLastSavedDraftAt(result.entry.updatedAt)
      setDraftBoxEntries(result.drafts)
      setPendingDraftToRestore(null)
    }, 800)

    return () => window.clearTimeout(timer)
  }, [activeDraftId, draft, initialDraftData, postId, storageMode])

  function restoreDraft(nextDraft: LocalPostDraft, draftId: string) {
    const normalizedDraft = normalizeDraftData(
      nextDraft,
      pointName,
      initialDraftData.boardSlug,
    )
    const restoredRewardPoolOptions = getEffectiveRewardPoolOptions(
      normalizedDraft.isAnonymous,
      {
        postRedPacketEnabled,
        postJackpotEnabled,
      },
    )
    setDraft({
      ...normalizedDraft,
      redPacketMode: resolveAvailableRewardPoolMode(
        normalizedDraft.redPacketMode,
        restoredRewardPoolOptions,
      ),
      redPacketEnabled:
        normalizedDraft.redPacketEnabled
        && (restoredRewardPoolOptions.postRedPacketEnabled
          || restoredRewardPoolOptions.postJackpotEnabled),
    })
    suppressedAutosaveKeyRef.current = null
    setDraftRestored(true)
    setActiveDraftId(draftId)
    setPendingDraftToRestore(null)
    toast.info("已恢复你上次未提交的本地草稿", "草稿已恢复")
  }

  function handleRestorePendingDraft() {
    if (pendingDraftToRestore) {
      restoreDraft(pendingDraftToRestore.data, pendingDraftToRestore.id)
    }
  }

  function handleManualDraftSave() {
    if (submitSucceededRef.current) {
      return
    }
    suppressedAutosaveKeyRef.current = null

    const result = savePostDraftToStorage(
      storageMode,
      draft,
      initialDraftData,
      postId,
      {
        draftId: activeDraftId ?? undefined,
        source: "manual",
      },
    )

    if (!result) {
      if (activeDraftId) {
        setActiveDraftId(null)
      }
      setDraftRestored(false)
      syncStoredDraftState({
        showPending: true,
        activeDraftId: null,
      })
      toast.info("请先输入标题、正文或其他有效配置后再保存草稿", "未保存草稿")
      return
    }

    setActiveDraftId(result.entry.id)
    setLastSavedDraftAt(result.entry.updatedAt)
    setDraftBoxEntries(result.drafts)
    setDraftRestored(false)
    setPendingDraftToRestore(null)
    toast.success("当前内容已同步到草稿箱，后续自动保存会继续更新这份草稿", "草稿已保存")
  }

  const handleManualDraftSaveEffect = useEffectEvent(() => {
    handleManualDraftSave()
  })

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return
      }

      if (event.key.toLowerCase() !== "s") {
        return
      }

      event.preventDefault()
      handleManualDraftSaveEffect()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  function handleClearDraft() {
    const targetDraftId = activeDraftId ?? pendingDraftToRestore?.id
    suppressedAutosaveKeyRef.current = buildAutosaveSuppressionKey(draft)

    if (!targetDraftId) {
      clearPostDraftFromStorage(storageMode, postId)
      setDraftRestored(false)
      setActiveDraftId(null)
      syncStoredDraftState({
        activeDraftId: null,
      })
      toast.info("当前页面的草稿箱已清空", "草稿箱已清空")
      return
    }

    deletePostDraftSnapshotFromStorage(storageMode, targetDraftId, postId)
    const nextActiveDraftId = activeDraftId === targetDraftId ? null : activeDraftId
    setDraftRestored(false)
    setActiveDraftId(nextActiveDraftId)
    syncStoredDraftState({
      showPending: true,
      activeDraftId: nextActiveDraftId,
    })
    toast.info("当前草稿已从草稿箱删除", "草稿已删除")
  }

  function handleClearDraftBox() {
    suppressedAutosaveKeyRef.current = buildAutosaveSuppressionKey(draft)
    clearPostDraftFromStorage(storageMode, postId)
    setDraftRestored(false)
    setActiveDraftId(null)
    syncStoredDraftState({
      showPending: true,
      activeDraftId: null,
    })
    toast.info("当前页面的草稿箱已清空", "草稿箱已清空")
  }

  function handleRestoreDraftFromBox(draftId: string) {
    const targetDraft = draftBoxEntries.find((item) => item.id === draftId)
    if (targetDraft) {
      restoreDraft(targetDraft.data, draftId)
    }
  }

  function handleDeleteDraftFromBox(draftId: string) {
    deletePostDraftSnapshotFromStorage(storageMode, draftId, postId)
    const nextActiveDraftId = activeDraftId === draftId ? null : activeDraftId
    if (activeDraftId === draftId) {
      suppressedAutosaveKeyRef.current = buildAutosaveSuppressionKey(draft)
    }
    setDraftRestored(false)
    setActiveDraftId(nextActiveDraftId)
    syncStoredDraftState({
      showPending: true,
      activeDraftId: nextActiveDraftId,
    })
    toast.info("所选草稿已从草稿箱删除", "草稿已删除")
  }

  function handleSubmitSuccess(submittedDraft?: LocalPostDraft) {
    submitSucceededRef.current = true
    suppressedAutosaveKeyRef.current = buildAutosaveSuppressionKey(draft)
    deleteCurrentPostDraftFromStorage(storageMode, {
      postId,
      draftId: activeDraftId,
      drafts: [submittedDraft, draft],
    })
    setDraftRestored(false)
    setActiveDraftId(null)
    syncStoredDraftState({
      activeDraftId: null,
    })
  }

  return {
    pendingDraftToRestore,
    draftBoxEntries,
    draftRestored,
    lastSavedDraftAt,
    handleRestorePendingDraft,
    handleManualDraftSave,
    handleClearDraft,
    handleClearDraftBox,
    handleRestoreDraftFromBox,
    handleDeleteDraftFromBox,
    handleSubmitSuccess,
  }
}
