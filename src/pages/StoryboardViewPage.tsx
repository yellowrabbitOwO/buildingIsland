import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { StoryboardCard, World } from "../data/types";
import { deleteStoryboard, getStoryboard, toggleStoryboardStar, updateStoryboardLanes, updateStoryboardMeta } from "../data/repositories/storyboard";
import { createCard, listCards, reorderCard, updateCard, deleteCard as deleteCardRepo } from "../data/repositories/storyboardCard";
import { db, newId } from "../data/db";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import ColorInput from "../components/common/ColorInput";
import { useDragReorder, useLaneDragReorder } from "../data/reorder";
import { useSaveShortcut } from "../data/useSaveShortcut";
import StoryboardLaneColumn from "../components/storyboard/StoryboardLaneColumn";
import StoryboardCardRow from "../components/storyboard/StoryboardCardRow";
import StoryboardCardEditorModal from "../components/storyboard/StoryboardCardEditorModal";
import { storyboardToManuscript } from "../data/manuscript/storyboardToManuscript";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import ManuscriptExportDialog from "../components/manuscript/ManuscriptExportDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { useLanguage } from "../i18n";

/** 「未分類」的特殊卡片區——不是 lanes 陣列裡的一個真正的 lane，用這個固定的空字串當 laneId 識別；
 * 卡片一開始都在這裡建立，使用者再拖到有意義的區塊裡去。跟真正的 lane 不同，沒有改名/刪除/排序這些
 * lane 管理功能，只有一顆「新增卡片」按鈕（點了直接開完整編輯彈窗），卡片本身一樣可以拖曳搬到別的區塊 */
const UNASSIGNED_LANE_ID = "";

interface MetaDraft {
  name: string;
  description?: string;
  tagColor?: string;
}

/** useLiveQuery 查詢還沒回來時的後備空陣列——用模組層級的固定參照而非每次 render 都建一個新的 []，
 * 否則下面 useMemo 的依賴永遠是新參照，記憶化形同虛設 */
const EMPTY_CARDS: StoryboardCard[] = [];
const EMPTY_ENTRY_IDS: string[] = [];

interface StoryboardViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的故事板渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  storyboardIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：刪除故事板後改關閉面板而非導覽主畫面網址 */
  embedded?: boolean;
  /** embedded 時回報標題/簡述草稿是否有未儲存變更；拖曳卡片/lane 增刪改都是即時寫入，不算「未存」 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 故事板本體：多個可自由增減/改名/排序的 lane，每個 lane 裡放可跨 lane 拖曳的卡片。
 * 拖曳、lane 增刪改、快速新增卡片都是即時寫入 Dexie（比照 NarrativeGraphViewPage／RelationGraphViewPage
 * 畫布本身的做法），只有故事板自己的標題/簡述/標題色用編輯/取消/儲存的草稿模式，跟其他頁面一致 */
export default function StoryboardViewPage({
  storyboardIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: StoryboardViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ storyboardId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const storyboardId = storyboardIdOverride ?? params.storyboardId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel, closePanel } = useSidePanel();
  const { t } = useLanguage();
  // 供 handleAddUnassignedCard 這類非同步操作在 await 之後判斷「使用者是否已經切到別的故事板」用
  const storyboardIdRef = useRef(storyboardId);
  useEffect(() => {
    storyboardIdRef.current = storyboardId;
  }, [storyboardId]);

  const board = useLiveQuery(() => (storyboardId ? getStoryboard(storyboardId) : undefined), [storyboardId]);
  const cards = useLiveQuery(() => (storyboardId ? listCards(storyboardId) : []), [storyboardId]) ?? EMPTY_CARDS;

  const [editing, setEditing] = useState(false);
  const [metaDraft, setMetaDraft] = useState<MetaDraft | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);

  const hasMetaChanges =
    editing &&
    metaDraft !== null &&
    board != null &&
    JSON.stringify(metaDraft) !== JSON.stringify({ name: board.name, description: board.description, tagColor: board.tagColor });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => !embedded && hasMetaChanges && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state !== "blocked") return;
    (async () => {
      const ok = await confirm({
        title: t("entryPage.leaveConfirm.title"),
        message: t("timelineViewPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker, confirm]);

  useEffect(() => {
    onDirtyChange?.(hasMetaChanges);
  }, [hasMetaChanges, onDirtyChange]);

  const cardsByLane = useMemo(() => {
    const map: Record<string, typeof cards> = {};
    for (const c of cards) (map[c.laneId] ??= []).push(c);
    for (const laneId in map) map[laneId].sort((a, b) => a.order - b.order);
    return map;
  }, [cards]);

  // 整塊板子所有卡片引用到的相關資訊卡，一次查完、做成 id→名稱的表往下傳，不要讓每張卡片自己各查一次——
  // 否則板上任何一張卡片異動時，所有卡片的 useLiveQuery 依賴都會一起變成新參照，一次拖曳觸發整塊板的查詢風暴
  const allRelatedEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of cards) for (const id of c.relatedEntryIds) ids.add(id);
    return ids.size ? Array.from(ids) : EMPTY_ENTRY_IDS;
  }, [cards]);
  const relatedEntries = useLiveQuery(
    () => (allRelatedEntryIds.length ? db.entries.bulkGet(allRelatedEntryIds) : []),
    [allRelatedEntryIds]
  );
  const entryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of relatedEntries ?? []) if (e) map.set(e.id, e.name);
    return map;
  }, [relatedEntries]);

  const sortedLanes = useMemo(() => [...(board?.lanes ?? [])].sort((a, b) => a.order - b.order), [board?.lanes]);

  const laneReorder = useDragReorder(sortedLanes, (next) => {
    if (!board) return;
    updateStoryboardLanes(board.id, next.map((l, i) => ({ ...l, order: i })));
  });

  const cardDrag = useLaneDragReorder((cardId, targetLaneId, targetCardId, position) => {
    const laneCards = cardsByLane[targetLaneId] ?? [];
    let index = targetCardId ? laneCards.findIndex((c) => c.id === targetCardId) : laneCards.length;
    if (index === -1) index = laneCards.length;
    if (targetCardId && position === "after") index += 1;
    // 同一 lane 內搬移時，laneCards 還包含被拖曳的卡片本身；reorderCard 會先把它從清單中移除才插入，
    // 若它原本的位置在目標索引之前，移除後右邊全部往前補一格，這裡的索引要跟著減一才會對齊使用者實際放開的位置
    // （對照 useDragReorder.rowProps 裡 `if (dragIndex < to) to -= 1` 的同一種補償邏輯）
    const sourceIndex = laneCards.findIndex((c) => c.id === cardId);
    if (sourceIndex !== -1 && sourceIndex < index) index -= 1;
    reorderCard(cardId, targetLaneId, index);
  });

  // handleSaveMeta 要等下面的 null 檢查過了才能定義（裡面要用到窄化過型別的 board），但 hook
  // 呼叫本身不能被那個檢查擋住（否則 board 從 undefined 變有值時，hook 呼叫次數會在兩次 render
  // 之間不一致）——所以用一個 ref 轉一手：這裡先無條件掛上 shortcut，實際要跑的函式晚點再指定
  const handleSaveMetaRef = useRef<() => void>(() => {});
  useSaveShortcut(() => handleSaveMetaRef.current(), editing);

  if (!board || !worldId) return null;

  const startEdit = () => {
    setMetaDraft({ name: board.name, description: board.description, tagColor: board.tagColor });
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSaveMeta = async () => {
    if (!metaDraft) return;
    await updateStoryboardMeta(board.id, metaDraft);
    setMetaDraft(null);
    setEditing(false);
  };
  handleSaveMetaRef.current = handleSaveMeta;
  const handleDelete = async () => {
    const ok = await confirm({
      title: t("storyboardListCard.deleteConfirm.title"),
      message: t("storyboardListCard.deleteConfirm.message", { name: board.name }),
    });
    if (!ok) return;
    await deleteStoryboard(board.id);
    if (embedded) {
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/storyboard`);
    }
  };

  const handleAddLane = () => {
    // 用函式式更新（讀取當下 DB 最新值再疊加），不要用 render 快照的 sortedLanes 直接算好整個新陣列
    // 傳出去——否則快速連點兩下「＋新增區塊」，第二次呼叫用到的可能還是還沒回灌最新 lanes 的舊快照，
    // 會把第一次剛新增的區塊悄悄蓋掉
    updateStoryboardLanes(board.id, (current) => {
      const sorted = [...current].sort((a, b) => a.order - b.order);
      return [...sorted, { id: newId(), name: t("storyboardViewPage.newLaneDefaultName"), order: sorted.length }];
    });
  };
  const handleRenameLane = (laneId: string, name: string) => {
    updateStoryboardLanes(board.id, (current) => current.map((l) => (l.id === laneId ? { ...l, name } : l)));
  };
  const handleDeleteLane = async (laneId: string, laneName: string) => {
    const laneCardCount = (cardsByLane[laneId] ?? []).length;
    const ok = await confirm({
      title: t("storyboardLaneColumn.deleteLaneTitle"),
      message:
        laneCardCount > 0
          ? t("storyboardViewPage.deleteLaneConfirm.messageWithCards", { name: laneName, count: laneCardCount })
          : t("storyboardViewPage.deleteLaneConfirm.message", { name: laneName }),
    });
    if (!ok) return;
    await Promise.all((cardsByLane[laneId] ?? []).map((c) => deleteCardRepo(c.id)));
    await updateStoryboardLanes(board.id, (current) => current.filter((l) => l.id !== laneId));
  };

  const handleAddUnassignedCard = async () => {
    const targetBoardId = board.id;
    const card = await createCard(targetBoardId, UNASSIGNED_LANE_ID, { title: t("storyboardCardEditorModal.unnamedCard") });
    // 建卡是非同步的，若這段等待期間使用者已經切到別的故事板（例如側邊面板換了目標），
    // 卡片仍正確建在原本的板子裡，只是不要再對著現在畫面上這個不相干的板子彈出編輯視窗
    if (storyboardIdRef.current !== targetBoardId) return;
    setOpenCardId(card.id);
  };

  const openCard = cards.find((c) => c.id === openCardId);
  const unassignedCards = cardsByLane[UNASSIGNED_LANE_ID] ?? [];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          {editing ? (
            <input
              autoFocus
              style={{ fontSize: 20, fontFamily: "var(--font-serif)", width: "100%" }}
              value={metaDraft?.name ?? ""}
              onChange={(e) => setMetaDraft((d) => (d ? { ...d, name: e.target.value } : d))}
            />
          ) : (
            <h2 style={{ margin: 0 }}>{board.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "storyboard", storyboardId: board.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleStoryboardStar(board.id)}
            style={{ color: board.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {board.starred ? "★" : "☆"}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("storyboardViewPage.tagColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSaveMeta}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setShowExport(true)}>
                {t("writingDocViewPage.exportManuscriptButton")}
              </button>
              <button className="btn" onClick={() => setShowHistory(true)}>
                {t("common.versionHistory")}
              </button>
              <button className="btn btn-primary" onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                {t("common.delete")}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <input
          style={{ width: "100%", marginBottom: 12 }}
          placeholder={t("mapViewPage.descriptionPlaceholder")}
          value={metaDraft?.description ?? ""}
          onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
        />
      ) : (
        board.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>{board.description}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {sortedLanes.map((lane, i) => (
          <StoryboardLaneColumn
            key={lane.id}
            lane={lane}
            cards={cardsByLane[lane.id] ?? []}
            drag={cardDrag}
            entryNameById={entryNameById}
            laneHandleProps={laneReorder.handleProps(i)}
            laneRowProps={laneReorder.rowProps(i)}
            laneDropIndicatorStyle={laneReorder.dropIndicatorStyle(i)}
            onRename={(name) => handleRenameLane(lane.id, name)}
            onDelete={() => handleDeleteLane(lane.id, lane.name)}
            onQuickAdd={(title) => createCard(board.id, lane.id, { title })}
            onOpenCard={setOpenCardId}
          />
        ))}
        <button className="btn" onClick={handleAddLane} style={{ alignSelf: "flex-start" }}>
          {t("storyboardViewPage.addLaneButton")}
        </button>

        <div
          {...cardDrag.laneDropProps(UNASSIGNED_LANE_ID)}
          style={{
            borderRadius: 8,
            border: "1px dashed var(--border)",
            padding: "10px 12px",
            ...cardDrag.laneHighlightStyle(UNASSIGNED_LANE_ID),
          }}
        >
          <StoryboardCardRow cards={unassignedCards} laneId={UNASSIGNED_LANE_ID} drag={cardDrag} entryNameById={entryNameById} onOpenCard={setOpenCardId}>
            <button className="btn" onClick={handleAddUnassignedCard} style={{ flexShrink: 0, alignSelf: "flex-start" }}>
              {t("storyboardLaneColumn.quickAddPlaceholder")}
            </button>
          </StoryboardCardRow>
        </div>
      </div>

      {openCard && (
        <StoryboardCardEditorModal
          card={openCard}
          worldId={worldId}
          onClose={() => setOpenCardId(null)}
          onSave={(patch) => updateCard(openCard.id, patch)}
          onDelete={() => deleteCardRepo(openCard.id)}
        />
      )}

      {showExport && (
        <ManuscriptExportDialog
          manuscript={storyboardToManuscript(board, cards, entryNameById, currentLocalUser?.name, t)}
          onClose={() => setShowExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="storyboards" entityId={board.id} onClose={() => setShowHistory(false)} />}
    </div>
  );
}
