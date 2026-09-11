import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChartBranchStyle, ChartNodeShape } from "../../data/types";
import { useLanguage } from "../../i18n";

/** PannableCanvas 目前的縮放比例，供內部的 DraggableNode 換算拖曳距離用——
 * 節點座標活在畫布內容座標系（會再被 scale(view.scale) 放大/縮小），
 * 拖曳時量到的是螢幕像素距離，須先除以縮放比例才是內容座標系該移動的距離 */
const CanvasScaleContext = createContext(1);

/** PannableCanvas 縮放比例上限（滾輪／放大縮小按鈕／手動輸入百分比／resetFocusRange 共用同一個值）：
 * 這個上限要夠高，才不會發生「重置檢視聚焦到一段很窄的範圍後，只要滾一下滾輪就被限制值強制拉回、
 * 畫面突然跳一下」的狀況——resetFocusRange 算出來的縮放比例可能因為聚焦範圍相對全部內容很窄而超過
 * 舊有的 4 倍上限 */
const MAX_SCALE = 20;

export const PALETTE = ["#c9a463", "#7fb3d5", "#a3d9a5", "#e08283", "#b39ddb", "#f4a261", "#4ecdc4", "#f7c59f"];

/** 分支敘事圖段落節點的預設顯示寬高；段落可個別覆寫，這裡是沒設定時的後備值 */
export const DEFAULT_PASSAGE_NODE_W = 150;
export const DEFAULT_PASSAGE_NODE_H = 54;

export type ManualPositions = Record<string, { x: number; y: number }>;

export type GridStyle = "none" | "dot" | "line" | "square";

/** 分支敘事圖沒有像關係圖那樣可各自調整的網格設定（沒有 gridVisible/alignMode/gridSize 這些欄位），
 * 完整編輯畫面跟主世界縮圖統一用這組固定值，改一處兩邊就會一起套用 */
export const NARRATIVE_GRAPH_GRID = { style: "line" as GridStyle, size: 24 };

/** 依對齊方式調整拖曳座標：
 * dot（點）＝貼齊最近的格點（兩軸都貼齊）；line（線）＝只貼齊較近的那一軸，讓節點沿格線對齊；
 * square（面）＝貼齊所在格子的中心點；none＝不調整 */
export function alignPosition(pos: { x: number; y: number }, mode: GridStyle, gridSize: number): { x: number; y: number } {
  if (mode === "none") return pos;
  if (mode === "dot") {
    return { x: Math.round(pos.x / gridSize) * gridSize, y: Math.round(pos.y / gridSize) * gridSize };
  }
  if (mode === "line") {
    const sx = Math.round(pos.x / gridSize) * gridSize;
    const sy = Math.round(pos.y / gridSize) * gridSize;
    return Math.abs(pos.x - sx) < Math.abs(pos.y - sy) ? { x: sx, y: pos.y } : { x: pos.x, y: sy };
  }
  return {
    x: Math.floor(pos.x / gridSize) * gridSize + gridSize / 2,
    y: Math.floor(pos.y / gridSize) * gridSize + gridSize / 2,
  };
}

/** 移動距離超過此門檻（viewBox 座標）才視為拖曳，否則視為單純點擊 */
const DRAG_THRESHOLD = 3;

/** 可拖曳（也可點擊）的節點容器：拖曳時依 SVG 顯示縮放比例換算成 viewBox 座標，即時回報新的絕對位置；
 * 放開時依實際移動距離判斷是拖曳結束還是單純點擊，分別觸發 onDragEnd／onClick */
export function DraggableNode({
  id,
  x,
  y,
  onDrag,
  onDragEnd,
  onClick,
  children,
}: {
  id: string;
  x: number;
  y: number;
  onDrag?: (id: string, pos: { x: number; y: number }) => void;
  onDragEnd?: (id: string) => void;
  onClick?: (id: string, clientX: number, clientY: number) => void;
  children: React.ReactNode;
}) {
  const dragState = useRef<{
    origX: number;
    origY: number;
    startX: number;
    startY: number;
    scaleX: number;
    scaleY: number;
    moved: boolean;
  } | null>(null);
  const canvasScale = useContext(CanvasScaleContext);

  if (!onDrag && !onClick) return <g>{children}</g>;

  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.stopPropagation();
    const svg = e.currentTarget.ownerSVGElement;
    const rect = svg?.getBoundingClientRect();
    const vb = svg?.viewBox.baseVal;
    const scaleX = rect && vb && rect.width ? vb.width / rect.width : 1;
    const scaleY = rect && vb && rect.height ? vb.height / rect.height : 1;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { origX: x, origY: y, startX: e.clientX, startY: e.clientY, scaleX, scaleY, moved: false };
  };
  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!dragState.current) return;
    const state = dragState.current;
    // 節點座標活在畫布內容座標系，會再被 <g transform="... scale(canvasScale)"> 放大/縮小，
    // 所以量到的 viewBox 像素距離要再除以目前縮放比例，才是內容座標系該移動的距離
    const dx = (e.clientX - state.startX) * state.scaleX / canvasScale;
    const dy = (e.clientY - state.startY) * state.scaleY / canvasScale;
    if (!state.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) state.moved = true;
    if (state.moved) onDrag?.(id, { x: state.origX + dx, y: state.origY + dy });
  };
  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    const state = dragState.current;
    dragState.current = null;
    if (!state) return;
    if (state.moved) onDragEnd?.(id);
    else onClick?.(id, e.clientX, e.clientY);
  };

  return (
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: onDrag ? "grab" : onClick ? "pointer" : undefined, touchAction: "none" }}
    >
      {children}
    </g>
  );
}

/** 仿 Figma／FigJam 的可縮放平移畫布：滾輪縮放（以游標為中心）、拖曳空白處平移；
 * 內容以其自身座標系（contentWidth／contentHeight）繪製，掛載時自動縮放置中以完整顯示內容 */
export function PannableCanvas({
  width,
  height,
  contentWidth,
  contentHeight,
  grid,
  showZoomInput,
  maxScale,
  initialView,
  onViewChange,
  resetFocus,
  resetFocusRange,
  jumpToRange,
  fixedControlsOffset,
  onHover,
  onDrawStart,
  onDrawMove,
  onDrawEnd,
  screenSpaceChildren,
  children,
}: {
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  /** 內容底下的背景網格；未設定則不顯示 */
  grid?: { style: GridStyle; size: number };
  /** 是否在左下角按鈕列加入可輸入精確縮放百分比的欄位 */
  showZoomInput?: boolean;
  /** 縮放上限（倍數，非百分比），未設定則用預設的 MAX_SCALE。時間線這類需要放大到日/時/分刻度的
   * 畫布可以傳更高的值，不影響其他共用這個元件的畫布（關係圖／分支敘事圖仍用預設上限） */
  maxScale?: number;
  /** 掛載時若提供，直接套用這個縮放平移狀態，不做自動置中縮放；之後內容尺寸變動仍會照常重新置中 */
  initialView?: { x: number; y: number; scale: number };
  /** 縮放平移狀態每次變動都會回報，供外部（例如「儲存視角」按鈕）取得目前最新值 */
  onViewChange?: (view: { x: number; y: number; scale: number }) => void;
  /** 提供時，「重置檢視」（⤢）按鈕改成把這個內容座標點對齊到畫布左緣（而非把全部內容置中），
   * 縮放比例仍沿用置中會用的那個估算值；未提供則維持原本的置中行為 */
  resetFocus?: { x: number; y: number };
  /** 提供時（優先於 resetFocus），「重置檢視」按鈕與掛載時的初始檢視都改成把 [x1,x2] 這段內容座標
   * 範圍置中縮放到剛好塞滿寬度（可能因此放大超過 100%，不像 fitToContent 只會縮小不會放大）；
   * y 決定垂直置中的高度。用於「聚焦到某個內容範圍」而非「看到全貌」的情境（例如時間線設定的
   * 故事核心時間區間）——跟 resetFocus 不同，這個也會套用在掛載時的初始檢視，不只重置按鈕 */
  resetFocusRange?: { x1: number; x2: number; y: number };
  /** 提供時，任何一次「token 變了」都會立即把 [x1,x2] 這段內容座標範圍置中縮放到剛好塞滿寬度
   * （邏輯跟 resetFocusRange 完全一樣，只是觸發時機不同：resetFocusRange 只在畫布尺寸變動或掛載時
   * 生效，這個則是呼叫端想在任何時候主動要求「現在立刻跳過去」就可以用——例如時間線的事件列表
   * 點一下就跳到該事件的位置。token 給每次呼叫一個不同的值（例如遞增計數器或時間戳記），同一個
   * range 再點一次也能重新觸發 */
  jumpToRange?: { x1: number; x2: number; y: number; token: number };
  /** 提供時，左下角的縮放控制列改成 position:fixed 貼齊視窗（而非貼齊畫布本身左下角），
   * 用於畫布下方另外疊了一塊固定定位的內容（例如分支敘事的段落編輯區）時，避免控制列被蓋住而按不到 */
  fixedControlsOffset?: { bottom: number; left: number };
  /** 游標在畫布上移動時回報對應的內容座標（跟 children 畫圖用的座標系一致，已經扣掉平移/縮放）；
   * 游標離開畫布時回報 null。供時間軸這類「游標對應某個資料點」的懸浮提示用，不影響既有的
   * 拖曳平移行為——純粹多算一份座標回報給外部，本身不消費事件、不擋掉子元素的點擊 */
  onHover?: (content: { x: number; y: number } | null) => void;
  /** 提供時，左鍵拖曳改觸發畫筆手勢（回報內容座標，換算方式跟 onHover 共用），不再觸發平移；
   * 平移改用中鍵拖曳。用於地圖高度筆刷這類「整頁單一用途都是畫」的畫布——沒有提供這三個 props 的
   * 頁面（關係圖／分支敘事圖／時間線）左鍵拖曳行為完全不受影響，仍然是平移 */
  onDrawStart?: (content: { x: number; y: number }) => void;
  onDrawMove?: (content: { x: number; y: number }) => void;
  onDrawEnd?: () => void;
  /** true 時，children 改畫在 SVG 最外層（不套用 translate(view.x,view.y) scale(view.scale)），
   * 呼叫端要自己把內容座標換算成螢幕座標再傳進來。用於縮放倍數會衝到很高的畫布（目前只有時間線）——
   * 縮放倍數一高，套在單一個 <g> 上的 translate 值會衝到百萬等級，瀏覽器內部合成畫面用的變換矩陣
   * 精度不夠，導致線條/文字整個畫不出來（在 SVG 座標系裡這是已知的極端縮放問題）。改成呼叫端自己
   * 用一般的 JS 浮點數（雙精度，不受這個限制）算出最終螢幕座標，SVG 這邊收到的都是正常量級的數字，
   * 就不會踩到這個精度懸崖。預設 false，維持原本行為（關係圖／分支敘事圖不受影響） */
  screenSpaceChildren?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  const svgRef = useRef<SVGSVGElement>(null);
  const gridPatternId = useId();
  const effectiveMaxScale = maxScale ?? MAX_SCALE;
  const [view, setView] = useState(() => initialView ?? { x: 0, y: 0, scale: 1 });
  // 記錄「上次已經置中過的尺寸」；初始若有 initialView，先假裝已經對目前尺寸置中過，避免掛載時蓋掉還原的視角。
  // 用尺寸比對（而非一次性旗標）是因為 React StrictMode 開發模式下 effect 會多跑一次，一次性旗標會被提早消耗掉
  const lastFitRef = useRef<{ w: number; h: number; cw: number; ch: number } | null>(
    initialView ? { w: width, h: height, cw: contentWidth, ch: contentHeight } : null
  );
  const [isPanning, setIsPanning] = useState(false);
  const panState = useRef<{ startX: number; startY: number; origX: number; origY: number; scaleX: number; scaleY: number } | null>(null);
  const isDrawingRef = useRef(false);
  const [zoomInputValue, setZoomInputValue] = useState(() => String(Math.round(view.scale * 100)));
  // 縮放輸入框有焦點時（使用者正在打字或點原生的增減箭頭）暫停這個回填，否則使用者才打一半
  // （例如想打 150 先打出 1）就會被下面 commitZoom 算出來的百分比（夾在下限 5）蓋掉，打不出多位數字
  const [zoomInputFocused, setZoomInputFocused] = useState(false);

  useEffect(() => {
    if (zoomInputFocused) return;
    setZoomInputValue(String(Math.round(view.scale * 100)));
  }, [view.scale, zoomInputFocused]);

  // 用 useLayoutEffect（在瀏覽器真的畫出畫面前同步跑完，不是跑完才排到下一輪）而不是 useEffect：
  // screenSpaceChildren 模式下，呼叫端（時間線）完全依賴這裡回報的 view 狀態去算每個元素的最終螢幕
  // 座標；如果用一般 useEffect（要等瀏覽器畫完這一幀才觸發，屬於下一輪更新），拖曳平移／滾輪縮放時
  // 呼叫端拿到的座標就會一路慢半拍，跟畫布自己的背景網格（直接用這裡的 view 畫，不必等這個回呼）對不上，
  // 快速拖曳時會看到內容跟背景網格分開、抖動的情況
  useLayoutEffect(() => {
    onViewChange?.(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /** 套用縮放百分比到畫布；raw 解析不出數字時（例如清空重打到一半）先不套用，等打出有效數字再套，
   * 不要用 100 之類的預設值蓋過去，否則點原生增減箭頭或打字途中畫面會先跳到不相干的縮放層級 */
  const commitZoom = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const pct = Math.min(effectiveMaxScale * 100, Math.max(5, parsed));
    setView((v) => {
      const cx = width / 2;
      const cy = height / 2;
      const contentX = (cx - v.x) / v.scale;
      const contentY = (cy - v.y) / v.scale;
      const newScale = pct / 100;
      return { scale: newScale, x: cx - contentX * newScale, y: cy - contentY * newScale };
    });
  };

  const fitToContent = () => {
    const scale = Math.min(1, (width - 16) / contentWidth, (height - 16) / contentHeight);
    const s = Math.max(0.05, scale);
    setView({ x: (width - contentWidth * s) / 2, y: (height - contentHeight * s) / 2, scale: s });
  };

  /** 把 resetFocus 那個內容座標點對齊到畫布左緣（留一點邊距），垂直置中；縮放比例沿用 fitToContent 的估算，
   * 讓整體大小感受一致，只是不置中，改成從指定點開始往右展開 */
  const FOCUS_LEFT_MARGIN = 70;
  const focusLeft = (point: { x: number; y: number }) => {
    const scale = Math.min(1, (width - 16) / contentWidth, (height - 16) / contentHeight);
    const s = Math.max(0.05, scale);
    setView({ x: FOCUS_LEFT_MARGIN - point.x * s, y: height / 2 - point.y * s, scale: s });
  };

  /** 把 [x1,x2] 這段內容座標範圍置中縮放到剛好塞滿寬度（留一點邊距）；跟 fitToContent／focusLeft
   * 不同，這裡容許放大超過 100%（上限沿用滾輪縮放的 4 倍），因為目的就是要放大聚焦到一小段範圍，
   * 不是縮小看全貌 */
  const focusRange = (range: { x1: number; x2: number; y: number }) => {
    const span = Math.max(1, range.x2 - range.x1);
    const s = Math.min(effectiveMaxScale, Math.max(0.05, (width - 32) / span));
    const cx = (range.x1 + range.x2) / 2;
    setView({ x: width / 2 - cx * s, y: height / 2 - range.y * s, scale: s });
  };

  useEffect(() => {
    const last = lastFitRef.current;
    if (last && last.w === width && last.h === height && last.cw === contentWidth && last.ch === contentHeight) {
      return; // 尺寸沒變（或剛用 initialView 還原過）——不用重新置中
    }
    // 可視窗尺寸（width/height）不變、畫布假想內容尺寸（contentWidth/contentHeight）只有變大沒有變小
    // 時，使用者當下看到的內容像素位置不會因為內容邊界擴大而改變（新增節點/事件、把節點拖到目前範圍
    // 外都屬於這種情況），不需要為此強制重新置中、打斷使用者正在手動平移/縮放的視角——只更新記錄，
    // 讓下一輪比較用最新尺寸為準，不觸發 fitToContent／focusRange。
    // 反過來，內容尺寸不變、只有可視窗尺寸（width/height）在變時（例如視窗被拖曳縮放、地圖頁開關
    // 尺規讓畫布跟著變窄一截）也是同樣道理：view 的 x/y/scale 是純粹的螢幕座標轉換，跟畫布本身多寬
    // 多高無關，可視窗變小只是「看得到的範圍」跟著變小（右／下緣多裁掉一點），不會讓已經畫在螢幕上
    // 的內容跳動；如果這裡還是照舊重新 fitToContent／focusRange，等於每次視窗尺寸一變就把使用者手動
    // 調好的平移縮放整個蓋掉重算一次——開關尺規（改變傳進來的 width/height）就會讓地圖看起來「跳一下」
    // （使用者回報的「按尺規地圖一直抖」），拖曳瀏覽器視窗邊緣時也會連續觸發同樣的問題。
    // 畫布尺寸「縮小」、內容尺寸也「縮小」（代表使用者刪掉了內容，原本置中的比例可能不再合適）、或
    // 第一次掛載（lastFitRef 還沒有值）則維持原本一定要重新置中的行為。手動按「重置檢視」（⤢）按鈕的
    // 行為是獨立的 onClick，不受這裡影響，使用者隨時可以自己要求重新置中
    const pureGrowth = !!last && last.w === width && last.h === height && contentWidth >= last.cw && contentHeight >= last.ch;
    const viewportOnlyChange = !!last && last.cw === contentWidth && last.ch === contentHeight;
    lastFitRef.current = { w: width, h: height, cw: contentWidth, ch: contentHeight };
    if (pureGrowth || viewportOnlyChange) return;
    if (resetFocusRange) focusRange(resetFocusRange);
    else fitToContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, contentHeight, width, height]);

  // jumpToRange 每次 token 變動就立刻跳過去，不像上面那個 effect 要等尺寸變動才觸發——
  // 呼叫端（例如時間線的事件列表）想要「點一下就跳到那個位置」時用這個
  useEffect(() => {
    if (jumpToRange) focusRange(jumpToRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToRange?.token]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // 跟 handlePointerDown/handlePointerMove 一樣要修正 CSS 顯示尺寸與 viewBox 的比例——畫布因
      // maxWidth:"100%" 被壓縮顯示時（例如側邊面板、較窄視窗），rect.width 會小於 viewBox 的寬度，
      // 沒有這層校正的話，滾輪縮放的「以游標為中心」計算會用錯座標系，縮放時畫面會偏移/亂跳，
      // 不是真的對準游標位置縮放
      const vb = el.viewBox.baseVal;
      const scaleX = rect.width ? vb.width / rect.width : 1;
      const scaleY = rect.height ? vb.height / rect.height : 1;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      const factor = Math.exp(-e.deltaY * 0.001);
      setView((v) => {
        const newScale = Math.min(effectiveMaxScale, Math.max(0.05, v.scale * factor));
        const contentX = (cx - v.x) / v.scale;
        const contentY = (cy - v.y) / v.scale;
        return { scale: newScale, x: cx - contentX * newScale, y: cy - contentY * newScale };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
    // effectiveMaxScale 來自 props，同一個畫布實例不會中途變動，故意只掛載時綁定一次事件監聽器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (onDrawStart) {
      if (e.button === 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = rect.width ? width / rect.width : 1;
        const scaleY = rect.height ? height / rect.height : 1;
        const viewBoxX = (e.clientX - rect.left) * scaleX;
        const viewBoxY = (e.clientY - rect.top) * scaleY;
        (e.target as Element).setPointerCapture(e.pointerId);
        isDrawingRef.current = true;
        onDrawStart({ x: (viewBoxX - view.x) / view.scale, y: (viewBoxY - view.y) / view.scale });
        return;
      }
      if (e.button !== 1) return;
      e.preventDefault(); // 避免瀏覽器把中鍵按下當成觸發自動捲動模式
    } else if (e.button !== 0) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // view.x/y 是外層 viewBox 座標系的平移量，換算螢幕像素距離時只需修正 CSS 顯示尺寸與 viewBox 的比例
    // （不像節點拖曳的內容座標，還要再除以縮放比例），否則畫布在窄螢幕（viewBox 比實際顯示尺寸大）時平移會過度敏感
    const scaleX = rect.width ? width / rect.width : 1;
    const scaleY = rect.height ? height / rect.height : 1;
    (e.target as Element).setPointerCapture(e.pointerId);
    panState.current = { startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y, scaleX, scaleY };
    setIsPanning(true);
  };
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (onHover || (onDrawMove && isDrawingRef.current)) {
      const rect = e.currentTarget.getBoundingClientRect();
      const scaleX = rect.width ? width / rect.width : 1;
      const scaleY = rect.height ? height / rect.height : 1;
      const viewBoxX = (e.clientX - rect.left) * scaleX;
      const viewBoxY = (e.clientY - rect.top) * scaleY;
      const content = { x: (viewBoxX - view.x) / view.scale, y: (viewBoxY - view.y) / view.scale };
      onHover?.(content);
      if (isDrawingRef.current) onDrawMove?.(content);
    }
    if (!panState.current) return;
    const { startX, startY, origX, origY, scaleX, scaleY } = panState.current;
    setView((v) => ({ ...v, x: origX + (e.clientX - startX) * scaleX, y: origY + (e.clientY - startY) * scaleY }));
  };
  const handlePointerUp = () => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      onDrawEnd?.();
    }
    panState.current = null;
    setIsPanning(false);
  };
  const handlePointerLeave = () => {
    handlePointerUp();
    onHover?.(null);
  };

  return (
    <div style={{ position: "relative" }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        // 只有 maxWidth 沒有搭配 height:"auto" 的話，畫布因側邊面板／窄視窗被壓縮顯示寬度時，
        // CSS 高度仍固定在 height 屬性值（640 之類），跟被壓縮的寬度兜不出 viewBox 原本的長寬比——
        // 瀏覽器預設的 preserveAspectRatio="xMidYMid meet" 這時會把內容等比縮小並置中，上下（或左右）
        // 留白，畫面顯示沒問題，但問題出在所有指標事件的座標換算（見下面 wheel/handlePointerDown 等）
        // 都是各自獨立算 scaleX=vb.width/rect.width、scaleY=vb.height/rect.height，這個算法假設畫布
        // 顯示尺寸跟 viewBox 同一個長寬比（沒有留白），一旦長寬比對不上，量出來的內容座標就會跟游標
        // 實際位置對不上（游標在上緣，量出來的卻是內容中段）。讓高度也用 auto 依比例縮放，
        // 顯示尺寸就會永遠維持 viewBox 的長寬比，不會有留白，才能保證這批座標換算永遠正確
        style={{ maxWidth: "100%", height: "auto", touchAction: "none", cursor: isPanning ? "grabbing" : "grab" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
        <CanvasScaleContext.Provider value={view.scale}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.scale})`}>
            {grid && (
              <>
                <defs>
                  {grid.style === "dot" && (
                    <pattern id={gridPatternId} width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
                      <circle cx={0} cy={0} r={1.5} fill="var(--border)" />
                    </pattern>
                  )}
                  {grid.style === "line" && (
                    <pattern id={gridPatternId} width={grid.size} height={grid.size} patternUnits="userSpaceOnUse">
                      <path d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`} fill="none" stroke="var(--border)" strokeWidth={1} />
                    </pattern>
                  )}
                  {grid.style === "square" && (
                    <pattern id={gridPatternId} width={grid.size * 2} height={grid.size * 2} patternUnits="userSpaceOnUse">
                      <rect width={grid.size} height={grid.size} fill="var(--bg-hover)" />
                      <rect x={grid.size} y={grid.size} width={grid.size} height={grid.size} fill="var(--bg-hover)" />
                    </pattern>
                  )}
                </defs>
                <rect
                  x={-contentWidth}
                  y={-contentHeight}
                  width={contentWidth * 3}
                  height={contentHeight * 3}
                  fill={`url(#${gridPatternId})`}
                />
              </>
            )}
            {!screenSpaceChildren && children}
          </g>
          {screenSpaceChildren && children}
        </CanvasScaleContext.Provider>
      </svg>
      <div
        style={
          fixedControlsOffset
            ? { position: "fixed", left: fixedControlsOffset.left, bottom: fixedControlsOffset.bottom, zIndex: 35, display: "flex", gap: 2, alignItems: "center" }
            : { position: "absolute", left: 4, bottom: 4, display: "flex", gap: 2, alignItems: "center" }
        }
      >
        <button
          type="button"
          className="btn-ghost"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, width: 22, height: 22, padding: 0, lineHeight: 1, fontSize: 13 }}
          onClick={() => setView((v) => ({ ...v, scale: Math.min(effectiveMaxScale, v.scale * 1.25) }))}
          title={t("graphPrimitives.zoomIn")}
        >
          ＋
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, width: 22, height: 22, padding: 0, lineHeight: 1, fontSize: 13 }}
          onClick={() => setView((v) => ({ ...v, scale: Math.max(0.05, v.scale / 1.25) }))}
          title={t("graphPrimitives.zoomOut")}
        >
          －
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, width: 22, height: 22, padding: 0, lineHeight: 1, fontSize: 11 }}
          onClick={() => {
            if (resetFocusRange) focusRange(resetFocusRange);
            else if (resetFocus) focusLeft(resetFocus);
            else fitToContent();
          }}
          title={t("graphPrimitives.resetView")}
        >
          ⤢
        </button>
        {showZoomInput && (
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            <input
              type="number"
              min={5}
              max={effectiveMaxScale * 100}
              value={zoomInputValue}
              onChange={(e) => {
                setZoomInputValue(e.target.value);
                commitZoom(e.target.value);
              }}
              onFocus={() => setZoomInputFocused(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={() => {
                setZoomInputFocused(false);
                setZoomInputValue(String(Math.round(view.scale * 100)));
              }}
              style={{
                width: 64,
                height: 22,
                fontSize: 11,
                textAlign: "center",
                border: "1px solid var(--border)",
                borderRadius: 4,
                background: "var(--bg)",
                color: "var(--text)",
              }}
              title={t("graphPrimitives.zoomPercentInput")}
            />
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>%</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** 連接線末端箭頭記號；fill 使用 context-stroke 自動沿用各線自己的顏色 */
export function ArrowMarkerDefs({ id }: { id: string }) {
  return (
    <defs>
      <marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
      </marker>
    </defs>
  );
}

/** 沿連接線方向標註的文字；以起訖點直線的中點與角度近似（曲線／直角線亦適用，視覺上仍貼近線的走向）。
 * dy 控制文字相對線中點的垂直偏移（負值在線上方、正值在線下方），供同一條線疊加「上方／下方」兩段獨立文字時錯開 */
export function EdgeLabel({
  x1,
  y1,
  x2,
  y2,
  text,
  dy = -4,
  fontSize = 11,
  color = "var(--text-muted)",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  dy?: number;
  fontSize?: number;
  color?: string;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;
  return (
    <text
      x={mx}
      y={my + dy}
      fontSize={fontSize}
      textAnchor="middle"
      fill={color}
      transform={`rotate(${angle}, ${mx}, ${my})`}
      style={{ pointerEvents: "none" }}
    >
      {text}
    </text>
  );
}

/** 依節點形狀繪製圖形（用於樹狀圖／心智圖／關係圖節點） */
export function NodeShape({
  shape,
  x,
  y,
  w,
  h,
  fill,
}: {
  shape: ChartNodeShape;
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}) {
  if (shape === "circle") {
    const r = Math.min(w, h) / 2;
    return <circle cx={x} cy={y} r={r} fill={fill} />;
  }
  if (shape === "diamond") {
    const points = `${x},${y - h / 2} ${x + w / 2},${y} ${x},${y + h / 2} ${x - w / 2},${y}`;
    return <polygon points={points} fill={fill} />;
  }
  const rx = shape === "roundedRect" ? 8 : 1;
  return <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={rx} fill={fill} />;
}

/** 兩點之間連接線的 SVG path；straight＝直線，curved＝S 型曲線，elbow＝直角轉折 */
export function branchPath(x1: number, y1: number, x2: number, y2: number, style: ChartBranchStyle): string {
  if (style === "straight") return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (style === "curved") {
    const midY = (y1 + y2) / 2;
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  }
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}
