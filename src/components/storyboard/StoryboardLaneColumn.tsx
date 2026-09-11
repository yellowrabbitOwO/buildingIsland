import { useState, type CSSProperties } from "react";
import type { StoryboardCard, StoryboardLane } from "../../data/types";
import type { useLaneDragReorder } from "../../data/reorder";
import StoryboardCardRow from "./StoryboardCardRow";
import { useLanguage } from "../../i18n";

/** 故事板的一個「幕/區塊」：標題列（就地改名、拖曳把手可調整 lane 順序、刪除 lane）、
 * 快速新增卡片輸入框、橫向捲動的卡片列。lane 本身的拖曳排序（laneHandleProps/laneRowProps）
 * 由外層 StoryboardViewPage 用既有的 useDragReorder 提供；卡片的拖曳排序（drag）用新的
 * useLaneDragReorder，因為卡片要能跨 lane 搬移 */
export default function StoryboardLaneColumn({
  lane,
  cards,
  drag,
  entryNameById,
  laneHandleProps,
  laneRowProps,
  laneDropIndicatorStyle,
  onRename,
  onDelete,
  onQuickAdd,
  onOpenCard,
}: {
  lane: StoryboardLane;
  cards: StoryboardCard[];
  drag: ReturnType<typeof useLaneDragReorder>;
  entryNameById: Map<string, string>;
  laneHandleProps: object;
  laneRowProps: object;
  laneDropIndicatorStyle: CSSProperties;
  onRename: (name: string) => void;
  onDelete: () => void;
  onQuickAdd: (title: string) => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { t } = useLanguage();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(lane.name);
  const [quickAddValue, setQuickAddValue] = useState("");

  const commitRename = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== lane.name) onRename(trimmed);
    else setNameDraft(lane.name);
    setRenaming(false);
  };

  const commitQuickAdd = () => {
    const trimmed = quickAddValue.trim();
    if (!trimmed) return;
    onQuickAdd(trimmed);
    setQuickAddValue("");
  };

  return (
    <div
      {...laneRowProps}
      {...drag.laneDropProps(lane.id)}
      style={{
        borderRadius: 8,
        border: "1px solid var(--border)",
        padding: "10px 12px",
        ...laneDropIndicatorStyle,
        ...drag.laneHighlightStyle(lane.id),
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span {...laneHandleProps} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("storyboardLaneColumn.dragToReorderTitle")}>
          ⠿
        </span>
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setNameDraft(lane.name);
                setRenaming(false);
              }
            }}
            style={{ fontWeight: 700, fontSize: 14 }}
          />
        ) : (
          <strong style={{ fontSize: 14, cursor: "text" }} onClick={() => setRenaming(true)} title={t("storyboardLaneColumn.clickToRenameTitle")}>
            {lane.name}
          </strong>
        )}
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{t("storyboardListCard.cardCount", { count: cards.length })}</span>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost" title={t("storyboardLaneColumn.deleteLaneTitle")} onClick={onDelete}>
          🗑
        </button>
      </div>
      <StoryboardCardRow cards={cards} laneId={lane.id} drag={drag} entryNameById={entryNameById} onOpenCard={onOpenCard}>
        <input
          value={quickAddValue}
          onChange={(e) => setQuickAddValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitQuickAdd();
          }}
          placeholder={t("storyboardLaneColumn.quickAddPlaceholder")}
          style={{ width: 140, flexShrink: 0, alignSelf: "flex-start" }}
        />
      </StoryboardCardRow>
    </div>
  );
}
