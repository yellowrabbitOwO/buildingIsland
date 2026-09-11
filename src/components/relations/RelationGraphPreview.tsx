import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { RelationGraphView } from "../../data/types";
import { getRelationsForWorld } from "../../data/repositories/relation";
import { forceLayout, treeLayout } from "../../data/relationGraphLayout";
import { PALETTE, PannableCanvas, DraggableNode, ArrowMarkerDefs, EdgeLabel, NodeShape, branchPath, type ManualPositions } from "../common/GraphPrimitives";
import { useLanguage } from "../../i18n";

const NODE_R = 20;

/** 已儲存關係圖的唯讀預覽：節點/連線即時算出，套用該圖已存的個人化設定（隱藏節點/分類、位置、網格），
 * 但不可拖曳節點、不開子選單、也不會把任何東西寫回資料庫——只給主世界首頁直接檢視、可縮放平移用 */
export default function RelationGraphPreview({ view, worldId }: { view: RelationGraphView; worldId: string }) {
  const { t } = useLanguage();
  const entries = useLiveQuery(() => db.entries.where({ worldId }).toArray(), [worldId]);
  const relations = useLiveQuery(() => getRelationsForWorld(worldId), [worldId]);

  const entryById = useMemo(() => new Map((entries ?? []).map((e) => [e.id, e])), [entries]);

  const hiddenCategoryIds = new Set(view.hiddenCategoryIds);
  const hiddenNodeIds = new Set(view.hiddenNodeIds);

  const nodes = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => !hiddenCategoryIds.has(e.categoryId) && !hiddenNodeIds.has(e.id))
        .map((e) => ({ id: e.id, name: e.name, categoryId: e.categoryId })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries, view.hiddenCategoryIds, view.hiddenNodeIds]
  );

  const visibleNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const edges = useMemo(() => {
    const list: { id: string; from: string; to: string; label: string }[] = [];
    for (const r of relations ?? []) {
      if (!visibleNodeIds.has(r.fromEntryId) || !visibleNodeIds.has(r.toEntryId)) continue;
      const fromEntry = entryById.get(r.fromEntryId);
      const field = fromEntry?.fields.find((f) => f.id === r.fromFieldId);
      const slot = r.fromSlotId ? field?.extraSlots?.find((s) => s.id === r.fromSlotId) : undefined;
      const label = slot
        ? `${field?.label ?? t("relationGraphViewPage.relationFieldFallback")}／${slot.label ?? t("relationGraphViewPage.subValueFallback")}`
        : (field?.label ?? t("relationGraphViewPage.relationFieldFallback"));
      list.push({ id: r.id, from: r.fromEntryId, to: r.toEntryId, label });
    }
    return list;
  }, [relations, entryById, visibleNodeIds, t]);

  const categories = useLiveQuery(() => db.categories.where({ worldId }).sortBy("order"), [worldId]);
  const categoryIndex = useMemo(() => new Map((categories ?? []).map((c, i) => [c.id, i])), [categories]);
  const colorForCategory = (categoryId: string) => PALETTE[(categoryIndex.get(categoryId) ?? 0) % PALETTE.length];

  const width = 760;
  const height = 420;
  const contentSize = Math.max(500, Math.round(Math.sqrt(Math.max(1, nodes.length)) * 200));

  // 只在本地補算尚未存過位置的節點座標，不寫回資料庫——這裡是唯讀預覽；
  // 樹狀圖模式要用 treeLayout 補算新節點，否則新節點會用力導向演算法算出的位置，跟正式編輯畫面顯示的階層位置對不上
  const positions = useMemo(() => {
    const nodeIds = nodes.map((n) => n.id);
    if (view.layoutMode === "tree") {
      const computed = treeLayout(nodeIds, edges, contentSize);
      // computed 每次都依「目前全部節點」重新置中，位移量會隨節點增減變動；用一個兩邊都存在的錨點節點
      // 校正新節點的偏移，讓補算出來的新節點跟已存的舊節點座標系一致（比照 RelationGraphViewPage 的做法）
      const anchor = nodeIds.find((id) => view.positions[id] && computed[id]);
      const dx = anchor ? view.positions[anchor].x - computed[anchor].x : 0;
      const dy = anchor ? view.positions[anchor].y - computed[anchor].y : 0;
      const result: ManualPositions = {};
      for (const n of nodes) {
        const saved = view.positions[n.id];
        result[n.id] = saved ?? { x: computed[n.id].x + dx, y: computed[n.id].y + dy };
      }
      return result;
    }
    const pinned: ManualPositions = {};
    for (const n of nodes) {
      const known = view.positions[n.id];
      if (known) pinned[n.id] = known;
    }
    return forceLayout(nodeIds, edges, pinned, contentSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, contentSize, view.positions, view.layoutMode]);

  if (!entries || !relations) return null;
  if (nodes.length === 0) return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("relationGraphViewPage.noEntriesToShow")}</p>;

  const arrowId = `preview-arrow-${view.id}`;

  return (
    <PannableCanvas
      width={width}
      height={height}
      contentWidth={contentSize}
      contentHeight={contentSize}
      grid={view.gridVisible ? { style: view.alignMode === "none" ? "line" : view.alignMode, size: view.gridSize } : undefined}
      // view.viewport 是使用者在「整頁」關係圖畫布（900×640，見 RelationGraphViewPage.tsx）按「儲存」
      // 時記錄的縮放平移狀態；這裡的預覽卡片固定是 760×420，尺寸不同，直接套用會跟整頁畫布本身的
      // embedded 情境犯一樣的錯（見該檔案 initialView 那行的說明）——所以一律不還原，改用自動置中縮放
    >
      {view.groups.map((g) => {
        const barWidth = Math.max(70, g.title.length * 9 + 20);
        return (
          <g key={g.id}>
            <rect x={g.x} y={g.y} width={g.width} height={g.height} rx={10} fill={g.color} fillOpacity={0.12} stroke={g.color} strokeWidth={2} />
            <rect x={g.x} y={g.y - 24} width={barWidth} height={24} rx={6} fill={g.color} />
            <text x={g.x + 10} y={g.y - 7} fontSize={12} fill="#fff">
              {g.title || t("relationGraphViewPage.groupDialog.defaultGroupTitle")}
            </text>
          </g>
        );
      })}
      <ArrowMarkerDefs id={arrowId} />
      {edges.map((e) => {
        const p1 = positions[e.from];
        const p2 = positions[e.to];
        if (!p1 || !p2) return null;
        const path = branchPath(p1.x, p1.y, p2.x, p2.y, "curved");
        return (
          <g key={e.id}>
            <path d={path} fill="none" stroke="var(--border)" strokeWidth={1.5} markerEnd={`url(#${arrowId})`} />
            <EdgeLabel x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} text={e.label} />
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = positions[n.id] ?? { x: contentSize / 2, y: contentSize / 2 };
        return (
          <DraggableNode key={n.id} id={n.id} x={p.x} y={p.y}>
            <NodeShape shape="circle" x={p.x} y={p.y} w={NODE_R * 2} h={NODE_R * 2} fill={colorForCategory(n.categoryId)} />
            <text
              x={p.x}
              y={p.y + NODE_R + 15}
              fontSize={11}
              textAnchor="middle"
              fill="var(--text)"
              stroke="var(--bg)"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {n.name.length > 10 ? n.name.slice(0, 10) + "…" : n.name || t("common.unnamed")}
            </text>
          </DraggableNode>
        );
      })}
    </PannableCanvas>
  );
}
