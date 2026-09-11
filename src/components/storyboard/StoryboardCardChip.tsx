import type { StoryboardCard } from "../../data/types";
import type { useLaneDragReorder } from "../../data/reorder";
import { useLanguage } from "../../i18n";

const CHIP_WIDTH = 220;

/** lane 裡的一張卡片：拖曳把手＋標題＋時間/地點＋內容／情緒轉折／衝突／相關資訊卡名稱——全部完整顯示，
 * 不截斷；卡片高度隨內容自然撐開（「自動拉長」），寬度維持固定，內容一多就讓 lane 那排卡片變長，
 * 靠 lane 本身既有的橫向捲動（overflowX: auto）左右滑動查看，而不是每張卡片自己變寬。
 * 點擊（把手以外的地方）開啟編輯彈窗 */
export default function StoryboardCardChip({
  card,
  laneId,
  drag,
  entryNameById,
  onOpen,
}: {
  card: StoryboardCard;
  laneId: string;
  drag: ReturnType<typeof useLaneDragReorder>;
  /** id→名稱的查表，由外層 StoryboardViewPage 對整塊板子只查一次、bulkGet 一次——
   * 不在每張卡片自己各查一次，否則板上任何一張卡片異動（拖曳/存檔）都會讓 useLiveQuery 依賴的
   * card 物件重新建立參照，害每一張卡片同時重新觸發自己的 bulkGet，一次拖曳變成整塊板的查詢風暴 */
  entryNameById: Map<string, string>;
  onOpen: () => void;
}) {
  const { t } = useLanguage();
  const meta = [card.time, card.location].filter(Boolean).join(" · ");
  const dragging = drag.dragCardId === card.id;
  const relatedNames = card.relatedEntryIds.map((id) => entryNameById.get(id)).filter((n): n is string => !!n);

  return (
    <div
      {...drag.cardDropProps(laneId, card.id)}
      style={{
        width: CHIP_WIDTH,
        flexShrink: 0,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        padding: "8px 10px",
        cursor: "pointer",
        opacity: dragging ? 0.5 : 1,
        ...drag.dropIndicatorStyle(card.id),
      }}
      onClick={onOpen}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        <span
          {...drag.handleProps(card.id, laneId)}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "grab", color: "var(--text-faint)", flexShrink: 0 }}
          title={t("storyboardCardChip.dragToReorderTitle")}
        >
          ⠿
        </span>
        <strong style={{ fontSize: 13, flex: 1, minWidth: 0, overflowWrap: "break-word" }}>{card.title}</strong>
      </div>
      {meta && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-faint)", overflowWrap: "break-word" }}>{meta}</p>
      )}
      {card.content && (
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
          {card.content}
        </p>
      )}
      {card.emotionalTurn && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", overflowWrap: "break-word" }}>
          <span style={{ color: "var(--text-faint)" }}>{t("storyboardCardChip.emotionalTurnLabel")}</span>
          {card.emotionalTurn}
        </p>
      )}
      {card.conflict && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", overflowWrap: "break-word" }}>
          <span style={{ color: "var(--text-faint)" }}>{t("storyboardCardChip.conflictLabel")}</span>
          {card.conflict}
        </p>
      )}
      {relatedNames.length > 0 && (
        <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", overflowWrap: "break-word" }}>
          🔗 {relatedNames.join("、")}
        </p>
      )}
    </div>
  );
}
