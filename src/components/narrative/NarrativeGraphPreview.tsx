import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import type { Passage, PassageChoice, NarrativeGraph } from "../../data/types";
import { useResolvedColor } from "../../data/colorResolve";
import { listPassages } from "../../data/repositories/passage";
import { PannableCanvas, DraggableNode, ArrowMarkerDefs, EdgeLabel, branchPath, NARRATIVE_GRAPH_GRID } from "../common/GraphPrimitives";
import { useLanguage } from "../../i18n";

const NODE_W = 130;
const NODE_H = 46;

function truncateTitle(title: string, fallback: string): string {
  const s = title || fallback;
  return s.length > 12 ? s.slice(0, 12) + "…" : s;
}

/** 唯讀縮圖裡的一條選項連結：顏色/粗細/上下文字都跟主編輯畫布套用同一套個人化設定，
 * 不然使用者在編輯畫布調過的樣式，縮圖卻還是預設外觀，會誤以為沒存到 */
function PreviewChoiceEdge({
  x1,
  y1,
  x2,
  y2,
  choice,
  arrowMarkerId,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  choice: PassageChoice;
  arrowMarkerId: string;
}) {
  const { t } = useLanguage();
  const path = branchPath(x1, y1, x2, y2, "curved");
  const lineColor = useResolvedColor(choice.lineColor) ?? "var(--border)";
  const aboveColor = useResolvedColor(choice.aboveTextColor) ?? "var(--text-muted)";
  const belowColor = useResolvedColor(choice.belowTextColor) ?? "var(--text-muted)";
  return (
    <g>
      <path d={path} fill="none" stroke={lineColor} strokeWidth={choice.lineWidth ?? 1.5} markerEnd={`url(#${arrowMarkerId})`} />
      <EdgeLabel
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        text={choice.aboveText || choice.label || t("narrativeGraphViewPage.unnamedChoice")}
        fontSize={choice.aboveTextSize ?? 11}
        color={aboveColor}
      />
      {choice.belowText && (
        <EdgeLabel x1={x1} y1={y1} x2={x2} y2={y2} text={choice.belowText} dy={14} fontSize={choice.belowTextSize ?? 11} color={belowColor} />
      )}
    </g>
  );
}

/** 唯讀縮圖裡的一個段落節點：底色／文字顏色／顯示寬高都跟主編輯畫布一致，未設定則用縮圖自己的預設值 */
function PreviewPassageNode({ passage, isStart }: { passage: Passage; isStart: boolean }) {
  const { t } = useLanguage();
  const bgColor = useResolvedColor(passage.bgColor) ?? "var(--bg-elevated)";
  const textColor = useResolvedColor(passage.textColor) ?? "var(--text)";
  const w = passage.width ?? NODE_W;
  const h = passage.height ?? NODE_H;
  return (
    <DraggableNode id={passage.id} x={passage.position.x} y={passage.position.y}>
      <rect
        x={passage.position.x - w / 2}
        y={passage.position.y - h / 2}
        width={w}
        height={h}
        rx={8}
        fill={bgColor}
        stroke={isStart ? "var(--accent)" : "var(--border)"}
        strokeWidth={isStart ? 2 : 1.5}
      />
      <text x={passage.position.x} y={passage.position.y + 4} fontSize={12} textAnchor="middle" fill={textColor}>
        {isStart ? "▶ " : ""}
        {truncateTitle(passage.title, t("narrativeGraphViewPage.unnamedPassage"))}
      </text>
    </DraggableNode>
  );
}

/** 已儲存分支敘事圖的唯讀預覽：段落位置已經是各自存好的一手資料，不用像關係圖那樣補算——
 * 直接照存檔的位置畫，不可拖曳、不會寫回資料庫，只給主世界首頁檢視、可縮放平移用。
 * embedded／panelWidth：在側邊面板裡顯示時，畫布的 SVG 內部座標系要照面板實際寬度縮小，
 * 而不是永遠畫 760 寬再靠 CSS max-width 硬壓——760 寬的網格線壓縮到只剩 ~300px 寬的面板裡會糊成一片，
 * 跟分支敘事完整編輯畫面（NarrativeGraphViewPage）在側邊面板裡的做法一致 */
export default function NarrativeGraphPreview({
  graph,
  embedded,
  panelWidth,
}: {
  graph: NarrativeGraph;
  embedded?: boolean;
  panelWidth?: number;
}) {
  const { t } = useLanguage();
  const passages = useLiveQuery(() => listPassages(graph.id), [graph.id]);

  const edges = useMemo(() => {
    if (!passages) return [];
    const ids = new Set(passages.map((p) => p.id));
    return passages.flatMap((p) =>
      p.choices.filter((c) => c.targetPassageId && ids.has(c.targetPassageId)).map((c) => ({ id: c.id, from: p.id, to: c.targetPassageId!, choice: c }))
    );
  }, [passages]);

  if (!passages) return null;
  if (passages.length === 0) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("narrativeGraphPreview.noPassages")}</p>;

  const width = embedded ? Math.max(240, (panelWidth ?? 360) - 40) : 760;
  const height = Math.round(width * (420 / 760));
  const maxX = Math.max(300, ...passages.map((p) => p.position.x));
  const maxY = Math.max(300, ...passages.map((p) => p.position.y));
  const contentSize = Math.max(500, maxX + 200, maxY + 200);
  const arrowId = `narrative-preview-arrow-${graph.id}`;

  return (
    <PannableCanvas width={width} height={height} contentWidth={contentSize} contentHeight={contentSize} grid={NARRATIVE_GRAPH_GRID}>
      <ArrowMarkerDefs id={arrowId} />
      {edges.map((e) => {
        const p1 = passages.find((p) => p.id === e.from)?.position;
        const p2 = passages.find((p) => p.id === e.to)?.position;
        if (!p1 || !p2) return null;
        return <PreviewChoiceEdge key={e.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} choice={e.choice} arrowMarkerId={arrowId} />;
      })}
      {passages.map((p) => (
        <PreviewPassageNode key={p.id} passage={p} isStart={graph.startPassageId === p.id} />
      ))}
    </PannableCanvas>
  );
}
