import { useLiveQuery } from "dexie-react-hooks";
import type { Storyboard } from "../../data/types";
import { listCards } from "../../data/repositories/storyboardCard";
import { useLanguage } from "../../i18n";

/** 主世界首頁「★ 重點內容」用的唯讀縮圖：故事板的內容本質上不是空間性的，不需要像分支敘事圖／關係圖
 * 那樣掛整個可縮放 SVG 畫布——每個 lane（依 order 排序）一行「{lane.name}・{N} 張卡片」，
 * 底下接最多 3 張卡片標題 */
export default function StoryboardPreview({ storyboard }: { storyboard: Storyboard }) {
  const { t } = useLanguage();
  const cards = useLiveQuery(() => listCards(storyboard.id), [storyboard.id]);
  if (!cards) return null;

  const sortedLanes = [...storyboard.lanes].sort((a, b) => a.order - b.order);
  // 未分類卡片（laneId === ""）不屬於任何一個 lane，不會出現在上面 sortedLanes 的迴圈裡——
  // 漏掉這段的話，卡在「未分類」的卡片會在這個縮圖裡完全消失，使用者會看到跟實際board不符的少算張數
  const unassignedCards = cards.filter((c) => !c.laneId).sort((a, b) => a.order - b.order);

  if (sortedLanes.length === 0 && unassignedCards.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("storyboardPreview.noLanes")}</p>;
  }

  const renderLaneRow = (key: string, name: string, laneCards: typeof cards) => (
    <div key={key} style={{ fontSize: 13 }}>
      <strong>{name}</strong>
      <span style={{ color: "var(--text-faint)" }}> ・ {t("storyboardListCard.cardCount", { count: laneCards.length })}</span>
      {laneCards.length > 0 && (
        <p
          style={{
            margin: "2px 0 0",
            color: "var(--text-muted)",
            fontSize: 12,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {laneCards
            .slice(0, 3)
            .map((c) => c.title)
            .join("、")}
        </p>
      )}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sortedLanes.map((lane) =>
        renderLaneRow(
          lane.id,
          lane.name,
          cards.filter((c) => c.laneId === lane.id).sort((a, b) => a.order - b.order)
        )
      )}
      {unassignedCards.length > 0 && renderLaneRow("__unassigned__", t("entryCard.unfiled"), unassignedCards)}
    </div>
  );
}
