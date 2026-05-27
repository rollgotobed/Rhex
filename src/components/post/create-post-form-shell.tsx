"use client"

import { createElement, useState, type ComponentPropsWithoutRef, type ReactNode } from "react"
import { ChevronDown, Coins, Gavel, Gift, Info, Loader2, MessageSquareText, Vote, type LucideIcon } from "lucide-react"

import { AddonSurfaceClientRenderer } from "@/addons-host/client/addon-surface-client-renderer"
import { BoardSelectField } from "@/components/board/board-select-field"
import {
  AuctionSettingsSection,
  BountySettingsSection,
  LotterySettingsSection,
  PollSettingsSection,
  PostEnhancementsSection,
} from "@/components/post/create-post-form-sections"
import { PostDraftNotice, type PostDraftNoticeAction } from "@/components/post/post-draft-notice"
import { AddonEditor } from "@/components/addon-editor"
import { Modal } from "@/components/ui/modal"
import { Button } from "@/components/ui/rbutton"
import { Tooltip } from "@/components/ui/tooltip"
import { showConfirm } from "@/components/ui/alert-dialog"
import { PostDraftBox } from "@/components/post/post-draft-box"
import type { MarkdownEmojiItem } from "@/lib/markdown-emoji"
import type { AccessThresholdOption } from "@/lib/access-threshold-options"
import type { CreatePostFormBoardGroup } from "@/components/post/create-post-form.shared"
import type { CreatePostDraftController } from "@/components/post/use-create-post-draft"
import type { CreatePostSubmitController } from "@/components/post/use-create-post-submit"
import type { LocalPostType } from "@/lib/post-types"
import { formatDateTime } from "@/lib/formatters"

interface CreatePostFormShellProps {
  boardOptions: CreatePostFormBoardGroup[]
  pointName: string
  addonCaptcha?: ReactNode
  addonFormBefore?: ReactNode
  addonFormAfter?: ReactNode
  addonToolsBefore?: ReactNode
  addonToolsAfter?: ReactNode
  addonEditorBefore?: ReactNode
  addonEditorAfter?: ReactNode
  addonEnhancementsBefore?: ReactNode
  addonEnhancementsAfter?: ReactNode
  addonSubmitBefore?: ReactNode
  addonSubmitAfter?: ReactNode
  markdownEmojiMap?: MarkdownEmojiItem[]
  viewLevelOptions: AccessThresholdOption[]
  viewVipLevelOptions: AccessThresholdOption[]
  vipMonthlyPrice: number
  vipQuarterlyPrice: number
  vipYearlyPrice: number
  postJackpotHitProbability: number
  draftController: CreatePostDraftController
  submitController: CreatePostSubmitController
}

function getPostTypeIcon(type: LocalPostType): LucideIcon {
  switch (type) {
    case "BOUNTY":
      return Coins
    case "POLL":
      return Vote
    case "LOTTERY":
      return Gift
    case "AUCTION":
      return Gavel
    case "NORMAL":
    default:
      return MessageSquareText
  }
}

function PostTypeIcon({ type, ...props }: { type: LocalPostType } & ComponentPropsWithoutRef<"svg">) {
  return createElement(getPostTypeIcon(type), props)
}

export function CreatePostFormShell({
  boardOptions,
  pointName,
  addonCaptcha,
  addonFormBefore,
  addonFormAfter,
  addonToolsBefore,
  addonToolsAfter,
  addonEditorBefore,
  addonEditorAfter,
  addonEnhancementsBefore,
  addonEnhancementsAfter,
  addonSubmitBefore,
  addonSubmitAfter,
  markdownEmojiMap,
  viewLevelOptions,
  viewVipLevelOptions,
  vipMonthlyPrice,
  vipQuarterlyPrice,
  vipYearlyPrice,
  postJackpotHitProbability,
  draftController,
  submitController,
}: CreatePostFormShellProps) {
  const {
    isEditMode,
    draft,
    pendingDraftToRestore,
    draftBoxEntries,
    showBoardTips,
    draftRestored,
    lastSavedDraftAt,
    normalizedPollOptions,
    fixedRedPacketTotalPoints,
    effectiveRewardPoolOptions,
    showRewardPoolEntry,
    selectedBoard,
    autoBoardPendingSelection,
    availablePostTypes,
    selectedPostTypeOption,
    autoExtractedTags,
    canUseAutoBoardSelection,
    boardSelectionMode,
    setBoardSelectionMode,
    aiSuggestedBoard,
    aiSuggestionPending,
    aiSuggestionError,
    shouldShowAttachmentEntry,
    minPostVipLevel,
    canPostInBoard,
    currentVipLevel,
    currentUserSummary,
    currentUserVipClassName,
    anonymousPostEnabled,
    anonymousPostPrice,
    postJackpotMinInitialPoints,
    postJackpotReplyIncrementPoints,
    currentUser,
    patchDraft,
    updateDraftField,
    setShowBoardTips,
    setActiveModal,
    setTagModalOpen,
    setAttachmentModalOpen,
    setCoverModalOpen,
    setRewardPoolModalOpen,
    handleRestorePendingDraft,
    handleManualDraftSave,
    handleClearDraft,
    handleClearDraftBox,
    handleRestoreDraftFromBox,
    handleDeleteDraftFromBox,
    removeManualTag,
    updatePollOption,
    addPollOption,
    removePollOption,
    updateLotteryPrize,
    addLotteryPrize,
    removeLotteryPrize,
    updateLotteryCondition,
    addLotteryCondition,
    addLotteryConditionGroup,
    removeLotteryCondition,
    removeLotteryConditionGroup,
    resolveAvailableRewardPoolMode,
  } = draftController

  const { loading, showSlowSubmitHint, slowSubmitWaitSeconds, handleSubmit } =
    submitController
  const [draftBoxModalOpen, setDraftBoxModalOpen] = useState(false)

  const hasDraftBoxEntries = draftBoxEntries.length > 0
  const draftMetaTimestamp = pendingDraftToRestore?.updatedAt ?? lastSavedDraftAt
  const draftSyncTooltipContent =
    "按 Ctrl/Cmd+S 会立即保存当前草稿。恢复其他草稿后，后续自动保存会继续更新那一份。"
  const draftNoticeActions: PostDraftNoticeAction[] = []

  if (pendingDraftToRestore) {
    draftNoticeActions.push({
      label: "恢复",
      onClick: handleRestorePendingDraft,
      variant: "outline",
    })
  }

  if (pendingDraftToRestore || hasDraftBoxEntries) {
    draftNoticeActions.push({
      label: "删除",
      onClick: handleClearDraft,
      variant: "ghost",
    })
  }

  if (hasDraftBoxEntries) {
    draftNoticeActions.push({
      label: `草稿箱 (${draftBoxEntries.length})`,
      onClick: () => setDraftBoxModalOpen(true),
      variant: "ghost",
    })
  }

  draftNoticeActions.push({
    label: "保存",
    onClick: () => {
      handleManualDraftSave()
      setDraftBoxModalOpen(true)
    },
    variant: "outline",
  })

  const draftNoticeTitleText = pendingDraftToRestore
    ? `草稿箱中有 ${draftBoxEntries.length} 份草稿`
    : lastSavedDraftAt
      ? draftRestored
        ? "已恢复草稿"
        : "当前草稿已同步"
      : hasDraftBoxEntries
        ? "草稿箱已启用"
        : "草稿状态"

  const draftNoticeTitle = (
    <span className="inline-flex items-center gap-1.5">
      <span>{draftNoticeTitleText}</span>
      {!pendingDraftToRestore ? (
        <Tooltip content={draftSyncTooltipContent}>
          <span className="inline-flex size-4 items-center justify-center rounded-full text-current/70 transition-colors hover:text-current">
            <Info className="h-3 w-3" />
          </span>
        </Tooltip>
      ) : null}
    </span>
  )

  const draftNoticeDescription = pendingDraftToRestore
    ? `你在${isEditMode ? "编辑帖子" : "发帖"}页的草稿箱里有历史草稿，可先恢复最近一份。`
    : undefined
  const postTypeHelperText = isEditMode
    ? "编辑模式下暂不允许切换帖子类型。"
    : selectedPostTypeOption
      ? `当前类型：${selectedPostTypeOption.label}，${selectedPostTypeOption.hint}${anonymousPostEnabled ? "，可按需搭配匿名发布" : ""}。`
      : "选择帖子类型后，下方会展开对应扩展配置。"

  const toolsContent = (
    <>
      {addonToolsBefore}
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-2">
          <p className="text-sm font-medium">选择节点</p>
          {!isEditMode && canUseAutoBoardSelection && boardSelectionMode === "auto" ? (
            <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
              <p className="text-sm leading-7 text-muted-foreground">
                节点会在你点击发布时，根据标题和正文由 AI 自动选择。
                <button
                  type="button"
                  className="ml-1 text-foreground underline underline-offset-4 transition-opacity hover:opacity-70"
                  onClick={() => setBoardSelectionMode("manual")}
                >
                  切换至手动选择？
                </button>
              </p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                {aiSuggestionError
                  ? aiSuggestionError
                  : selectedBoard
                    ? `当前匹配节点：${selectedBoard.label}（${selectedBoard.value}）`
                    : autoBoardPendingSelection
                      ? null
                      : aiSuggestedBoard
                        ? `当前匹配节点：${aiSuggestedBoard.name}（${aiSuggestedBoard.slug}）`
                        : "暂未匹配到节点，可继续补充内容或切换为手动选择。"}
              </p>
            </div>
          ) : (
            <>
              <BoardSelectField
                value={draft.boardSlug}
                onChange={(value) => updateDraftField("boardSlug", value)}
                boardOptions={boardOptions}
                disabled={isEditMode}
              />
              <p className="text-xs leading-6 text-muted-foreground">
                {isEditMode
                  ? "编辑模式下暂不允许切换节点。"
                  : canUseAutoBoardSelection
                    ? (
                        <>
                          已切换为手动选择。
                          <button
                            type="button"
                            className="ml-1 text-foreground underline underline-offset-4 transition-opacity hover:opacity-70"
                            onClick={() => setBoardSelectionMode("auto")}
                          >
                            切换回 AI 自动选择？
                          </button>
                        </>
                      )
                    : "选择一个合适的节点发布内容"}
              </p>
            </>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">帖子类型</p>
            <p className="text-xs text-muted-foreground">选择后再填写对应内容</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div className="space-y-3">
              <div className="relative">
                {selectedPostTypeOption ? (
                  <span className="pointer-events-none absolute top-1/2 left-2.5 flex -translate-y-1/2 items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
                      <PostTypeIcon type={selectedPostTypeOption.value} className="h-4 w-4" />
                    </span>
                  </span>
                ) : null}
                <select
                  value={draft.postType}
                  onChange={(event) => updateDraftField("postType", event.target.value as LocalPostType)}
                  disabled={isEditMode}
                  aria-label="帖子类型"
                  className="h-11 w-full appearance-none rounded-full border border-border bg-card pr-10 pl-12 text-sm font-medium text-foreground outline-hidden transition-colors hover:bg-accent/35 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {availablePostTypes.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            {!isEditMode && anonymousPostEnabled ? (
              <label className="flex h-11 shrink-0 items-center justify-between gap-3 rounded-full border border-border bg-card px-4 text-sm sm:min-w-[168px]">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="font-medium">匿名发布</span>
                  <Tooltip
                    content={`开启后显示为匿名账号，发布额外扣除 ${anonymousPostPrice} ${pointName}`}
                    enableMobileTap
                  >
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground">
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  </Tooltip>
                </span>
                <input
                  type="checkbox"
                  checked={draft.isAnonymous}
                  onChange={(event) =>
                    updateDraftField("isAnonymous", event.target.checked)}
                  className="h-4 w-4"
                />
              </label>
            ) : null}
          </div>
          <p className="text-xs leading-6 text-muted-foreground">{postTypeHelperText}</p>
        </div>
      </div>

      {!canPostInBoard ? (
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-left"
            onClick={() => setShowBoardTips((current) => !current)}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Info className="h-4 w-4 text-muted-foreground" />
              <span>发帖提示与权限要求</span>
            </div>
            <ChevronDown
              className={
                showBoardTips
                  ? "h-4 w-4 rotate-180 text-muted-foreground transition-transform"
                  : "h-4 w-4 text-muted-foreground transition-transform"
              }
            />
          </button>
          {showBoardTips ? (
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              {selectedBoard?.allowUserPost === false && currentUser.role !== "ADMIN" && currentUser.role !== "MODERATOR" ? (
                <p>当前节点仅管理员和版主可发帖。</p>
              ) : null}
              <p>
                当前节点要求：最低{pointName} {selectedBoard?.minPostPoints ?? 0}
                ，最低等级 Lv.{selectedBoard?.minPostLevel ?? 0}，最低 VIP 等级{" "}
                {minPostVipLevel}，
                {selectedBoard?.requirePostReview ? "发帖后需审核" : "发帖默认直发"}。
              </p>
              <p>
                当前账号：
                <span className={currentUserVipClassName}>{currentUserSummary.split(" · ")[0]}</span>
                {` · Lv.${currentUser.level} · ${currentUser.points} ${pointName} ${draftController.isVipActive ? `· VIP ${currentVipLevel}` : "· 非 VIP"}`}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {!canPostInBoard ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {selectedBoard?.allowUserPost === false && currentUser.role !== "ADMIN" && currentUser.role !== "MODERATOR"
            ? "当前节点仅管理员和版主可发帖。"
            : `当前不满足该节点发帖权限，请提升${pointName}、等级、VIP 等级或开通 VIP 后再试。`}
        </div>
      ) : null}

      {draft.postType === "BOUNTY" ? (
        <BountySettingsSection
          pointName={pointName}
          bountyPoints={draft.bountyPoints}
          onBountyPointsChange={(value) => updateDraftField("bountyPoints", value)}
          disabled={isEditMode}
        />
      ) : null}

      {draft.postType === "AUCTION" ? (
        <AuctionSettingsSection
          pointName={pointName}
          auctionMode={draft.auctionMode}
          auctionPricingRule={draft.auctionPricingRule}
          auctionStartPrice={draft.auctionStartPrice}
          auctionIncrementStep={draft.auctionIncrementStep}
          auctionStartsAt={draft.auctionStartsAt}
          auctionEndsAt={draft.auctionEndsAt}
          auctionWinnerOnlyContent={draft.auctionWinnerOnlyContent}
          auctionWinnerOnlyContentPreview={draft.auctionWinnerOnlyContentPreview}
          onAuctionModeChange={(value) => updateDraftField("auctionMode", value)}
          onAuctionPricingRuleChange={(value) => updateDraftField("auctionPricingRule", value)}
          onAuctionStartPriceChange={(value) => updateDraftField("auctionStartPrice", value)}
          onAuctionIncrementStepChange={(value) => updateDraftField("auctionIncrementStep", value)}
          onAuctionStartsAtChange={(value) => updateDraftField("auctionStartsAt", value)}
          onAuctionEndsAtChange={(value) => updateDraftField("auctionEndsAt", value)}
          onAuctionWinnerOnlyContentChange={(value) => updateDraftField("auctionWinnerOnlyContent", value)}
          onAuctionWinnerOnlyContentPreviewChange={(value) => updateDraftField("auctionWinnerOnlyContentPreview", value)}
          disabled={isEditMode}
        />
      ) : null}

      {draft.postType === "POLL" ? (
        <PollSettingsSection
          pollOptions={draft.pollOptions}
          normalizedPollOptionsCount={normalizedPollOptions.length}
          pollExpiresAt={draft.pollExpiresAt}
          onPollOptionChange={updatePollOption}
          onPollExpiresAtChange={(value) => updateDraftField("pollExpiresAt", value)}
          onAddPollOption={addPollOption}
          onRemovePollOption={removePollOption}
          disabled={isEditMode}
        />
      ) : null}

      {draft.postType === "LOTTERY" ? (
        <LotterySettingsSection
          pointName={pointName}
          lotteryStartsAt={draft.lotteryStartsAt}
          lotteryEndsAt={draft.lotteryEndsAt}
          lotteryParticipantGoal={draft.lotteryParticipantGoal}
          lotteryPrizes={draft.lotteryPrizes}
          lotteryConditions={draft.lotteryConditions}
          userLevelOptions={viewLevelOptions}
          vipLevelOptions={viewVipLevelOptions}
          vipMonthlyPrice={vipMonthlyPrice}
          vipQuarterlyPrice={vipQuarterlyPrice}
          vipYearlyPrice={vipYearlyPrice}
          onLotteryStartsAtChange={(value) => updateDraftField("lotteryStartsAt", value)}
          onLotteryEndsAtChange={(value) => updateDraftField("lotteryEndsAt", value)}
          onLotteryParticipantGoalChange={(value) =>
            updateDraftField("lotteryParticipantGoal", value)}
          onLotteryPrizeChange={updateLotteryPrize}
          onAddLotteryPrize={addLotteryPrize}
          onRemoveLotteryPrize={removeLotteryPrize}
          onLotteryConditionChange={updateLotteryCondition}
          onAddLotteryConditionGroup={addLotteryConditionGroup}
          onAddLotteryCondition={addLotteryCondition}
          onRemoveLotteryCondition={removeLotteryCondition}
          onRemoveLotteryConditionGroup={removeLotteryConditionGroup}
          disabled={isEditMode}
        />
      ) : null}
      {addonToolsAfter}
    </>
  )

  const editorContent = (
    <div className="space-y-2">
      {addonEditorBefore}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">公开正文</p>
        <p className="text-xs text-muted-foreground">请遵守社区规则，文明发帖！</p>
      </div>
      <AddonEditor
        context="post"
        value={draft.content}
        onChange={(value) => updateDraftField("content", value)}
        placeholder="文明社区，文明发言。支持 Markdown 语法"
        markdownEmojiMap={markdownEmojiMap}
      />
      {addonEditorAfter}
    </div>
  )

  const enhancementsContent = (
    <>
      {addonEnhancementsBefore}
      <PostEnhancementsSection
        pointName={pointName}
        rewardPoolEnabled={showRewardPoolEntry}
        settings={{
          finalTags: draft.manualTags,
          autoExtractedTags,
          coverUploading: draftController.coverUploading,
          coverPath: draft.coverPath,
          commentsVisibleToAuthorOnly: draft.commentsVisibleToAuthorOnly,
          loginUnlockContent: draft.loginUnlockContent,
          replyUnlockContent: draft.replyUnlockContent,
          purchaseUnlockContent: draft.purchaseUnlockContent,
          purchasePrice: draft.purchasePrice,
          minViewLevel: draft.minViewLevel,
          minViewVipLevel: draft.minViewVipLevel,
          redPacketEnabled: draft.redPacketEnabled,
          redPacketMode: draft.redPacketMode,
          redPacketGrantMode: draft.redPacketGrantMode,
          redPacketTriggerType: draft.redPacketTriggerType,
          jackpotInitialPoints: draft.jackpotInitialPoints,
          fixedRedPacketTotalPoints,
          postJackpotMinInitialPoints,
          postJackpotReplyIncrementPoints,
          postJackpotHitProbability,
          rewardPoolEditable: !isEditMode,
          showAttachmentEntry: shouldShowAttachmentEntry,
          attachmentCount: draft.attachments.length,
        }}
        actions={{
          onOpenTagModal: () => setTagModalOpen(true),
          onOpenAttachmentModal: () => setAttachmentModalOpen(true),
          onOpenCoverModal: () => setCoverModalOpen(true),
          onRemoveManualTag: removeManualTag,
          onCoverClear: () => updateDraftField("coverPath", ""),
          onCommentsVisibleToAuthorOnlyChange: (checked) =>
            updateDraftField("commentsVisibleToAuthorOnly", checked),
          onOpenLoginModal: () => setActiveModal("login"),
          onClearLoginUnlock: () => updateDraftField("loginUnlockContent", ""),
          onOpenReplyModal: () => setActiveModal("reply"),
          onClearReplyUnlock: () => updateDraftField("replyUnlockContent", ""),
          onOpenPurchaseModal: () => setActiveModal("purchase"),
          onClearPurchaseUnlock: () =>
            patchDraft({ purchaseUnlockContent: "", purchasePrice: "20" }),
          onOpenViewLevelModal: () => setActiveModal("view-level"),
          onClearViewLevel: () =>
            patchDraft({ minViewLevel: "0", minViewVipLevel: "0" }),
          onOpenRewardPoolModal: () => setRewardPoolModalOpen(true),
          onClearRewardPool: () =>
            patchDraft({
              redPacketEnabled: false,
              redPacketMode: resolveAvailableRewardPoolMode(
                draft.redPacketMode,
                effectiveRewardPoolOptions,
              ),
              jackpotInitialPoints: String(postJackpotMinInitialPoints),
              redPacketGrantMode: "FIXED",
              redPacketClaimOrderMode: "FIRST_COME_FIRST_SERVED",
              redPacketTriggerType: "REPLY",
              redPacketUnitPoints: "10",
              redPacketTotalPoints: "10",
              redPacketPacketCount: "1",
            }),
          onRedPacketEnabledChange: (checked) =>
            patchDraft({
              redPacketEnabled: checked,
              ...(checked
                ? {
                    redPacketMode: resolveAvailableRewardPoolMode(
                      draft.redPacketMode,
                      effectiveRewardPoolOptions,
                    ),
                  }
                : {}),
            }),
          onRedPacketModeChange: (value) => updateDraftField("redPacketMode", value),
          onRedPacketGrantModeChange: (value) =>
            updateDraftField("redPacketGrantMode", value),
          onRedPacketClaimOrderModeChange: (value) =>
            updateDraftField("redPacketClaimOrderMode", value),
          onRedPacketTriggerTypeChange: (value) =>
            updateDraftField("redPacketTriggerType", value),
          onJackpotInitialPointsChange: (value) =>
            updateDraftField("jackpotInitialPoints", value),
          onRedPacketValueChange: (value) => {
            if (draft.redPacketGrantMode === "FIXED") {
              updateDraftField("redPacketUnitPoints", value)
              return
            }
            updateDraftField("redPacketTotalPoints", value)
          },
          onRedPacketPacketCountChange: (value) =>
            updateDraftField("redPacketPacketCount", value),
        }}
      />
      {addonEnhancementsAfter}
    </>
  )

  const submitContent = (
    <>
      {addonSubmitBefore}
      <div className="flex flex-wrap items-start justify-between gap-2 sm:flex-nowrap sm:items-center">
        <div>
          <PostDraftNotice
            title={draftNoticeTitle}
            description={draftNoticeDescription}
            meta={draftMetaTimestamp ? `保存于 ${formatDateTime(draftMetaTimestamp)}` : undefined}
            tone={pendingDraftToRestore ? "warning" : "info"}
            size="dense"
            actions={draftNoticeActions}
            className="w-full"
          />
          {loading && showSlowSubmitHint ? (
            <PostDraftNotice
              title={isEditMode ? "保存仍在处理中" : "发帖仍在处理中"}
              description={
                `已等待 ${slowSubmitWaitSeconds} 秒。服务器当前响应较慢，请勿重复提交；创建完成后会自动跳转到帖子详情页。`
              }
              tone="warning"
              size="dense"
              className="mt-2 w-full"
            />
          ) : null}
        </div>
        <Button
          className="h-8 rounded-full px-4 text-xs sm:h-9 sm:px-4 sm:text-sm"
          disabled={loading || !canPostInBoard}
        >
          {loading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
              {aiSuggestionPending && !isEditMode
                ? "AI 分析中..."
                : isEditMode
                  ? "保存中..."
                  : "发布中..."}
            </>
          ) : isEditMode ? (
            "保存帖子"
          ) : (
            "发布帖子"
          )}
        </Button>
      </div>
      {addonSubmitAfter}
    </>
  )

  const formContent = (
    <>
      <AddonSurfaceClientRenderer
        surface="post.create.tools"
        surfaceProps={{
          boardOptions,
          canPostInBoard,
          currentUser,
          currentUserSummary,
          currentUserVipClassName,
          draft,
          draftController,
          isEditMode,
          minPostVipLevel,
          pointName,
          selectedBoard,
          selectedPostTypeOption,
          showBoardTips,
          viewLevelOptions,
          viewVipLevelOptions,
        }}
        fallback={toolsContent}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">标题</p>
        <input
          value={draft.title}
          onChange={(event) => updateDraftField("title", event.target.value)}
          className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-hidden"
          placeholder="写一个让人愿意点进来的标题"
        />
      </div>

      <AddonSurfaceClientRenderer
        surface="post.create.editor"
        surfaceProps={{
          draft,
          draftController,
          markdownEmojiMap,
        }}
        fallback={editorContent}
      />

      <AddonSurfaceClientRenderer
        surface="post.create.enhancements"
        surfaceProps={{
          draft,
          draftController,
          pointName,
        }}
        fallback={enhancementsContent}
      />

      {addonCaptcha}

      <AddonSurfaceClientRenderer
        surface="post.create.submit"
        surfaceProps={{
          canPostInBoard,
          draft,
          draftController,
          pointName,
          submitController,
        }}
        fallback={submitContent}
      />
    </>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {addonFormBefore}
      <AddonSurfaceClientRenderer
        surface="post.create.form"
        surfaceProps={{
          addonCaptcha,
          boardOptions,
          draft,
          draftController,
          pointName,
          submitController,
          viewLevelOptions,
          viewVipLevelOptions,
        }}
        fallback={formContent}
      />
      {addonFormAfter}
      <Modal
        open={draftBoxModalOpen}
        onClose={() => setDraftBoxModalOpen(false)}
        title="草稿箱"
        description="自动保存和手动保存都会更新对应草稿；恢复后会继续写回当前这份。"
        size="lg"
      >
        <PostDraftBox
          entries={draftBoxEntries}
          onRestore={(draftId) => {
            handleRestoreDraftFromBox(draftId)
            setDraftBoxModalOpen(false)
          }}
          onDelete={handleDeleteDraftFromBox}
          onClearAll={async () => {
            const confirmed = await showConfirm({
              title: "清空草稿箱",
              description: "这会删除当前页面保存的全部本地草稿，无法恢复。",
              confirmText: "清空草稿箱",
              cancelText: "取消",
              variant: "danger",
            })

            if (!confirmed) {
              return
            }

            handleClearDraftBox()
          }}
        />
      </Modal>
    </form>
  )
}
