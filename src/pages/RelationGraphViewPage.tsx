import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db, newId } from "../data/db";
import type { RelationGraphGroup, World } from "../data/types";
import { getRelationsForWorld } from "../data/repositories/relation";
import {
  deleteRelationGraph,
  getRelationGraph,
  switchRelationGraphLayout,
  toggleRelationGraphStar,
  updateRelationGraphMeta,
  updateRelationGraphState,
} from "../data/repositories/relationGraph";
import { forceLayout, treeLayout } from "../data/relationGraphLayout";
import {
  PALETTE,
  PannableCanvas,
  DraggableNode,
  ArrowMarkerDefs,
  EdgeLabel,
  NodeShape,
  branchPath,
  alignPosition,
  type ManualPositions,
  type GridStyle,
} from "../components/common/GraphPrimitives";
import Modal from "../components/common/Modal";
import { CanvasWorkbench } from "../components/common/CanvasWorkbench";
import ColorInput from "../components/common/ColorInput";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { svgToRaster } from "../data/manuscript/exportGraphImage";
import { buildImagePdfBlob } from "../data/manuscript/exportPdf";
import ImageExportDialog from "../components/manuscript/ImageExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { useLanguage, categoryDisplayName } from "../i18n";

interface GraphNode {
  id: string;
  name: string;
  categoryId: string;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

const NODE_R = 24;

/** 一條關係圖連接線：曲線＋箭頭＋欄位名稱標註 */
function RelationEdge({
  x1,
  y1,
  x2,
  y2,
  label,
  arrowMarkerId,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  arrowMarkerId: string;
}) {
  const path = branchPath(x1, y1, x2, y2, "curved");
  return (
    <g>
      <path d={path} fill="none" stroke="var(--border)" strokeWidth={1.5} markerEnd={`url(#${arrowMarkerId})`} />
      <EdgeLabel x1={x1} y1={y1} x2={x2} y2={y2} text={label} />
    </g>
  );
}

/** 節點點擊子選單：前往條目／從此圖隱藏。portal 掛載到 body，仿 DropdownMenu 的全螢幕遮罩關閉手法
 * （不直接用 DropdownMenu 是因為它的觸發元素要求 HTMLButtonElement，SVG <g> 節點用不上） */
function NodeContextMenu({
  x,
  y,
  onGoToEntry,
  onHide,
  onClose,
}: {
  x: number;
  y: number;
  onGoToEntry: () => void;
  onHide?: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const left = Math.min(x, window.innerWidth - 140);
  const top = Math.min(y, window.innerHeight - 90);
  return createPortal(
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 9000 }} onClick={onClose} />
      <div
        className="card"
        style={{ position: "fixed", left, top, zIndex: 9001, padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 120 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="btn-ghost"
          style={{ textAlign: "left" }}
          onClick={() => {
            onGoToEntry();
            onClose();
          }}
        >
          {t("relationGraphViewPage.goToEntry")}
        </button>
        {onHide && (
          <button
            className="btn-ghost"
            style={{ textAlign: "left" }}
            title={t("relationGraphViewPage.hideNodeTitle")}
            onClick={() => {
              onHide();
              onClose();
            }}
          >
            {t("relationGraphViewPage.hideNode")}
          </button>
        )}
      </div>
    </>,
    document.body
  );
}

const GROUP_MIN_WIDTH = 80;
const GROUP_MIN_HEIGHT = 60;
const GROUP_TITLE_BAR_HEIGHT = 24;

/** 新增／編輯群組框的標題與顏色；大小與位置改用畫布上直接拖曳調整，這裡不用管 */
function GroupEditDialog({
  worldId,
  initial,
  onClose,
  onSubmit,
}: {
  worldId: string;
  initial: { title: string; color: string };
  onClose: () => void;
  onSubmit: (input: { title: string; color: string }) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [color, setColor] = useState(initial.color);
  const { t } = useLanguage();
  return (
    <Modal title={t("relationGraphViewPage.groupDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label>
          {t("relationGraphViewPage.groupDialog.titleLabel")}
          <input style={{ width: "100%", marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <ColorInput label={t("relationGraphViewPage.groupDialog.colorLabel")} value={color} onChange={setColor} worldId={worldId} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit({ title: title.trim() || t("relationGraphViewPage.groupDialog.defaultGroupTitle"), color })}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface RelationGraphViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的關係圖渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  graphIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：畫布尺寸改依面板寬度縮小、刪除圖後改關閉面板、點節點選單的「前往條目」
   * 改成在面板本身切換內容，都不導覽主畫面的網址 */
  embedded?: boolean;
  /** embedded 時回報目前是否處於編輯狀態（有可能尚未儲存的名稱／簡述／標題顏色變更），
   * 供側邊面板決定切換／關閉前是否要先確認 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一已儲存關係圖的畫布：節點/連線即時從世界的條目與關聯資料算出，
 * 只有隱藏節點/分類、位置、網格設定屬於這張圖自己的個人化資料 */
export default function RelationGraphViewPage({
  graphIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: RelationGraphViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ graphId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const graphId = graphIdOverride ?? params.graphId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { panelWidth, openPanel, closePanel } = useSidePanel();
  const arrowId = useId();
  const { t } = useLanguage();

  const view = useLiveQuery(() => (graphId ? getRelationGraph(graphId) : undefined), [graphId]);
  // worldId 理論上不會是空字串——查詢條件用 "" 只是讓 querier 在 worldId 還沒就緒的短暫瞬間仍回傳型別相符的空陣列，
  // 不用回傳 undefined（.toArray()／.sortBy() 的回傳型別本來就不含 undefined，回傳 undefined 會被 TS 擋下）
  const entries = useLiveQuery(() => db.entries.where({ worldId: worldId ?? "" }).toArray(), [worldId]);
  const categories = useLiveQuery(() => db.categories.where({ worldId: worldId ?? "" }).sortBy("order"), [worldId]);
  const relations = useLiveQuery(() => getRelationsForWorld(worldId ?? ""), [worldId]);

  const [menuFor, setMenuFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [metaDraft, setMetaDraft] = useState<{ name: string; description?: string; tagColor?: string } | null>(null);
  const [liveGroupPositions, setLiveGroupPositions] = useState<ManualPositions>({});
  const [liveGroupCorners, setLiveGroupCorners] = useState<ManualPositions>({});
  const [editingGroup, setEditingGroup] = useState<{ id: string | null; title: string; color: string } | null>(null);
  const [liveViewport, setLiveViewport] = useState<{ x: number; y: number; scale: number } | null>(null);
  // 非 embedded 時，畫布可視窗尺寸不再寫死 900×640，改成量測 CanvasWorkbench 實際分給畫布的
  // 容器尺寸（做法跟 MapViewPage 一致，見該檔案的說明）——寫死尺寸時，視窗比 640 矮就會被裁切
  // 成要內部捲動才看得到全部，視窗比較大則平白浪費版面分給畫布的空間
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [showImageExport, setShowImageExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const [measuredCanvasSize, setMeasuredCanvasSize] = useState<{ width: number; height: number } | null>(null);

  const entryById = useMemo(() => new Map((entries ?? []).map((e) => [e.id, e])), [entries]);

  const nodes: GraphNode[] = useMemo(
    () => (entries ?? []).map((e) => ({ id: e.id, name: e.name, categoryId: e.categoryId })),
    [entries]
  );

  const edges: GraphEdge[] = useMemo(() => {
    const list: GraphEdge[] = [];
    for (const r of relations ?? []) {
      const fromEntry = entryById.get(r.fromEntryId);
      if (!fromEntry || !entryById.has(r.toEntryId)) continue; // 防呆：略過指向已刪除條目的殘留關聯
      const field = fromEntry.fields.find((f) => f.id === r.fromFieldId);
      const slot = r.fromSlotId ? field?.extraSlots?.find((s) => s.id === r.fromSlotId) : undefined;
      const label = slot
        ? `${field?.label ?? t("relationGraphViewPage.relationFieldFallback")}／${slot.label ?? t("relationGraphViewPage.subValueFallback")}`
        : (field?.label ?? t("relationGraphViewPage.relationFieldFallback"));
      list.push({ id: r.id, from: r.fromEntryId, to: r.toEntryId, label });
    }
    return list;
  }, [relations, entryById, t]);

  const categoryIndex = useMemo(() => new Map((categories ?? []).map((c, i) => [c.id, i])), [categories]);
  const colorForCategory = (categoryId: string) => PALETTE[(categoryIndex.get(categoryId) ?? 0) % PALETTE.length];

  const hiddenCategoryIds = useMemo(() => new Set(view?.hiddenCategoryIds ?? []), [view?.hiddenCategoryIds]);
  const hiddenNodeIds = useMemo(() => new Set(view?.hiddenNodeIds ?? []), [view?.hiddenNodeIds]);
  const allSelected = hiddenCategoryIds.size === 0;

  const toggleCategory = (id: string) => {
    if (!view) return;
    const set = new Set(view.hiddenCategoryIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    updateRelationGraphState(view.id, { hiddenCategoryIds: [...set] });
  };
  const toggleAll = () => {
    if (!view) return;
    updateRelationGraphState(view.id, { hiddenCategoryIds: allSelected ? (categories ?? []).map((c) => c.id) : [] });
  };
  /** 重置：恢復全部顯示（節點與分類），並恢復到新建關係圖時的網格／對齊方式，
   * 因為調整過對齊方式後版面形狀會不一樣，使用者希望重置也一併復原 */
  const handleReset = () => {
    if (!view) return;
    updateRelationGraphState(view.id, {
      hiddenNodeIds: [],
      hiddenCategoryIds: [],
      gridVisible: false,
      alignMode: "none",
      gridSize: 24,
    });
  };

  const visibleNodes = nodes.filter((n) => !hiddenCategoryIds.has(n.categoryId) && !hiddenNodeIds.has(n.id));
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = edges.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to));

  const width = embedded ? Math.max(240, panelWidth - 40) : (measuredCanvasSize?.width ?? 900);
  const height = embedded ? 380 : (measuredCanvasSize?.height ?? 640);
  const contentSize = Math.max(700, Math.round(Math.sqrt(Math.max(1, visibleNodes.length)) * 220));

  const savedPositions = view?.positions ?? {};
  const [computedPositions, setComputedPositions] = useState<ManualPositions>({});
  const [livePositions, setLivePositions] = useState<ManualPositions>({});
  const processedKeyRef = useRef<string>("");

  const visibleNodeIdsKey = visibleNodes.map((n) => n.id).sort().join(",");
  const visibleEdgeIdsKey = visibleEdges.map((e) => e.id).sort().join(",");

  useEffect(() => {
    if (!view) return;
    const unpositioned = visibleNodes.filter((n) => !savedPositions[n.id] && !computedPositions[n.id]);
    if (unpositioned.length === 0) return;
    const key = unpositioned.map((n) => n.id).sort().join(",");
    if (processedKeyRef.current === key) return;
    processedKeyRef.current = key;

    const allIds = visibleNodes.map((n) => n.id);
    const pinned: ManualPositions = {};
    for (const n of visibleNodes) {
      const known = savedPositions[n.id] ?? computedPositions[n.id];
      if (known) pinned[n.id] = known;
    }
    const patch: ManualPositions = {};
    if (view.layoutMode === "tree") {
      // treeLayout 每次都依「目前全部節點」的邊界框重新置中，這個位移量會隨節點增減而變動；
      // 用一個兩次計算都存在的錨點節點（新舊都有算過）校正新節點的偏移，讓新節點跟已存的舊節點落在同一個座標系，
      // 否則舊節點原地不動、新節點卻用新的置中位移，兩者會對不齊（尤其是新節點掛在既有節點底下時）
      const result = treeLayout(allIds, visibleEdges, contentSize);
      const anchor = allIds.find((id) => pinned[id] && result[id]);
      const dx = anchor ? pinned[anchor].x - result[anchor].x : 0;
      const dy = anchor ? pinned[anchor].y - result[anchor].y : 0;
      for (const n of unpositioned) patch[n.id] = { x: result[n.id].x + dx, y: result[n.id].y + dy };
    } else {
      const result = forceLayout(allIds, visibleEdges, pinned, contentSize);
      for (const n of unpositioned) patch[n.id] = result[n.id];
    }
    setComputedPositions((prev) => ({ ...prev, ...patch }));
    updateRelationGraphState(view.id, { positions: patch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.id, view?.layoutMode, visibleNodeIdsKey, visibleEdgeIdsKey, contentSize]);

  const handleLayoutModeChange = async (mode: "force" | "tree") => {
    if (!view || mode === view.layoutMode) return;
    const ok = await confirm({
      title: t("relationGraphViewPage.switchLayoutConfirm.title"),
      message: t("relationGraphViewPage.switchLayoutConfirm.message"),
      confirmLabel: t("relationGraphViewPage.switchLayoutConfirm.confirmLabel"),
    });
    if (!ok) return;
    setComputedPositions({});
    setLivePositions({});
    processedKeyRef.current = "";
    await switchRelationGraphLayout(view.id, mode);
  };

  const posOf = (id: string) =>
    livePositions[id] ?? savedPositions[id] ?? computedPositions[id] ?? { x: contentSize / 2, y: contentSize / 2 };

  const handleDrag = (id: string, pos: { x: number; y: number }) => {
    const aligned = view ? alignPosition(pos, view.alignMode, view.gridSize) : pos;
    setLivePositions((prev) => ({ ...prev, [id]: aligned }));
  };
  const handleDragEnd = (id: string) => {
    if (!view) return;
    const pos = livePositions[id];
    if (!pos) return;
    updateRelationGraphState(view.id, { positions: { [id]: pos } });
  };
  const handleNodeClick = (id: string, clientX: number, clientY: number) => setMenuFor({ id, x: clientX, y: clientY });

  const handleGroupTitleDrag = (id: string, pos: { x: number; y: number }) => {
    setLiveGroupPositions((prev) => ({ ...prev, [id]: pos }));
    // 標題列拖曳只是移動整個框，寬高需維持不變——連帶把「右下角」也照同樣的位移量移動，
    // 否則畫面上寬高＝右下角－位置，位置變了但右下角沒跟著動，框就會被拖成變形
    const group = view?.groups.find((g) => g.id === id);
    if (group) setLiveGroupCorners((prev) => ({ ...prev, [id]: { x: pos.x + group.width, y: pos.y + group.height } }));
  };
  const handleGroupTitleDragEnd = (id: string) => {
    if (!view) return;
    const pos = liveGroupPositions[id];
    if (!pos) return;
    const next = view.groups.map((g) => (g.id === id ? { ...g, x: pos.x, y: pos.y } : g));
    updateRelationGraphState(view.id, { groups: next });
  };
  const handleGroupResizeDrag = (id: string, pos: { x: number; y: number }) => {
    setLiveGroupCorners((prev) => ({ ...prev, [id]: pos }));
  };
  const handleGroupResizeDragEnd = (id: string) => {
    if (!view) return;
    const corner = liveGroupCorners[id];
    const group = view.groups.find((g) => g.id === id);
    if (!corner || !group) return;
    const width = Math.max(GROUP_MIN_WIDTH, corner.x - group.x);
    const height = Math.max(GROUP_MIN_HEIGHT, corner.y - group.y);
    // corner 存的是拖曳當下未夾限的原始位置；拖過最小尺寸時矩形本身會被夾限住，
    // 這裡要把 corner 也校正回夾限後的座標，避免下次渲染時把手跟矩形邊角對不上
    setLiveGroupCorners((prev) => ({ ...prev, [id]: { x: group.x + width, y: group.y + height } }));
    const next = view.groups.map((g) => (g.id === id ? { ...g, width, height } : g));
    updateRelationGraphState(view.id, { groups: next });
  };
  const handleDeleteGroup = (id: string) => {
    if (!view) return;
    updateRelationGraphState(view.id, { groups: view.groups.filter((g) => g.id !== id) });
  };
  const handleSubmitGroupDialog = (input: { title: string; color: string }) => {
    if (!view) return;
    if (editingGroup?.id) {
      const next = view.groups.map((g) => (g.id === editingGroup.id ? { ...g, title: input.title, color: input.color } : g));
      updateRelationGraphState(view.id, { groups: next });
    } else {
      const newGroup: RelationGraphGroup = {
        id: newId(),
        x: contentSize / 2 - 140,
        y: contentSize / 2 - 90,
        width: 280,
        height: 180,
        color: input.color,
        title: input.title,
      };
      updateRelationGraphState(view.id, { groups: [...view.groups, newGroup] });
    }
    setEditingGroup(null);
  };

  const startEdit = () => {
    if (!view) return;
    setMetaDraft({ name: view.name, description: view.description, tagColor: view.tagColor });
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSave = async () => {
    if (!view || !metaDraft) return;
    await updateRelationGraphMeta(view.id, metaDraft);
    // view.viewport 是給「整頁」畫布（900x640）用的縮放平移狀態；embedded 時畫布尺寸小很多，
    // liveViewport 量到的是面板尺寸下的座標，存進去會污染整頁畫布下次還原時的視角，所以只在非 embedded 時儲存
    if (liveViewport && !embedded) await updateRelationGraphState(view.id, { viewport: liveViewport });
    setMetaDraft(null);
    setEditing(false);
  };
  useSaveShortcut(handleSave, editing);
  const handleDeleteGraph = async () => {
    if (!view) return;
    const ok = await confirm({
      title: t("relationGraphViewPage.deleteGraphConfirm.title"),
      message: t("relationGraphViewPage.deleteGraphConfirm.message", { name: view.name }),
    });
    if (!ok) return;
    await deleteRelationGraph(view.id);
    if (embedded) {
      // 圖已經刪除，就算還在編輯狀態也沒有東西好儲存了——先清掉面板的 dirty 標記，
      // 否則 closePanel() 會因為殘留的 dirty 狀態又跳出一次對不上情境的「未儲存變更」確認
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/relations`);
    }
  };

  const hasMetaChanges =
    editing &&
    metaDraft !== null &&
    view != null &&
    JSON.stringify(metaDraft) !== JSON.stringify({ name: view.name, description: view.description, tagColor: view.tagColor });

  useEffect(() => {
    onDirtyChange?.(hasMetaChanges);
  }, [hasMetaChanges, onDirtyChange]);

  // embedded 模式維持原本用 panelWidth 換算寬度、固定高度 380 的做法；非 embedded 才量測。
  // 依賴陣列的 fullyLoaded 要跟下面那行 early return 的條件完全一致（四個 useLiveQuery 都讀出來
  // 才算）——這四個查詢各自獨立非同步完成，時間點通常不同；如果只挑其中一個（例如 view）當依賴，
  // 很可能 view 最先讀出來、其他三個還沒好，此時 canvasHostRef 那個 DOM 節點根本還沒掛上去
  // （下面提早 return null 了），effect 抓不到 host 只能先跳過，但 viewLoaded 已經在那次就變成
  // true 了；等其餘三個也讀出來、DOM 真的掛上去的那次重新渲染，因為 viewLoaded 沒有再變化，
  // React 會直接跳過重跑這個 effect，永遠量不到尺寸、畫布也就永遠不會出現
  const fullyLoaded = !!view && !!entries && !!categories && !!relations && !!worldId;
  useLayoutEffect(() => {
    if (embedded) return;
    const host = canvasHostRef.current;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      setMeasuredCanvasSize({
        width: Math.max(240, Math.floor(rect.width)),
        height: Math.max(200, Math.floor(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [embedded, fullyLoaded]);

  if (!view || !entries || !categories || !relations || !worldId) return null;

  return (
    <>
      <CanvasWorkbench
        embedded={embedded}
        titleBar={
          <>
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
            <h2 style={{ margin: 0 }}>{view.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "relationGraph", graphId: view.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleRelationGraphStar(view.id)}
            style={{ color: view.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {view.starred ? "★" : "☆"}
          </button>
          <button className="btn-ghost" title={t("relationGraphViewPage.exportImageTitle")} onClick={() => setShowImageExport(true)}>
            {t("mapViewPage.exportImageLabel")}
          </button>
          <button className="btn-ghost" onClick={() => setShowHistory(true)}>
            {t("common.versionHistory")}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("relationGraphViewPage.tagColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" title={t("relationGraphViewPage.saveButtonTitle")} onClick={handleSave}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={handleDeleteGraph}>
                {t("common.delete")}
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <input
          style={{ width: "100%", marginBottom: 8 }}
          placeholder={t("mapViewPage.descriptionPlaceholder")}
          value={metaDraft?.description ?? ""}
          onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
        />
      ) : (
        view.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>{view.description}</p>
      )}
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("relationGraphViewPage.autoGeneratedHint")}
        {editing
          ? t("relationGraphViewPage.editingHint")
          : t("relationGraphViewPage.viewingHint")}
        {view.layoutMode === "tree" && t("relationGraphViewPage.treeLayoutHint")}
      </p>
          </>
        }
        sidePanel={
          editing && categories.length > 0 ? (
            <>
      {editing && categories.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ marginBottom: 4, fontSize: 13 }}>{t("relationGraphViewPage.showCategoriesLabel")}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              {t("relationGraphViewPage.selectAll")}
            </label>
            {categories.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                <input type="checkbox" checked={!hiddenCategoryIds.has(c.id)} onChange={() => toggleCategory(c.id)} />
                <span
                  style={{ width: 10, height: 10, borderRadius: 2, background: colorForCategory(c.id), display: "inline-block", flexShrink: 0 }}
                />
                {categoryDisplayName(c, t)}
              </label>
            ))}
          </div>
        </div>
      )}
          </>
        ) : undefined
        }
        toolbar={
          editing ? (
            <>
      {editing && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px", fontSize: 13 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {t("relationGraphViewPage.layoutModeLabel")}
            <select value={view.layoutMode} onChange={(e) => handleLayoutModeChange(e.target.value as "force" | "tree")}>
              <option value="force">{t("relationGraphViewPage.layoutMode.force")}</option>
              <option value="tree">{t("relationGraphViewPage.layoutMode.tree")}</option>
            </select>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={view.gridVisible}
              onChange={(e) => {
                const checked = e.target.checked;
                // 關閉網格顯示時一併把對齊方式收回「無」，避免使用者看不到對齊方式/間距欄位卻仍在悄悄貼齊
                updateRelationGraphState(view.id, checked ? { gridVisible: true } : { gridVisible: false, alignMode: "none" });
              }}
            />
            {t("relationGraphViewPage.gridVisibleLabel")}
          </label>
          {view.gridVisible && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {t("relationGraphViewPage.alignModeLabel")}
                <select
                  value={view.alignMode}
                  onChange={(e) => updateRelationGraphState(view.id, { alignMode: e.target.value as GridStyle })}
                >
                  <option value="none">{t("relationGraphViewPage.alignMode.none")}</option>
                  <option value="dot">{t("relationGraphViewPage.alignMode.dot")}</option>
                  <option value="line">{t("relationGraphViewPage.alignMode.line")}</option>
                  <option value="square">{t("relationGraphViewPage.alignMode.square")}</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {t("relationGraphViewPage.gridSpacingLabel")}
                <input
                  type="number"
                  min={8}
                  max={200}
                  value={view.gridSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!Number.isNaN(val) && val > 0) updateRelationGraphState(view.id, { gridSize: val });
                  }}
                  style={{ width: 60 }}
                />
              </label>
            </>
          )}
          <button className="btn" onClick={handleReset}>
            {t("relationGraphViewPage.resetButton")}
          </button>
          <button className="btn" onClick={() => setEditingGroup({ id: null, title: "", color: "#c9a463" })}>
            {t("relationGraphViewPage.addGroupButton")}
          </button>
        </div>
      )}
          </>
        ) : undefined
        }
      >
      <div ref={canvasHostRef} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      {visibleNodes.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{t("relationGraphViewPage.noEntriesToShow")}</p>
      ) : !(embedded || measuredCanvasSize) ? null : (
        <PannableCanvas
          width={width}
          height={height}
          contentWidth={contentSize}
          contentHeight={contentSize}
          grid={view.gridVisible ? { style: view.alignMode === "none" ? "line" : view.alignMode, size: view.gridSize } : undefined}
          showZoomInput
          // view.viewport 是使用者在「整頁」畫布（900x640）按「儲存」時記錄的縮放平移狀態；
          // embedded 時畫布尺寸依面板寬度縮小很多，直接套用會整個跑出可視範圍外（縮放位移是針對原本尺寸算的），
          // 所以側邊面板一律不還原已存視角，改用自動置中縮放
          initialView={embedded ? undefined : view.viewport}
          onViewChange={setLiveViewport}
        >
          {view.groups.map((g) => {
            const pos = liveGroupPositions[g.id] ?? { x: g.x, y: g.y };
            const corner = liveGroupCorners[g.id] ?? { x: g.x + g.width, y: g.y + g.height };
            const w = Math.max(GROUP_MIN_WIDTH, corner.x - pos.x);
            const h = Math.max(GROUP_MIN_HEIGHT, corner.y - pos.y);
            const barWidth = Math.max(70, g.title.length * 9 + 46);
            return (
              <g key={g.id}>
                <rect x={pos.x} y={pos.y} width={w} height={h} rx={10} fill={g.color} fillOpacity={0.12} stroke={g.color} strokeWidth={2} />
                <DraggableNode
                  id={g.id}
                  x={pos.x}
                  y={pos.y}
                  onDrag={editing ? handleGroupTitleDrag : undefined}
                  onDragEnd={editing ? handleGroupTitleDragEnd : undefined}
                  onClick={editing ? () => setEditingGroup({ id: g.id, title: g.title, color: g.color }) : undefined}
                >
                  <rect x={pos.x} y={pos.y - GROUP_TITLE_BAR_HEIGHT} width={barWidth} height={GROUP_TITLE_BAR_HEIGHT} rx={6} fill={g.color} />
                  <text x={pos.x + 10} y={pos.y - 7} fontSize={12} fill="#fff">
                    {g.title || t("relationGraphViewPage.groupDialog.defaultGroupTitle")}
                  </text>
                  {editing && (
                    <text
                      x={pos.x + barWidth - 16}
                      y={pos.y - 7}
                      fontSize={12}
                      fill="#fff"
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteGroup(g.id);
                      }}
                    >
                      ✕
                    </text>
                  )}
                </DraggableNode>
                {editing && (
                  <DraggableNode id={g.id} x={corner.x} y={corner.y} onDrag={handleGroupResizeDrag} onDragEnd={handleGroupResizeDragEnd}>
                    <rect
                      x={corner.x - 8}
                      y={corner.y - 8}
                      width={16}
                      height={16}
                      rx={3}
                      fill={g.color}
                      style={{ cursor: "nwse-resize" }}
                    />
                  </DraggableNode>
                )}
              </g>
            );
          })}
          <ArrowMarkerDefs id={arrowId} />
          {visibleEdges.map((e) => {
            const p1 = posOf(e.from);
            const p2 = posOf(e.to);
            return <RelationEdge key={e.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} label={e.label} arrowMarkerId={arrowId} />;
          })}
          {visibleNodes.map((n) => {
            const p = posOf(n.id);
            return (
              <DraggableNode
                key={n.id}
                id={n.id}
                x={p.x}
                y={p.y}
                onDrag={editing ? handleDrag : undefined}
                onDragEnd={editing ? handleDragEnd : undefined}
                onClick={handleNodeClick}
              >
                <NodeShape shape="circle" x={p.x} y={p.y} w={NODE_R * 2} h={NODE_R * 2} fill={colorForCategory(n.categoryId)} />
                <text
                  x={p.x}
                  y={p.y + NODE_R + 16}
                  fontSize={12}
                  textAnchor="middle"
                  fill="var(--text)"
                  stroke="var(--bg)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {n.name.length > 12 ? n.name.slice(0, 12) + "…" : n.name || t("common.unnamed")}
                </text>
              </DraggableNode>
            );
          })}
        </PannableCanvas>
      )}
      </div>

      {menuFor && (
        <NodeContextMenu
          x={menuFor.x}
          y={menuFor.y}
          onGoToEntry={() =>
            embedded ? openPanel({ kind: "entry", entryId: menuFor.id }) : navigate(`/world/${worldId}/entry/${menuFor.id}`)
          }
          onHide={
            editing
              ? () => updateRelationGraphState(view.id, (v) => ({ hiddenNodeIds: [...v.hiddenNodeIds, menuFor.id] }))
              : undefined
          }
          onClose={() => setMenuFor(null)}
        />
      )}

      {editingGroup && (
        <GroupEditDialog
          worldId={worldId}
          initial={{ title: editingGroup.title, color: editingGroup.color }}
          onClose={() => setEditingGroup(null)}
          onSubmit={handleSubmitGroupDialog}
        />
      )}
      </CanvasWorkbench>

      {showImageExport && (
        <ImageExportDialog
          title={view.name}
          getPngBlob={async () => {
            const svg = canvasHostRef.current?.querySelector("svg");
            if (!svg) throw new Error(t("relationGraphViewPage.canvasNotFound"));
            return (await svgToRaster(svg, contentSize, contentSize, 2, t)).blob;
          }}
          getPdfBlob={async () => {
            const svg = canvasHostRef.current?.querySelector("svg");
            if (!svg) throw new Error(t("relationGraphViewPage.canvasNotFound"));
            const { dataUrl } = await svgToRaster(svg, contentSize, contentSize, 2, t);
            return buildImagePdfBlob(view.name, currentLocalUser?.name, dataUrl);
          }}
          onClose={() => setShowImageExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="relationGraphs" entityId={view.id} onClose={() => setShowHistory(false)} />}
    </>
  );
}
