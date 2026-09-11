import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { Passage, PassageChoice, World } from "../data/types";
import { useResolvedColor } from "../data/colorResolve";
import { createPassage, listPassages, updatePassagePosition } from "../data/repositories/passage";
import { deleteNarrativeGraph, getNarrativeGraph, toggleNarrativeGraphStar, updateNarrativeGraphMeta } from "../data/repositories/narrativeGraph";
import {
  PannableCanvas,
  DraggableNode,
  ArrowMarkerDefs,
  EdgeLabel,
  branchPath,
  DEFAULT_PASSAGE_NODE_W,
  DEFAULT_PASSAGE_NODE_H,
  NARRATIVE_GRAPH_GRID,
  type ManualPositions,
} from "../components/common/GraphPrimitives";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import { useSaveShortcut } from "../data/useSaveShortcut";
import { svgToRaster } from "../data/manuscript/exportGraphImage";
import { buildImagePdfBlob } from "../data/manuscript/exportPdf";
import ImageExportDialog from "../components/manuscript/ImageExportDialog";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import ColorInput from "../components/common/ColorInput";
import { CanvasWorkbench } from "../components/common/CanvasWorkbench";
import PassageDock, { MIN_DOCK_HEIGHT, MAX_DOCK_HEIGHT, DOCK_CHROME_HEIGHT } from "../components/narrative/PassageDock";
import { useLanguage } from "../i18n";

const DEFAULT_DOCK_HEIGHT = 320;
/** 拖曳節點時，與其他節點中心點距離小於這個值（內容座標系單位）就吸附對齊並顯示輔助線 */
const SNAP_THRESHOLD = 8;
/** 選項下方文字與線中點的垂直偏移；上方文字沿用 EdgeLabel 預設的 -4，這裡刻意錯開避免重疊 */
const BELOW_TEXT_DY = 14;

function truncateTitle(title: string, fallback: string): string {
  const s = title || fallback;
  return s.length > 14 ? s.slice(0, 14) + "…" : s;
}

/** 一條選項連結：曲線＋箭頭＋選填的線上方文字（留空則退回顯示選項名稱 label）＋選填的線下方文字，顏色/粗細/字級皆可個別覆寫 */
function ChoiceEdge({
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
        <EdgeLabel
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          text={choice.belowText}
          dy={BELOW_TEXT_DY}
          fontSize={choice.belowTextSize ?? 11}
          color={belowColor}
        />
      )}
    </g>
  );
}

/** 一個段落節點：底色／文字顏色／顯示寬高皆可個別覆寫，未設定則使用預設值 */
function PassageNode({
  passage,
  pos,
  isStart,
  editing,
  onDrag,
  onDragEnd,
  onClick,
}: {
  passage: Passage;
  pos: { x: number; y: number };
  isStart: boolean;
  editing: boolean;
  onDrag: (id: string, pos: { x: number; y: number }) => void;
  onDragEnd: (id: string) => void;
  onClick: (id: string, clientX: number, clientY: number) => void;
}) {
  const { t } = useLanguage();
  const bgColor = useResolvedColor(passage.bgColor) ?? "var(--bg-elevated)";
  const textColor = useResolvedColor(passage.textColor) ?? "var(--text)";
  const w = passage.width ?? DEFAULT_PASSAGE_NODE_W;
  const h = passage.height ?? DEFAULT_PASSAGE_NODE_H;
  return (
    <DraggableNode
      id={passage.id}
      x={pos.x}
      y={pos.y}
      onDrag={editing ? onDrag : undefined}
      onDragEnd={editing ? onDragEnd : undefined}
      onClick={onClick}
    >
      <rect
        x={pos.x - w / 2}
        y={pos.y - h / 2}
        width={w}
        height={h}
        rx={8}
        fill={bgColor}
        stroke={isStart ? "var(--accent)" : "var(--border)"}
        strokeWidth={isStart ? 2 : 1.5}
      />
      <text x={pos.x} y={pos.y + 5} fontSize={13} textAnchor="middle" fill={textColor}>
        {isStart ? "▶ " : ""}
        {truncateTitle(passage.title, t("narrativeGraphViewPage.unnamedPassage"))}
      </text>
    </DraggableNode>
  );
}

interface NarrativeGraphViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的分支敘事圖渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  graphIdOverride?: string;
  worldIdOverride?: string;
  /** 在側邊面板裡渲染時為 true：畫布尺寸改依面板寬度縮小、刪除圖後改關閉面板而非導覽主畫面網址、
   * 段落編輯區改成跟著面板內容一起捲動的一般區塊（不再固定貼在整個頁面下方） */
  embedded?: boolean;
  /** embedded 時回報目前段落編輯區是否有未儲存變更，供側邊面板決定切換／關閉前是否要先確認 */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一已儲存分支敘事圖的畫布：段落是各自獨立的一手內容資料（不像關係圖節點是條目借來的），
 * 點擊段落節點在頁面下方固定的段落編輯區開啟，不做右鍵選單、不整頁跳轉 */
export default function NarrativeGraphViewPage({
  graphIdOverride,
  worldIdOverride,
  embedded = false,
  onDirtyChange,
}: NarrativeGraphViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ graphId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const graphId = graphIdOverride ?? params.graphId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { panelView, panelWidth, openPanel, closePanel } = useSidePanel();
  const arrowId = useId();
  const { t } = useLanguage();

  const graph = useLiveQuery(() => (graphId ? getNarrativeGraph(graphId) : undefined), [graphId]);
  const passages = useLiveQuery(() => (graphId ? listPassages(graphId) : undefined), [graphId]);

  const [editing, setEditing] = useState(false);
  const [metaDraft, setMetaDraft] = useState<{ name: string; description?: string; tagColor?: string } | null>(null);
  const [livePositions, setLivePositions] = useState<ManualPositions>({});
  const [dragGuides, setDragGuides] = useState<{ x?: number; y?: number }>({});

  const [openPassageId, setOpenPassageId] = useState<string | null>(null);
  const [dockHeight, setDockHeight] = useState(DEFAULT_DOCK_HEIGHT);
  // 非 embedded 時，畫布可視窗尺寸不再寫死 900×640，改成量測 CanvasWorkbench 實際分給畫布的
  // 容器尺寸（做法跟 MapViewPage 一致，見該檔案的說明）
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [showImageExport, setShowImageExport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const [measuredCanvasSize, setMeasuredCanvasSize] = useState<{ width: number; height: number } | null>(null);

  // 畫布座標系尺寸只依「已存檔」的段落位置成長、且只增不減——絕對不能參考拖曳中的 livePositions，
  // 否則每拖一下邊界就跟著變，PannableCanvas 偵測到 contentWidth/contentHeight 改變就會重新置中，
  // 使用者手動平移/縮放的視角當場被洗掉，變成「拖到一半畫面自己跳回置中」。
  // 這裡用 ref 在 render 當下直接算好（不能像原本那樣用 state+effect：掛載當下先用預設值 700 畫一次，
  // 資料到位後 effect 才把它養大又觸發第二次 fitToContent，兩次尺寸不同、畫面就會在剛進頁面時明顯跳一下——
  // 例如剛進入這張圖的編輯畫布時就會看到），確保畫布第一次真正渲染時尺寸就已經是對的
  const contentSizeRef = useRef(700);
  if (passages) {
    const maxX = Math.max(300, ...passages.map((p) => p.position.x));
    const maxY = Math.max(300, ...passages.map((p) => p.position.y));
    const needed = Math.max(700, maxX + 400, maxY + 400);
    if (needed > contentSizeRef.current) contentSizeRef.current = needed;
  }
  const contentSize = contentSizeRef.current;
  // 底部段落編輯區是否有未儲存變更；跟側邊面板的 dirty 追蹤是同一套手法，只是這裡是這個頁面自己局部管理
  const dockDirtyRef = useRef(false);
  const requestIdRef = useRef(0);
  const handleDockDirtyChange = useCallback(
    (dirty: boolean) => {
      dockDirtyRef.current = dirty;
      onDirtyChange?.(dirty);
    },
    [onDirtyChange]
  );

  const confirmDiscardIfDirty = useCallback(
    async (action: () => void) => {
      if (!dockDirtyRef.current) {
        action();
        return;
      }
      const myId = ++requestIdRef.current;
      const ok = await confirm({
        title: t("narrativeGraphViewPage.leavePassageEditConfirmTitle"),
        message: t("entryPage.leaveConfirm.message"),
        confirmLabel: t("entryPage.leaveConfirm.confirmLabel"),
      });
      if (ok && requestIdRef.current === myId) {
        dockDirtyRef.current = false;
        // 這裡也要跟 handleDeleteGraph 一樣通知外層（embedded 時是側邊面板的 dirty 狀態）——
        // 不然使用者剛在這裡選擇「離開」捨棄變更，外層的 dirty 標記仍停在 true，之後想關閉整個
        // 側邊面板時會被誤判成還有未儲存變更，又跳出一次跟目前操作對不上的確認框
        onDirtyChange?.(false);
        action();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, onDirtyChange]
  );

  const edges = useMemo(() => {
    if (!passages) return [];
    const ids = new Set(passages.map((p) => p.id));
    return passages.flatMap((p) =>
      p.choices
        .filter((c) => c.targetPassageId && ids.has(c.targetPassageId))
        .map((c) => ({ id: c.id, from: p.id, to: c.targetPassageId!, choice: c }))
    );
  }, [passages]);

  const posOf = (id: string) => livePositions[id] ?? passages?.find((p) => p.id === id)?.position ?? { x: 0, y: 0 };

  const handleDrag = (id: string, pos: { x: number; y: number }) => {
    let snappedX = pos.x;
    let snappedY = pos.y;
    let guideX: number | undefined;
    let guideY: number | undefined;
    for (const p of passages ?? []) {
      if (p.id === id) continue;
      const other = posOf(p.id);
      if (guideX === undefined && Math.abs(pos.x - other.x) < SNAP_THRESHOLD) {
        snappedX = other.x;
        guideX = other.x;
      }
      if (guideY === undefined && Math.abs(pos.y - other.y) < SNAP_THRESHOLD) {
        snappedY = other.y;
        guideY = other.y;
      }
    }
    setDragGuides({ x: guideX, y: guideY });
    setLivePositions((prev) => ({ ...prev, [id]: { x: snappedX, y: snappedY } }));
  };
  const handleDragEnd = (id: string) => {
    setDragGuides({});
    const pos = livePositions[id];
    if (pos) updatePassagePosition(id, pos);
  };
  const handleNodeClick = (id: string) => {
    confirmDiscardIfDirty(() => setOpenPassageId(id));
  };
  const handleCloseDock = () => {
    confirmDiscardIfDirty(() => setOpenPassageId(null));
  };

  const handleAddPassage = () => {
    if (!graphId || !worldId) return;
    // 建立段落（寫入 DB）要放在確認捨棄草稿「之後」才做——原本先建立段落、後彈確認框的順序，
    // 使用者若在確認框選「不要離開」，這個已經寫入 DB 的空白段落並不會被回滾，變成沒人打開過、
    // 名字還是預設值的幽靈段落，永遠留在圖裡
    confirmDiscardIfDirty(async () => {
      const passage = await createPassage(worldId, graphId, { title: t("narrativeGraphViewPage.newPassageDefaultTitle") });
      setOpenPassageId(passage.id);
    });
  };

  const startEdit = () => {
    if (!graph) return;
    setMetaDraft({ name: graph.name, description: graph.description, tagColor: graph.tagColor });
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
  };
  const handleSaveMeta = async () => {
    if (!graph || !metaDraft) return;
    await updateNarrativeGraphMeta(graph.id, metaDraft);
    setMetaDraft(null);
    setEditing(false);
  };
  useSaveShortcut(handleSaveMeta, editing);

  const handleDeleteGraph = async () => {
    if (!graph) return;
    const ok = await confirm({
      title: t("narrativeGraphCard.deleteConfirm.title"),
      message: t("narrativeGraphCard.deleteConfirm.message", { name: graph.name }),
    });
    if (!ok) return;
    await deleteNarrativeGraph(graph.id);
    if (embedded) {
      // 圖已經刪除，段落編輯區（如果還開著）裡的草稿也跟著沒有意義了——先清掉面板的 dirty 標記，
      // 否則 closePanel() 會因為殘留的 dirty 狀態又跳出一次「未儲存變更」確認，這次的訊息完全對不上剛剛的操作
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/narrative`);
    }
  };

  // embedded 模式維持原本用 panelWidth 換算寬度、固定高度 380 的做法；非 embedded 才量測。
  // 依賴陣列的 fullyLoaded 要跟下面那行 early return 的條件完全一致（graph 和 passages 兩個
  // useLiveQuery 都讀出來才算）——這兩個查詢各自獨立非同步完成，時間點通常不同；如果只挑其中
  //一個（例如 graph）當依賴，很可能 graph 最先讀出來、passages 還沒好，此時 canvasHostRef
  // 那個 DOM 節點根本還沒掛上去（下面提早 return null 了），effect 抓不到 host 只能先跳過，
  // 但 graphLoaded 已經在那次就變成 true 了；等 passages 也讀出來、DOM 真的掛上去的那次
  // 重新渲染，因為 graphLoaded 沒有再變化，React 會直接跳過重跑這個 effect，永遠量不到尺寸、
  // 畫布也就永遠不會出現
  const fullyLoaded = !!graph && !!passages && !!worldId;
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

  if (!graph || !passages || !worldId) return null;

  const totalWords = passages.reduce((n, p) => n + p.body.length, 0);

  const width = embedded ? Math.max(240, panelWidth - 40) : (measuredCanvasSize?.width ?? 900);
  const height = embedded ? 380 : (measuredCanvasSize?.height ?? 640);
  const clampedDockHeight = Math.min(MAX_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, dockHeight));
  // 非 embedded 時段落編輯區是 fixed 貼在整個視窗下方，會蓋住畫布左下角原本 absolute 定位的縮放控制列
  // （尤其是還沒捲動到頁面最底、編輯區佔滿一大塊可視範圍時），所以段落編輯開著時把控制列也改成 fixed，
  // 貼著編輯區上緣浮動；embedded 時編輯區是面板裡的一般區塊、不會蓋住畫布，維持原本定位即可。
  // 編輯區可以拖到最高 MAX_DOCK_HEIGHT（720px），在較矮的視窗裡直接疊加偏移量會把控制列推到畫面最上緣以外、
  // 完全按不到（position:fixed 不會因為捲動被找回來），所以要跟視窗高度取一個上限，確保控制列永遠留在可視範圍內
  const canvasFixedControlsOffset =
    !embedded && openPassageId
      ? { bottom: Math.min(clampedDockHeight + DOCK_CHROME_HEIGHT + 8, Math.max(60, window.innerHeight - 80)), left: 248 }
      : undefined;
  // 段落編輯區是另一個自己管理的 position:fixed 停靠面板，開著時要讓工作區自己再縮一截高度，
  // 畫布欄位才不會被蓋住底部（見 CanvasWorkbench 的 extraBottomOffset 說明）；embedded 時編輯區
  // 是面板裡的一般區塊、不會蓋住畫布，不用縮
  const extraBottomOffset = !embedded && openPassageId ? clampedDockHeight + DOCK_CHROME_HEIGHT + 8 : 0;

  return (
    <>
      <CanvasWorkbench
        embedded={embedded}
        extraBottomOffset={extraBottomOffset}
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
            <h2 style={{ margin: 0 }}>{graph.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "narrativeGraph", graphId: graph.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleNarrativeGraphStar(graph.id)}
            style={{ color: graph.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {graph.starred ? "★" : "☆"}
          </button>
          <button className="btn-ghost" title={t("narrativeGraphViewPage.exportImageTitle")} onClick={() => setShowImageExport(true)}>
            {t("mapViewPage.exportImageLabel")}
          </button>
          <button className="btn-ghost" onClick={() => setShowHistory(true)}>
            {t("common.versionHistory")}
          </button>
          {editing ? (
            <>
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={handleSaveMeta}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          <input
            style={{ width: "100%" }}
            placeholder={t("mapViewPage.descriptionPlaceholder")}
            value={metaDraft?.description ?? ""}
            onChange={(e) => setMetaDraft((d) => (d ? { ...d, description: e.target.value } : d))}
          />
          <ColorInput
            label={t("narrativeGraphViewPage.tagColorLabel")}
            value={metaDraft?.tagColor}
            onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
            allowClear
            worldId={worldId}
          />
        </div>
      ) : (
        graph.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>{graph.description}</p>
      )}
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("narrativeGraphViewPage.clickPassageHint", { count: totalWords })}
        {editing
          ? t("narrativeGraphViewPage.editingHint")
          : t("narrativeGraphViewPage.viewingHint")}
      </p>
          </>
        }
        toolbar={
          editing ? (
            <button className="btn btn-primary" onClick={handleAddPassage}>
              {t("narrativeGraphViewPage.addPassageButton")}
            </button>
          ) : undefined
        }
      >
      <div ref={canvasHostRef} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      {passages.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>{t("narrativeGraphViewPage.emptyPassagesHint")}</p>
      ) : !(embedded || measuredCanvasSize) ? null : (
        <PannableCanvas
          width={width}
          height={height}
          contentWidth={contentSize}
          contentHeight={contentSize}
          showZoomInput
          resetFocus={graph.startPassageId ? posOf(graph.startPassageId) : undefined}
          grid={NARRATIVE_GRAPH_GRID}
          fixedControlsOffset={canvasFixedControlsOffset}
        >
          <ArrowMarkerDefs id={arrowId} />
          {edges.map((e) => {
            const p1 = posOf(e.from);
            const p2 = posOf(e.to);
            return <ChoiceEdge key={e.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} choice={e.choice} arrowMarkerId={arrowId} />;
          })}
          {passages.map((p) => {
            const pos = posOf(p.id);
            const isStart = graph.startPassageId === p.id;
            return (
              <PassageNode
                key={p.id}
                passage={p}
                pos={pos}
                isStart={isStart}
                editing={editing}
                onDrag={handleDrag}
                onDragEnd={handleDragEnd}
                onClick={handleNodeClick}
              />
            );
          })}
          {dragGuides.x !== undefined && (
            <line
              x1={dragGuides.x}
              y1={0}
              x2={dragGuides.x}
              y2={contentSize}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 4"
              style={{ pointerEvents: "none" }}
            />
          )}
          {dragGuides.y !== undefined && (
            <line
              x1={0}
              y1={dragGuides.y}
              x2={contentSize}
              y2={dragGuides.y}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="4 4"
              style={{ pointerEvents: "none" }}
            />
          )}
        </PannableCanvas>
      )}
      </div>
      </CanvasWorkbench>
      {openPassageId && graphId && (
        <PassageDock
          passageId={openPassageId}
          graphId={graphId}
          height={clampedDockHeight}
          onHeightChange={(h) => setDockHeight(Math.min(MAX_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, h)))}
          onClose={handleCloseDock}
          onDirtyChange={handleDockDirtyChange}
          right={panelView ? panelWidth : 0}
          embedded={embedded}
        />
      )}
      {showImageExport && (
        <ImageExportDialog
          title={graph.name}
          getPngBlob={async () => {
            const svg = canvasHostRef.current?.querySelector("svg");
            if (!svg) throw new Error(t("relationGraphViewPage.canvasNotFound"));
            return (await svgToRaster(svg, contentSize, contentSize, 2, t)).blob;
          }}
          getPdfBlob={async () => {
            const svg = canvasHostRef.current?.querySelector("svg");
            if (!svg) throw new Error(t("relationGraphViewPage.canvasNotFound"));
            const { dataUrl } = await svgToRaster(svg, contentSize, contentSize, 2, t);
            return buildImagePdfBlob(graph.name, currentLocalUser?.name, dataUrl);
          }}
          onClose={() => setShowImageExport(false)}
        />
      )}
      {showHistory && <VersionHistoryDialog entityType="narrativeGraphs" entityId={graph.id} onClose={() => setShowHistory(false)} />}
    </>
  );
}
