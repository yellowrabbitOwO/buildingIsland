import type { ReactNode } from "react";
import type { StoryboardCard } from "../../data/types";
import type { useLaneDragReorder } from "../../data/reorder";
import StoryboardCardChip from "./StoryboardCardChip";

/** 一個 lane（或「未分類」區）裡橫向捲動的卡片列；`StoryboardLaneColumn`（真正的 lane）跟
 * `StoryboardViewPage` 的「未分類」特殊區都是「外層一個有拖放屬性的容器＋裡面這一排卡片」，
 * 兩邊原本各自獨立刻了一份一模一樣的卡片列 JSX，容易改一邊漏改另一邊，所以抽出來共用；
 * 拖放容器本身（laneDropProps／樣式）留在各自呼叫端，因為兩邊的外層容器長得不一樣（有沒有標題列）。
 * `children` 放在卡片列最後——真正的 lane 傳快速新增輸入框，「未分類」區傳「＋ 新增卡片」按鈕 */
export default function StoryboardCardRow({
  cards,
  laneId,
  drag,
  entryNameById,
  onOpenCard,
  children,
}: {
  cards: StoryboardCard[];
  laneId: string;
  drag: ReturnType<typeof useLaneDragReorder>;
  entryNameById: Map<string, string>;
  onOpenCard: (cardId: string) => void;
  children?: ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {cards.map((card) => (
        <StoryboardCardChip
          key={card.id}
          card={card}
          laneId={laneId}
          drag={drag}
          entryNameById={entryNameById}
          onOpen={() => onOpenCard(card.id)}
        />
      ))}
      {children}
    </div>
  );
}
