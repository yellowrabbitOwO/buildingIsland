import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type {
  World,
  CompassStyle,
  FloorPlanData,
  FloorPlanDimension,
  FloorPlanFillPattern,
  FloorPlanLandmarkArea,
  FloorPlanLandmarkPoint,
  LandmarkIconType,
  FloorPlanPolygonRoom,
  FloorPlanRoom,
  FloorPlanStyle,
  FloorPlanSymbol,
  FloorPlanSymbolType,
  FloorPlanText,
  FloorPlanWall,
  FpItemType,
  RoomShape,
} from "../data/types";
import { deleteMap, getMap, MAP_SIZE_PRESETS, toggleMapStar, updateMapMeta, updateMapState } from "../data/repositories/map";
import { db, newId } from "../data/db";
import {
  applyOrtho,
  type BoxHandle,
  computeBoxRotationAngle,
  computePolygonResize,
  computeRoomResize,
  computeUniformScaleFactor,
  createDefaultFloorPlan,
  DEFAULT_TEXT_FONT_SIZE,
  findAlignmentSnap,
  findObjectSnap,
  type FpBounds,
  getFpItemBounds,
  getFpItemLocalBox,
  type FpItemUnion,
  polygonArea,
  polygonCentroid,
  rotatePoint,
  rotatePolygonPoints,
} from "../data/floorPlan";
import { getRoomShapePoints, ROOM_SHAPES } from "../data/roomShapes";
import { useSaveShortcut } from "../data/useSaveShortcut";
import {
  applyStrokeStyleToCanvas,
  resolveFillStyleForCanvas,
  resolveFillValue,
  resolveStrokeColor,
  resolveStrokeDasharray,
} from "../data/floorPlanStyle";
import { FloorPlanFillDefs } from "../components/map/FloorPlanFillDefs";
import { FloorPlanTransformBox } from "../components/map/FloorPlanTransformBox";
import { alignPosition, DraggableNode, PannableCanvas } from "../components/common/GraphPrimitives";
import { CanvasWorkbench } from "../components/common/CanvasWorkbench";
import HeightMapImage from "../components/map/HeightMapImage";
import {
  CompassGraphic,
  DimensionGraphic,
  formatAreaLabel,
  formatDimensionLabel,
  formatRealDistance,
  MeasureLineGraphic,
  ScaleBarGraphic,
} from "../components/map/MapDecorations";
import { drawFloorPlanSymbolToCanvas, FLOOR_PLAN_SYMBOL_TYPES, FloorPlanSymbolIcon, SYMBOL_SIZE } from "../components/map/FloorPlanSymbols";
import {
  DEFAULT_LANDMARK_ICON_COLOR,
  drawFloorPlanLandmarkIconToCanvas,
  FloorPlanLandmarkIconGraphic,
  LANDMARK_ICON_SIZE,
} from "../components/map/FloorPlanLandmarkIcons";
import { listLandmarkIconTypes, ensureBuiltInLandmarkIconTypes } from "../data/repositories/landmarkIconType";
import { MapRulerOverlay, RULER_SIZE } from "../components/map/MapRuler";
import { applyHeightRampToCanvas, DEFAULT_SEA_COLOR } from "../data/heightColorRamp";
import ColorInput from "../components/common/ColorInput";
import Modal from "../components/common/Modal";
import DropdownMenu from "../components/common/DropdownMenu";
import { useConfirm } from "../components/common/ConfirmProvider";
import { useSidePanel } from "../components/common/SidePanelProvider";
import { downloadBlob } from "../data/downloadFile";
import { buildImagePdfBlob } from "../data/manuscript/exportPdf";
import VersionHistoryDialog from "../components/common/VersionHistoryDialog";
import { useLocalUser } from "../localUser";
import { getLocalUser } from "../data/repositories/localUser";
import { useLanguage, type TranslationKey } from "../i18n";
import {
  canvasToDataUrl,
  clearToSea,
  drawImageToCanvas,
  generateRandomTerrain,
  loadHeightMapIntoCanvas,
  loadImageFile,
  paintDab,
  paintDabsAlong,
  trimDab,
  trimDabsAlong,
} from "../data/terrainBrush";

/** 拖曳筆刷即時預覽兩次編碼之間至少間隔多久（毫秒）：畫布全解析度編碼成 PNG 本身要價不低
 * （大地圖上實測 300ms 以上），拖曳中每個 rAF 都編碼會直接卡死；改成縮圖編碼雖然不卡，但縮圖
 * 跟放開滑鼠後看到的全解析度結果長得不一樣（使用者反應「長按跟放開是兩種樣子」）。
 * 這裡改成兩者都用同一個全解析度編碼函式，只是拖曳中限制編碼頻率——放開滑鼠前後看到的
 * 永遠是同一份全解析度畫面，只是拖曳中更新得比較不頻繁（不是每個 rAF 都更新） */
const PREVIEW_MIN_INTERVAL_MS = 250;

/** 拖曳筆刷這一筆的歷史紀錄上限：每筆存一份全解析度 dataURL，太多筆會佔用大量記憶體 */
const MAX_HISTORY = 20;

/** 平面圖變動的歷史紀錄上限：每筆存一份完整的 FloorPlanData（牆／房間／圖層都是小資料，不像
 * 地形點陣圖那樣有記憶體壓力，可以存得比地形歷史紀錄多一些） */
const FP_MAX_HISTORY = 50;

/** 地形筆刷（draw/erase/trim）跟平面圖向量工具（select/wall/room/dimension/symbol/polygon）並列在
 * 同一排工具列裡，選哪個工具、點畫布就做哪件事，兩種內容一直都畫在同一張地圖／同一個畫布上，
 * 不需要先切換「模式」才能用——使用者要能在兩者之間隨時交替，不是先選邊站的兩個分開頁面 */
type Tool =
  | "draw"
  | "erase"
  | "trim"
  | "select"
  | "pan"
  | "wall"
  | "room"
  | "dimension"
  | "symbol"
  | "polygon"
  | "text"
  | "landmarkPoint"
  | "landmarkArea";

/** 平面圖物件的種類＋單一物件的選取記錄；fpSelected 現在是陣列（框選可以一次選到多個），
 * 單擊物件一律「取代」整個選取集合成只有這一個（不做 shift 加選之類的疊加，維持簡單），只有
 * 框選才會產生多選 */
type FpSelection = { type: FpItemType; id: string };
const BRUSH_TOOLS = new Set<Tool>(["draw", "erase", "trim"]);
/** 畫牆／房間／標註／符號／多邊形／文字／地標點／地標區域這幾個工具都是「點畫布放置東西」的
 * 操作，會用到物件鎖點／格點吸附／正交模式，跟選取工具（純點選既有物件）不一樣，用這個集合
 * 統一判斷要不要顯示放置預覽／游標樣式——多邊形／地標區域雖然是多次點擊才完成，一樣算在內
 * （沿用既有 polygon 的做法：這裡只管游標樣式跟 hover 預覽點，實際的多點邏輯在 handleFpDrawStart） */
const POINT_PLACEMENT_TOOLS = new Set<Tool>([
  "wall",
  "room",
  "dimension",
  "symbol",
  "polygon",
  "text",
  "landmarkPoint",
  "landmarkArea",
]);
/** 8 種物件型別的翻譯 key：對齊工具「指定物件為錨點」的清單用「房間 1」「符號 2」這種型別名稱
 * ＋選取集合裡的序號標示每個選項，方便使用者分辨要指定哪一個當錨點 */
const FP_ITEM_TYPE_LABEL: Record<FpItemType, TranslationKey> = {
  wall: "fpItemType.wall",
  room: "fpItemType.room",
  dimension: "fpItemType.dimension",
  symbol: "fpItemType.symbol",
  polygon: "fpItemType.polygon",
  text: "fpItemType.text",
  landmarkPoint: "fpItemType.landmarkPoint",
  landmarkArea: "fpItemType.landmarkArea",
};
/** 指北針款式選單的清單＋預覽小圖用的翻譯 key，見「指北針」彈出視窗 */
const COMPASS_STYLE_OPTIONS: { value: CompassStyle; labelKey: TranslationKey }[] = [
  { value: "classic", labelKey: "compassStyle.classic" },
  { value: "rose", labelKey: "compassStyle.rose" },
  { value: "arrow", labelKey: "compassStyle.arrow" },
];

// 這幾個是「螢幕像素」大小（不是內容座標），畫的時候要除以目前縮放比例換算成內容座標尺寸，
// 手柄／點擊熱區才不會縮得比游標還小——縮到很小張（例如整層樓平面圖縮到 20% 顯示）時，
// 固定內容像素大小的手柄會小到滑鼠幾乎點不到，這裡讓手柄在螢幕上永遠是同一個大小
/** 地標區域未自訂樣式時的預設顏色：跟房間／多邊形共用的 var(--accent) 區隔開來，讓地標區域
 * 一眼就能跟一般房間分開，選用跟地標點圖示風格搭的暖金色 */
const LANDMARK_FALLBACK_COLOR = "#c9a463";

/** 把地標圖示類型上傳的 dataURL 圖片載成 HTMLImageElement，供匯出 PNG 時用 ctx.drawImage 畫——
 * 跟 terrainBrush.ts 的 loadImageFile 是同一種 Promise 包裝，但來源是已經存好的 dataURL 字串，
 * 不是使用者這次選的 File，邏輯更簡單不需要 createObjectURL/revokeObjectURL */
function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = dataUrl;
  });
}

const WALL_HIT_SCREEN_WIDTH = 14;
const ENDPOINT_HANDLE_SCREEN_R = 6;
const ROOM_MIN_SIZE = 20;
/** 物件鎖點的吸附半徑（螢幕像素）：畫新牆／房間／標註時，游標落在既有牆端點／中點或房間角點
 * 這個距離內就直接吸附過去，比格點吸附優先（見 fpSnap） */
const OBJECT_SNAP_SCREEN_PX = 10;
/** 拖曳智慧參考線的偵測半徑（螢幕像素）：拖曳中的物件邊界跟其他物件邊界的距離在這範圍內才會顯示
 * 參考線並貼齊，比照 OBJECT_SNAP_SCREEN_PX 同樣是螢幕像素常數（見 resolveAlignmentSnap 用法） */
const ALIGN_GUIDE_SCREEN_PX = 6;
/** 複製貼上時新物件相對原物件的偏移量（內容像素），讓貼上的複本不會完全疊在原物件正上方看不出來 */
const PASTE_OFFSET = 20;
/** 多邊形頂點手柄／點擊多邊形起點視為封閉的判定半徑（螢幕像素） */
const POLYGON_VERTEX_HANDLE_SCREEN_R = 6;
const POLYGON_CLOSE_SCREEN_PX = 12;

/** -100~100 的筆刷高度（正＝陸地、負＝海面下、0＝海平面）換算成灰階畫布用的 0~255 亮度值 */
function grayFromHeight(height: number): number {
  return Math.round(((height + 100) / 200) * 255);
}

/** Shift 鎖比例：把 (x1,y1)→(x2,y2) 這個邊界框鎖成正方形，取寬高位移量「絕對值較大的那一軸」
 * 當邊長，另一軸依原本的方向（正或負）套用同樣的邊長——畫房間拖曳中、拖曳縮放 handle 都共用
 * 這個純函式，只是呼叫端各自決定「起點」是什麼（畫房間是拖曳起點，縮放是房間左上角） */
function lockSquare(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: x1 + Math.sign(dx || 1) * size, y: y1 + Math.sign(dy || 1) * size };
}

/** 依房間的外框（x,y,width,height）＋形狀，畫出對應的 SVG 圖形元素——房間繪製中的即時預覽、
 * 已存檔房間的正式渲染都呼叫這個函式，形狀分流邏輯只寫一次。rect／circle 直接用原生的
 * `<rect>`/`<ellipse>`（比較單純、也不用動既有的矩形專屬計算），其餘形狀呼叫
 * `getRoomShapePoints` 算頂點後用 `<polygon>` 畫出來 */
function renderRoomShape(shape: RoomShape, x: number, y: number, width: number, height: number, props: React.SVGProps<SVGElement>) {
  if (shape === "rect") return <rect x={x} y={y} width={width} height={height} {...(props as React.SVGProps<SVGRectElement>)} />;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;
  if (shape === "circle") return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} {...(props as React.SVGProps<SVGEllipseElement>)} />;
  const points = getRoomShapePoints(shape, cx, cy, rx, ry) ?? [];
  return <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} {...(props as React.SVGProps<SVGPolygonElement>)} />;
}

/** Canvas 2D 版本的 renderRoomShape：把房間外框＋形狀畫成一條 ctx path（呼叫端接著自己
 * fill/stroke），供匯出圖片用——跟上面 SVG 版共用同一份 getRoomShapePoints 幾何邏輯，兩邊畫出來
 * 的形狀保證一致 */
function traceRoomShapePath(ctx: CanvasRenderingContext2D, shape: RoomShape, x: number, y: number, width: number, height: number) {
  ctx.beginPath();
  if (shape === "rect") {
    ctx.rect(x, y, width, height);
    return;
  }
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2;
  const ry = height / 2;
  if (shape === "circle") {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    return;
  }
  const points = getRoomShapePoints(shape, cx, cy, rx, ry) ?? [];
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** 拖曳中即時跟著移動＋放開才真正寫入的共用邏輯（比例尺／指北針共用，兩者原本各自複製一份
 * 幾乎一樣的 state+ref+onDrag/onDragEnd，抽成這個 hook 避免以後改一邊漏了另一邊）：state 給
 * 畫面即時重繪，ref 額外同步存一份給 onDragEnd 讀——拖曳放開時 pointerup 常常跟最後一次
 * pointermove 同一輪處理，state 更新還沒真的 re-render、onDragEnd 的 closure 讀到的 state
 * 可能還是上一輪的（甚至是 null），ref 賦值是同步的，不會有這個問題 */
function useLiveDragPosition(onCommit: (pos: { x: number; y: number }) => void) {
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);
  const liveRef = useRef<{ x: number; y: number } | null>(null);
  const onDrag = (_id: string, pos: { x: number; y: number }) => {
    liveRef.current = pos;
    setLivePos(pos);
  };
  const onDragEnd = () => {
    const pos = liveRef.current;
    liveRef.current = null;
    setLivePos(null);
    if (pos) onCommit(pos);
  };
  return { livePos, onDrag, onDragEnd };
}

/** 跟 useLiveDragPosition 同一個構想，差別是這裡的 id 不固定（平面圖裡房間／牆端點數量不固定），
 * 用 id 字串對號讓同一組 state／ref 服務同一類別裡任意多個可拖曳物件，不必每個房間各開一個 hook */
function useLiveDragById(onCommit: (id: string, pos: { x: number; y: number }) => void) {
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const liveRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const onDrag = (id: string, pos: { x: number; y: number }) => {
    const next = { id, x: pos.x, y: pos.y };
    liveRef.current = next;
    setLive(next);
  };
  const onDragEnd = (id: string) => {
    const cur = liveRef.current;
    liveRef.current = null;
    setLive(null);
    if (cur && cur.id === id) onCommit(id, { x: cur.x, y: cur.y });
  };
  return { live, onDrag, onDragEnd };
}

function LabeledSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 180 }} title={hint}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ flex: 1, minWidth: 0, accentColor: "var(--accent)" }}
        />
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ width: 64, flexShrink: 0 }}
        />
      </div>
    </div>
  );
}

/** 左側工具列的線稿圖示：一律用 currentColor 描邊／填色，跟著按鈕本身的文字顏色走——按鈕選中時
 * className 換成 btn-primary、文字顏色跟著變，圖示因為用 currentColor 也會自動換成同一個顏色，
 * 不用另外準備「選中狀態」的圖示配色。純裝飾用，實際名稱靠按鈕的 title 屬性做 hover 提示 */
function MapToolIcon({
  tool,
  shape,
  landmarkIconType,
}: {
  tool: Tool;
  shape?: RoomShape;
  landmarkIconType?: LandmarkIconType;
}) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (tool) {
    case "draw":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <path d="M14 3l5 5-9 9c-1.5 1.5-4 1.5-5 0s-1.5-3.5 0-5l9-9z" {...stroke} />
          <path d="M12.5 5.5l4 4" {...stroke} />
        </svg>
      );
    case "erase":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <g transform="rotate(-20 11 11)">
            <rect x={5} y={8} width={12} height={7} rx={1.5} {...stroke} />
            <line x1={5} y1={12.3} x2={17} y2={12.3} {...stroke} />
          </g>
        </svg>
      );
    case "trim":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <circle cx={6} cy={6} r={2.1} {...stroke} />
          <circle cx={6} cy={16} r={2.1} {...stroke} />
          <line x1={7.7} y1={7.4} x2={18} y2={17} {...stroke} />
          <line x1={7.7} y1={14.6} x2={18} y2={5} {...stroke} />
        </svg>
      );
    case "select":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <path d="M6 3v15l4-3.3 2.3 5 2-1-2.3-5 4.7 0z" fill="currentColor" />
        </svg>
      );
    case "pan":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <g fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11.5V5a1.2 1.2 0 0 1 2.4 0v6" />
            <path d="M9.4 11V4a1.2 1.2 0 0 1 2.4 0v7" />
            <path d="M11.8 11.2V5.2a1.2 1.2 0 0 1 2.4 0v6.3" />
            <path d="M14.2 11.8V8a1.1 1.1 0 0 1 2.2 0v5.2c0 2.9-1.9 5.3-4.8 5.3h-1.6c-1.7 0-2.7-.6-3.6-1.8l-2.5-3.3c-.5-.6-.3-1.5.3-1.9.6-.4 1.4-.2 1.9.4l1.1 1.4" />
          </g>
        </svg>
      );
    case "wall":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <line x1={4} y1={11} x2={18} y2={11} stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <circle cx={4} cy={11} r={1.6} fill="currentColor" />
          <circle cx={18} cy={11} r={1.6} fill="currentColor" />
        </svg>
      );
    case "room": {
      // 房間工具的圖示跟著目前選的幾何形狀變（長按可換形狀，見左側工具列），不是永遠畫方形——
      // 圓形／三角／五角／六角／星形直接借用 getRoomShapePoints 算頂點，跟畫布上實際畫出來的
      // 形狀共用同一套幾何邏輯，不用另外手畫六種圖示
      const s = shape ?? "rect";
      if (s === "rect") {
        return (
          <svg viewBox="0 0 22 22" width={20} height={20}>
            <rect x={4} y={5} width={14} height={12} {...stroke} />
          </svg>
        );
      }
      if (s === "circle") {
        return (
          <svg viewBox="0 0 22 22" width={20} height={20}>
            <ellipse cx={11} cy={11} rx={7} ry={7} {...stroke} />
          </svg>
        );
      }
      const points = getRoomShapePoints(s, 11, 11, 7.5, 7.5) ?? [];
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <polygon points={points.map((p) => `${p.x},${p.y}`).join(" ")} {...stroke} />
        </svg>
      );
    }
    case "dimension":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <line x1={4} y1={7} x2={4} y2={15} {...stroke} />
          <line x1={18} y1={7} x2={18} y2={15} {...stroke} />
          <line x1={4} y1={11} x2={18} y2={11} {...stroke} />
        </svg>
      );
    case "symbol":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <line x1={6} y1={5} x2={16} y2={5} {...stroke} />
          <line x1={6} y1={5} x2={6} y2={9} {...stroke} />
          <line x1={16} y1={5} x2={16} y2={9} {...stroke} />
          <rect x={6} y={9} width={10} height={8} rx={1.5} {...stroke} />
        </svg>
      );
    case "polygon":
      // 鋼筆工具（原「多邊形」更名＋換圖示，行為不變：依序點頂點、點回起點或按「完成」封閉）
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <path d="M14 3l5 5-2 2-5-5z" fill="currentColor" />
          <path d="M12 6l-7 7-1 5 5-1 7-7z" {...stroke} />
          <circle cx={5} cy={17} r={1.1} fill="currentColor" />
        </svg>
      );
    case "text":
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <text x={11} y={16} fontSize={16} fontWeight={700} textAnchor="middle" fill="currentColor">
            A
          </text>
        </svg>
      );
    case "landmarkPoint":
      // 地標點工具的圖示跟著目前選的圖示種類變（長按可換，見左側工具列），借用跟畫布上實際渲染
      // 同一套 FloorPlanLandmarkIconGraphic，不用另外手畫縮圖；landmarkIconType 是 undefined
      // 時（例如清單還沒載入完成）退回通用圖釘。這裡還沒有實際放置的地標點，沒有 customText
      // 可以顯示（那是每個地標點自己的欄位），所以不傳 initial，單純預覽圖示形狀＋顏色
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <g transform="translate(11 11) scale(0.3)">
            <FloorPlanLandmarkIconGraphic
              builtInKey={landmarkIconType?.builtInKey}
              customImage={landmarkIconType?.customImage}
              color={landmarkIconType?.defaultColor}
              textColor={landmarkIconType?.textColor}
              fillColor={landmarkIconType?.fillColor}
            />
          </g>
        </svg>
      );
    case "landmarkArea":
      // 地標區域：一個虛線圈＋圖釘，示意「圈一塊地點的範圍」
      return (
        <svg viewBox="0 0 22 22" width={20} height={20}>
          <ellipse cx={11} cy={12} rx={8} ry={6} fill="none" stroke="currentColor" strokeWidth={1.4} strokeDasharray="2.5 2.5" />
          <path d="M11 5a3 3 0 0 1 3 3c0 2.2-3 5.5-3 5.5S8 10.2 8 8a3 3 0 0 1 3-3z" fill="currentColor" />
          <circle cx={11} cy={8} r={1.1} fill="var(--bg)" />
        </svg>
      );
  }
}

interface MapViewPageProps {
  /** 提供時取代網址參數，供側邊面板用指定的地圖渲染這個元件（面板不在 <Outlet> 底下，拿不到路由參數／context） */
  mapIdOverride?: string;
  worldIdOverride?: string;
  embedded?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

/** 單一已儲存地圖的畫布：一張地圖同時支援「地形」（手繪高度圖筆刷）跟「平面圖」（畫牆／房間的
 * 向量工具＋圖層）兩套內容，疊在同一個畫布上——兩套工具並列在同一排工具列裡，選哪個工具、
 * 點畫布就做哪件事，不需要先切換「模式」，可以隨時交替使用 */
export default function MapViewPage({ mapIdOverride, worldIdOverride, embedded = false, onDirtyChange }: MapViewPageProps = {}) {
  const outletContext = useOutletContext<{ world: World } | undefined>();
  const params = useParams<{ mapId: string }>();
  const worldId = worldIdOverride ?? outletContext?.world.id;
  const mapId = mapIdOverride ?? params.mapId;
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const { openPanel, closePanel, panelWidth } = useSidePanel();

  const map = useLiveQuery(() => (mapId ? getMap(mapId) : undefined), [mapId]);
  const { currentUserId } = useLocalUser();
  const currentLocalUser = useLiveQuery(() => (currentUserId ? getLocalUser(currentUserId) : undefined), [currentUserId]);
  const [showHistory, setShowHistory] = useState(false);

  // 地標連結：查一次「地點」分類（builtInKey，不用名稱字串比對，使用者可能自建其他分類）底下的
  // 所有資訊卡，整個元件共用同一份查詢結果（供「連結地點」下拉選單＋每個地標的標籤解析共用），
  // 不要每個地標各自查一次
  const locationCategory = useLiveQuery(
    () => (worldId ? db.categories.where({ worldId, builtInKey: "location" }).first() : undefined),
    [worldId]
  );
  const locationEntries =
    useLiveQuery(
      () => (locationCategory ? db.entries.where({ worldId, categoryId: locationCategory.id }).toArray() : []),
      [worldId, locationCategory?.id]
    ) ?? [];
  const entryNameById = new Map(locationEntries.map((e) => [e.id, e.name]));

  // 地標圖示類型：內建 9 種＋使用者自訂，整個世界共用一份，隨時可能被「管理」頁改名/新增/
  // 刪除，這裡用 useLiveQuery 即時反映，不快取成本地 state
  const landmarkIconTypes = useLiveQuery(() => (worldId ? listLandmarkIconTypes(worldId) : []), [worldId]) ?? [];
  // 除了用 id 查，內建類型額外用 builtInKey（例如 "town"）也註冊一份查得到——舊資料的
  // FloorPlanLandmarkPoint.icon／landmarkIcon 預設值都是直接存這種字面值，內建類型的 id 現在改成
  // newId() 產生（見 ensureBuiltInLandmarkIconTypes 的說明：id 拿固定字面值當每個世界都用同一把
  // 資料庫主鍵會互撞），這裡補一層回退比對，舊資料才不會突然找不到對應類型、退化成通用圖釘
  const landmarkIconTypeById = new Map<string, LandmarkIconType>();
  for (const t of landmarkIconTypes) {
    landmarkIconTypeById.set(t.id, t);
    if (t.builtInKey && !landmarkIconTypeById.has(t.builtInKey)) landmarkIconTypeById.set(t.builtInKey, t);
  }
  /** 地標點顯示用的解析結果：標籤文字（自訂 label → 連結地點名稱 → 類型名稱 → icon id 本身）、
   * 目前生效線條顏色（point.color → 類型的 defaultColor → 全域預設）、通用圖釘釘頭文字顏色
   * （point.textColor → 類型的 textColor → 線條顏色）、通用圖釘填滿顏色（point.fillColor → 類型的
   * fillColor，都沒設定則維持鏤空）、釘頭上要疊的文字（純粹是 point.customText，留空就是不顯示，
   * 不會退回類型名稱或名稱首字——這是每個地標點自己的選擇）、對應的圖示類型（可能是
   * undefined——類型在「管理」頁被刪除時的優雅退化，見 deleteLandmarkIconType 說明） */
  const resolveLandmarkPointDisplay = (point: FloorPlanLandmarkPoint) => {
    const iconType = landmarkIconTypeById.get(point.icon);
    const color = point.color || iconType?.defaultColor || DEFAULT_LANDMARK_ICON_COLOR;
    return {
      iconType,
      label: point.label || entryNameById.get(point.linkedEntryId ?? "") || iconType?.label || point.icon,
      color,
      iconTextColor: point.textColor || iconType?.textColor || color,
      iconFillColor: point.fillColor || iconType?.fillColor,
      iconCustomText: point.customText,
    };
  };

  const [editing, setEditing] = useState(false);
  const [showMapSizeDialog, setShowMapSizeDialog] = useState(false);
  const [showScaleBarModal, setShowScaleBarModal] = useState(false);
  const [showCompassModal, setShowCompassModal] = useState(false);
  // 「地圖設定」視窗打開當下的原始值（取消／比較前後要退回這裡）；視窗關閉後清空
  const [mapSettingsOriginal, setMapSettingsOriginal] = useState<{
    width: number;
    height: number;
    seaColor?: string;
  } | null>(null);
  // 是否正在「比較前後」——true 時畫面暫時退回 mapSettingsOriginal 顯示「之前」，
  // mapSettingsAfterRef 記住切回去之前的「之後」草稿，讓再按一次能還原
  const [mapSettingsComparing, setMapSettingsComparing] = useState(false);
  const mapSettingsAfterRef = useRef<{ width: number; height: number; seaColor?: string } | null>(null);
  const [metaDraft, setMetaDraft] = useState<{
    name: string;
    description?: string;
    tagColor?: string;
    seaColor?: string;
    width: number;
    height: number;
  } | null>(null);
  const [liveViewport, setLiveViewport] = useState<{ x: number; y: number; scale: number } | null>(null);
  // 手柄／吸附半徑要換算成內容座標尺寸（見上面常數區塊的說明），這裡提早算好供整個元件共用，
  // 不用等到最下面渲染前才算——平面圖的拖曳／吸附相關 handler 也需要用到
  const viewScale = liveViewport?.scale ?? 1;

  const [tool, setTool] = useState<Tool>("draw");
  const isBrushTool = BRUSH_TOOLS.has(tool);

  const [brushHeight, setBrushHeight] = useState(30);
  const [brushRadius, setBrushRadius] = useState(60);
  const [falloff, setFalloff] = useState(0.5);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPreviewAtRef = useRef(0);
  /** 銳利化這一筆拖曳開始時凍結的畫布快照，讓沿路徑重疊的每個 dab 都從同一份像素取樣，
   * 避免銳利化這種發散效果隨拖曳中重疊次數一路疊加成雜訊（見 terrainBrush.ts 的 trimDab 說明） */
  const trimSharpenBaselineRef = useRef<HTMLCanvasElement | null>(null);
  /** 上一步／下一步歷史紀錄：每筆畫完（放開滑鼠）、隨機生成、清空地圖都算一步。用 ref 存整份堆疊
   * （避免大字串陣列進 state 拖累重繪），另外用 canUndo/canRedo 兩個 state 只反映「按鈕能不能按」，
   * 換地圖或改尺寸重建畫布時（見下面的初始化 effect）會重置成只有目前這張的起始狀態 */
  const historyRef = useRef<{ stack: (string | undefined)[]; index: number }>({ stack: [], index: -1 });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const terrainFileInputRef = useRef<HTMLInputElement | null>(null);
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  // 非 embedded 時，畫布可視窗尺寸（傳給 PannableCanvas 的 width/height）不再寫死 900×640——
  // CanvasWorkbench 分給畫布的實際空間會隨 toolbar／左右面板內容多寡、視窗高度而變（見
  // CanvasWorkbench.tsx 的說明），寫死尺寸太大時畫布會被裁切成要內部捲動才看得到全部
  // （這正是「地圖空間太小」的成因），太小則平白浪費版面分給畫布的空間。改成量測畫布實際能用的
  // 容器尺寸（見下面 canvasHostRef 那個 100%×100% 的量測用容器），量到之前先不掛載
  // PannableCanvas，避免用一個錯誤的初始尺寸掛載又立刻抓到正確尺寸，觸發它内部「尺寸變了要
  // 重新置中」的邏輯，把使用者上次存的檢視角度／縮放蓋掉
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const [measuredCanvasSize, setMeasuredCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const scaleBarDrag = useLiveDragPosition((pos) => {
    if (map?.scaleBar) updateMapState(map.id, { scaleBar: { ...map.scaleBar, ...pos } });
  });
  const compassDrag = useLiveDragPosition((pos) => {
    if (map?.compass) updateMapState(map.id, { compass: { ...map.compass, ...pos } });
  });
  // 比例尺／指北針的文字／數字欄位本地草稿：直接把 <input> 綁在 map.scaleBar/map.compass 上、
  // 每個按鍵都立刻 updateMapState 的話，寫入要等 IndexedDB 認回、useLiveQuery 重新查詢才會反映回
  // 畫面上的 value——打字快一點就會覺得游標跳動或漏字。改成打字先存本地草稿，失焦（或按 Enter）
  // 才真正寫入資料庫，跟這個檔案的 metaDraft／儲存是同一套「本地草稿、確認才送出」的精神
  const [scaleBarDistanceDraft, setScaleBarDistanceDraft] = useState<number | null>(null);
  const [scaleBarUnitDraft, setScaleBarUnitDraft] = useState<string | null>(null);
  const [scaleBarLengthDraft, setScaleBarLengthDraft] = useState<number | null>(null);
  const [compassRotationDraft, setCompassRotationDraft] = useState<number | null>(null);
  const [compassLabelDrafts, setCompassLabelDrafts] = useState<Partial<Record<"n" | "e" | "s" | "w", string>>>({});
  // 文字物件的內容／字級也是同一套「本地草稿、失焦或按 Enter 才真正寫入」——不然每打一個字都
  // commitFloorPlan（連帶寫資料庫＋推一筆復原記錄），打一段文字就會塞爆復原堆疊
  const [textContentDraft, setTextContentDraft] = useState<string | null>(null);
  const [textFontSizeDraft, setTextFontSizeDraft] = useState<number | null>(null);
  // 地標點／地標區域的自訂標籤也是同一套「本地草稿、失焦才 commit」
  const [landmarkLabelDraft, setLandmarkLabelDraft] = useState<string | null>(null);
  // 地標點釘頭自訂文字（單一字元）草稿，同一套「本地草稿、失焦才 commit」
  const [landmarkCustomTextDraft, setLandmarkCustomTextDraft] = useState<string | null>(null);

  // 尺規顯示、量距離工具都是純工作區輔助（像 Photoshop 的尺規／量尺工具），跟畫面上的縮放平移
  // 一樣屬於「這次瀏覽」的暫時狀態，不隨地圖內容一起存進資料庫
  const [showRuler, setShowRuler] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } | null } | null>(null);

  // 平面圖內容：地圖還沒用過平面圖工具時 map.floorPlan 是 undefined，這裡用一個空殼當安全預設值，
  // 真正第一次寫入資料庫是在 startEdit（見下方）——一進編輯模式就順便建好，讓地形／平面圖兩套
  // 工具從一開始就都能用，不用等使用者先手動點過平面圖工具才生效
  const floorPlan: FloorPlanData = map?.floorPlan ?? {
    layers: [],
    activeLayerId: "",
    walls: [],
    rooms: [],
    dimensions: [],
    symbols: [],
    polygons: [],
    texts: [],
    landmarkPoints: [],
    landmarkAreas: [],
  };
  // 地標點／地標區域一律直接指定歸屬這個圖層，不透過 activeLayerId——同一張地圖固定恰好一個
  // （見 createDefaultFloorPlan／startEdit 的回填邏輯），編輯模式下必定找得到
  const landmarkLayer = floorPlan.layers.find((l) => l.isLandmarkLayer);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(40);
  const [orthoEnabled, setOrthoEnabled] = useState(true);
  /** 正交模式鎖角的間隔（度）：使用者可自訂，不是只能固定 45°——例如想鎖 30° 一格畫六角形式的牆面 */
  const [orthoStep, setOrthoStep] = useState(45);
  /** 拖曳智慧參考線開關（預設開啟）：拖曳單一物件時，如果邊緣/中心線接近其他可見物件，顯示虛線
   * 提示並自動貼齊，跟格點吸附是互斥的優先序（見 resolveAlignmentSnap）——兩者都啟用時，智慧參考線
   * 抓到就不再套用格點吸附，因為對齊實際物件通常比對齊抽象格點更符合使用者意圖 */
  const [alignGuideEnabled, setAlignGuideEnabled] = useState(true);
  /** 目前要畫的參考線座標（內容座標系，橫跨整張地圖）；拖曳結束要記得清空，避免殘留 */
  const [fpAlignGuides, setFpAlignGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [roomDraft, setRoomDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  /** 目前選來畫的幾何形狀：房間工具不再只能畫矩形，長按房間按鈕可以換成圓形／三角／五角／六角／
   * 星形（見左側工具列），這裡記「下一個畫出來的房間要用哪種形狀」，跟符號工具的 symbolType 是
   * 同一種設計 */
  const [roomShape, setRoomShape] = useState<RoomShape>("rect");
  /** 長按房間按鈕開啟形狀選單的計時器／狀態：短按（放開時計時器還沒到）＝直接切到房間工具、沿用
   * 目前的 roomShape；長按超過門檻＝改成打開形狀選單，放開時不要再誤觸「切到房間工具」 */
  const roomLongPressTimerRef = useRef<number | null>(null);
  const roomLongPressFiredRef = useRef(false);
  /** 地標點按鈕的長按開圖示選單計時器／狀態，跟房間按鈕是同一套機制 */
  const landmarkLongPressTimerRef = useRef<number | null>(null);
  const landmarkLongPressFiredRef = useRef(false);
  /** 目前是否按著 Shift：拖曳畫房間／拖曳縮放 handle 時用來鎖定外框長寬比例（正方形邊界框），
   * DraggableNode 的 onDrag 不會傳滑鼠事件／modifier key 狀態，只能自己在 window 上另外監聽 */
  const shiftPressedRef = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftPressedRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftPressedRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);
  const [dimensionStart, setDimensionStart] = useState<{ x: number; y: number } | null>(null);
  /** 目前選來放的符號類型：符號工具本身不像牆／房間只有一種畫法，需要另外知道「這次點畫布要放哪一種」 */
  const [symbolType, setSymbolType] = useState<FloorPlanSymbolType>("door");
  /** 多邊形房間繪製中的頂點：null＝目前沒在畫；每點一下畫布加一個頂點，點回起點附近或按「完成」封閉 */
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[] | null>(null);
  /** 目前選來放的地標點圖示：跟符號的 symbolType、房間的 roomShape 是同一種設計 */
  const [landmarkIcon, setLandmarkIcon] = useState<string>("town");
  /** 地標區域繪製中的頂點：跟 polygonPoints 是同一種鋼筆式點頂點邏輯，但故意用獨立的一組 state——
   * 避免使用者畫到一半切換「鋼筆」/「地標區域」兩個工具時，半成品路徑被誤當成另一種物件收尾 */
  const [landmarkAreaPoints, setLandmarkAreaPoints] = useState<{ x: number; y: number }[] | null>(null);
  /** 選取的物件集合：陣列，空陣列＝沒有選取任何東西。單擊物件一律「取代」成只選這一個，框選
   * （見 selectBoxDraft）才會一次選到多個 */
  const [fpSelected, setFpSelected] = useState<FpSelection[]>([]);
  /** 對齊工具的兩種模式：「以選取範圍為準」（用所有選取物件的聯集邊界當基準）／「指定物件為錨點」
   * （用其中一個選取物件自己的邊界當基準，其餘物件對齊過去，錨點本身不動）。選取集合一變動就重置
   * 回預設模式並清掉錨點，避免錨點指到已經不在選取集合裡的物件 */
  const [alignMode, setAlignMode] = useState<"range" | "anchor">("range");
  const [alignAnchorKey, setAlignAnchorKey] = useState<string | null>(null);
  useEffect(() => {
    setAlignMode("range");
    setAlignAnchorKey(null);
  }, [fpSelected]);
  /** 框選中的暫存框（select 工具在空白處拖曳時用）：null＝目前沒在框選。放開時比較起訖點的距離，
   * 距離太小（沒真的拖曳、只是單純點一下）視為「點空白處清空選取」，維持原本點一下清空的直覺 */
  const [selectBoxDraft, setSelectBoxDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  /** 多選後「拖任何一個被選到的物件，全部一起移動」的共用位移量：ref 給拖放開那一刻讀（避免
   * state 更新跟最後一次 pointermove 同一輪處理、還沒真的 re-render 就被讀到舊值的既有慣例問題，
   * 見下面 useLiveDragById 的說明），state 純粹給畫面即時預覽用。只有 fpSelected.length > 1 時
   * 才會進入這個路徑，單一物件的拖曳走各自原本的單一物件 drag hook，不受影響 */
  const groupDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const [groupDragDelta, setGroupDragDelta] = useState<{ dx: number; dy: number } | null>(null);
  const [layerNameDrafts, setLayerNameDrafts] = useState<Record<string, string>>({});
  const fpHistoryRef = useRef<{ stack: FloorPlanData[]; index: number }>({ stack: [floorPlan], index: 0 });
  const [fpCanUndo, setFpCanUndo] = useState(false);
  const [fpCanRedo, setFpCanRedo] = useState(false);
  // 複製貼上：clipboardRef 存實際資料（ref 不觸發重繪，貼上當下才需要讀），hasClipboard 這個
  // state 純粹只給「貼上」按鈕的 disabled 狀態用——ref 本身變動不會讓按鈕重新渲染。陣列＝可以
  // 一次複製／貼上多選的物件，跟 fpSelected 一樣
  const clipboardRef = useRef<
    {
      type: FpItemType;
      data:
        | FloorPlanWall
        | FloorPlanRoom
        | FloorPlanDimension
        | FloorPlanSymbol
        | FloorPlanPolygonRoom
        | FloorPlanText
        | FloorPlanLandmarkPoint
        | FloorPlanLandmarkArea;
    }[]
  >([]);
  const [hasClipboard, setHasClipboard] = useState(false);
  /** 按住空白鍵暫時切換成手形工具（比照 Photoshop 慣例）：spaceHeldRef 避免按住不放時，鍵盤原生的
   * repeat keydown 事件每次都重新記錄一次「切換前的工具」（那樣放開時只會還原成「最後一次 repeat
   * 當下」的工具，而不是真正一開始在用的工具）；preSpaceToolRef 記錄空白鍵按下那一刻原本在用的工具，
   * 放開時還原回去 */
  const spaceHeldRef = useRef(false);
  const preSpaceToolRef = useRef<Tool>("select");

  // 掛載時初始化 offscreen canvas：用「canvas 實例還不存在」判斷是否要初始化，不能用「跟上次寫入的值比對」
  // 這種去重方式——第一次渲染兩邊都是 undefined 會誤判「沒變化」而完全沒建立畫布
  useEffect(() => {
    if (!map || canvasRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = map.width;
    canvas.height = map.height;
    const ctx = canvas.getContext("2d");
    const resetHistory = () => {
      historyRef.current = { stack: [map.heightMap], index: 0 };
      setCanUndo(false);
      setCanRedo(false);
    };
    if (map.heightMap && ctx) {
      loadHeightMapIntoCanvas(canvas, map.heightMap)
        .catch(() => clearToSea(ctx, map.width, map.height))
        .then(resetHistory);
    } else if (ctx) {
      clearToSea(ctx, map.width, map.height);
      resetHistory();
    }
    canvasRef.current = canvas;
  }, [map]);

  /** 沿拖曳路徑即時預覽：跟放開滑鼠後儲存的畫面用同一個全解析度編碼函式，只是拖曳中限制更新頻率，
   * 確保長按拖曳時看到的跟放開後看到的永遠是同一份結果，不會有兩種樣子（見上面常數的說明） */
  const schedulePreview = () => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      if (performance.now() - lastPreviewAtRef.current < PREVIEW_MIN_INTERVAL_MS) return;
      if (canvasRef.current) {
        lastPreviewAtRef.current = performance.now();
        setLivePreviewUrl(canvasToDataUrl(canvasRef.current));
      }
    });
  };

  /** 畫完一筆／隨機生成／清空地圖後記錄一步歷史紀錄；如果目前不在堆疊最頂端（先前上一步過），
   * 這筆新動作會蓋掉原本「上一步」之後的分支，是標準的上一步／下一步堆疊行為 */
  const pushHistory = (entry: string | undefined) => {
    const h = historyRef.current;
    const truncated = h.stack.slice(0, h.index + 1);
    truncated.push(entry);
    const overflow = truncated.length - MAX_HISTORY;
    const stack = overflow > 0 ? truncated.slice(overflow) : truncated;
    historyRef.current = { stack, index: stack.length - 1 };
    setCanUndo(historyRef.current.index > 0);
    setCanRedo(false);
  };

  const applyHistoryEntry = async (entry: string | undefined) => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (entry) await loadHeightMapIntoCanvas(canvas, entry).catch(() => clearToSea(ctx, map.width, map.height));
    else clearToSea(ctx, map.width, map.height);
    setLivePreviewUrl(null);
    await updateMapState(map.id, { heightMap: entry });
  };

  const handleUndo = async () => {
    const h = historyRef.current;
    if (h.index <= 0) return;
    const newIndex = h.index - 1;
    await applyHistoryEntry(h.stack[newIndex]);
    historyRef.current = { ...h, index: newIndex };
    setCanUndo(newIndex > 0);
    setCanRedo(true);
  };
  const handleRedo = async () => {
    const h = historyRef.current;
    if (h.index >= h.stack.length - 1) return;
    const newIndex = h.index + 1;
    await applyHistoryEntry(h.stack[newIndex]);
    historyRef.current = { ...h, index: newIndex };
    setCanUndo(true);
    setCanRedo(newIndex < h.stack.length - 1);
  };

  /** 銳利化模式下取得（並在拖曳起點建立）這一筆的凍結快照；非銳利化不需要，回傳 undefined
   * 讓 trimDab 照舊讀取即時畫布（磨平是收斂效果，疊加不會失控，見 terrainBrush.ts 說明） */
  const getTrimSampleSource = (canvas: HTMLCanvasElement, isStrokeStart: boolean): CanvasRenderingContext2D | undefined => {
    if (falloff >= 0) return undefined;
    if (isStrokeStart || !trimSharpenBaselineRef.current) {
      let baseline = trimSharpenBaselineRef.current;
      if (!baseline || baseline.width !== canvas.width || baseline.height !== canvas.height) {
        baseline = document.createElement("canvas");
        baseline.width = canvas.width;
        baseline.height = canvas.height;
        trimSharpenBaselineRef.current = baseline;
      }
      baseline.getContext("2d")?.drawImage(canvas, 0, 0);
    }
    return trimSharpenBaselineRef.current?.getContext("2d") ?? undefined;
  };

  /** 量距離工具：點第一下記 A 點，點第二下記 B 點並算出距離（用比例尺的 lengthPx/realDistance
   * 反推），再點一下（此時 A、B 都已經有值）視為重新開始量，把這次點的位置當新的 A 點 */
  const handleMeasureClick = (pos: { x: number; y: number }) => {
    setMeasurePoints((prev) => {
      if (!prev || prev.b) return { a: pos, b: null };
      return { a: prev.a, b: pos };
    });
  };

  const handleDrawStart = (pos: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (tool === "trim") trimDab(ctx, pos.x, pos.y, brushRadius, falloff, getTrimSampleSource(canvas, true));
    else paintDab(ctx, pos.x, pos.y, brushRadius, falloff, grayFromHeight(brushHeight), tool === "erase");
    lastPointRef.current = pos;
    schedulePreview();
  };
  const handleDrawMove = (pos: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    if (!canvas || !lastPointRef.current) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (tool === "trim") trimDabsAlong(ctx, lastPointRef.current, pos, brushRadius, falloff, getTrimSampleSource(canvas, false));
    else paintDabsAlong(ctx, lastPointRef.current, pos, brushRadius, falloff, grayFromHeight(brushHeight), tool === "erase");
    lastPointRef.current = pos;
    schedulePreview();
  };
  const handleDrawEnd = () => {
    lastPointRef.current = null;
    trimSharpenBaselineRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const dataUrl = canvasToDataUrl(canvas);
    setLivePreviewUrl(null);
    updateMapState(map.id, { heightMap: dataUrl });
    pushHistory(dataUrl);
  };

  const handleGenerateRandom = () => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    generateRandomTerrain(ctx, map.width, map.height);
    const dataUrl = canvasToDataUrl(canvas);
    setLivePreviewUrl(null);
    updateMapState(map.id, { heightMap: dataUrl });
    pushHistory(dataUrl);
  };

  const handleClearMap = async () => {
    if (!map) return;
    const ok = await confirm({ title: t("mapViewPage.clearMapConfirm.title"), message: t("mapViewPage.clearMapConfirm.message") });
    if (!ok) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) clearToSea(ctx, map.width, map.height);
    }
    setLivePreviewUrl(null);
    updateMapState(map.id, { heightMap: undefined });
    pushHistory(undefined);
  };

  /** 匯入圖片直接當作新地形：跟隨機生成地形共用同一套「整張換掉、存歷史紀錄」流程，
   * 差別只在來源是使用者選的檔案而非亂數。灰階轉換見 terrainBrush.ts 的 drawImageToCanvas 說明 */
  const handleImportTerrainFile = async (file: File) => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const img = await loadImageFile(file).catch(() => null);
    if (!img) return;
    // 先清成海平面再畫：圖片若帶透明背景，drawImage 只會疊在既有內容上，透明的部分會
    // 讓底下舊地形透出來，變成新舊內容混色，不是「整張圖片＝新地形，其餘視為海」的預期效果
    const ctx = canvas.getContext("2d");
    if (ctx) clearToSea(ctx, canvas.width, canvas.height);
    drawImageToCanvas(canvas, img, { grayscale: true });
    const dataUrl = canvasToDataUrl(canvas);
    setLivePreviewUrl(null);
    updateMapState(map.id, { heightMap: dataUrl });
    pushHistory(dataUrl);
  };

  /** 匯入圖片當底圖參考：另外存在 referenceImage，不影響 heightMap／歷史紀錄——純粹疊在上面
   * 半透明顯示供描繪，見 HeightMapImage 下方的渲染與 types.ts 的欄位說明 */
  const handleImportReferenceFile = async (file: File) => {
    if (!map) return;
    const img = await loadImageFile(file).catch(() => null);
    if (!img) return;
    const tmp = document.createElement("canvas");
    tmp.width = map.width;
    tmp.height = map.height;
    drawImageToCanvas(tmp, img);
    updateMapState(map.id, { referenceImage: canvasToDataUrl(tmp), referenceImageOpacity: map.referenceImageOpacity ?? 0.5 });
  };

  const handleAddScaleBar = () => {
    if (!map) return;
    updateMapState(map.id, {
      scaleBar: {
        x: Math.round(map.width * 0.08),
        y: Math.round(map.height * 0.92),
        lengthPx: Math.round(map.width * 0.15),
        realDistance: 50,
        unit: t("mapViewPage.defaultUnit"),
      },
    });
  };
  const handleAddCompass = () => {
    if (!map) return;
    updateMapState(map.id, {
      compass: {
        x: Math.round(map.width * 0.92),
        y: Math.round(map.height * 0.1),
        rotation: 0,
        labels: { n: t("compassDirection.n"), e: t("compassDirection.e"), s: t("compassDirection.s"), w: t("compassDirection.w") },
      },
    });
  };

  const commitScaleBarDistance = () => {
    if (scaleBarDistanceDraft !== null && map?.scaleBar) {
      updateMapState(map.id, { scaleBar: { ...map.scaleBar, realDistance: Math.max(0.01, scaleBarDistanceDraft) } });
    }
    setScaleBarDistanceDraft(null);
  };
  const commitScaleBarUnit = () => {
    if (scaleBarUnitDraft !== null && map?.scaleBar) updateMapState(map.id, { scaleBar: { ...map.scaleBar, unit: scaleBarUnitDraft } });
    setScaleBarUnitDraft(null);
  };
  const commitScaleBarLength = () => {
    // 下限（20）在這裡才夾，不能在打字的 onChange 就夾：例如想打「50」，才打了「5」
    // （5<20）就會被立刻拉成 20，游標後面接著打的「0」會變成接在 20 後面變 200，
    // 而不是使用者原本想打的 50——打字過程中的中繼值本來就可能暫時小於下限，交給放開時再夾
    if (scaleBarLengthDraft !== null && map?.scaleBar) {
      updateMapState(map.id, { scaleBar: { ...map.scaleBar, lengthPx: Math.max(20, scaleBarLengthDraft) } });
    }
    setScaleBarLengthDraft(null);
  };
  const commitCompassRotation = () => {
    if (compassRotationDraft !== null && map?.compass) updateMapState(map.id, { compass: { ...map.compass, rotation: compassRotationDraft } });
    setCompassRotationDraft(null);
  };
  const commitCompassLabel = (k: "n" | "e" | "s" | "w") => {
    const v = compassLabelDrafts[k];
    if (v !== undefined && map?.compass) updateMapState(map.id, { compass: { ...map.compass, labels: { ...map.compass.labels, [k]: v } } });
    setCompassLabelDrafts((d) => {
      const next = { ...d };
      delete next[k];
      return next;
    });
  };
  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  // ---- 平面圖（畫牆／房間／圖層）----

  const pushFpHistory = (entry: FloorPlanData) => {
    const h = fpHistoryRef.current;
    const truncated = h.stack.slice(0, h.index + 1);
    truncated.push(entry);
    const overflow = truncated.length - FP_MAX_HISTORY;
    const stack = overflow > 0 ? truncated.slice(overflow) : truncated;
    fpHistoryRef.current = { stack, index: stack.length - 1 };
    setFpCanUndo(fpHistoryRef.current.index > 0);
    setFpCanRedo(false);
  };
  const commitFloorPlan = (next: FloorPlanData) => {
    if (!map) return;
    updateMapState(map.id, { floorPlan: next });
    pushFpHistory(next);
  };
  const fpHandleUndo = () => {
    if (!map) return;
    const h = fpHistoryRef.current;
    if (h.index <= 0) return;
    const newIndex = h.index - 1;
    updateMapState(map.id, { floorPlan: h.stack[newIndex] });
    fpHistoryRef.current = { ...h, index: newIndex };
    setFpCanUndo(newIndex > 0);
    setFpCanRedo(true);
    setFpSelected([]);
  };
  const fpHandleRedo = () => {
    if (!map) return;
    const h = fpHistoryRef.current;
    if (h.index >= h.stack.length - 1) return;
    const newIndex = h.index + 1;
    updateMapState(map.id, { floorPlan: h.stack[newIndex] });
    fpHistoryRef.current = { ...h, index: newIndex };
    setFpCanUndo(true);
    setFpCanRedo(newIndex < h.stack.length - 1);
    setFpSelected([]);
  };

  /** 畫新牆／房間／標註、拖曳牆端點時的落點：物件鎖點優先（吸附到既有牆端點／中點、房間角點），
   * 找不到夠近的候選點才退回格點吸附，兩者都沒有就用原始座標——物件鎖點優先是 CAD 的慣例，
   * 通常比格點更精確表達「使用者想接在這個既有點上」的意圖 */
  const fpSnap = (pos: { x: number; y: number }) => {
    const objSnap = findObjectSnap(pos, floorPlan, OBJECT_SNAP_SCREEN_PX / viewScale);
    if (objSnap) return objSnap;
    return gridEnabled ? alignPosition(pos, "dot", gridSize) : pos;
  };

  /** 拖曳智慧參考線的候選物件邊界：同圖層可見、排除正在拖曳的那一個自己——8 種型別的 layerId
   * 都是同一個欄位名稱，直接結構型別存取即可，不用額外的型別窄化 */
  const getVisibleFpBounds = (excludeType: FpItemType, excludeId: string): FpBounds[] => {
    const visibleIds = new Set(floorPlan.layers.filter((l) => l.visible).map((l) => l.id));
    const bounds: FpBounds[] = [];
    const collect = (type: FpItemType, items: FpItemUnion[]) => {
      for (const item of items) {
        const withId = item as { id: string; layerId: string };
        if (type === excludeType && withId.id === excludeId) continue;
        if (!visibleIds.has(withId.layerId)) continue;
        bounds.push(getFpItemBounds(type, item));
      }
    };
    collect("wall", floorPlan.walls);
    collect("room", floorPlan.rooms);
    collect("dimension", floorPlan.dimensions);
    collect("symbol", floorPlan.symbols);
    collect("polygon", floorPlan.polygons);
    collect("text", floorPlan.texts);
    collect("landmarkPoint", floorPlan.landmarkPoints);
    collect("landmarkArea", floorPlan.landmarkAreas);
    return bounds;
  };
  /** 幫正在拖曳的物件（draftItem 是套用目前拖曳位置後、假設性的物件資料，只用來算邊界，不會被
   * 寫回）算出智慧參考線的貼齊位移量，同時把要畫的參考線寫進 fpAlignGuides state。拖曳中
   * （onDrag）跟放開寫入（onCommit）都呼叫這個函式：前者只在乎畫面上的參考線視覺，後者額外要用
   * 回傳的 dx/dy 真正調整落點——兩處呼叫時機不同、位置一樣，運算結果自然一致，不會出現參考線
   * 顯示的貼齊位置跟放開後實際套用的位置對不上的情況 */
  /** 回傳值除了位移量，還多帶 hitX/hitY——「這一軸有沒有真的命中參考線」跟「這一軸的位移量是不是剛好
   * 0」是兩回事（物件本來就已經對齊時，命中但位移量剛好是 0），呼叫端要用 hitX/hitY 判斷要不要跳過
   * 格點吸附那一階段，不能只看 dx/dy 是否為 0（否則「剛好對齊、位移量 0」的情況會被誤判成沒命中，
   * 反而又被格點吸附拉走，見下方各 move drag 的用法） */
  const resolveAlignmentSnap = (
    type: FpItemType,
    id: string,
    draftItem: FpItemUnion
  ): { dx: number; dy: number; hitX: boolean; hitY: boolean } => {
    if (!alignGuideEnabled) {
      setFpAlignGuides({ x: [], y: [] });
      return { dx: 0, dy: 0, hitX: false, hitY: false };
    }
    const bounds = getFpItemBounds(type, draftItem);
    const candidates = getVisibleFpBounds(type, id);
    const snap = findAlignmentSnap(bounds, candidates, ALIGN_GUIDE_SCREEN_PX / viewScale);
    if (!snap) {
      setFpAlignGuides({ x: [], y: [] });
      return { dx: 0, dy: 0, hitX: false, hitY: false };
    }
    setFpAlignGuides({ x: snap.guideX, y: snap.guideY });
    return { dx: snap.dx, dy: snap.dy, hitX: snap.guideX.length > 0, hitY: snap.guideY.length > 0 };
  };

  const handleFpDrawStart = (pos: { x: number; y: number }) => {
    if (tool === "select") {
      // 框選起點：這裡故意不用 fpSnap——框選是一個鬆散的取景動作，不是要精準定位一個新物件的
      // 落點，套用物件鎖點／格點吸附反而會讓框的邊界跳來跳去、選取結果變得不可預期
      setSelectBoxDraft({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
      return;
    }
    const p = fpSnap(pos);
    if (tool === "wall") {
      if (!wallStart) {
        setWallStart(p);
      } else {
        const end = orthoEnabled ? applyOrtho(wallStart, p, orthoStep) : p;
        if (Math.hypot(end.x - wallStart.x, end.y - wallStart.y) >= 4) {
          const wall = { id: newId(), x1: wallStart.x, y1: wallStart.y, x2: end.x, y2: end.y, layerId: floorPlan.activeLayerId };
          commitFloorPlan({ ...floorPlan, walls: [...floorPlan.walls, wall] });
        }
        setWallStart(null);
      }
      return;
    }
    if (tool === "room") {
      setRoomDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
      return;
    }
    if (tool === "dimension") {
      if (!dimensionStart) {
        setDimensionStart(p);
      } else {
        const end = orthoEnabled ? applyOrtho(dimensionStart, p, orthoStep) : p;
        if (Math.hypot(end.x - dimensionStart.x, end.y - dimensionStart.y) >= 4) {
          const dim = { id: newId(), x1: dimensionStart.x, y1: dimensionStart.y, x2: end.x, y2: end.y, layerId: floorPlan.activeLayerId };
          commitFloorPlan({ ...floorPlan, dimensions: [...floorPlan.dimensions, dim] });
        }
        setDimensionStart(null);
      }
      return;
    }
    if (tool === "symbol") {
      const symbol = { id: newId(), type: symbolType, x: p.x, y: p.y, layerId: floorPlan.activeLayerId };
      commitFloorPlan({ ...floorPlan, symbols: [...floorPlan.symbols, symbol] });
      return;
    }
    if (tool === "text") {
      // 點一下就先放一個帶預設內容的文字物件，立刻切回選取工具＋選中它——使用者接著直接在下面
      // 樣式面板的文字框改內容，不用另外跳出對話框輸入，跟其他工具「點下去就是最終結果，選取後
      // 才調整細節」的操作方式一致
      const text = { id: newId(), text: t("mapViewPage.defaultTextContent"), x: p.x, y: p.y, layerId: floorPlan.activeLayerId, fontSize: DEFAULT_TEXT_FONT_SIZE };
      commitFloorPlan({ ...floorPlan, texts: [...floorPlan.texts, text] });
      setFpSelected([{ type: "text", id: text.id }]);
      setTool("select");
      return;
    }
    if (tool === "polygon") {
      if (!polygonPoints) {
        setPolygonPoints([p]);
      } else if (polygonPoints.length >= 3 && Math.hypot(p.x - polygonPoints[0].x, p.y - polygonPoints[0].y) <= POLYGON_CLOSE_SCREEN_PX / viewScale) {
        // 點回起點附近＝視為封閉多邊形，直接用累積到目前為止的頂點（不含這次點回起點這一下）
        commitFloorPlan({ ...floorPlan, polygons: [...floorPlan.polygons, { id: newId(), points: polygonPoints, layerId: floorPlan.activeLayerId }] });
        setPolygonPoints(null);
      } else {
        setPolygonPoints([...polygonPoints, p]);
      }
      return;
    }
    if (tool === "landmarkPoint") {
      if (!landmarkLayer) return;
      // 點一下就先放一個地標點，立刻切回選取工具＋選中它，跟文字工具「畫完立刻選取以便編輯」
      // 的體驗一致——使用者接著在下面屬性面板連結地點／改自訂標籤
      const point: FloorPlanLandmarkPoint = { id: newId(), x: p.x, y: p.y, icon: landmarkIcon, layerId: landmarkLayer.id };
      commitFloorPlan({ ...floorPlan, landmarkPoints: [...floorPlan.landmarkPoints, point] });
      setFpSelected([{ type: "landmarkPoint", id: point.id }]);
      setTool("select");
      return;
    }
    if (tool === "landmarkArea") {
      if (!landmarkLayer) return;
      if (!landmarkAreaPoints) {
        setLandmarkAreaPoints([p]);
      } else if (
        landmarkAreaPoints.length >= 3 &&
        Math.hypot(p.x - landmarkAreaPoints[0].x, p.y - landmarkAreaPoints[0].y) <= POLYGON_CLOSE_SCREEN_PX / viewScale
      ) {
        commitFloorPlan({
          ...floorPlan,
          landmarkAreas: [...floorPlan.landmarkAreas, { id: newId(), points: landmarkAreaPoints, layerId: landmarkLayer.id }],
        });
        setLandmarkAreaPoints(null);
      } else {
        setLandmarkAreaPoints([...landmarkAreaPoints, p]);
      }
    }
  };
  /** 多邊形沒有點回起點時，另外提供「完成」按鈕手動封閉（見下方工具列），跟「取消繪製」搭配使用 */
  const handleFinishPolygon = () => {
    if (!polygonPoints || polygonPoints.length < 3) return;
    commitFloorPlan({ ...floorPlan, polygons: [...floorPlan.polygons, { id: newId(), points: polygonPoints, layerId: floorPlan.activeLayerId }] });
    setPolygonPoints(null);
  };
  const handleCancelPolygon = () => setPolygonPoints(null);
  /** 地標區域版本的「完成」／「取消」，邏輯跟多邊形完全一樣，只是寫進 landmarkAreas 且圖層固定 */
  const handleFinishLandmarkArea = () => {
    if (!landmarkAreaPoints || landmarkAreaPoints.length < 3 || !landmarkLayer) return;
    commitFloorPlan({
      ...floorPlan,
      landmarkAreas: [...floorPlan.landmarkAreas, { id: newId(), points: landmarkAreaPoints, layerId: landmarkLayer.id }],
    });
    setLandmarkAreaPoints(null);
  };
  const handleCancelLandmarkArea = () => setLandmarkAreaPoints(null);
  const handleFpDrawMove = (pos: { x: number; y: number }) => {
    if (tool === "select" && selectBoxDraft) {
      setSelectBoxDraft((d) => (d ? { ...d, x2: pos.x, y2: pos.y } : d));
      return;
    }
    if (tool === "room" && roomDraft) {
      const p = fpSnap(pos);
      const locked = shiftPressedRef.current ? lockSquare(roomDraft.x1, roomDraft.y1, p.x, p.y) : p;
      setRoomDraft((d) => (d ? { ...d, x2: locked.x, y2: locked.y } : d));
    }
  };
  /** 框選：判斷「兩個矩形範圍有沒有重疊」，只要有一點點重疊就算選到（不要求完全被框住），
   * 呼叫端各自把物件的實際幾何換算成一個外接矩形（bounding box）再丟進來比 */
  const boxesOverlap = (
    a: { minX: number; maxX: number; minY: number; maxY: number },
    b: { minX: number; maxX: number; minY: number; maxY: number }
  ) => !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
  const handleFpDrawEnd = () => {
    if (tool === "select" && selectBoxDraft) {
      const box = {
        minX: Math.min(selectBoxDraft.x1, selectBoxDraft.x2),
        maxX: Math.max(selectBoxDraft.x1, selectBoxDraft.x2),
        minY: Math.min(selectBoxDraft.y1, selectBoxDraft.y2),
        maxY: Math.max(selectBoxDraft.y1, selectBoxDraft.y2),
      };
      setSelectBoxDraft(null);
      // 拖曳距離太小＝沒有真的拖出一個框，視為單純點一下空白處，維持原本「點空白清空選取」的直覺
      if (box.maxX - box.minX < 4 && box.maxY - box.minY < 4) {
        setFpSelected([]);
        return;
      }
      const visibleIds = new Set(floorPlan.layers.filter((l) => l.visible).map((l) => l.id));
      const picked: FpSelection[] = [];
      // 8 種物件的外接矩形一律透過共用的 getFpItemBounds 計算（連房間旋轉過後也能算準確的
      // 旋轉後外接矩形，不再偷懶用未旋轉前的矩形比對），不再各自手算一次
      for (const wall of floorPlan.walls) {
        if (visibleIds.has(wall.layerId) && boxesOverlap(box, getFpItemBounds("wall", wall))) picked.push({ type: "wall", id: wall.id });
      }
      for (const room of floorPlan.rooms) {
        if (visibleIds.has(room.layerId) && boxesOverlap(box, getFpItemBounds("room", room))) picked.push({ type: "room", id: room.id });
      }
      for (const dim of floorPlan.dimensions) {
        if (visibleIds.has(dim.layerId) && boxesOverlap(box, getFpItemBounds("dimension", dim))) picked.push({ type: "dimension", id: dim.id });
      }
      for (const symbol of floorPlan.symbols) {
        if (visibleIds.has(symbol.layerId) && boxesOverlap(box, getFpItemBounds("symbol", symbol))) picked.push({ type: "symbol", id: symbol.id });
      }
      for (const poly of floorPlan.polygons) {
        if (visibleIds.has(poly.layerId) && boxesOverlap(box, getFpItemBounds("polygon", poly))) picked.push({ type: "polygon", id: poly.id });
      }
      for (const text of floorPlan.texts) {
        if (visibleIds.has(text.layerId) && boxesOverlap(box, getFpItemBounds("text", text))) picked.push({ type: "text", id: text.id });
      }
      for (const point of floorPlan.landmarkPoints) {
        if (visibleIds.has(point.layerId) && boxesOverlap(box, getFpItemBounds("landmarkPoint", point))) picked.push({ type: "landmarkPoint", id: point.id });
      }
      for (const area of floorPlan.landmarkAreas) {
        if (visibleIds.has(area.layerId) && boxesOverlap(box, getFpItemBounds("landmarkArea", area))) picked.push({ type: "landmarkArea", id: area.id });
      }
      setFpSelected(picked);
      return;
    }
    if (tool === "room" && roomDraft) {
      const x = Math.min(roomDraft.x1, roomDraft.x2);
      const y = Math.min(roomDraft.y1, roomDraft.y2);
      const w = Math.abs(roomDraft.x2 - roomDraft.x1);
      const h = Math.abs(roomDraft.y2 - roomDraft.y1);
      setRoomDraft(null);
      if (w < ROOM_MIN_SIZE || h < ROOM_MIN_SIZE) return;
      const room = { id: newId(), x, y, width: w, height: h, layerId: floorPlan.activeLayerId, shape: roomShape };
      commitFloorPlan({ ...floorPlan, rooms: [...floorPlan.rooms, room] });
    }
  };
  /** 把目前選取集合拆成各類型的 id 集合，刪除／樣式／複製等要「對整個選取集合做同一件事」的
   * handler 共用這個，不用每個都重新寫一次分組邏輯 */
  const selectedIdsByType = (): Record<FpItemType, Set<string>> => {
    const ids: Record<FpItemType, Set<string>> = {
      wall: new Set(),
      room: new Set(),
      dimension: new Set(),
      symbol: new Set(),
      polygon: new Set(),
      text: new Set(),
      landmarkPoint: new Set(),
      landmarkArea: new Set(),
    };
    fpSelected.forEach((s) => ids[s.type].add(s.id));
    return ids;
  };
  /** 這個物件是不是「多選（框選）狀態下」被選取的一員——只有這種情況才要走群組拖曳（拖其中一個、
   * 全部一起動），單選時維持原本各自獨立的單一物件拖曳邏輯不受影響 */
  const isGroupDragMember = (type: FpItemType, id: string) => fpSelected.length > 1 && fpSelected.some((s) => s.type === type && s.id === id);
  /** 開始／更新群組拖曳的共用位移量：dx/dy 是「這次被抓來拖的物件」相對它自己原始位置的位移，
   * 套用到整個選取集合的每一個物件上（各自用自己的原始座標＋這個位移，不是互相參照），是一個
   * 單純的剛體平移，跟物件本身的形狀／旋轉角度無關 */
  const startGroupDrag = (dx: number, dy: number) => {
    groupDragDeltaRef.current = { dx, dy };
    setGroupDragDelta({ dx, dy });
  };
  /** 群組拖曳放開時一次性寫回全部選取物件的新位置——用 ref 讀最後的位移量（不是 state），
   * 避免拖放開那一刻跟最後一次 pointermove 同一輪處理、state 還沒真的更新就被讀到舊值（見上面
   * groupDragDeltaRef 宣告處的說明，跟 useLiveDragById 的既有考量一致） */
  const commitGroupDrag = () => {
    const delta = groupDragDeltaRef.current;
    groupDragDeltaRef.current = null;
    setGroupDragDelta(null);
    if (!delta) return;
    const ids = selectedIdsByType();
    commitFloorPlan({
      ...floorPlan,
      walls: floorPlan.walls.map((w) =>
        ids.wall.has(w.id) ? { ...w, x1: w.x1 + delta.dx, y1: w.y1 + delta.dy, x2: w.x2 + delta.dx, y2: w.y2 + delta.dy } : w
      ),
      rooms: floorPlan.rooms.map((r) => (ids.room.has(r.id) ? { ...r, x: r.x + delta.dx, y: r.y + delta.dy } : r)),
      dimensions: floorPlan.dimensions.map((d) =>
        ids.dimension.has(d.id) ? { ...d, x1: d.x1 + delta.dx, y1: d.y1 + delta.dy, x2: d.x2 + delta.dx, y2: d.y2 + delta.dy } : d
      ),
      symbols: floorPlan.symbols.map((s) => (ids.symbol.has(s.id) ? { ...s, x: s.x + delta.dx, y: s.y + delta.dy } : s)),
      polygons: floorPlan.polygons.map((p) =>
        ids.polygon.has(p.id) ? { ...p, points: p.points.map((pt) => ({ x: pt.x + delta.dx, y: pt.y + delta.dy })) } : p
      ),
      texts: floorPlan.texts.map((t) => (ids.text.has(t.id) ? { ...t, x: t.x + delta.dx, y: t.y + delta.dy } : t)),
      landmarkPoints: floorPlan.landmarkPoints.map((p) => (ids.landmarkPoint.has(p.id) ? { ...p, x: p.x + delta.dx, y: p.y + delta.dy } : p)),
      landmarkAreas: floorPlan.landmarkAreas.map((a) =>
        ids.landmarkArea.has(a.id) ? { ...a, points: a.points.map((pt) => ({ x: pt.x + delta.dx, y: pt.y + delta.dy })) } : a
      ),
    });
  };
  const handleFpDeleteSelected = () => {
    if (fpSelected.length === 0) return;
    const ids = selectedIdsByType();
    commitFloorPlan({
      ...floorPlan,
      walls: floorPlan.walls.filter((w) => !ids.wall.has(w.id)),
      rooms: floorPlan.rooms.filter((r) => !ids.room.has(r.id)),
      dimensions: floorPlan.dimensions.filter((d) => !ids.dimension.has(d.id)),
      symbols: floorPlan.symbols.filter((s) => !ids.symbol.has(s.id)),
      polygons: floorPlan.polygons.filter((p) => !ids.polygon.has(p.id)),
      texts: floorPlan.texts.filter((t) => !ids.text.has(t.id)),
      landmarkPoints: floorPlan.landmarkPoints.filter((p) => !ids.landmarkPoint.has(p.id)),
      landmarkAreas: floorPlan.landmarkAreas.filter((a) => !ids.landmarkArea.has(a.id)),
    });
    setFpSelected([]);
  };
  /** 依 {type,id} 找出實際的物件資料，對齊工具要用每個選取物件自己的邊界（getFpItemBounds）
   * 才能算出各自要位移多少，跟只需要「哪些 id 屬於這個型別」的 selectedIdsByType 用途不同 */
  const getFpItemById = (sel: FpSelection): FpItemUnion | undefined => {
    switch (sel.type) {
      case "wall":
        return floorPlan.walls.find((w) => w.id === sel.id);
      case "room":
        return floorPlan.rooms.find((r) => r.id === sel.id);
      case "dimension":
        return floorPlan.dimensions.find((d) => d.id === sel.id);
      case "symbol":
        return floorPlan.symbols.find((s) => s.id === sel.id);
      case "polygon":
        return floorPlan.polygons.find((p) => p.id === sel.id);
      case "text":
        return floorPlan.texts.find((t) => t.id === sel.id);
      case "landmarkPoint":
        return floorPlan.landmarkPoints.find((p) => p.id === sel.id);
      case "landmarkArea":
        return floorPlan.landmarkAreas.find((a) => a.id === sel.id);
    }
  };
  const alignSelKey = (sel: FpSelection) => `${sel.type}:${sel.id}`;
  type AlignEdge = "left" | "right" | "centerX" | "top" | "bottom" | "centerY";
  const alignEdgeValue = (b: FpBounds, edge: AlignEdge) => {
    switch (edge) {
      case "left":
        return b.minX;
      case "right":
        return b.maxX;
      case "centerX":
        return (b.minX + b.maxX) / 2;
      case "top":
        return b.minY;
      case "bottom":
        return b.maxY;
      case "centerY":
        return (b.minY + b.maxY) / 2;
    }
  };
  /** 對齊選取的物件（至少要選 2 個）：靠左/右/置中、靠上/下/置中。目標基準值依 alignMode 決定——
   * 「以選取範圍為準」用所有選取物件的聯集邊界；「指定物件為錨點」用錨點物件自己的邊界（錨點本身
   * 不會被移動）。每個物件各自跟目標值比較算出自己要位移多少（單軸），不是像群組拖曳那樣整個
   * 集合套用同一個位移量，所以另外用一個 Map 記錄每個物件各自的位移，依型別分流寫回、一次性
   * commitFloorPlan（沿用 handleCopySelected/commitGroupDrag 那種依型別分流套用變更的既有模式） */
  const handleAlignSelected = (edge: AlignEdge) => {
    if (fpSelected.length < 2) return;
    const entries = fpSelected
      .map((sel) => {
        const item = getFpItemById(sel);
        return item ? { sel, bounds: getFpItemBounds(sel.type, item) } : null;
      })
      .filter((e): e is { sel: FpSelection; bounds: FpBounds } => e !== null);
    if (entries.length < 2) return;
    const anchorEntry = alignMode === "anchor" ? entries.find((e) => alignSelKey(e.sel) === alignAnchorKey) : undefined;
    if (alignMode === "anchor" && !anchorEntry) return;
    const targetBounds: FpBounds = anchorEntry
      ? anchorEntry.bounds
      : {
          minX: Math.min(...entries.map((e) => e.bounds.minX)),
          maxX: Math.max(...entries.map((e) => e.bounds.maxX)),
          minY: Math.min(...entries.map((e) => e.bounds.minY)),
          maxY: Math.max(...entries.map((e) => e.bounds.maxY)),
        };
    const target = alignEdgeValue(targetBounds, edge);
    const isHorizontal = edge === "left" || edge === "right" || edge === "centerX";
    const deltas = new Map<string, { dx: number; dy: number }>();
    for (const { sel, bounds } of entries) {
      if (anchorEntry && sel === anchorEntry.sel) continue;
      const diff = target - alignEdgeValue(bounds, edge);
      if (diff === 0) continue;
      deltas.set(alignSelKey(sel), isHorizontal ? { dx: diff, dy: 0 } : { dx: 0, dy: diff });
    }
    if (deltas.size === 0) return;
    const shiftFor = (type: FpItemType, id: string) => deltas.get(`${type}:${id}`);
    commitFloorPlan({
      ...floorPlan,
      walls: floorPlan.walls.map((w) => {
        const d = shiftFor("wall", w.id);
        return d ? { ...w, x1: w.x1 + d.dx, y1: w.y1 + d.dy, x2: w.x2 + d.dx, y2: w.y2 + d.dy } : w;
      }),
      rooms: floorPlan.rooms.map((r) => {
        const d = shiftFor("room", r.id);
        return d ? { ...r, x: r.x + d.dx, y: r.y + d.dy } : r;
      }),
      dimensions: floorPlan.dimensions.map((dim) => {
        const d = shiftFor("dimension", dim.id);
        return d ? { ...dim, x1: dim.x1 + d.dx, y1: dim.y1 + d.dy, x2: dim.x2 + d.dx, y2: dim.y2 + d.dy } : dim;
      }),
      symbols: floorPlan.symbols.map((s) => {
        const d = shiftFor("symbol", s.id);
        return d ? { ...s, x: s.x + d.dx, y: s.y + d.dy } : s;
      }),
      polygons: floorPlan.polygons.map((p) => {
        const d = shiftFor("polygon", p.id);
        return d ? { ...p, points: p.points.map((pt) => ({ x: pt.x + d.dx, y: pt.y + d.dy })) } : p;
      }),
      texts: floorPlan.texts.map((t) => {
        const d = shiftFor("text", t.id);
        return d ? { ...t, x: t.x + d.dx, y: t.y + d.dy } : t;
      }),
      landmarkPoints: floorPlan.landmarkPoints.map((p) => {
        const d = shiftFor("landmarkPoint", p.id);
        return d ? { ...p, x: p.x + d.dx, y: p.y + d.dy } : p;
      }),
      landmarkAreas: floorPlan.landmarkAreas.map((a) => {
        const d = shiftFor("landmarkArea", a.id);
        return d ? { ...a, points: a.points.map((pt) => ({ x: pt.x + d.dx, y: pt.y + d.dy })) } : a;
      }),
    });
  };
  /** 幫目前選取的物件（牆／房間／標註／多邊形）更新樣式（線條顏色／虛線／填滿顏色／填滿方式）——
   * 符號沒有這組樣式，選取符號時呼叫端不會顯示樣式面板，這裡不用特別擋。patch 是要合併進既有
   * style 的部分欄位，跟其他「找到該筆物件、拆解重組陣列」的既有 handler 是同一套寫法。目前
   * 呼叫端（樣式面板）只在剛好選 1 個時才會顯示，但這裡寫成套用到整個選取集合，之後如果想開放
   * 多選一起改樣式也不用再改這個函式 */
  const handleUpdateSelectedStyle = (patch: Partial<FloorPlanStyle>) => {
    if (fpSelected.length === 0) return;
    const ids = selectedIdsByType();
    const merge = (style: FloorPlanStyle | undefined): FloorPlanStyle => ({ ...style, ...patch });
    commitFloorPlan({
      ...floorPlan,
      walls: floorPlan.walls.map((w) => (ids.wall.has(w.id) ? { ...w, style: merge(w.style) } : w)),
      rooms: floorPlan.rooms.map((r) => (ids.room.has(r.id) ? { ...r, style: merge(r.style) } : r)),
      dimensions: floorPlan.dimensions.map((d) => (ids.dimension.has(d.id) ? { ...d, style: merge(d.style) } : d)),
      polygons: floorPlan.polygons.map((p) => (ids.polygon.has(p.id) ? { ...p, style: merge(p.style) } : p)),
      landmarkAreas: floorPlan.landmarkAreas.map((a) => (ids.landmarkArea.has(a.id) ? { ...a, style: merge(a.style) } : a)),
    });
  };
  /** 文字物件的內容／字級／顏色更新——這幾個是文字專屬的屬性，不是 FloorPlanStyle 那組線條/填滿
   * 樣式，所以另外開一個 handler，不跟 handleUpdateSelectedStyle 混在一起 */
  const handleUpdateSelectedText = (patch: Partial<Pick<FloorPlanText, "text" | "fontSize" | "color">>) => {
    if (singleSelected?.type !== "text") return;
    commitFloorPlan({
      ...floorPlan,
      texts: floorPlan.texts.map((t) => (t.id === singleSelected.id ? { ...t, ...patch } : t)),
    });
  };
  const commitTextContent = () => {
    if (textContentDraft !== null) handleUpdateSelectedText({ text: textContentDraft || t("mapViewPage.defaultTextContent") });
    setTextContentDraft(null);
  };
  const commitTextFontSize = () => {
    if (textFontSizeDraft !== null) handleUpdateSelectedText({ fontSize: Math.min(72, Math.max(8, textFontSizeDraft)) });
    setTextFontSizeDraft(null);
  };
  /** 地標點／地標區域的自訂標籤／連結地點更新——兩種型別共用同一個 patch 形狀，依 singleSelected
   * 的實際類型寫回對應陣列，跟 handleUpdateSelectedText 是同一種設計。customText／textColor／
   * fillColor 只有地標點會用到（地標區域沒有這幾個欄位），但呼叫端本來就只在 selectedLandmarkPoint
   * 存在時才會帶這幾個欄位進來，同一套共用函式不用特別拆開 */
  const handleUpdateSelectedLandmark = (patch: {
    label?: string;
    linkedEntryId?: string;
    color?: string;
    customText?: string;
    textColor?: string;
    fillColor?: string;
  }) => {
    if (singleSelected?.type === "landmarkPoint") {
      commitFloorPlan({
        ...floorPlan,
        landmarkPoints: floorPlan.landmarkPoints.map((p) => (p.id === singleSelected.id ? { ...p, ...patch } : p)),
      });
    } else if (singleSelected?.type === "landmarkArea") {
      commitFloorPlan({
        ...floorPlan,
        landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === singleSelected.id ? { ...a, ...patch } : a)),
      });
    }
  };
  const commitLandmarkLabel = () => {
    if (landmarkLabelDraft !== null) handleUpdateSelectedLandmark({ label: landmarkLabelDraft.trim() || undefined });
    setLandmarkLabelDraft(null);
  };
  const commitLandmarkCustomText = () => {
    if (landmarkCustomTextDraft !== null) handleUpdateSelectedLandmark({ customText: landmarkCustomTextDraft.trim() || undefined });
    setLandmarkCustomTextDraft(null);
  };
  const handleCopySelected = () => {
    if (fpSelected.length === 0) return;
    const ids = selectedIdsByType();
    clipboardRef.current = [
      ...floorPlan.walls.filter((w) => ids.wall.has(w.id)).map((data) => ({ type: "wall" as const, data })),
      ...floorPlan.rooms.filter((r) => ids.room.has(r.id)).map((data) => ({ type: "room" as const, data })),
      ...floorPlan.dimensions.filter((d) => ids.dimension.has(d.id)).map((data) => ({ type: "dimension" as const, data })),
      ...floorPlan.symbols.filter((s) => ids.symbol.has(s.id)).map((data) => ({ type: "symbol" as const, data })),
      ...floorPlan.polygons.filter((p) => ids.polygon.has(p.id)).map((data) => ({ type: "polygon" as const, data })),
      ...floorPlan.texts.filter((t) => ids.text.has(t.id)).map((data) => ({ type: "text" as const, data })),
      ...floorPlan.landmarkPoints.filter((p) => ids.landmarkPoint.has(p.id)).map((data) => ({ type: "landmarkPoint" as const, data })),
      ...floorPlan.landmarkAreas.filter((a) => ids.landmarkArea.has(a.id)).map((data) => ({ type: "landmarkArea" as const, data })),
    ];
    setHasClipboard(clipboardRef.current.length > 0);
  };
  const handlePasteClipboard = () => {
    const clip = clipboardRef.current;
    if (clip.length === 0) return;
    const newWalls: FloorPlanWall[] = [];
    const newRooms: FloorPlanRoom[] = [];
    const newDimensions: FloorPlanDimension[] = [];
    const newSymbols: FloorPlanSymbol[] = [];
    const newPolygons: FloorPlanPolygonRoom[] = [];
    const newTexts: FloorPlanText[] = [];
    const newLandmarkPoints: FloorPlanLandmarkPoint[] = [];
    const newLandmarkAreas: FloorPlanLandmarkArea[] = [];
    const pasted: FpSelection[] = [];
    for (const item of clip) {
      if (item.type === "wall") {
        const w = item.data as FloorPlanWall;
        const copy = { ...w, id: newId(), x1: w.x1 + PASTE_OFFSET, y1: w.y1 + PASTE_OFFSET, x2: w.x2 + PASTE_OFFSET, y2: w.y2 + PASTE_OFFSET, layerId: floorPlan.activeLayerId };
        newWalls.push(copy);
        pasted.push({ type: "wall", id: copy.id });
      } else if (item.type === "room") {
        const r = item.data as FloorPlanRoom;
        const copy = { ...r, id: newId(), x: r.x + PASTE_OFFSET, y: r.y + PASTE_OFFSET, layerId: floorPlan.activeLayerId };
        newRooms.push(copy);
        pasted.push({ type: "room", id: copy.id });
      } else if (item.type === "dimension") {
        const d = item.data as FloorPlanDimension;
        const copy = { ...d, id: newId(), x1: d.x1 + PASTE_OFFSET, y1: d.y1 + PASTE_OFFSET, x2: d.x2 + PASTE_OFFSET, y2: d.y2 + PASTE_OFFSET, layerId: floorPlan.activeLayerId };
        newDimensions.push(copy);
        pasted.push({ type: "dimension", id: copy.id });
      } else if (item.type === "symbol") {
        const s = item.data as FloorPlanSymbol;
        const copy = { ...s, id: newId(), x: s.x + PASTE_OFFSET, y: s.y + PASTE_OFFSET, layerId: floorPlan.activeLayerId };
        newSymbols.push(copy);
        pasted.push({ type: "symbol", id: copy.id });
      } else if (item.type === "polygon") {
        const poly = item.data as FloorPlanPolygonRoom;
        const copy = {
          ...poly,
          id: newId(),
          points: poly.points.map((p) => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })),
          layerId: floorPlan.activeLayerId,
        };
        newPolygons.push(copy);
        pasted.push({ type: "polygon", id: copy.id });
      } else if (item.type === "text") {
        const t = item.data as FloorPlanText;
        const copy = { ...t, id: newId(), x: t.x + PASTE_OFFSET, y: t.y + PASTE_OFFSET, layerId: floorPlan.activeLayerId };
        newTexts.push(copy);
        pasted.push({ type: "text", id: copy.id });
      } else if (item.type === "landmarkPoint") {
        const p = item.data as FloorPlanLandmarkPoint;
        // 貼上的地標點／地標區域一律強制回地標圖層，不可脫離——即使目前作用中的是別的一般圖層
        const copy = { ...p, id: newId(), x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET, layerId: landmarkLayer?.id ?? p.layerId };
        newLandmarkPoints.push(copy);
        pasted.push({ type: "landmarkPoint", id: copy.id });
      } else {
        const a = item.data as FloorPlanLandmarkArea;
        const copy = {
          ...a,
          id: newId(),
          points: a.points.map((p) => ({ x: p.x + PASTE_OFFSET, y: p.y + PASTE_OFFSET })),
          layerId: landmarkLayer?.id ?? a.layerId,
        };
        newLandmarkAreas.push(copy);
        pasted.push({ type: "landmarkArea", id: copy.id });
      }
    }
    commitFloorPlan({
      ...floorPlan,
      walls: [...floorPlan.walls, ...newWalls],
      rooms: [...floorPlan.rooms, ...newRooms],
      dimensions: [...floorPlan.dimensions, ...newDimensions],
      symbols: [...floorPlan.symbols, ...newSymbols],
      polygons: [...floorPlan.polygons, ...newPolygons],
      texts: [...floorPlan.texts, ...newTexts],
      landmarkPoints: [...floorPlan.landmarkPoints, ...newLandmarkPoints],
      landmarkAreas: [...floorPlan.landmarkAreas, ...newLandmarkAreas],
    });
    setFpSelected(pasted);
  };

  // 鍵盤快捷鍵：複製／貼上／刪除／切換工具，比照一般向量繪圖軟體的慣例（V 選取、H 手形、
  // W 畫牆、R 房間、D 標註、S 符號、P 鋼筆、T 文字、L 地標點、A 地標區域，都是單鍵直接切換，跟 Illustrator／Figma 等
  // 軟體的工具鍵慣例一致）。存檔快捷鍵（Ctrl/Cmd+S）改用共用的 useSaveShortcut（見下方），
  // 因為存檔要在輸入框／文字區也能觸發，跟這裡「聚焦在輸入框時整個不處理」的守門邏輯衝突，
  // 拆開成兩個獨立的監聽器各自處理。不設依賴陣列讓這個 effect 每次
  // render 都重新掛一次監聽器，確保 handler closure 抓到的永遠是最新的 fpSelected／floorPlan，
  // 不用另外把這幾個 handler 包 useCallback——這個監聽器很輕量，重掛的成本可以忽略；
  // editing 為 false 時直接不掛，離開編輯模式後鍵盤快捷鍵自然失效
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "c" && fpSelected.length > 0) {
        e.preventDefault();
        handleCopySelected();
      } else if ((e.ctrlKey || e.metaKey) && key === "v" && clipboardRef.current.length > 0) {
        e.preventDefault();
        handlePasteClipboard();
      } else if ((key === "delete" || key === "backspace") && fpSelected.length > 0) {
        e.preventDefault();
        handleFpDeleteSelected();
      } else if (key === "v" && !e.ctrlKey && !e.metaKey) {
        // 純按 V（沒有 Ctrl/Cmd）＝切到選取工具，跟上面「Ctrl/Cmd+V＝貼上」不會互相誤觸
        e.preventDefault();
        setTool("select");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "h") {
        // 其餘單鍵快捷鍵比照 Illustrator／Figma 等向量繪圖軟體慣例：H＝手形（跟空白鍵暫時切換並存，
        // 這裡是「切過去就不換回來」的版本）、W＝畫牆、R＝房間、D＝標註、S＝符號、P＝鋼筆、T＝文字
        e.preventDefault();
        setTool("pan");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "w") {
        e.preventDefault();
        setTool("wall");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "r") {
        e.preventDefault();
        setTool("room");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "d") {
        e.preventDefault();
        setTool("dimension");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "s") {
        e.preventDefault();
        setTool("symbol");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "p") {
        e.preventDefault();
        setTool("polygon");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "t") {
        e.preventDefault();
        setTool("text");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "l") {
        e.preventDefault();
        setTool("landmarkPoint");
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && key === "a") {
        e.preventDefault();
        setTool("landmarkArea");
      } else if (key === " ") {
        // 按住空白鍵暫時切成手形工具，放開後在下面的 keyup handler 還原——repeat 的 keydown
        // 只在「還沒記錄過」時才記一次原本的工具，避免按住不放時每次 repeat 都覆寫掉
        e.preventDefault();
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          preSpaceToolRef.current = tool;
          setTool("pan");
        }
      }
    };
    const keyupHandler = (e: KeyboardEvent) => {
      if (e.key === " " && spaceHeldRef.current) {
        spaceHeldRef.current = false;
        setTool(preSpaceToolRef.current);
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", keyupHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", keyupHandler);
    };
  });

  // 房間搬移／縮放／旋轉／牆端點拖曳都共用同一套「拖曳中即時預覽、放開才寫入」邏輯，各自一組 id 空間互不干擾
  const roomMoveDrag = useLiveDragById((id, pos) => {
    const room = floorPlan.rooms.find((r) => r.id === id);
    if (!room) return;
    const guide = resolveAlignmentSnap("room", id, { ...room, x: pos.x, y: pos.y });
    const guided = { x: pos.x + guide.dx, y: pos.y + guide.dy };
    const snapped = fpSnap(guided);
    const p = { x: guide.hitX ? guided.x : snapped.x, y: guide.hitY ? guided.y : snapped.y };
    commitFloorPlan({ ...floorPlan, rooms: floorPlan.rooms.map((r) => (r.id === id ? { ...r, x: p.x, y: p.y } : r)) });
  });
  /** 統一變形外框的縮放控制點拖曳：key 編碼成 "型別:id:控制點方向"（例如 "room:abc:se"），一個 hook
   * 涵蓋全部支援縮放的物件類型，依型別分流呼叫 floorPlan.ts 對應家族的縮放計算函式（見
   * computeRoomResize／computeUniformScaleFactor／computePolygonResize 的說明）——牆／標註沒有分流
   * 到這裡（FloorPlanTransformBox 對這兩種型別的 showResizeHandles 是 false，根本不會觸發） */
  const boxResizeDrag = useLiveDragById((key, pos) => {
    const [type, id, handle] = key.split(":") as [FpItemType, string, BoxHandle];
    switch (type) {
      case "room": {
        const room = floorPlan.rooms.find((r) => r.id === id);
        if (!room) return;
        const patch = computeRoomResize(room, handle, pos, ROOM_MIN_SIZE);
        commitFloorPlan({ ...floorPlan, rooms: floorPlan.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
        return;
      }
      case "symbol": {
        const symbol = floorPlan.symbols.find((s) => s.id === id);
        if (!symbol) return;
        const factor = computeUniformScaleFactor(getFpItemLocalBox("symbol", symbol), handle, pos);
        const newScale = Math.min(6, Math.max(0.2, (symbol.scale ?? 1) * factor));
        commitFloorPlan({ ...floorPlan, symbols: floorPlan.symbols.map((s) => (s.id === id ? { ...s, scale: newScale } : s)) });
        return;
      }
      case "landmarkPoint": {
        const point = floorPlan.landmarkPoints.find((p) => p.id === id);
        if (!point) return;
        const factor = computeUniformScaleFactor(getFpItemLocalBox("landmarkPoint", point), handle, pos);
        const newScale = Math.min(6, Math.max(0.2, (point.scale ?? 1) * factor));
        commitFloorPlan({ ...floorPlan, landmarkPoints: floorPlan.landmarkPoints.map((p) => (p.id === id ? { ...p, scale: newScale } : p)) });
        return;
      }
      case "text": {
        const text = floorPlan.texts.find((t) => t.id === id);
        if (!text) return;
        const factor = computeUniformScaleFactor(getFpItemLocalBox("text", text), handle, pos);
        const newFontSize = Math.round(Math.min(96, Math.max(8, (text.fontSize ?? DEFAULT_TEXT_FONT_SIZE) * factor)));
        commitFloorPlan({ ...floorPlan, texts: floorPlan.texts.map((t) => (t.id === id ? { ...t, fontSize: newFontSize } : t)) });
        return;
      }
      case "polygon": {
        const poly = floorPlan.polygons.find((p) => p.id === id);
        if (!poly) return;
        const newPoints = computePolygonResize(poly.points, getFpItemLocalBox("polygon", poly), handle, pos, 4);
        commitFloorPlan({ ...floorPlan, polygons: floorPlan.polygons.map((p) => (p.id === id ? { ...p, points: newPoints } : p)) });
        return;
      }
      case "landmarkArea": {
        const area = floorPlan.landmarkAreas.find((a) => a.id === id);
        if (!area) return;
        const newPoints = computePolygonResize(area.points, getFpItemLocalBox("landmarkArea", area), handle, pos, 4);
        commitFloorPlan({ ...floorPlan, landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === id ? { ...a, points: newPoints } : a)) });
        return;
      }
      default:
        return;
    }
  });
  /** 把「型別/id」的物件旋轉到絕對角度 angle（度）——房間/符號/地標點/文字有獨立的 rotation 欄位
   * 直接寫入；多邊形/地標區域/牆/標註沒有 rotation 欄位，改把「目標角度－目前角度」的差量套用到
   * 頂點/端點上永久旋轉（這幾種的「目前角度」來自 getFpItemLocalBox，多邊形/地標區域固定是 0，
   * 牆/標註是兩端點目前的實際朝向）。統一外框的旋轉控制點拖曳、屬性面板的旋轉角度數字輸入框都呼叫
   * 這個函式，確保「拖出來的角度」跟「打數字打出來的角度」永遠是同一套換算邏輯 */
  const commitRotationAngle = (type: FpItemType, id: string, angle: number) => {
    switch (type) {
      case "room": {
        commitFloorPlan({ ...floorPlan, rooms: floorPlan.rooms.map((r) => (r.id === id ? { ...r, rotation: angle } : r)) });
        return;
      }
      case "symbol": {
        commitFloorPlan({ ...floorPlan, symbols: floorPlan.symbols.map((s) => (s.id === id ? { ...s, rotation: angle } : s)) });
        return;
      }
      case "landmarkPoint": {
        commitFloorPlan({ ...floorPlan, landmarkPoints: floorPlan.landmarkPoints.map((p) => (p.id === id ? { ...p, rotation: angle } : p)) });
        return;
      }
      case "text": {
        commitFloorPlan({ ...floorPlan, texts: floorPlan.texts.map((t) => (t.id === id ? { ...t, rotation: angle } : t)) });
        return;
      }
      case "polygon": {
        const poly = floorPlan.polygons.find((p) => p.id === id);
        if (!poly) return;
        const box = getFpItemLocalBox("polygon", poly);
        const newPoints = rotatePolygonPoints(poly.points, { x: box.cx, y: box.cy }, angle - box.rotation);
        commitFloorPlan({ ...floorPlan, polygons: floorPlan.polygons.map((p) => (p.id === id ? { ...p, points: newPoints } : p)) });
        return;
      }
      case "landmarkArea": {
        const area = floorPlan.landmarkAreas.find((a) => a.id === id);
        if (!area) return;
        const box = getFpItemLocalBox("landmarkArea", area);
        const newPoints = rotatePolygonPoints(area.points, { x: box.cx, y: box.cy }, angle - box.rotation);
        commitFloorPlan({ ...floorPlan, landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === id ? { ...a, points: newPoints } : a)) });
        return;
      }
      case "wall": {
        const wall = floorPlan.walls.find((w) => w.id === id);
        if (!wall) return;
        const center = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
        const delta = angle - getFpItemLocalBox("wall", wall).rotation;
        const p1 = rotatePoint({ x: wall.x1, y: wall.y1 }, center, delta);
        const p2 = rotatePoint({ x: wall.x2, y: wall.y2 }, center, delta);
        commitFloorPlan({ ...floorPlan, walls: floorPlan.walls.map((w) => (w.id === id ? { ...w, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } : w)) });
        return;
      }
      case "dimension": {
        const dim = floorPlan.dimensions.find((d) => d.id === id);
        if (!dim) return;
        const center = { x: (dim.x1 + dim.x2) / 2, y: (dim.y1 + dim.y2) / 2 };
        const delta = angle - getFpItemLocalBox("dimension", dim).rotation;
        const p1 = rotatePoint({ x: dim.x1, y: dim.y1 }, center, delta);
        const p2 = rotatePoint({ x: dim.x2, y: dim.y2 }, center, delta);
        commitFloorPlan({ ...floorPlan, dimensions: floorPlan.dimensions.map((d) => (d.id === id ? { ...d, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y } : d)) });
        return;
      }
    }
  };
  /** 統一變形外框的旋轉控制點拖曳：key 編碼成 "型別:id"，算出滑鼠對應的絕對角度後交給
   * commitRotationAngle 寫入——房間/符號/文字的旋轉中心用各自的 x/y(+寬高換算)，多邊形/地標區域/
   * 牆/標註則用 getFpItemLocalBox 的中心點 */
  const boxRotateDrag = useLiveDragById((key, pos) => {
    const sep = key.indexOf(":");
    const type = key.slice(0, sep) as FpItemType;
    const id = key.slice(sep + 1);
    const item = getFpItemById({ type, id });
    if (!item) return;
    let center: { x: number; y: number };
    if (type === "room") {
      const room = item as FloorPlanRoom;
      center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
    } else if (type === "symbol" || type === "landmarkPoint") {
      const p = item as FloorPlanSymbol | FloorPlanLandmarkPoint;
      center = { x: p.x, y: p.y };
    } else {
      const box = getFpItemLocalBox(type, item);
      center = { x: box.cx, y: box.cy };
    }
    const angle = computeBoxRotationAngle(center, pos, orthoEnabled, orthoStep);
    commitRotationAngle(type, id, angle);
  });
  /** 翻轉目前選取的單一物件（水平／垂直）。各家族的實作方式不同（見規劃文件的家族對照表）：
   * 房間現有形狀都對自身垂直軸對稱，水平翻轉在數學上等於旋轉角度取負（無新增欄位）；垂直翻轉則是
   * 「180 減目前角度」——等於「先水平翻轉、再轉 180 度」，跟房間水平翻轉共用同一個推導。符號／
   * 地標點／文字用 flipX 欄位；垂直翻轉＝flipX 翻轉＋角度加 180 度（標準恆等式：旋轉 180 度再水平
   * 鏡射＝垂直鏡射，見元件內的 transform 組合）。多邊形／地標區域直接把每個頂點對外框中心軸鏡射、
   * 永久覆寫 points[]。牆／標註是對稱線段，翻轉在視覺上沒有差異，維持原樣（no-op，按鈕仍會顯示，
   * 只是資料不會變） */
  const handleFlipSelected = (axis: "horizontal" | "vertical") => {
    if (!singleSelected) return;
    const { type, id } = singleSelected;
    const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
    switch (type) {
      case "room": {
        const room = floorPlan.rooms.find((r) => r.id === id);
        if (!room) return;
        const cur = room.rotation ?? 0;
        const next = axis === "horizontal" ? norm(-cur) : norm(180 - cur);
        commitFloorPlan({ ...floorPlan, rooms: floorPlan.rooms.map((r) => (r.id === id ? { ...r, rotation: next } : r)) });
        return;
      }
      case "symbol": {
        const symbol = floorPlan.symbols.find((s) => s.id === id);
        if (!symbol) return;
        const patch =
          axis === "horizontal"
            ? { flipX: !(symbol.flipX ?? false) }
            : { flipX: !(symbol.flipX ?? false), rotation: norm((symbol.rotation ?? 0) + 180) };
        commitFloorPlan({ ...floorPlan, symbols: floorPlan.symbols.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
        return;
      }
      case "landmarkPoint": {
        const point = floorPlan.landmarkPoints.find((p) => p.id === id);
        if (!point) return;
        const patch =
          axis === "horizontal"
            ? { flipX: !(point.flipX ?? false) }
            : { flipX: !(point.flipX ?? false), rotation: norm((point.rotation ?? 0) + 180) };
        commitFloorPlan({ ...floorPlan, landmarkPoints: floorPlan.landmarkPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
        return;
      }
      case "text": {
        const text = floorPlan.texts.find((t) => t.id === id);
        if (!text) return;
        const patch =
          axis === "horizontal"
            ? { flipX: !(text.flipX ?? false) }
            : { flipX: !(text.flipX ?? false), rotation: norm((text.rotation ?? 0) + 180) };
        commitFloorPlan({ ...floorPlan, texts: floorPlan.texts.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
        return;
      }
      case "polygon": {
        const poly = floorPlan.polygons.find((p) => p.id === id);
        if (!poly) return;
        const box = getFpItemLocalBox("polygon", poly);
        const newPoints = poly.points.map((p) => (axis === "horizontal" ? { x: 2 * box.cx - p.x, y: p.y } : { x: p.x, y: 2 * box.cy - p.y }));
        commitFloorPlan({ ...floorPlan, polygons: floorPlan.polygons.map((p) => (p.id === id ? { ...p, points: newPoints } : p)) });
        return;
      }
      case "landmarkArea": {
        const area = floorPlan.landmarkAreas.find((a) => a.id === id);
        if (!area) return;
        const box = getFpItemLocalBox("landmarkArea", area);
        const newPoints = area.points.map((p) => (axis === "horizontal" ? { x: 2 * box.cx - p.x, y: p.y } : { x: p.x, y: 2 * box.cy - p.y }));
        commitFloorPlan({ ...floorPlan, landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === id ? { ...a, points: newPoints } : a)) });
        return;
      }
      case "wall":
      case "dimension":
        return;
    }
  };
  /** 依 {type,id} 找目前存在的 live 縮放/旋轉拖曳狀態，供渲染時即時預覽用——key 是
   * "型別:id[:控制點]"，比對開頭的型別/id 是不是這個物件自己的 */
  const getBoxResizeLive = (type: FpItemType, id: string): { handle: BoxHandle; pos: { x: number; y: number } } | null => {
    const live = boxResizeDrag.live;
    if (!live) return null;
    const [t, i, h] = live.id.split(":");
    if (t !== type || i !== id) return null;
    return { handle: h as BoxHandle, pos: { x: live.x, y: live.y } };
  };
  const getBoxRotateLive = (type: FpItemType, id: string): { x: number; y: number } | null => {
    const live = boxRotateDrag.live;
    if (!live) return null;
    const sep2 = live.id.indexOf(":");
    if (live.id.slice(0, sep2) !== type || live.id.slice(sep2 + 1) !== id) return null;
    return { x: live.x, y: live.y };
  };
  // wallEndpointDrag 的 id 編碼成 "牆id:1" 或 "牆id:2"，放開時再拆開對應是哪段牆的哪一端
  const wallEndpointDrag = useLiveDragById((key, pos) => {
    const [wallId, endStr] = key.split(":");
    const wall = floorPlan.walls.find((w) => w.id === wallId);
    if (!wall) return;
    const other = endStr === "1" ? { x: wall.x2, y: wall.y2 } : { x: wall.x1, y: wall.y1 };
    const snapped = fpSnap(pos);
    const finalPos = orthoEnabled ? applyOrtho(other, snapped, orthoStep) : snapped;
    const patch = endStr === "1" ? { x1: finalPos.x, y1: finalPos.y } : { x2: finalPos.x, y2: finalPos.y };
    commitFloorPlan({ ...floorPlan, walls: floorPlan.walls.map((w) => (w.id === wallId ? { ...w, ...patch } : w)) });
  });
  /** 拖曳牆的本體（不是端點）＝整段牆平移，兩個端點一起移動、牆的長度角度不變——原本只支援拖端點
   * 個別調整，這裡補上「整段牆搬移」，順便也是框選多選時「拖其中一段牆、其他選取物件一起動」的
   * 進入點（見 isGroupDragMember／startGroupDrag） */
  const wallMoveDrag = useLiveDragById((id, pos) => {
    const wall = floorPlan.walls.find((w) => w.id === id);
    if (!wall) return;
    const midX = (wall.x1 + wall.x2) / 2;
    const midY = (wall.y1 + wall.y2) / 2;
    let dx = pos.x - midX;
    let dy = pos.y - midY;
    const guide = resolveAlignmentSnap("wall", id, { ...wall, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy });
    dx += guide.dx;
    dy += guide.dy;
    commitFloorPlan({
      ...floorPlan,
      walls: floorPlan.walls.map((w) => (w.id === id ? { ...w, x1: w.x1 + dx, y1: w.y1 + dy, x2: w.x2 + dx, y2: w.y2 + dy } : w)),
    });
  });

  const symbolMoveDrag = useLiveDragById((id, pos) => {
    const symbol = floorPlan.symbols.find((s) => s.id === id);
    if (!symbol) return;
    const guide = resolveAlignmentSnap("symbol", id, { ...symbol, x: pos.x, y: pos.y });
    const guided = { x: pos.x + guide.dx, y: pos.y + guide.dy };
    const snapped = fpSnap(guided);
    const p = { x: guide.hitX ? guided.x : snapped.x, y: guide.hitY ? guided.y : snapped.y };
    commitFloorPlan({ ...floorPlan, symbols: floorPlan.symbols.map((s) => (s.id === id ? { ...s, x: p.x, y: p.y } : s)) });
  });
  const textMoveDrag = useLiveDragById((id, pos) => {
    const text = floorPlan.texts.find((t) => t.id === id);
    if (!text) return;
    const guide = resolveAlignmentSnap("text", id, { ...text, x: pos.x, y: pos.y });
    const guided = { x: pos.x + guide.dx, y: pos.y + guide.dy };
    const snapped = fpSnap(guided);
    const p = { x: guide.hitX ? guided.x : snapped.x, y: guide.hitY ? guided.y : snapped.y };
    commitFloorPlan({ ...floorPlan, texts: floorPlan.texts.map((t) => (t.id === id ? { ...t, x: p.x, y: p.y } : t)) });
  });
  /** 多邊形整體搬移：用形心當拖曳錨點，放開時把「拖曳終點－原形心」的位移量套用到每個頂點上，
   * 整個形狀一起平移，形狀本身（頂點之間的相對關係）不變 */
  const polygonMoveDrag = useLiveDragById((id, pos) => {
    const poly = floorPlan.polygons.find((p) => p.id === id);
    if (!poly) return;
    const centroid = polygonCentroid(poly.points);
    let dx = pos.x - centroid.x;
    let dy = pos.y - centroid.y;
    const guide = resolveAlignmentSnap("polygon", id, { ...poly, points: poly.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
    dx += guide.dx;
    dy += guide.dy;
    const movedPoints = poly.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    commitFloorPlan({ ...floorPlan, polygons: floorPlan.polygons.map((p) => (p.id === id ? { ...p, points: movedPoints } : p)) });
  });
  // polygonVertexDrag 的 id 編碼成 "多邊形id:頂點索引"，放開時拆開對應是哪個多邊形的哪一個頂點
  const polygonVertexDrag = useLiveDragById((key, pos) => {
    const sep = key.lastIndexOf(":");
    const polyId = key.slice(0, sep);
    const idx = Number(key.slice(sep + 1));
    const poly = floorPlan.polygons.find((p) => p.id === polyId);
    if (!poly) return;
    const p = fpSnap(pos);
    const newPoints = poly.points.map((pt, i) => (i === idx ? p : pt));
    commitFloorPlan({ ...floorPlan, polygons: floorPlan.polygons.map((pl) => (pl.id === polyId ? { ...pl, points: newPoints } : pl)) });
  });
  const landmarkPointMoveDrag = useLiveDragById((id, pos) => {
    const point = floorPlan.landmarkPoints.find((p) => p.id === id);
    if (!point) return;
    const guide = resolveAlignmentSnap("landmarkPoint", id, { ...point, x: pos.x, y: pos.y });
    const guided = { x: pos.x + guide.dx, y: pos.y + guide.dy };
    const snapped = fpSnap(guided);
    const p = { x: guide.hitX ? guided.x : snapped.x, y: guide.hitY ? guided.y : snapped.y };
    commitFloorPlan({ ...floorPlan, landmarkPoints: floorPlan.landmarkPoints.map((pt) => (pt.id === id ? { ...pt, x: p.x, y: p.y } : pt)) });
  });
  const landmarkAreaMoveDrag = useLiveDragById((id, pos) => {
    const area = floorPlan.landmarkAreas.find((a) => a.id === id);
    if (!area) return;
    const centroid = polygonCentroid(area.points);
    let dx = pos.x - centroid.x;
    let dy = pos.y - centroid.y;
    const guide = resolveAlignmentSnap("landmarkArea", id, { ...area, points: area.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
    dx += guide.dx;
    dy += guide.dy;
    const movedPoints = area.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
    commitFloorPlan({ ...floorPlan, landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === id ? { ...a, points: movedPoints } : a)) });
  });
  const landmarkAreaVertexDrag = useLiveDragById((key, pos) => {
    const sep = key.lastIndexOf(":");
    const areaId = key.slice(0, sep);
    const idx = Number(key.slice(sep + 1));
    const area = floorPlan.landmarkAreas.find((a) => a.id === areaId);
    if (!area) return;
    const p = fpSnap(pos);
    const newPoints = area.points.map((pt, i) => (i === idx ? p : pt));
    commitFloorPlan({ ...floorPlan, landmarkAreas: floorPlan.landmarkAreas.map((a) => (a.id === areaId ? { ...a, points: newPoints } : a)) });
  });

  const handleAddLayer = () => {
    const layer = { id: newId(), name: t("mapViewPage.newLayerDefaultName", { n: floorPlan.layers.length + 1 }), visible: true };
    commitFloorPlan({ ...floorPlan, layers: [...floorPlan.layers, layer], activeLayerId: layer.id });
  };
  const handleToggleLayerVisible = (layerId: string) => {
    commitFloorPlan({ ...floorPlan, layers: floorPlan.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)) });
  };
  const handleDeleteLayer = (layerId: string) => {
    const target = floorPlan.layers.find((l) => l.id === layerId);
    // 地標系統圖層不能被刪除——UI 本來就不會給它刪除按鈕，這裡再擋一層，不信任呼叫來源
    if (!target || target.isLandmarkLayer) return;
    // 下限判斷排除地標圖層：使用者至少要留一個「一般」圖層，地標圖層不算數
    const regularCount = floorPlan.layers.filter((l) => !l.isLandmarkLayer).length;
    if (regularCount <= 1) return;
    const remaining = floorPlan.layers.filter((l) => l.id !== layerId);
    // fallback 一定要挑一般圖層，絕不能讓一般物件因為圖層被刪除而意外歸到地標圖層
    const fallbackId = remaining.find((l) => !l.isLandmarkLayer)!.id;
    commitFloorPlan({
      layers: remaining,
      activeLayerId: floorPlan.activeLayerId === layerId ? fallbackId : floorPlan.activeLayerId,
      walls: floorPlan.walls.map((w) => (w.layerId === layerId ? { ...w, layerId: fallbackId } : w)),
      rooms: floorPlan.rooms.map((r) => (r.layerId === layerId ? { ...r, layerId: fallbackId } : r)),
      dimensions: floorPlan.dimensions.map((d) => (d.layerId === layerId ? { ...d, layerId: fallbackId } : d)),
      symbols: floorPlan.symbols.map((s) => (s.layerId === layerId ? { ...s, layerId: fallbackId } : s)),
      polygons: floorPlan.polygons.map((p) => (p.layerId === layerId ? { ...p, layerId: fallbackId } : p)),
      texts: floorPlan.texts.map((t) => (t.layerId === layerId ? { ...t, layerId: fallbackId } : t)),
      // 地標點／地標區域一律歸屬地標圖層，不受一般圖層被刪除影響——這兩行純粹是型別要求
      // FloorPlanData 完整回傳，實際上 layerId 不會有任何一筆命中上面的 layerId === layerId 判斷
      landmarkPoints: floorPlan.landmarkPoints,
      landmarkAreas: floorPlan.landmarkAreas,
    });
  };
  const commitLayerName = (layerId: string) => {
    const draft = layerNameDrafts[layerId];
    if (draft !== undefined && draft.trim()) {
      commitFloorPlan({ ...floorPlan, layers: floorPlan.layers.map((l) => (l.id === layerId ? { ...l, name: draft.trim() } : l)) });
    }
    setLayerNameDrafts((d) => {
      const next = { ...d };
      delete next[layerId];
      return next;
    });
  };

  const startEdit = () => {
    if (!map) return;
    setMetaDraft({
      name: map.name,
      description: map.description,
      tagColor: map.tagColor,
      seaColor: map.seaColor,
      width: map.width,
      height: map.height,
    });
    // 地形／平面圖兩套工具一進編輯模式就都要能用，不像過去要先手動切到「平面圖模式」才建立
    // floorPlan 內容——這張地圖可能還沒有 floorPlan（undefined），先建一份預設的（一個空圖層＋
    // 地標系統圖層）寫進資料庫＋歷史紀錄起點，後面畫牆／房間才有地方歸屬（activeLayerId 才有效）
    if (!map.floorPlan) {
      const fresh = createDefaultFloorPlan(t);
      updateMapState(map.id, { floorPlan: fresh });
      fpHistoryRef.current = { stack: [fresh], index: 0 };
      setFpCanUndo(false);
      setFpCanRedo(false);
    } else if (!map.floorPlan.layers.some((l) => l.isLandmarkLayer)) {
      // 這次功能上線前建立的舊地圖：floorPlan 已存在，但還沒有地標系統圖層，這裡回填一筆——
      // 比照上面「floorPlan 整個不存在」的分支，寫資料庫的同時也要手動重設 fpHistoryRef／
      // undo-redo 旗標，否則復原堆疊的起點會跟 Dexie 實際內容兜不起來
      const augmented: FloorPlanData = {
        ...map.floorPlan,
        layers: [...map.floorPlan.layers, { id: newId(), name: t("mapViewPage.landmarkLayerName"), visible: true, isLandmarkLayer: true }],
      };
      updateMapState(map.id, { floorPlan: augmented });
      fpHistoryRef.current = { stack: [augmented], index: 0 };
      setFpCanUndo(false);
      setFpCanRedo(false);
    }
    // 地標圖示類型（內建 9 種）新地圖／舊地圖都用同一個 ensureBuiltInLandmarkIconTypes 補齊——
    // 這個函式本身有「已經有就跳過」的防呆，跟上面 floorPlan／地標圖層的回填各自獨立、
    // 可以放心無條件呼叫，不用另外判斷是新地圖還是舊地圖
    if (worldId) ensureBuiltInLandmarkIconTypes(worldId);
    setEditing(true);
  };
  const cancelEdit = () => {
    setMetaDraft(null);
    setEditing(false);
    setHoverPos(null);
    setWallStart(null);
    setRoomDraft(null);
    setDimensionStart(null);
    setPolygonPoints(null);
    setFpSelected([]);
  };

  /** 切換地圖尺寸：立刻套用，不像其他欄位要等按「儲存」——尺寸不是單純的外觀屬性，畫布上的
   * 筆刷座標系直接綁定它，如果只改草稿、畫面（PannableCanvas 的 contentWidth/height、畫布本身）
   * 卻還停在舊尺寸，筆刷點下去的座標會對不上實際的畫布像素（使用者反應「切換尺寸沒有效果」——
   * 感覺上是完全沒反應，但其實是改了草稿卻沒有任何畫面在讀它）。立刻套用能讓畫面／座標系／
   * 資料庫三者隨時保持一致，不需要另外處理「草稿尺寸跟實際畫布不同步」這種中間狀態 */
  const handleResize = async (w: number, h: number) => {
    if (!map || (w === map.width && h === map.height)) return;
    await updateMapMeta(map.id, { width: w, height: h });
    // 尺寸變了：既有視角是針對舊尺寸算的（PannableCanvas 偵測到內容只是單純變大時不會主動重新置中，
    // 是為了其他畫布「新增節點但沒動過構圖」的情境設計的，這裡尺寸是使用者自己主動改的，反而需要
    // 强制重新置中，不能沿用舊視角），清掉讓畫布依新尺寸重新自動置中縮放；
    // 既有 offscreen canvas 也是舊尺寸，一併清掉讓下面的初始化 effect 依新尺寸／剛縮放好的高度圖重建
    await updateMapState(map.id, { viewport: undefined });
    canvasRef.current = null;
    setMetaDraft((d) => (d ? { ...d, width: w, height: h } : d));
  };

  /** 「地圖設定」視窗的「比較前後」——切到「之前」時借用 handleResize 現有的畫布／視角同步邏輯
   * 暫時把畫面換成開啟視窗當下的原始尺寸／海洋顏色；再按一次換回切換前記住的「之後」草稿。
   * 這裡沒有另外做一份「不寫入資料庫的預覽層」，是刻意的：尺寸的畫布重建/視角重置邏輯已經
   * 跟 map.width/height（來自 Dexie）綁死，另外做一份純視覺預覽風險是重蹈舊註解提到的
   * 畫布跟資料尺寸對不上的覆轍；比較/取消時多寫幾次 Dexie 換來邏輯單純、不會跟現有機制打架 */
  const handleToggleMapSettingsCompare = async () => {
    if (!metaDraft || !mapSettingsOriginal) return;
    if (mapSettingsComparing) {
      const after = mapSettingsAfterRef.current;
      if (after) {
        await handleResize(after.width, after.height);
        setMetaDraft((d) => (d ? { ...d, seaColor: after.seaColor } : d));
      }
      setMapSettingsComparing(false);
    } else {
      mapSettingsAfterRef.current = { width: metaDraft.width, height: metaDraft.height, seaColor: metaDraft.seaColor };
      await handleResize(mapSettingsOriginal.width, mapSettingsOriginal.height);
      setMetaDraft((d) => (d ? { ...d, seaColor: mapSettingsOriginal.seaColor } : d));
      setMapSettingsComparing(true);
    }
  };
  /** 取消：退回視窗開啟當下的原始尺寸／海洋顏色，讓「沒按確定就不會更改」成立——
   * 尺寸雖然編輯過程中已經即時寫入 Dexie（沿用既有的 handleResize，避免畫布/資料尺寸對不上，
   * 見上方比較前後的說明），取消時再呼叫一次 handleResize 換回原始尺寸即可還原 */
  const handleCancelMapSettings = async () => {
    if (mapSettingsOriginal) {
      await handleResize(mapSettingsOriginal.width, mapSettingsOriginal.height);
      setMetaDraft((d) => (d ? { ...d, seaColor: mapSettingsOriginal.seaColor } : d));
    }
    setMapSettingsComparing(false);
    setShowMapSizeDialog(false);
  };
  /** 確定：如果目前正顯示「比較前後」的「之前」畫面，先切回「之後」的編輯結果再關視窗，
   * 避免使用者按下確定的當下畫面其實是舊尺寸 */
  const handleConfirmMapSettings = async () => {
    if (mapSettingsComparing && mapSettingsAfterRef.current) {
      const after = mapSettingsAfterRef.current;
      await handleResize(after.width, after.height);
      setMetaDraft((d) => (d ? { ...d, seaColor: after.seaColor } : d));
    }
    setMapSettingsComparing(false);
    setShowMapSizeDialog(false);
  };

  const handleSave = async () => {
    if (!map || !metaDraft) return;
    // 尺寸多半已經在 handleResize 立刻套用過了（點預設尺寸按鈕／套用），但自訂寬高輸入框本身
    // 只會更新 metaDraft 草稿——如果使用者打完數字沒點「套用」、直接點這裡的「儲存」，
    // metaDraft.width/height 會跟 map 不一致，這裡還是要照 handleResize 的方式重置 viewport／
    // 清空 canvasRef.current，否則畫面顯示的（讀 map.heightMap）雖然是剛縮放好的新尺寸，
    // 但實際拿來畫筆刷的離線畫布還停在舊尺寸，兩者對不上，使用者再畫一筆就會把新尺寸的地形
    // 蓋成一張跟畫布大小錯位的圖
    const sizeChanged = metaDraft.width !== map.width || metaDraft.height !== map.height;
    await updateMapMeta(map.id, metaDraft);
    if (sizeChanged) {
      await updateMapState(map.id, { viewport: undefined });
      canvasRef.current = null;
    } else if (liveViewport && !embedded) {
      await updateMapState(map.id, { viewport: liveViewport });
    }
    setMetaDraft(null);
    setEditing(false);
    setHoverPos(null);
  };
  // Ctrl/Cmd+S：整份地圖（含地形／平面圖／目前縮放平移位置）存檔，行為等同按「儲存」按鈕；
  // editing 為 false（metaDraft 也一定是 null，見 startEdit）時停用，不在檢視模式誤觸發
  useSaveShortcut(handleSave, editing);
  const handleDeleteMap = async () => {
    if (!map) return;
    const ok = await confirm({ title: t("mapCard.deleteConfirm.title"), message: t("mapCard.deleteConfirm.message", { name: map.name }) });
    if (!ok) return;
    await deleteMap(map.id);
    if (embedded) {
      onDirtyChange?.(false);
      closePanel();
    } else {
      navigate(`/world/${worldId}/map`);
    }
  };

  /** 匯出成圖片：另外開一張跟地圖同解析度的離線 canvas，全部用 Canvas 2D 原生指令重畫一次——
   * 不是把畫面上的 SVG 直接轉檔，因為 SVG 版本（1）縮放平移後只涵蓋目前可視範圍，不是整張地圖，
   * （2）套的是濾鏡（feComponentTransfer）不是純像素，序列化成圖片還要另外處理濾鏡；用同一批
   * 資料在離線 canvas 上重畫一次，永遠是「整張地圖、全解析度」，跟目前畫面顯示到哪裡無關。
   * 顏色改用 getComputedStyle 讀出實際的 CSS 變數值——canvas fillStyle 不吃 var(--x) 這種語法，
   * 一定要先解析成瀏覽器算好的最終顏色字串，深色模式下讀到的也會是深色模式的顏色，跟畫面一致 */
  const buildMapExportCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!map) return null;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = map.width;
    exportCanvas.height = map.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return null;

    if (map.heightMap) {
      await loadHeightMapIntoCanvas(exportCanvas, map.heightMap);
      applyHeightRampToCanvas(ctx, map.width, map.height, map.seaColor ?? DEFAULT_SEA_COLOR);
    } else {
      ctx.fillStyle = map.seaColor ?? DEFAULT_SEA_COLOR;
      ctx.fillRect(0, 0, map.width, map.height);
    }

    const rootStyle = getComputedStyle(document.documentElement);
    const cssVar = (name: string, fallback: string) => rootStyle.getPropertyValue(name).trim() || fallback;
    const textColor = cssVar("--text", "#1a1a1a");
    const borderColor = cssVar("--border", "#888888");
    const accentColor = cssVar("--accent", "#3b82f6");
    const bgColor = cssVar("--bg", "#ffffff");

    const visibleLayerIds = new Set(floorPlan.layers.filter((l) => l.visible).map((l) => l.id));

    for (const room of floorPlan.rooms.filter((r) => visibleLayerIds.has(r.layerId))) {
      ctx.save();
      const cx = room.x + room.width / 2;
      const cy = room.y + room.height / 2;
      if (room.rotation) {
        ctx.translate(cx, cy);
        ctx.rotate((room.rotation * Math.PI) / 180);
        ctx.translate(-cx, -cy);
      }
      const hasCustomFill = !!(room.style?.fillColor || room.style?.fillPattern);
      traceRoomShapePath(ctx, room.shape ?? "rect", room.x, room.y, room.width, room.height);
      ctx.globalAlpha = hasCustomFill ? 1 : 0.08;
      ctx.fillStyle = resolveFillStyleForCanvas(ctx, room.style, accentColor);
      ctx.fill();
      ctx.globalAlpha = 1;
      applyStrokeStyleToCanvas(ctx, room.style, borderColor);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (room.label) {
        ctx.fillStyle = textColor;
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(room.label, cx, cy);
      }
      ctx.restore();
    }

    for (const poly of floorPlan.polygons.filter((p) => visibleLayerIds.has(p.layerId))) {
      const hasCustomFill = !!(poly.style?.fillColor || poly.style?.fillPattern);
      ctx.beginPath();
      poly.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = hasCustomFill ? 1 : 0.08;
      ctx.fillStyle = resolveFillStyleForCanvas(ctx, poly.style, accentColor);
      ctx.fill();
      ctx.globalAlpha = 1;
      applyStrokeStyleToCanvas(ctx, poly.style, borderColor);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      const centroid = polygonCentroid(poly.points);
      const label = `${poly.label ? `${poly.label} · ` : ""}${formatAreaLabel(polygonArea(poly.points), map.scaleBar)}`;
      ctx.fillStyle = textColor;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, centroid.x, centroid.y);
    }

    ctx.lineCap = "round";
    for (const wall of floorPlan.walls.filter((w) => visibleLayerIds.has(w.layerId))) {
      applyStrokeStyleToCanvas(ctx, wall.style, textColor);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(wall.x1, wall.y1);
      ctx.lineTo(wall.x2, wall.y2);
      ctx.stroke();
    }
    ctx.lineCap = "butt";
    ctx.setLineDash([]);

    for (const symbol of floorPlan.symbols.filter((s) => visibleLayerIds.has(s.layerId))) {
      ctx.save();
      ctx.translate(symbol.x, symbol.y);
      ctx.rotate(((symbol.rotation ?? 0) * Math.PI) / 180);
      // scale/flipX 合併進同一個 ctx.scale：flipX 只是把水平縮放倍率變負值，
      // 跟畫面上的 SVG transform（translate→rotate→scale）順序一致
      const symbolScale = symbol.scale ?? 1;
      ctx.scale((symbol.flipX ? -1 : 1) * symbolScale, symbolScale);
      drawFloorPlanSymbolToCanvas(ctx, symbol.type, textColor, bgColor);
      ctx.restore();
    }

    for (const text of floorPlan.texts.filter((t) => visibleLayerIds.has(t.layerId))) {
      const fontSize = text.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
      const estWidth = fontSize * text.text.length || fontSize;
      const cx = text.x + estWidth / 2;
      ctx.save();
      // 繞 (cx, text.y) 旋轉＋繞 x=cx 水平翻轉，跟畫面上的 SVG transform 是同一組數學（見
      // MapViewPage.tsx 文字渲染區塊的說明），只是換成 Canvas 2D 的 API 寫法
      ctx.translate(cx, text.y);
      ctx.rotate(((text.rotation ?? 0) * Math.PI) / 180);
      ctx.scale(text.flipX ? -1 : 1, 1);
      ctx.translate(-cx, -text.y);
      ctx.fillStyle = text.color || textColor;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text.text, text.x, text.y);
      ctx.restore();
    }

    for (const dim of floorPlan.dimensions.filter((d) => visibleLayerIds.has(d.layerId))) {
      const dx = dim.x2 - dim.x1;
      const dy = dim.y2 - dim.y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const tick = 5;
      applyStrokeStyleToCanvas(ctx, dim.style, borderColor);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dim.x1, dim.y1);
      ctx.lineTo(dim.x2, dim.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(dim.x1 - nx * tick, dim.y1 - ny * tick);
      ctx.lineTo(dim.x1 + nx * tick, dim.y1 + ny * tick);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dim.x2 - nx * tick, dim.y2 - ny * tick);
      ctx.lineTo(dim.x2 + nx * tick, dim.y2 + ny * tick);
      ctx.stroke();
      const midX = (dim.x1 + dim.x2) / 2;
      const midY = (dim.y1 + dim.y2) / 2;
      ctx.fillStyle = resolveStrokeColor(dim.style, borderColor);
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(formatDimensionLabel(len, map.scaleBar), midX + nx * 11, midY + ny * 11);
    }
    ctx.setLineDash([]);

    // 地標區域／地標點放在其餘平面圖內容之後匯出，確保跟畫布顯示一樣疊在最上層
    for (const area of floorPlan.landmarkAreas.filter((a) => visibleLayerIds.has(a.layerId))) {
      const hasCustomFill = !!(area.style?.fillColor || area.style?.fillPattern);
      ctx.beginPath();
      area.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.globalAlpha = hasCustomFill ? 1 : 0.12;
      ctx.fillStyle = resolveFillStyleForCanvas(ctx, area.style, LANDMARK_FALLBACK_COLOR);
      ctx.fill();
      ctx.globalAlpha = 1;
      applyStrokeStyleToCanvas(ctx, area.style, LANDMARK_FALLBACK_COLOR);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      const centroid = polygonCentroid(area.points);
      const label = area.label || entryNameById.get(area.linkedEntryId ?? "") || t("fpItemType.landmarkArea");
      ctx.fillStyle = textColor;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, centroid.x, centroid.y);
    }

    // 自訂地標圖示上傳的圖片先統一預先載入一次、存進表裡，同一種類型的多個地標點共用同一張
    // 已載好的圖，不用每個地標點各自重新載入
    const landmarkCustomImages = new Map<string, HTMLImageElement>();
    for (const t of landmarkIconTypes) {
      if (!t.customImage) continue;
      try {
        landmarkCustomImages.set(t.id, await loadImageFromDataUrl(t.customImage));
      } catch {
        // 載入失敗就當作沒有圖片，畫的時候會退回通用圖釘
      }
    }
    for (const point of floorPlan.landmarkPoints.filter((p) => visibleLayerIds.has(p.layerId))) {
      const { iconType, label, color, iconTextColor, iconFillColor, iconCustomText } = resolveLandmarkPointDisplay(point);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(((point.rotation ?? 0) * Math.PI) / 180);
      const pointScale = point.scale ?? 1;
      ctx.scale((point.flipX ? -1 : 1) * pointScale, pointScale);
      drawFloorPlanLandmarkIconToCanvas(ctx, {
        builtInKey: iconType?.builtInKey,
        customImage: iconType ? landmarkCustomImages.get(iconType.id) : undefined,
        color,
        textColor: iconTextColor,
        fillColor: iconFillColor,
        initial: iconCustomText,
      });
      // 標籤文字在畫面上（見平面圖渲染區塊）也是跟圖示包在同一個 transform 裡一起轉/縮放/翻轉，
      // 這裡要在 restore 之前、用本地座標畫，才會跟畫面顯示一致
      ctx.fillStyle = textColor;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, 0, LANDMARK_ICON_SIZE * 0.42 + 4);
      ctx.restore();
    }

    if (map.scaleBar) {
      const { x, y, lengthPx, realDistance, unit } = map.scaleBar;
      const tick = 6;
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lengthPx, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y - tick);
      ctx.lineTo(x, y + tick);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + lengthPx, y - tick);
      ctx.lineTo(x + lengthPx, y + tick);
      ctx.stroke();
      ctx.fillStyle = textColor;
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(`${realDistance} ${unit}`, x + lengthPx / 2, y - tick - 5);
    }

    if (map.compass) {
      const { x, y, rotation, labels } = map.compass;
      const compassStyle = map.compass.style ?? "classic";
      const faintColor = cssVar("--text-faint", "#999999");
      const pointAt = (r: number, angleDeg: number) => {
        const rad = ((angleDeg - 90) * Math.PI) / 180;
        return { x: x + r * Math.cos(rad), y: y + r * Math.sin(rad) };
      };
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (compassStyle === "rose") {
        // 跟 CompassGraphic 的 CompassRoseGraphic 用同一組半徑/角度數字
        const spikeTriangle = (tipR: number, baseR: number, baseHalfWidthDeg: number, angle: number) => {
          const tip = pointAt(tipR, angle);
          const b1 = pointAt(baseR, angle - baseHalfWidthDeg);
          const b2 = pointAt(baseR, angle + baseHalfWidthDeg);
          return { tip, b1, b2 };
        };
        const fillTriangle = (t: { tip: { x: number; y: number }; b1: { x: number; y: number }; b2: { x: number; y: number } }, fill: string) => {
          ctx.fillStyle = fill;
          ctx.beginPath();
          ctx.moveTo(t.tip.x, t.tip.y);
          ctx.lineTo(t.b1.x, t.b1.y);
          ctx.lineTo(t.b2.x, t.b2.y);
          ctx.closePath();
          ctx.fill();
        };
        for (const angle of [45, 135, 225, 315]) fillTriangle(spikeTriangle(17, 3, 5, angle + rotation), borderColor);
        const cardinals = [
          { angle: 0, label: labels.n, primary: true },
          { angle: 90, label: labels.e, primary: false },
          { angle: 180, label: labels.s, primary: false },
          { angle: 270, label: labels.w, primary: false },
        ];
        for (const c of cardinals) fillTriangle(spikeTriangle(30, 3, 7, c.angle + rotation), c.primary ? accentColor : faintColor);
        ctx.fillStyle = textColor;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        for (const c of cardinals) {
          const labelPos = pointAt(30 + 14, c.angle + rotation);
          ctx.fillStyle = textColor;
          ctx.font = c.primary ? "bold 12px sans-serif" : "12px sans-serif";
          ctx.fillText(c.label, labelPos.x, labelPos.y);
        }
      } else if (compassStyle === "arrow") {
        // 跟 CompassGraphic 的 CompassArrowGraphic 用同一組半徑/角度數字
        const tipR = 28;
        const baseR = 4;
        const tip = pointAt(tipR, rotation);
        const b1 = pointAt(baseR, rotation - 16);
        const b2 = pointAt(baseR, rotation + 16);
        const tail = pointAt(baseR, rotation + 180);
        ctx.strokeStyle = faintColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.fillStyle = accentColor;
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(b1.x, b1.y);
        ctx.lineTo(b2.x, b2.y);
        ctx.closePath();
        ctx.fill();
        const labelPos = pointAt(tipR + 13, rotation);
        ctx.fillStyle = textColor;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(labels.n, labelPos.x, labelPos.y);
      } else {
        // classic：跟 CompassGraphic 的 CompassClassicGraphic 用同一組半徑/角度數字
        const R = 26;
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = bgColor;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        for (const dir of [
          { angle: 0, label: labels.n, primary: true },
          { angle: 90, label: labels.e, primary: false },
          { angle: 180, label: labels.s, primary: false },
          { angle: 270, label: labels.w, primary: false },
        ]) {
          const a = dir.angle + rotation;
          const tip = pointAt(R - 5, a);
          const labelPos = pointAt(R + 13, a);
          ctx.strokeStyle = dir.primary ? accentColor : faintColor;
          ctx.lineWidth = dir.primary ? 2.5 : 1.5;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(tip.x, tip.y);
          ctx.stroke();
          ctx.fillStyle = textColor;
          ctx.font = dir.primary ? "bold 12px sans-serif" : "12px sans-serif";
          ctx.fillText(dir.label, labelPos.x, labelPos.y);
        }
      }
    }

    return exportCanvas;
  };

  const handleExportImage = async () => {
    const exportCanvas = await buildMapExportCanvas();
    if (!exportCanvas) return;
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      downloadBlob(blob, `${map?.name || "map"}.png`);
    }, "image/png");
  };

  const handleExportPdf = async () => {
    const exportCanvas = await buildMapExportCanvas();
    if (!exportCanvas || !map) return;
    const dataUrl = exportCanvas.toDataURL("image/png");
    const blob = await buildImagePdfBlob(map.name, currentLocalUser?.name, dataUrl);
    downloadBlob(blob, `${map.name || "map"}.pdf`);
  };

  const hasMetaChanges =
    editing &&
    metaDraft !== null &&
    map != null &&
    JSON.stringify(metaDraft) !==
      JSON.stringify({
        name: map.name,
        description: map.description,
        tagColor: map.tagColor,
        seaColor: map.seaColor,
        width: map.width,
        height: map.height,
      });

  useEffect(() => {
    onDirtyChange?.(hasMetaChanges);
  }, [hasMetaChanges, onDirtyChange]);

  // embedded 模式維持原本用 panelWidth 換算寬度、固定高度 380 的做法（側邊面板本身已經是另一個
  // 獨立捲動容器，量測時機更複雜，這裡不動它）；非 embedded 才量測 CanvasWorkbench 實際分給
  // 畫布的容器尺寸。依賴陣列要包含 `!!map`：地圖（useLiveQuery）還沒讀出來之前，下面會提早
  // return null，canvasHostRef 那個 DOM 節點根本還沒掛上去，這個 effect 抓不到 host 只能先跳過；
  // 沒有 `!!map` 這個依賴的話，等地圖讀出來、DOM 真的掛上去的那次重新渲染，因為 embedded 沒變，
  // React 會直接跳過重跑這個 effect，永遠量不到尺寸、畫布也就永遠不會出現。
  // 這裡量到的是 canvasHostRef「原始」容器尺寸，刻意不管尺規開關——量測跟尺規是否顯示無關
  // （canvasHostRef 是 100%/100% 貼滿父層，尺規開不開都不會改變它的大小），尺規要佔掉的
  // RULER_SIZE 留到下面算 width/height 時才扣，讓「扣尺規空間」跟「尺規的 padding 出現」
  // 在同一次 render 就一起生效。以前是在這個 effect 裡先扣好尺規空間才存進 state，勾選尺規的
  // 那一瞬間會有一個 render 空隙：padding 已經加上去了、但 SVG 尺寸還是尺規開之前量到的舊值
  // （effect 要等這次 render 的 DOM 都更新完才會跑），畫面上暫時比容器寬 22px，觸發外層
  // overflow:auto 容器跳出捲軸；捲軸一出現又把容器擠小一點，ResizeObserver 偵測到尺寸變化再量一次、
  // 再觸發一次微調，如此反覆造成使用者說的「按尺規地圖一直抖」——兩個數字只要不是「同一個 render
  // 用同一個依據算出來的」，就有機會在切換瞬間對不上而互相踩踏出這種回饋迴圈
  const mapLoaded = !!map;
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
  }, [embedded, mapLoaded]);

  if (!map || !worldId) return null;

  const rulerOffset = !embedded && showRuler ? RULER_SIZE : 0;
  const width = embedded
    ? Math.max(240, panelWidth - 40)
    : Math.max(240, (measuredCanvasSize?.width ?? 900) - rulerOffset);
  const height = embedded ? 380 : Math.max(200, (measuredCanvasSize?.height ?? 640) - rulerOffset);
  const displayedDataUrl = livePreviewUrl ?? map.heightMap;
  const visibleLayerIds = new Set(floorPlan.layers.filter((l) => l.visible).map((l) => l.id));
  // 樣式面板只在剛好選 1 個物件時顯示（多選一起改樣式語意不明確，例如混了牆跟房間時「填滿方式」
  // 對牆沒有意義；框選這種一次選多個的情境下，樣式面板乾脆整個隱藏，只留刪除／複製這些對整個
  // 集合都講得通的操作）。singleSelected 是這唯一一個被選取物件的記錄，null 代表沒選或選了不只一個
  const singleSelected = fpSelected.length === 1 ? fpSelected[0] : null;
  // 選取單一物件時，「旋轉與翻轉」面板要顯示目前的角度數字——8 種型別統一透過 getFpItemLocalBox
  // 讀取，多邊形/地標區域/牆/標註沒有獨立 rotation 欄位時這裡讀到的就是 getFpItemLocalBox 算出來的
  // 目前角度（多邊形/地標區域固定是 0，牆/標註是兩端點目前的實際朝向）
  const selectedRotationDeg = singleSelected
    ? (() => {
        const item = getFpItemById(singleSelected);
        return item ? Math.round(getFpItemLocalBox(singleSelected.type, item).rotation) : null;
      })()
    : null;
  // 目前選取物件的樣式（線條顏色／虛線／填滿），給下面的樣式編輯面板讀目前值用；符號沒有樣式，
  // selectedStyle 維持 undefined（面板本身也不會對符號顯示，見下方 leftPanel/bottomPanel）
  const selectedStyle: FloorPlanStyle | undefined =
    singleSelected?.type === "wall"
      ? floorPlan.walls.find((w) => w.id === singleSelected.id)?.style
      : singleSelected?.type === "room"
        ? floorPlan.rooms.find((r) => r.id === singleSelected.id)?.style
        : singleSelected?.type === "dimension"
          ? floorPlan.dimensions.find((d) => d.id === singleSelected.id)?.style
          : singleSelected?.type === "polygon"
            ? floorPlan.polygons.find((p) => p.id === singleSelected.id)?.style
            : singleSelected?.type === "landmarkArea"
              ? floorPlan.landmarkAreas.find((a) => a.id === singleSelected.id)?.style
              : undefined;
  const selectedSupportsFill = singleSelected?.type === "room" || singleSelected?.type === "polygon" || singleSelected?.type === "landmarkArea";
  // 符號／文字／地標點都是固定樣式的定點標記，不套用 FloorPlanStyle 這組線條/填滿系統；
  // 地標區域跟多邊形房間一樣是可自訂樣式的封閉形狀，維持支援
  const selectedSupportsStyle =
    singleSelected != null &&
    singleSelected.type !== "symbol" &&
    singleSelected.type !== "text" &&
    singleSelected.type !== "landmarkPoint";
  // 文字物件的內容／字級／顏色（跟上面的 FloorPlanStyle 是兩套獨立的東西，見 handleUpdateSelectedText）
  const selectedText = singleSelected?.type === "text" ? floorPlan.texts.find((t) => t.id === singleSelected.id) : undefined;
  // 地標點／地標區域的自訂標籤／連結地點（跟上面的 FloorPlanStyle 也是獨立的東西，見 handleUpdateSelectedLandmark）
  const selectedLandmarkPoint =
    singleSelected?.type === "landmarkPoint" ? floorPlan.landmarkPoints.find((p) => p.id === singleSelected.id) : undefined;
  const selectedLandmarkArea =
    singleSelected?.type === "landmarkArea" ? floorPlan.landmarkAreas.find((a) => a.id === singleSelected.id) : undefined;
  // 通用圖釘（沒有 builtInKey）才有「釘頭疊文字／文字顏色／填滿顏色」這幾個欄位可以編輯——9 種
  // 手繪內建圖示形狀固定，沒有文字也沒有可填滿的封閉區域
  const selectedLandmarkPointIconType = selectedLandmarkPoint ? landmarkIconTypeById.get(selectedLandmarkPoint.icon) : undefined;
  const wallHitWidth = WALL_HIT_SCREEN_WIDTH / viewScale;
  const endpointHandleR = ENDPOINT_HANDLE_SCREEN_R / viewScale;
  const polygonVertexHandleR = POLYGON_VERTEX_HANDLE_SCREEN_R / viewScale;

  return (
    <>
      <input
        ref={terrainFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleImportTerrainFile(file);
        }}
      />
      <input
        ref={referenceFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleImportReferenceFile(file);
        }}
      />
      {showMapSizeDialog && metaDraft && mapSettingsOriginal && (
        <Modal title={t("mapViewPage.mapSettingsModal.title")} onClose={handleCancelMapSettings} width={420}>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: 13 }}>
            {mapSettingsComparing && (
              <div style={{ padding: "6px 8px", borderRadius: 6, background: "var(--surface-2)", color: "var(--text-muted)" }}>
                {t("mapViewPage.mapSettingsModal.comparingNotice")}
              </div>
            )}
            <fieldset disabled={mapSettingsComparing} style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <div style={{ marginBottom: 4, color: "var(--text-muted)" }}>{t("mapViewPage.mapSizeLabel")}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                  {MAP_SIZE_PRESETS.map((p) => (
                    <button
                      key={p.labelKey}
                      type="button"
                      className={metaDraft.width === p.width && metaDraft.height === p.height ? "btn btn-primary" : "btn-ghost"}
                      onClick={() => handleResize(p.width, p.height)}
                    >
                      {t(p.labelKey)}（{p.width}×{p.height}）
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <input
                    type="number"
                    min={200}
                    max={6000}
                    value={metaDraft.width}
                    onChange={(e) => setMetaDraft((d) => (d ? { ...d, width: Math.max(1, Number(e.target.value)) } : d))}
                    style={{ width: 90 }}
                  />
                  <span style={{ color: "var(--text-muted)" }}>×</span>
                  <input
                    type="number"
                    min={200}
                    max={6000}
                    value={metaDraft.height}
                    onChange={(e) => setMetaDraft((d) => (d ? { ...d, height: Math.max(1, Number(e.target.value)) } : d))}
                    style={{ width: 90 }}
                  />
                  {/* 自訂尺寸打字過程不能每個字元都觸發套用（會一邊打一邊重建畫布），所以跟預設尺寸按鈕不同，
                      這裡要一個明確的按鈕觸發，打完再按 */}
                  <button
                    type="button"
                    className="btn"
                    disabled={metaDraft.width === map.width && metaDraft.height === map.height}
                    onClick={() => handleResize(metaDraft.width, metaDraft.height)}
                  >
                    {t("mapViewPage.mapSettingsModal.applyButton")}
                  </button>
                </div>
              </div>
              <ColorInput
                label={t("mapViewPage.mapSettingsModal.seaColorLabel")}
                value={metaDraft.seaColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, seaColor: c || undefined } : d))}
                allowClear
                fallbackColor={DEFAULT_SEA_COLOR}
                fallbackLabel={t("mapViewPage.defaultFallbackLabel")}
                worldId={worldId}
              />
            </fieldset>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <button type="button" className="btn-ghost" onClick={handleToggleMapSettingsCompare}>
                {mapSettingsComparing ? t("mapViewPage.mapSettingsModal.backToEditButton") : t("mapViewPage.mapSettingsModal.compareButton")}
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn" onClick={handleCancelMapSettings}>
                  {t("common.cancel")}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleConfirmMapSettings}>
                  {t("mapViewPage.confirmButton")}
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {showScaleBarModal && (
        <Modal title={t("mapViewPage.scaleBarModal.title")} onClose={() => setShowScaleBarModal(false)} width={360}>
          {map.scaleBar ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.scaleBarModal.realDistanceLabel")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    min={0.01}
                    value={scaleBarDistanceDraft ?? map.scaleBar.realDistance}
                    title={t("mapViewPage.scaleBarModal.realDistanceInputTitle")}
                    onChange={(e) => setScaleBarDistanceDraft(Number(e.target.value))}
                    onBlur={commitScaleBarDistance}
                    onKeyDown={blurOnEnter}
                    style={{ width: 100 }}
                  />
                  <input
                    type="text"
                    value={scaleBarUnitDraft ?? map.scaleBar.unit}
                    placeholder={t("mapViewPage.defaultUnit")}
                    title={t("mapViewPage.scaleBarModal.unitInputTitle")}
                    onChange={(e) => setScaleBarUnitDraft(e.target.value)}
                    onBlur={commitScaleBarUnit}
                    onKeyDown={blurOnEnter}
                    style={{ width: 80 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.scaleBarModal.lengthLabel")}</span>
                <input
                  type="number"
                  min={20}
                  max={4000}
                  value={scaleBarLengthDraft ?? map.scaleBar.lengthPx}
                  onChange={(e) => setScaleBarLengthDraft(Number(e.target.value))}
                  onBlur={commitScaleBarLength}
                  onKeyDown={blurOnEnter}
                  style={{ width: 100 }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    updateMapState(map.id, { scaleBar: undefined });
                    setShowScaleBarModal(false);
                  }}
                >
                  {t("mapViewPage.scaleBarModal.removeButton")}
                </button>
                <button className="btn btn-primary" onClick={() => setShowScaleBarModal(false)}>
                  {t("mapViewPage.doneButton")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.scaleBarModal.emptyHint")}</span>
              <button className="btn btn-primary" onClick={handleAddScaleBar}>
                {t("mapViewPage.scaleBarModal.addButton")}
              </button>
            </div>
          )}
        </Modal>
      )}
      {showCompassModal && (
        <Modal title={t("mapViewPage.compassModal.title")} onClose={() => setShowCompassModal(false)} width={420}>
          {map.compass ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.compassModal.styleLabel")}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {COMPASS_STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={(map.compass!.style ?? "classic") === opt.value ? "btn btn-primary" : "btn-ghost"}
                      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 6 }}
                      onClick={() => updateMapState(map.id, { compass: { ...map.compass!, style: opt.value } })}
                    >
                      <svg viewBox="0 0 60 60" width={48} height={48}>
                        <CompassGraphic
                          x={30}
                          y={30}
                          rotation={0}
                          labels={{ n: t("compassDirection.n"), e: t("compassDirection.e"), s: t("compassDirection.s"), w: t("compassDirection.w") }}
                          style={opt.value}
                        />
                      </svg>
                      <span style={{ fontSize: 11 }}>{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.compassModal.rotationLabel")}</span>
                <input
                  type="number"
                  value={compassRotationDraft ?? map.compass.rotation}
                  onChange={(e) => setCompassRotationDraft(Number(e.target.value))}
                  onBlur={commitCompassRotation}
                  onKeyDown={blurOnEnter}
                  style={{ width: 80 }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.compassModal.labelsLabel")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["n", "e", "s", "w"] as const).map((k) => (
                    <input
                      key={k}
                      type="text"
                      value={compassLabelDrafts[k] ?? map.compass!.labels[k]}
                      title={{ n: t("compassDirection.n"), e: t("compassDirection.e"), s: t("compassDirection.s"), w: t("compassDirection.w") }[k]}
                      onChange={(e) => setCompassLabelDrafts((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => commitCompassLabel(k)}
                      onKeyDown={blurOnEnter}
                      style={{ width: 48 }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    updateMapState(map.id, { compass: undefined });
                    setShowCompassModal(false);
                  }}
                >
                  {t("mapViewPage.compassModal.removeButton")}
                </button>
                <button className="btn btn-primary" onClick={() => setShowCompassModal(false)}>
                  {t("mapViewPage.doneButton")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.compassModal.emptyHint")}</span>
              <button className="btn btn-primary" onClick={handleAddCompass}>
                {t("mapViewPage.compassModal.addButton")}
              </button>
            </div>
          )}
        </Modal>
      )}
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
            <h2 style={{ margin: 0 }}>{map.name}</h2>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {!embedded && (
            <button className="btn-ghost" onClick={() => openPanel({ kind: "map", mapId: map.id })} title={t("sidebar.openBeside")}>
              ⇲
            </button>
          )}
          <button
            className="btn-ghost"
            title={t("mapViewPage.starToggleTitle")}
            onClick={() => toggleMapStar(map.id)}
            style={{ color: map.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
          >
            {map.starred ? "★" : "☆"}
          </button>
          <button className={showRuler ? "btn btn-primary" : "btn-ghost"} title={t("mapViewPage.rulerToggleTitle")} onClick={() => setShowRuler((v) => !v)}>
            {t("mapViewPage.rulerButtonLabel")}
          </button>
          <button
            className={measuring ? "btn btn-primary" : "btn-ghost"}
            title={map.scaleBar ? t("mapViewPage.measureButtonTitleReady") : t("mapViewPage.measureButtonTitleDisabled")}
            disabled={!map.scaleBar}
            onClick={() => {
              setMeasuring((v) => !v);
              setMeasurePoints(null);
            }}
          >
            {t("mapViewPage.measureButtonLabel")}
          </button>
          <button className="btn-ghost" title={t("mapViewPage.exportImageTitle")} onClick={handleExportImage}>
            {t("mapViewPage.exportImageLabel")}
          </button>
          <button className="btn-ghost" title={t("mapViewPage.exportPdfTitle")} onClick={handleExportPdf}>
            {t("mapViewPage.exportPdfLabel")}
          </button>
          <button className="btn-ghost" onClick={() => setShowHistory(true)}>
            {t("common.versionHistory")}
          </button>
          {editing ? (
            <>
              <ColorInput
                label={t("mapViewPage.tagColorLabel")}
                value={metaDraft?.tagColor}
                onChange={(c) => setMetaDraft((d) => (d ? { ...d, tagColor: c || undefined } : d))}
                allowClear
                worldId={worldId}
              />
              <button className="btn" onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" title={t("mapViewPage.saveButtonTitle")} onClick={handleSave}>
                {t("common.save")}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-primary" onClick={startEdit}>
                {t("common.edit")}
              </button>
              <button className="btn btn-danger" onClick={handleDeleteMap}>
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
        map.description && <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 8 }}>{map.description}</p>
      )}
          </>
        }
        leftPanel={
          editing ? (
            <>
              {/* 地形筆刷（繪製／擦除／修剪）跟平面圖工具（選取／畫牆／房間）並列在同一欄，不分「模式」——
                  兩種內容一直都畫在同一張地圖上，選哪個工具、點畫布就做哪件事，隨時能互相切換。
                  直向排列貼在畫布左側，比照 Photoshop／Illustrator 的工具列；按鈕只放圖示不放文字，
                  節省欄寬，實際名稱靠 title 屬性做 hover 提示 */}
              <button
                className={tool === "draw" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("draw")}
                title={t("mapViewPage.tool.draw")}
              >
                <MapToolIcon tool="draw" />
              </button>
              <button
                className={tool === "erase" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("erase")}
                title={t("mapViewPage.tool.erase")}
              >
                <MapToolIcon tool="erase" />
              </button>
              <button
                className={tool === "trim" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("trim")}
                title={t("mapViewPage.tool.trim")}
              >
                <MapToolIcon tool="trim" />
              </button>
              <div style={{ width: "100%", height: 1, background: "var(--border)" }} />
              <button
                className={tool === "select" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("select")}
                title={t("mapViewPage.tool.select")}
              >
                <MapToolIcon tool="select" />
              </button>
              <button
                className={tool === "pan" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("pan")}
                title={t("mapViewPage.tool.pan")}
              >
                <MapToolIcon tool="pan" />
              </button>
              <button
                className={tool === "wall" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("wall")}
                title={t("mapViewPage.tool.wall")}
              >
                <MapToolIcon tool="wall" />
              </button>
              {/* 房間工具改成「長按選形狀」：短按（放開時還沒到長按門檻）＝直接切到房間工具、沿用
                  目前選的形狀；長按超過 450ms＝打開形狀選單換方形／圓形／三角／五角／六角／星形。
                  用 DropdownMenu 的 renderTrigger 拿它內部的開關函式，但完全不綁原生 click 事件——
                  開關由這裡的 pointerdown/pointerup 計時器手動觸發，短按放開時故意不呼叫它 */}
              <DropdownMenu
                direction="right"
                minWidth={150}
                renderTrigger={({ ref, onClick: openPicker }) => (
                  <button
                    ref={ref}
                    className={tool === "room" ? "btn btn-primary" : "btn"}
                    style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={t("mapViewPage.tool.roomTitle", { shape: t(ROOM_SHAPES.find((s) => s.type === roomShape)?.labelKey ?? "roomShape.rect") })}
                    onPointerDown={() => {
                      roomLongPressFiredRef.current = false;
                      roomLongPressTimerRef.current = window.setTimeout(() => {
                        roomLongPressFiredRef.current = true;
                        openPicker();
                      }, 450);
                    }}
                    onPointerUp={() => {
                      if (roomLongPressTimerRef.current != null) {
                        window.clearTimeout(roomLongPressTimerRef.current);
                        roomLongPressTimerRef.current = null;
                      }
                      if (!roomLongPressFiredRef.current) setTool("room");
                    }}
                    onPointerLeave={() => {
                      if (roomLongPressTimerRef.current != null) {
                        window.clearTimeout(roomLongPressTimerRef.current);
                        roomLongPressTimerRef.current = null;
                      }
                    }}
                  >
                    <MapToolIcon tool="room" shape={roomShape} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {ROOM_SHAPES.map((s) => (
                      <button
                        key={s.type}
                        className="btn-ghost"
                        style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", padding: "6px 8px" }}
                        onClick={() => {
                          setRoomShape(s.type);
                          setTool("room");
                          close();
                        }}
                      >
                        <MapToolIcon tool="room" shape={s.type} />
                        {t(s.labelKey)}
                      </button>
                    ))}
                  </>
                )}
              </DropdownMenu>
              <button
                className={tool === "dimension" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("dimension")}
                title={t("mapViewPage.tool.dimension")}
              >
                <MapToolIcon tool="dimension" />
              </button>
              <button
                className={tool === "symbol" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("symbol")}
                title={t("mapViewPage.tool.symbol")}
              >
                <MapToolIcon tool="symbol" />
              </button>
              <button
                className={tool === "polygon" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("polygon")}
                title={t("mapViewPage.tool.polygon")}
              >
                <MapToolIcon tool="polygon" />
              </button>
              <button
                className={tool === "text" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("text")}
                title={t("mapViewPage.tool.text")}
              >
                <MapToolIcon tool="text" />
              </button>
              <div style={{ width: "100%", height: 1, background: "var(--border)" }} />
              {/* 地標點跟房間工具是同一套「長按選種類」機制：短按＝用目前 landmarkIcon 直接放置，
                  長按超過門檻＝打開圖示選單換一種；選單內容來自「管理」頁可編輯的即時清單，
                  不是寫死的 9 種 */}
              <DropdownMenu
                direction="right"
                minWidth={170}
                renderTrigger={({ ref, onClick: openPicker }) => (
                  <button
                    ref={ref}
                    className={tool === "landmarkPoint" ? "btn btn-primary" : "btn"}
                    style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={t("mapViewPage.tool.landmarkPointTitle", { icon: landmarkIconTypeById.get(landmarkIcon)?.label ?? landmarkIcon })}
                    onPointerDown={() => {
                      landmarkLongPressFiredRef.current = false;
                      landmarkLongPressTimerRef.current = window.setTimeout(() => {
                        landmarkLongPressFiredRef.current = true;
                        openPicker();
                      }, 450);
                    }}
                    onPointerUp={() => {
                      if (landmarkLongPressTimerRef.current != null) {
                        window.clearTimeout(landmarkLongPressTimerRef.current);
                        landmarkLongPressTimerRef.current = null;
                      }
                      if (!landmarkLongPressFiredRef.current) setTool("landmarkPoint");
                    }}
                    onPointerLeave={() => {
                      if (landmarkLongPressTimerRef.current != null) {
                        window.clearTimeout(landmarkLongPressTimerRef.current);
                        landmarkLongPressTimerRef.current = null;
                      }
                    }}
                  >
                    <MapToolIcon tool="landmarkPoint" landmarkIconType={landmarkIconTypeById.get(landmarkIcon)} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {landmarkIconTypes.map((t) => (
                      <button
                        key={t.id}
                        className="btn-ghost"
                        style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-start", padding: "6px 8px" }}
                        onClick={() => {
                          setLandmarkIcon(t.id);
                          setTool("landmarkPoint");
                          close();
                        }}
                      >
                        <MapToolIcon tool="landmarkPoint" landmarkIconType={t} />
                        {t.label}
                      </button>
                    ))}
                  </>
                )}
              </DropdownMenu>
              <button
                className={tool === "landmarkArea" ? "btn btn-primary" : "btn"}
                style={{ width: 40, height: 40, padding: 0, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
                onClick={() => setTool("landmarkArea")}
                title={t("mapViewPage.tool.landmarkArea")}
              >
                <MapToolIcon tool="landmarkArea" />
              </button>
            </>
          ) : undefined
        }
        bottomPanel={
          editing ? (
            <>
          {isBrushTool ? (
            <>
              {/* 筆刷半徑固定放在工具按鈕後面第一個位置：筆刷高度只有繪製／擦除工具才出現，如果放在
                  筆刷半徑前面，切到修剪工具時筆刷高度整個消失，後面的筆刷半徑／羽化會跟著往前遞補、
                  換行位置也會跟著變（使用者反應「繪製和擦除的筆刷半徑都跑到左邊，兩個位置互換」）——
                  筆刷半徑放第一個，不管哪個工具位置都不會變，只有它後面的欄位會跟著工具增減 */}
              <LabeledSlider label={t("mapViewPage.brushRadiusLabel")} value={brushRadius} min={5} max={200} step={1} onChange={setBrushRadius} />
              {tool !== "trim" && (
                <LabeledSlider
                  label={t("mapViewPage.brushHeightLabel")}
                  hint={t("mapViewPage.brushHeightHint")}
                  value={brushHeight}
                  min={-100}
                  max={100}
                  step={1}
                  onChange={setBrushHeight}
                />
              )}
              <LabeledSlider
                label={tool === "trim" ? t("mapViewPage.smoothSharpenLabel") : t("mapViewPage.featherLabel")}
                hint={tool === "trim" ? t("mapViewPage.smoothSharpenHint") : undefined}
                value={falloff}
                min={tool === "trim" ? -1 : 0}
                max={1}
                step={0.05}
                onChange={setFalloff}
              />
              <div style={{ display: "flex", gap: 6, paddingBottom: 3 }}>
                <button className="btn" onClick={handleUndo} disabled={!canUndo} title={t("mapViewPage.undoTerrainTitle")}>
                  {t("mapViewPage.undoLabel")}
                </button>
                <button className="btn" onClick={handleRedo} disabled={!canRedo} title={t("mapViewPage.redoTerrainTitle")}>
                  {t("mapViewPage.redoLabel")}
                </button>
              </div>
              <button className="btn btn-primary" onClick={handleGenerateRandom}>
                {t("mapViewPage.generateRandomButton")}
              </button>
              <button className="btn btn-danger" onClick={handleClearMap}>
                {t("mapViewPage.clearMapConfirm.title")}
              </button>
            </>
          ) : (
            <>
              {tool === "symbol" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.symbolTypeLabel")}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxWidth: 260 }}>
                    {FLOOR_PLAN_SYMBOL_TYPES.map((s) => (
                      <button
                        key={s.type}
                        className={symbolType === s.type ? "btn btn-primary" : "btn"}
                        style={{ fontSize: 12, padding: "4px 8px" }}
                        onClick={() => setSymbolType(s.type)}
                      >
                        {t(s.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {tool === "polygon" && polygonPoints && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.pointsPlacedHint", { count: polygonPoints.length })}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary" onClick={handleFinishPolygon} disabled={polygonPoints.length < 3}>
                      {t("mapViewPage.finishPolygonButton")}
                    </button>
                    <button className="btn" onClick={handleCancelPolygon}>
                      {t("mapViewPage.cancelDrawingButton")}
                    </button>
                  </div>
                </div>
              )}
              {tool === "landmarkArea" && landmarkAreaPoints && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.pointsPlacedHint", { count: landmarkAreaPoints.length })}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-primary" onClick={handleFinishLandmarkArea} disabled={landmarkAreaPoints.length < 3}>
                      {t("mapViewPage.finishLandmarkAreaButton")}
                    </button>
                    <button className="btn" onClick={handleCancelLandmarkArea}>
                      {t("mapViewPage.cancelDrawingButton")}
                    </button>
                  </div>
                </div>
              )}
              {selectedSupportsStyle && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.strokeColorLabel")}</span>
                    <ColorInput
                      value={selectedStyle?.strokeColor}
                      onChange={(c) => handleUpdateSelectedStyle({ strokeColor: c || undefined })}
                      allowClear
                      worldId={worldId}
                      // 選取狀態下的線條一律是 var(--accent)（見 roomStrokeFallback／polyStrokeFallback／
                      // areaStrokeFallback，三者在 isSelected 時都收斂成同一個值）——一開始並不是「沒有
                      // 顏色」，是已經套用這個預設色，色塊要照實顯示，不能長得像「未設定」的棋盤格
                      fallbackColor="var(--accent)"
                      fallbackLabel={t("mapViewPage.defaultFallbackLabel")}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.strokeStyleLabel")}</span>
                    <button
                      className={selectedStyle?.dashed ? "btn btn-primary" : "btn"}
                      onClick={() => handleUpdateSelectedStyle({ dashed: !selectedStyle?.dashed })}
                      style={{ fontSize: 12 }}
                    >
                      {selectedStyle?.dashed ? t("mapViewPage.dashedLabel") : t("mapViewPage.solidLabel")}
                    </button>
                  </div>
                  {selectedSupportsFill && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.fillColorLabel")}</span>
                        <ColorInput
                          value={selectedStyle?.fillColor}
                          onChange={(c) => handleUpdateSelectedStyle({ fillColor: c || undefined })}
                          allowClear
                          worldId={worldId}
                          // 房間／多邊形預設整面填 var(--accent)；地標區域預設填 LANDMARK_FALLBACK_COLOR
                          // （見 resolveFillValue 呼叫處的第二個參數）——同樣不是「沒有顏色」
                          fallbackColor={singleSelected?.type === "landmarkArea" ? LANDMARK_FALLBACK_COLOR : "var(--accent)"}
                          fallbackLabel={t("mapViewPage.defaultFallbackLabel")}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.fillPatternLabel")}</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {(
                            [
                              { type: "solid", labelKey: "fillPattern.solid" },
                              { type: "dot", labelKey: "fillPattern.dot" },
                              { type: "diagonal", labelKey: "fillPattern.diagonal" },
                            ] as { type: FloorPlanFillPattern; labelKey: TranslationKey }[]
                          ).map((p) => (
                            <button
                              key={p.type}
                              className={(selectedStyle?.fillPattern ?? "solid") === p.type ? "btn btn-primary" : "btn"}
                              style={{ fontSize: 12, padding: "4px 8px" }}
                              onClick={() => handleUpdateSelectedStyle({ fillPattern: p.type })}
                            >
                              {t(p.labelKey)}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {selectedText && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.textContentLabel")}</span>
                    <input
                      type="text"
                      value={textContentDraft ?? selectedText.text}
                      onChange={(e) => setTextContentDraft(e.target.value)}
                      onBlur={commitTextContent}
                      onKeyDown={blurOnEnter}
                      style={{ width: 160 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.fontSizeLabel")}</span>
                    <input
                      type="number"
                      min={8}
                      max={72}
                      value={textFontSizeDraft ?? selectedText.fontSize ?? DEFAULT_TEXT_FONT_SIZE}
                      onChange={(e) => setTextFontSizeDraft(Number(e.target.value))}
                      onBlur={commitTextFontSize}
                      onKeyDown={blurOnEnter}
                      style={{ width: 64 }}
                    />
                  </div>
                  <ColorInput
                    label={t("mapViewPage.textColorLabel")}
                    value={selectedText.color}
                    onChange={(c) => handleUpdateSelectedText({ color: c || undefined })}
                    allowClear
                    worldId={worldId}
                  />
                </div>
              )}
              {(selectedLandmarkPoint || selectedLandmarkArea) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.customLabelLabel")}</span>
                    <input
                      type="text"
                      value={landmarkLabelDraft ?? (selectedLandmarkPoint ?? selectedLandmarkArea)?.label ?? ""}
                      onChange={(e) => setLandmarkLabelDraft(e.target.value)}
                      onBlur={commitLandmarkLabel}
                      onKeyDown={blurOnEnter}
                      style={{ width: 160 }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.linkedLocationLabel")}</span>
                    <div style={{ display: "flex", gap: 4 }}>
                      <select
                        value={(selectedLandmarkPoint ?? selectedLandmarkArea)?.linkedEntryId ?? ""}
                        onChange={(e) => handleUpdateSelectedLandmark({ linkedEntryId: e.target.value || undefined })}
                        style={{ minWidth: 140 }}
                      >
                        <option value="">{t("mapViewPage.noLinkOption")}</option>
                        {locationEntries.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn-ghost"
                        title={t("mapViewPage.openLinkedEntryTitle")}
                        disabled={!(selectedLandmarkPoint ?? selectedLandmarkArea)?.linkedEntryId}
                        onClick={(e) => {
                          e.stopPropagation();
                          const entryId = (selectedLandmarkPoint ?? selectedLandmarkArea)?.linkedEntryId;
                          if (entryId) openPanel({ kind: "entry", entryId });
                        }}
                      >
                        ⇲
                      </button>
                    </div>
                  </div>
                  {selectedLandmarkPoint && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.iconColorLabel")}</span>
                      <ColorInput
                        value={selectedLandmarkPoint.color}
                        onChange={(c) => handleUpdateSelectedLandmark({ color: c || undefined })}
                        allowClear
                        worldId={worldId}
                        fallbackColor={selectedLandmarkPointIconType?.defaultColor || DEFAULT_LANDMARK_ICON_COLOR}
                        fallbackLabel={t("mapViewPage.defaultFallbackLabel")}
                      />
                    </div>
                  )}
                  {/* 通用圖釘（沒有 builtInKey）才有釘頭可以疊文字、才有封閉區域可以填色——9 種手繪
                      內建圖示形狀固定，這幾個欄位對它們沒有意義，不顯示 */}
                  {selectedLandmarkPoint && !selectedLandmarkPointIconType?.builtInKey && (
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.customTextLabel")}</span>
                        <input
                          type="text"
                          value={landmarkCustomTextDraft ?? selectedLandmarkPoint.customText ?? ""}
                          onChange={(e) => setLandmarkCustomTextDraft(e.target.value)}
                          // 用 select() 讓使用者點進欄位就能直接「蓋掉」原本那個字——但瀏覽器點擊
                          // 輸入框的預設行為（把游標放到點擊位置）發生在 focus 事件之後，同一輪事件
                          // 循環裡呼叫 select() 會被這個預設行為蓋掉，所以要丟到下一輪（requestAnimationFrame）
                          // 才會生效
                          onFocus={(e) => {
                            const el = e.currentTarget;
                            requestAnimationFrame(() => el.select());
                          }}
                          onBlur={commitLandmarkCustomText}
                          onKeyDown={blurOnEnter}
                          maxLength={1}
                          style={{ width: 48, textAlign: "center" }}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.textColorLabel")}</span>
                        <ColorInput
                          value={selectedLandmarkPoint.textColor}
                          onChange={(c) => handleUpdateSelectedLandmark({ textColor: c || undefined })}
                          allowClear
                          worldId={worldId}
                          fallbackColor={
                            selectedLandmarkPointIconType?.textColor ||
                            selectedLandmarkPoint.color ||
                            selectedLandmarkPointIconType?.defaultColor ||
                            DEFAULT_LANDMARK_ICON_COLOR
                          }
                          fallbackLabel={t("mapViewPage.iconTypeFallbackLabel")}
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.fillColorLabel")}</span>
                        <ColorInput
                          value={selectedLandmarkPoint.fillColor}
                          onChange={(c) => handleUpdateSelectedLandmark({ fillColor: c || undefined })}
                          allowClear
                          worldId={worldId}
                          fallbackColor={selectedLandmarkPointIconType?.fillColor}
                          fallbackLabel={t("mapViewPage.iconTypeFallbackLabel")}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
            </>
          ) : undefined
        }
        toolbar={
          editing ? (
            <>
      {editing && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.editHistoryLabel")}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn" onClick={fpHandleUndo} disabled={!fpCanUndo} title={t("mapViewPage.undoFloorPlanTitle")}>
                {t("mapViewPage.undoLabel")}
              </button>
              <button className="btn" onClick={fpHandleRedo} disabled={!fpCanRedo} title={t("mapViewPage.redoFloorPlanTitle")}>
                {t("mapViewPage.redoLabel")}
              </button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.mapSettingsModal.title")}</span>
            <button
              className="btn"
              onClick={() => {
                if (map) setMapSettingsOriginal({ width: map.width, height: map.height, seaColor: map.seaColor });
                setMapSettingsComparing(false);
                setShowMapSizeDialog(true);
              }}
            >
              {t("mapViewPage.mapSettingsModal.title")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.imageLabel")}</span>
            <DropdownMenu label={t("mapViewPage.importLabel")} buttonClassName="btn">
              {(close) => (
                <>
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    title={t("mapViewPage.importTerrainTitle")}
                    onClick={() => {
                      terrainFileInputRef.current?.click();
                      close();
                    }}
                  >
                    {t("mapViewPage.importTerrainButton")}
                  </button>
                  <button
                    className="btn-ghost"
                    style={{ textAlign: "left" }}
                    title={t("mapViewPage.importReferenceTitle")}
                    onClick={() => {
                      referenceFileInputRef.current?.click();
                      close();
                    }}
                  >
                    {t("mapViewPage.importReferenceButton")}
                  </button>
                </>
              )}
            </DropdownMenu>
          </div>
          {map.referenceImage && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.referenceOpacityLabel")}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={map.referenceImageOpacity ?? 0.5}
                  onChange={(e) => updateMapState(map.id, { referenceImageOpacity: Number(e.target.value) })}
                  style={{ accentColor: "var(--accent)" }}
                />
                <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => updateMapState(map.id, { referenceImage: undefined })}>
                  {t("mapViewPage.removeReferenceButton")}
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.scaleBarLabel")}</span>
            <button className="btn" onClick={() => setShowScaleBarModal(true)}>
              {map.scaleBar ? t("mapViewPage.scaleBarSettingsButton") : t("mapViewPage.scaleBarModal.addButton")}
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.compassLabel")}</span>
            <button className="btn" onClick={() => setShowCompassModal(true)}>
              {map.compass ? t("mapViewPage.compassSettingsButton") : t("mapViewPage.compassModal.addButton")}
            </button>
          </div>
        </div>
      )}
            </>
          ) : undefined
        }
        sidePanel={
          editing ? (
            <>
            {/* 操作：吸附／正交／參考線這些全域開關，跟複製/貼上/刪除/對齊/旋轉翻轉這些「對選取
                物件做動作」的按鈕，都是跟物件本身屬性（線條、標籤...）無關的操作型功能，統一放在
                側欄上半；下半的圖層清單維持原樣 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 700 }}>{t("mapViewPage.operationsHeader")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.gridSnapLabel")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className={gridEnabled ? "btn btn-primary" : "btn"} onClick={() => setGridEnabled((v) => !v)} style={{ fontSize: 12 }}>
                    {gridEnabled ? t("mapViewPage.toggleOn") : t("mapViewPage.toggleOff")}
                  </button>
                  <input
                    type="number"
                    min={5}
                    max={500}
                    value={gridSize}
                    title={t("mapViewPage.gridSizeTitle")}
                    onChange={(e) => setGridSize(Math.max(5, Number(e.target.value)))}
                    style={{ width: 56 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.orthoModeLabel")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button
                    className={orthoEnabled ? "btn btn-primary" : "btn"}
                    onClick={() => setOrthoEnabled((v) => !v)}
                    style={{ fontSize: 12 }}
                    title={t("mapViewPage.orthoModeTitle")}
                  >
                    {orthoEnabled ? t("mapViewPage.toggleOn") : t("mapViewPage.toggleOff")}
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={orthoStep}
                    title={t("mapViewPage.orthoStepTitle")}
                    onChange={(e) => {
                      const v = Math.round(Number(e.target.value));
                      if (Number.isFinite(v)) setOrthoStep(Math.min(180, Math.max(1, v)));
                    }}
                    style={{ width: 56 }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.alignGuideLabel")}</span>
                <button
                  className={alignGuideEnabled ? "btn btn-primary" : "btn"}
                  onClick={() => setAlignGuideEnabled((v) => !v)}
                  style={{ fontSize: 12 }}
                  title={t("mapViewPage.alignGuideTitle")}
                >
                  {alignGuideEnabled ? t("mapViewPage.toggleOn") : t("mapViewPage.toggleOff")}
                </button>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn" onClick={handleCopySelected} disabled={fpSelected.length === 0} title={t("mapViewPage.copyTitle")}>
                  {t("mapViewPage.copyButton")}
                </button>
                <button className="btn" onClick={handlePasteClipboard} disabled={!hasClipboard} title={t("mapViewPage.pasteTitle")}>
                  {t("mapViewPage.pasteButton")}
                </button>
              </div>
              {fpSelected.length > 0 && (
                <button className="btn btn-danger" onClick={handleFpDeleteSelected} title={t("mapViewPage.deleteSelectedTitle")}>
                  {t("mapViewPage.deleteSelectedButtonPrefix")}
                  {singleSelected
                    ? singleSelected.type === "landmarkPoint"
                      ? (landmarkIconTypeById.get(selectedLandmarkPoint?.icon ?? "")?.label ?? t(FP_ITEM_TYPE_LABEL.landmarkPoint))
                      : singleSelected.type === "polygon"
                        ? t("mapViewPage.deleteSelectedPolygonLabel")
                        : t(FP_ITEM_TYPE_LABEL[singleSelected.type])
                    : t("mapViewPage.multipleObjectsCount", { count: fpSelected.length })}
                </button>
              )}
              {fpSelected.length > 1 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.alignHeader")}</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className={alignMode === "range" ? "btn btn-primary" : "btn-ghost"} onClick={() => setAlignMode("range")}>
                      {t("mapViewPage.alignRangeMode")}
                    </button>
                    <button type="button" className={alignMode === "anchor" ? "btn btn-primary" : "btn-ghost"} onClick={() => setAlignMode("anchor")}>
                      {t("mapViewPage.alignAnchorMode")}
                    </button>
                  </div>
                  {alignMode === "anchor" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {fpSelected.map((sel, i) => {
                        const key = alignSelKey(sel);
                        return (
                          <button
                            key={key}
                            type="button"
                            className={alignAnchorKey === key ? "btn btn-primary" : "btn-ghost"}
                            onClick={() => setAlignAnchorKey(key)}
                          >
                            {t(FP_ITEM_TYPE_LABEL[sel.type])} {i + 1}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(
                      [
                        ["left", "alignEdge.left"],
                        ["centerX", "alignEdge.centerX"],
                        ["right", "alignEdge.right"],
                        ["top", "alignEdge.top"],
                        ["centerY", "alignEdge.centerY"],
                        ["bottom", "alignEdge.bottom"],
                      ] as [AlignEdge, TranslationKey][]
                    ).map(([edge, labelKey]) => (
                      <button
                        key={edge}
                        type="button"
                        className="btn"
                        disabled={alignMode === "anchor" && !alignAnchorKey}
                        onClick={() => handleAlignSelected(edge)}
                      >
                        {t(labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {singleSelected && selectedRotationDeg !== null && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.rotateFlipHeader")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <input
                      type="number"
                      value={selectedRotationDeg}
                      title={t("mapViewPage.rotationInputTitle")}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && singleSelected) commitRotationAngle(singleSelected.type, singleSelected.id, ((Math.round(v) % 360) + 360) % 360);
                      }}
                      style={{ width: 64 }}
                    />
                    <span style={{ color: "var(--text-muted)" }}>{t("mapViewPage.degreeUnit")}</span>
                    <button type="button" className="btn" onClick={() => handleFlipSelected("horizontal")}>
                      {t("mapViewPage.flipHorizontalButton")}
                    </button>
                    <button type="button" className="btn" onClick={() => handleFlipSelected("vertical")}>
                      {t("mapViewPage.flipVerticalButton")}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("mapViewPage.layersHeader")}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
                {/* 地標系統圖層固定排在最上面——這裡只調整「顯示順序」，不動 floorPlan.layers
                    本身的陣列順序（陣列順序跟畫面上的疊放順序無關，純粹是這份清單自己的顯示分組，
                    這樣寫也讓「這次功能上線前建立的舊地圖」不需要額外轉檔就能套用新的顯示順序） */}
                {[...floorPlan.layers]
                  .sort((a, b) => (b.isLandmarkLayer ? 1 : 0) - (a.isLandmarkLayer ? 1 : 0))
                  .map((layer) =>
                  layer.isLandmarkLayer ? (
                    // 地標系統圖層：只能切換顯示/隱藏，名稱鎖定顯示成純文字、不能設為作用中圖層、
                    // 不能重新命名或刪除——地標點／地標區域一律直接歸屬這個圖層，不透過
                    // activeLayerId／使用者操作決定歸屬
                    <div key={layer.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        className="btn-ghost"
                        title={layer.visible ? t("mapViewPage.hideLayerTitle") : t("mapViewPage.showLayerTitle")}
                        onClick={() => handleToggleLayerVisible(layer.id)}
                        style={{ width: 26, opacity: layer.visible ? 1 : 0.4 }}
                      >
                        {layer.visible ? "👁" : "🚫"}
                      </button>
                      <span style={{ width: 16 }} />
                      <span
                        style={{ flex: 1, minWidth: 0, color: "var(--text-muted)" }}
                        title={t("mapViewPage.landmarkLayerTitle")}
                      >
                        {layer.name}{t("mapViewPage.systemLayerSuffix")}
                      </span>
                      <span style={{ width: 26 }} />
                    </div>
                  ) : (
                    <div key={layer.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        className="btn-ghost"
                        title={layer.visible ? t("mapViewPage.hideLayerTitle") : t("mapViewPage.showLayerTitle")}
                        onClick={() => handleToggleLayerVisible(layer.id)}
                        style={{ width: 26, opacity: layer.visible ? 1 : 0.4 }}
                      >
                        {layer.visible ? "👁" : "🚫"}
                      </button>
                      <input
                        type="radio"
                        name="activeLayer"
                        checked={floorPlan.activeLayerId === layer.id}
                        onChange={() => commitFloorPlan({ ...floorPlan, activeLayerId: layer.id })}
                        title={t("mapViewPage.setActiveLayerTitle")}
                      />
                      <input
                        type="text"
                        value={layerNameDrafts[layer.id] ?? layer.name}
                        onChange={(e) => setLayerNameDrafts((d) => ({ ...d, [layer.id]: e.target.value }))}
                        onBlur={() => commitLayerName(layer.id)}
                        onKeyDown={blurOnEnter}
                        style={{ flex: 1, minWidth: 0, fontWeight: floorPlan.activeLayerId === layer.id ? 700 : 400 }}
                      />
                      <button
                        className="btn-ghost"
                        title={t("mapViewPage.deleteLayerTitle")}
                        onClick={() => handleDeleteLayer(layer.id)}
                        disabled={floorPlan.layers.filter((l) => !l.isLandmarkLayer).length <= 1}
                      >
                        🗑
                      </button>
                    </div>
                  )
                )}
              </div>
              <button className="btn" style={{ alignSelf: "flex-start" }} onClick={handleAddLayer}>
                {t("mapViewPage.addLayerButton")}
              </button>
            </div>
            </>
          ) : undefined
        }
        sidePanelWidth={240}
      >
      <div ref={canvasHostRef} style={{ width: "100%", height: "100%", minHeight: 0 }}>
        {(embedded || measuredCanvasSize) && (
        <div
          style={{
            position: "relative",
            display: "inline-block",
            paddingLeft: showRuler ? RULER_SIZE : 0,
            paddingTop: showRuler ? RULER_SIZE : 0,
            cursor: editing && tool === "pan" ? "grab" : editing && POINT_PLACEMENT_TOOLS.has(tool) ? "crosshair" : undefined,
          }}
        >
        <PannableCanvas
          key={`${map.width}x${map.height}`}
          width={width}
          height={height}
          contentWidth={map.width}
          contentHeight={map.height}
          showZoomInput
          initialView={embedded ? undefined : map.viewport}
          onViewChange={setLiveViewport}
          onHover={editing || measuring ? setHoverPos : undefined}
          onDrawStart={
            measuring ? handleMeasureClick : tool === "pan" ? undefined : editing && !isBrushTool ? handleFpDrawStart : editing ? handleDrawStart : undefined
          }
          onDrawMove={
            measuring || tool === "pan" ? undefined : editing && !isBrushTool ? handleFpDrawMove : editing ? handleDrawMove : undefined
          }
          onDrawEnd={
            measuring || tool === "pan" ? undefined : editing && !isBrushTool ? handleFpDrawEnd : editing ? handleDrawEnd : undefined
          }
        >
          <HeightMapImage
            dataUrl={displayedDataUrl}
            width={map.width}
            height={map.height}
            seaColor={editing ? metaDraft?.seaColor : map.seaColor}
          />
          {/* 底圖參考：半透明疊在地形上方供描繪，只在編輯模式顯示（純粹是繪圖輔助，不是地圖本身內容）；
              疊在 HeightMapImage 之後（後畫的蓋在上面），不套等高線濾鏡，保留原始顏色才看得出照片/草稿內容 */}
          {editing && map.referenceImage && (
            <image
              href={map.referenceImage}
              x={0}
              y={0}
              width={map.width}
              height={map.height}
              preserveAspectRatio="none"
              opacity={map.referenceImageOpacity ?? 0.5}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* 平面圖內容（牆／房間）：不分模式一律顯示（跟比例尺／指北針一樣是地圖本身內容），
              只有圖層關閉顯示時才不畫；只有編輯中且目前在平面圖模式、工具是「選取」時才掛可拖曳／
              可點選的互動，其餘情況（瀏覽、地形模式、畫牆／房間工具中）單純顯示畫好的圖形，
              不掛互動——不然在畫新牆的時候點到舊牆會誤觸選取，而不是繼續畫新的 */}
          {floorPlan.rooms
            .filter((r) => visibleLayerIds.has(r.layerId))
            .map((room) => {
              const groupShift = groupDragDelta && isGroupDragMember("room", room.id) ? groupDragDelta : null;
              const live = roomMoveDrag.live?.id === room.id ? roomMoveDrag.live : null;
              const resizeLive = getBoxResizeLive("room", room.id);
              const resizePatch = resizeLive ? computeRoomResize(room, resizeLive.handle, resizeLive.pos, ROOM_MIN_SIZE) : null;
              const x = groupShift ? room.x + groupShift.dx : resizePatch ? resizePatch.x : (live?.x ?? room.x);
              const y = groupShift ? room.y + groupShift.dy : resizePatch ? resizePatch.y : (live?.y ?? room.y);
              const w = resizePatch ? resizePatch.width : room.width;
              const h = resizePatch ? resizePatch.height : room.height;
              const cx = x + w / 2;
              const cy = y + h / 2;
              const rotateLive = getBoxRotateLive("room", room.id);
              const rotation = rotateLive ? computeBoxRotationAngle({ x: cx, y: cy }, rotateLive, orthoEnabled, orthoStep) : (room.rotation ?? 0);
              const isSelected = fpSelected.some((s) => s.type === "room" && s.id === room.id);
              const roomStrokeFallback = isSelected ? "var(--accent)" : "var(--border)";
              const body = (
                <>
                  <FloorPlanFillDefs objectId={room.id} style={room.style} fallbackColor="var(--accent)" />
                  {renderRoomShape(room.shape ?? "rect", x, y, w, h, {
                    fill: resolveFillValue(room.style, "var(--accent)", room.id),
                    fillOpacity: room.style?.fillColor || room.style?.fillPattern ? undefined : isSelected ? 0.18 : 0.08,
                    stroke: resolveStrokeColor(room.style, roomStrokeFallback),
                    strokeDasharray: resolveStrokeDasharray(room.style),
                    strokeWidth: isSelected ? 2 : 1.5,
                  })}
                  {room.label && (
                    <text x={x + w / 2} y={y + h / 2} fontSize={13} textAnchor="middle" dominantBaseline="middle" fill="var(--text)">
                      {room.label}
                    </text>
                  )}
                </>
              );
              const interactive = editing && tool === "select";
              // 旋轉套在最外層的 <g transform> 上——房間本身的座標都還是用未旋轉的邏輯座標算，交給
              // SVG 的 transform 一次轉到畫面上該有的角度／位置，點擊測試（hit-testing）瀏覽器會自動
              // 照 transform 校正，DraggableNode 不用另外知道「這個房間被轉過」
              if (!interactive) return <g key={room.id} transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>{body}</g>;
              return (
                <g key={room.id}>
                  <g transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
                    <DraggableNode
                      id={room.id}
                      x={x}
                      y={y}
                      onDrag={(id, pos) => {
                        if (isGroupDragMember("room", id)) startGroupDrag(pos.x - room.x, pos.y - room.y);
                        else {
                          resolveAlignmentSnap("room", id, { ...room, x: pos.x, y: pos.y });
                          roomMoveDrag.onDrag(id, pos);
                        }
                      }}
                      onDragEnd={(id) => {
                        if (isGroupDragMember("room", id)) commitGroupDrag();
                        else roomMoveDrag.onDragEnd(id);
                        setFpAlignGuides({ x: [], y: [] });
                      }}
                      onClick={() => setFpSelected([{ type: "room", id: room.id }])}
                    >
                      <g style={{ cursor: "grab" }}>{body}</g>
                    </DraggableNode>
                  </g>
                  {/* 統一變形外框（縮放/旋轉），自己內部處理旋轉 transform，不能疊在上面那層已經
                      轉過的 <g> 裡面，否則旋轉角度會被套用兩次 */}
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={{ cx, cy, w, h, rotation }}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`room:${room.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`room:${room.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`room:${room.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`room:${room.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {floorPlan.walls
            .filter((w) => visibleLayerIds.has(w.layerId))
            .map((wall) => {
              const p1Live = wallEndpointDrag.live?.id === `${wall.id}:1` ? wallEndpointDrag.live : null;
              const p2Live = wallEndpointDrag.live?.id === `${wall.id}:2` ? wallEndpointDrag.live : null;
              const moveLive = wallMoveDrag.live?.id === wall.id ? wallMoveDrag.live : null;
              const groupShift = groupDragDelta && isGroupDragMember("wall", wall.id) ? groupDragDelta : null;
              const origMidX = (wall.x1 + wall.x2) / 2;
              const origMidY = (wall.y1 + wall.y2) / 2;
              const bodyDx = groupShift ? groupShift.dx : moveLive ? moveLive.x - origMidX : 0;
              const bodyDy = groupShift ? groupShift.dy : moveLive ? moveLive.y - origMidY : 0;
              let x1 = p1Live?.x ?? wall.x1 + bodyDx;
              let y1 = p1Live?.y ?? wall.y1 + bodyDy;
              let x2 = p2Live?.x ?? wall.x2 + bodyDx;
              let y2 = p2Live?.y ?? wall.y2 + bodyDy;
              const rotateLive = getBoxRotateLive("wall", wall.id);
              if (rotateLive) {
                const center = { x: origMidX, y: origMidY };
                const angle = computeBoxRotationAngle(center, rotateLive, orthoEnabled, orthoStep);
                const delta = angle - getFpItemLocalBox("wall", wall).rotation;
                const p1 = rotatePoint({ x: wall.x1, y: wall.y1 }, center, delta);
                const p2 = rotatePoint({ x: wall.x2, y: wall.y2 }, center, delta);
                x1 = p1.x;
                y1 = p1.y;
                x2 = p2.x;
                y2 = p2.y;
              }
              const isSelected = fpSelected.some((s) => s.type === "wall" && s.id === wall.id);
              const body = (
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={resolveStrokeColor(wall.style, isSelected ? "var(--accent)" : "var(--text)")}
                  strokeDasharray={resolveStrokeDasharray(wall.style)}
                  strokeWidth={isSelected ? 4 : 3}
                  strokeLinecap="round"
                />
              );
              const interactive = editing && tool === "select";
              if (!interactive) return <g key={wall.id}>{body}</g>;
              return (
                <g key={wall.id}>
                {/* 選取／拖曳整段牆都掛在包住兩條線的 DraggableNode 上，不是掛在底下那條看不見的粗線
                    本身——粗線雖然畫在前面，但上面 visible 的細線後畫、疊在 z-order 最上層，實際收到
                    滑鼠事件的是細線；細線自己沒掛處理常式的話事件會直接冒泡到最外層畫布，被當成
                    「點空白處」而取消選取。掛在共同的父層上，不管滑鼠精確點到哪條線，事件冒泡上來都會被接住 */}
                <DraggableNode
                  key={wall.id}
                  id={wall.id}
                  x={origMidX}
                  y={origMidY}
                  onDrag={(id, pos) => {
                    if (isGroupDragMember("wall", id)) startGroupDrag(pos.x - origMidX, pos.y - origMidY);
                    else {
                      const dx = pos.x - origMidX;
                      const dy = pos.y - origMidY;
                      resolveAlignmentSnap("wall", id, { ...wall, x1: wall.x1 + dx, y1: wall.y1 + dy, x2: wall.x2 + dx, y2: wall.y2 + dy });
                      wallMoveDrag.onDrag(id, pos);
                    }
                  }}
                  onDragEnd={(id) => {
                    if (isGroupDragMember("wall", id)) commitGroupDrag();
                    else wallMoveDrag.onDragEnd(id);
                    setFpAlignGuides({ x: [], y: [] });
                  }}
                  onClick={() => setFpSelected([{ type: "wall", id: wall.id }])}
                >
                  <g style={{ cursor: "move" }}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={wallHitWidth} />
                  {body}
                  {isSelected && (
                    <>
                      <DraggableNode id={`${wall.id}:1`} x={x1} y={y1} onDrag={wallEndpointDrag.onDrag} onDragEnd={wallEndpointDrag.onDragEnd}>
                        <circle cx={x1} cy={y1} r={endpointHandleR} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} style={{ cursor: "move" }} />
                      </DraggableNode>
                      <DraggableNode id={`${wall.id}:2`} x={x2} y={y2} onDrag={wallEndpointDrag.onDrag} onDragEnd={wallEndpointDrag.onDragEnd}>
                        <circle cx={x2} cy={y2} r={endpointHandleR} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} style={{ cursor: "move" }} />
                      </DraggableNode>
                    </>
                  )}
                  </g>
                </DraggableNode>
                {/* 牆的「縮放」就是既有的兩端點拖曳，不需要另外的 8 點縮放框；這裡只加旋轉手把
                    （過去牆完全沒有旋轉能力，是全新功能） */}
                {isSelected && (
                  <FloorPlanTransformBox
                    box={getFpItemLocalBox("wall", { ...wall, x1, y1, x2, y2 })}
                    viewScale={viewScale}
                    showResizeHandles={false}
                    onRotateDrag={(pos) => boxRotateDrag.onDrag(`wall:${wall.id}`, pos)}
                    onRotateDragEnd={() => boxRotateDrag.onDragEnd(`wall:${wall.id}`)}
                  />
                )}
                </g>
              );
            })}

          {/* 尺寸標註：跟牆一樣不分工具一律顯示，只有圖層關閉才不畫；只支援選取／刪除／複製，
              不支援拖曳端點重新定位——量錯了直接刪掉重標比較不會出錯（見 DimensionGraphic 說明） */}
          {floorPlan.dimensions
            .filter((d) => visibleLayerIds.has(d.layerId))
            .map((dim) => {
              const isSelected = fpSelected.some((s) => s.type === "dimension" && s.id === dim.id);
              // 標註本身不支援單獨拖曳（見上方註解），但框選多選一起搬移時還是要跟著位移——
              // 只有「屬於群組拖曳中的一員」這個情況才會位移，平常維持原本固定不能拖的樣子
              const groupShift = groupDragDelta && isGroupDragMember("dimension", dim.id) ? groupDragDelta : null;
              let x1 = dim.x1 + (groupShift?.dx ?? 0);
              let y1 = dim.y1 + (groupShift?.dy ?? 0);
              let x2 = dim.x2 + (groupShift?.dx ?? 0);
              let y2 = dim.y2 + (groupShift?.dy ?? 0);
              const rotateLive = getBoxRotateLive("dimension", dim.id);
              if (rotateLive) {
                const center = { x: (dim.x1 + dim.x2) / 2, y: (dim.y1 + dim.y2) / 2 };
                const angle = computeBoxRotationAngle(center, rotateLive, orthoEnabled, orthoStep);
                const delta = angle - getFpItemLocalBox("dimension", dim).rotation;
                const p1 = rotatePoint({ x: dim.x1, y: dim.y1 }, center, delta);
                const p2 = rotatePoint({ x: dim.x2, y: dim.y2 }, center, delta);
                x1 = p1.x;
                y1 = p1.y;
                x2 = p2.x;
                y2 = p2.y;
              }
              const label = formatDimensionLabel(Math.hypot(x2 - x1, y2 - y1), map.scaleBar);
              const body = <DimensionGraphic x1={x1} y1={y1} x2={x2} y2={y2} label={label} selected={isSelected} style={dim.style} />;
              const interactive = editing && tool === "select";
              if (!interactive) return <g key={dim.id}>{body}</g>;
              return (
                <g key={dim.id}>
                  <g
                    style={{ cursor: "pointer" }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setFpSelected([{ type: "dimension", id: dim.id }]);
                    }}
                  >
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={wallHitWidth} />
                    {body}
                  </g>
                  {/* 標註過去完全不支援任何拖曳（見上方註解），這裡新增旋轉能力——旋轉跟既有的
                      「不可拖曳搬移／端點」設計不衝突，繞中點轉動兩端點，量出來的距離不變 */}
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={getFpItemLocalBox("dimension", { ...dim, x1, y1, x2, y2 })}
                      viewScale={viewScale}
                      showResizeHandles={false}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`dimension:${dim.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`dimension:${dim.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 傢俱／門窗符號：跟牆一樣不分工具一律顯示，只有圖層關閉才不畫；可搬移／旋轉／刪除／複製 */}
          {floorPlan.symbols
            .filter((s) => visibleLayerIds.has(s.layerId))
            .map((symbol) => {
              const groupShift = groupDragDelta && isGroupDragMember("symbol", symbol.id) ? groupDragDelta : null;
              const live = symbolMoveDrag.live?.id === symbol.id ? symbolMoveDrag.live : null;
              const x = groupShift ? symbol.x + groupShift.dx : (live?.x ?? symbol.x);
              const y = groupShift ? symbol.y + groupShift.dy : (live?.y ?? symbol.y);
              const resizeLive = getBoxResizeLive("symbol", symbol.id);
              const scale = resizeLive
                ? Math.min(6, Math.max(0.2, (symbol.scale ?? 1) * computeUniformScaleFactor(getFpItemLocalBox("symbol", symbol), resizeLive.handle, resizeLive.pos)))
                : (symbol.scale ?? 1);
              const rotateLive = getBoxRotateLive("symbol", symbol.id);
              const rotation = rotateLive ? computeBoxRotationAngle({ x, y }, rotateLive, orthoEnabled, orthoStep) : (symbol.rotation ?? 0);
              const flipX = symbol.flipX ?? false;
              const isSelected = fpSelected.some((s) => s.type === "symbol" && s.id === symbol.id);
              const body = (
                <g style={isSelected ? { filter: "drop-shadow(0 0 2px var(--accent))" } : undefined}>
                  {/* 大多數符號都是只有描邊、內部空心的線稿（見 FloorPlanSymbols.tsx），中間點擊會落空；
                      墊一塊透明矩形當點擊熱區，範圍跟符號的內容座標尺寸一致 */}
                  <rect x={-SYMBOL_SIZE / 2} y={-SYMBOL_SIZE / 2} width={SYMBOL_SIZE} height={SYMBOL_SIZE} fill="transparent" />
                  <FloorPlanSymbolIcon type={symbol.type} />
                </g>
              );
              // scale/flipX 一起放進同一個 scale() transform（flipX 只是把水平縮放倍率變負值），
              // 順序是先轉角度再縮放/翻轉——跟 PNG 匯出（drawFloorPlanSymbolToCanvas）要維持一致
              const transform = `translate(${x} ${y}) rotate(${rotation}) scale(${(flipX ? -1 : 1) * scale} ${scale})`;
              const interactive = editing && tool === "select";
              const wrapped = <g transform={transform}>{body}</g>;
              if (!interactive) return <g key={symbol.id}>{wrapped}</g>;
              return (
                <g key={symbol.id}>
                  <DraggableNode
                    id={symbol.id}
                    x={x}
                    y={y}
                    onDrag={(id, pos) => {
                      if (isGroupDragMember("symbol", id)) startGroupDrag(pos.x - symbol.x, pos.y - symbol.y);
                      else {
                        resolveAlignmentSnap("symbol", id, { ...symbol, x: pos.x, y: pos.y });
                        symbolMoveDrag.onDrag(id, pos);
                      }
                    }}
                    onDragEnd={(id) => {
                      if (isGroupDragMember("symbol", id)) commitGroupDrag();
                      else symbolMoveDrag.onDragEnd(id);
                      setFpAlignGuides({ x: [], y: [] });
                    }}
                    onClick={() => setFpSelected([{ type: "symbol", id: symbol.id }])}
                  >
                    <g transform={transform} style={{ cursor: "grab" }}>
                      {body}
                    </g>
                  </DraggableNode>
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={{ cx: x, cy: y, w: SYMBOL_SIZE * scale, h: SYMBOL_SIZE * scale, rotation }}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`symbol:${symbol.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`symbol:${symbol.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`symbol:${symbol.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`symbol:${symbol.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 自由多邊形房間：跟矩形房間一樣不分工具一律顯示，只有圖層關閉才不畫；面積標籤永遠顯示
              （鞋帶公式即時算，不用另外存），選取後每個頂點都有個別手柄可以拖，形狀可以整個搬移 */}
          {floorPlan.polygons
            .filter((p) => visibleLayerIds.has(p.layerId))
            .map((poly) => {
              const origCentroid = polygonCentroid(poly.points);
              const moveLive = polygonMoveDrag.live?.id === poly.id ? polygonMoveDrag.live : null;
              const groupShift = groupDragDelta && isGroupDragMember("polygon", poly.id) ? groupDragDelta : null;
              let points = poly.points;
              if (groupShift) {
                points = poly.points.map((pt) => ({ x: pt.x + groupShift.dx, y: pt.y + groupShift.dy }));
              } else if (moveLive) {
                const dx = moveLive.x - origCentroid.x;
                const dy = moveLive.y - origCentroid.y;
                points = poly.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
              }
              points = points.map((pt, i) => {
                const vLive = polygonVertexDrag.live?.id === `${poly.id}:${i}` ? polygonVertexDrag.live : null;
                return vLive ? { x: vLive.x, y: vLive.y } : pt;
              });
              // 統一變形外框的縮放/旋轉即時預覽：跟移動/頂點拖曳互斥（同一時間只會有一種拖曳在進行），
              // 有其中一個 live 狀態就整批覆寫 points，直接複用 computePolygonResize/rotatePolygonPoints
              const boxResizeLive = getBoxResizeLive("polygon", poly.id);
              const boxRotateLive = getBoxRotateLive("polygon", poly.id);
              if (boxResizeLive) {
                points = computePolygonResize(poly.points, getFpItemLocalBox("polygon", poly), boxResizeLive.handle, boxResizeLive.pos, 4);
              } else if (boxRotateLive) {
                const rotBox = getFpItemLocalBox("polygon", poly);
                const angle = computeBoxRotationAngle({ x: rotBox.cx, y: rotBox.cy }, boxRotateLive, orthoEnabled, orthoStep);
                points = rotatePolygonPoints(poly.points, { x: rotBox.cx, y: rotBox.cy }, angle);
              }
              const isSelected = fpSelected.some((s) => s.type === "polygon" && s.id === poly.id);
              const centroid = polygonCentroid(points);
              const area = polygonArea(points);
              const polyStrokeFallback = isSelected ? "var(--accent)" : "var(--border)";
              const body = (
                <>
                  <FloorPlanFillDefs objectId={poly.id} style={poly.style} fallbackColor="var(--accent)" />
                  <polygon
                    points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={resolveFillValue(poly.style, "var(--accent)", poly.id)}
                    fillOpacity={poly.style?.fillColor || poly.style?.fillPattern ? undefined : isSelected ? 0.18 : 0.08}
                    stroke={resolveStrokeColor(poly.style, polyStrokeFallback)}
                    strokeDasharray={resolveStrokeDasharray(poly.style)}
                    strokeWidth={isSelected ? 2 : 1.5}
                  />
                  <text x={centroid.x} y={centroid.y} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" style={{ pointerEvents: "none" }}>
                    {poly.label ? `${poly.label} · ` : ""}
                    {formatAreaLabel(area, map.scaleBar)}
                  </text>
                </>
              );
              const interactive = editing && tool === "select";
              if (!interactive) return <g key={poly.id}>{body}</g>;
              return (
                <g key={poly.id}>
                  <DraggableNode
                    id={poly.id}
                    x={origCentroid.x}
                    y={origCentroid.y}
                    onDrag={(id, pos) => {
                      if (isGroupDragMember("polygon", id)) startGroupDrag(pos.x - origCentroid.x, pos.y - origCentroid.y);
                      else {
                        const dx = pos.x - origCentroid.x;
                        const dy = pos.y - origCentroid.y;
                        resolveAlignmentSnap("polygon", id, { ...poly, points: poly.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
                        polygonMoveDrag.onDrag(id, pos);
                      }
                    }}
                    onDragEnd={(id) => {
                      if (isGroupDragMember("polygon", id)) commitGroupDrag();
                      else polygonMoveDrag.onDragEnd(id);
                      setFpAlignGuides({ x: [], y: [] });
                    }}
                    onClick={() => setFpSelected([{ type: "polygon", id: poly.id }])}
                  >
                    <g style={{ cursor: "grab" }}>{body}</g>
                  </DraggableNode>
                  {isSelected &&
                    points.map((pt, i) => (
                      <DraggableNode
                        key={i}
                        id={`${poly.id}:${i}`}
                        x={pt.x}
                        y={pt.y}
                        onDrag={polygonVertexDrag.onDrag}
                        onDragEnd={polygonVertexDrag.onDragEnd}
                      >
                        <circle cx={pt.x} cy={pt.y} r={polygonVertexHandleR} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} style={{ cursor: "move" }} />
                      </DraggableNode>
                    ))}
                  {/* 統一變形外框跟上面的逐頂點編輯手把並存：頂點手把改變形狀本身，外框整體縮放/
                      旋轉/翻轉，服務不同目的 */}
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={getFpItemLocalBox("polygon", { ...poly, points })}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`polygon:${poly.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`polygon:${poly.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`polygon:${poly.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`polygon:${poly.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 文字標籤：跟符號一樣不分工具一律顯示，只有圖層關閉才不畫；可搬移／刪除／複製，
              內容／字級／顏色的編輯在選取後的下方樣式面板（見 handleUpdateSelectedText） */}
          {floorPlan.texts
            .filter((t) => visibleLayerIds.has(t.layerId))
            .map((text) => {
              const groupShift = groupDragDelta && isGroupDragMember("text", text.id) ? groupDragDelta : null;
              const live = textMoveDrag.live?.id === text.id ? textMoveDrag.live : null;
              const x = groupShift ? text.x + groupShift.dx : (live?.x ?? text.x);
              const y = groupShift ? text.y + groupShift.dy : (live?.y ?? text.y);
              const resizeLive = getBoxResizeLive("text", text.id);
              const fontSize = resizeLive
                ? Math.round(
                    Math.min(
                      96,
                      Math.max(
                        8,
                        (text.fontSize ?? DEFAULT_TEXT_FONT_SIZE) *
                          computeUniformScaleFactor(getFpItemLocalBox("text", { ...text, x, y }), resizeLive.handle, resizeLive.pos)
                      )
                    )
                  )
                : (text.fontSize ?? DEFAULT_TEXT_FONT_SIZE);
              const estWidth = fontSize * text.text.length || fontSize;
              const cx = x + estWidth / 2;
              const rotateLive = getBoxRotateLive("text", text.id);
              const rotation = rotateLive ? computeBoxRotationAngle({ x: cx, y }, rotateLive, orthoEnabled, orthoStep) : (text.rotation ?? 0);
              const flipX = text.flipX ?? false;
              const isSelected = fpSelected.some((s) => s.type === "text" && s.id === text.id);
              const body = (
                <text
                  x={x}
                  y={y}
                  fontSize={fontSize}
                  fill={text.color || "var(--text)"}
                  dominantBaseline="middle"
                  style={{ userSelect: "none", filter: isSelected ? "drop-shadow(0 0 2px var(--accent))" : undefined }}
                >
                  {text.text}
                </text>
              );
              // 水平翻轉繞 x=cx 這條線鏡射（在本地、未旋轉的座標系做），旋轉套在最外層——
              // 跟符號 translate→rotate→scale 的順序慣例一致（旋轉在外、翻轉/縮放在內）
              const transform = `rotate(${rotation} ${cx} ${y}) translate(${cx} 0) scale(${flipX ? -1 : 1} 1) translate(${-cx} 0)`;
              const interactive = editing && tool === "select";
              if (!interactive) return <g key={text.id} transform={transform}>{body}</g>;
              return (
                <g key={text.id}>
                  <g transform={transform}>
                    <DraggableNode
                      id={text.id}
                      x={x}
                      y={y}
                      onDrag={(id, pos) => {
                        if (isGroupDragMember("text", id)) startGroupDrag(pos.x - text.x, pos.y - text.y);
                        else {
                          resolveAlignmentSnap("text", id, { ...text, x: pos.x, y: pos.y });
                          textMoveDrag.onDrag(id, pos);
                        }
                      }}
                      onDragEnd={(id) => {
                        if (isGroupDragMember("text", id)) commitGroupDrag();
                        else textMoveDrag.onDragEnd(id);
                        setFpAlignGuides({ x: [], y: [] });
                      }}
                      onClick={() => setFpSelected([{ type: "text", id: text.id }])}
                    >
                      <g style={{ cursor: "grab" }}>{body}</g>
                    </DraggableNode>
                  </g>
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={{ cx, cy: y, w: estWidth, h: fontSize, rotation }}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`text:${text.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`text:${text.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`text:${text.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`text:${text.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 地標區域：跟多邊形房間共用同一套樣式／拖曳邏輯，差別是固定歸屬地標圖層、標籤是
              解析過的地點名稱，且不像多邊形附加面積數字（一塊叫「黑森林」的區域不需要看到
              「黑森林 · 12.4 m²」）。渲染順序放在 texts 之後、地標點之前——地標整體要疊在
              平面圖內容最上層方便點擊，這裡只管畫面順序，跟圖層清單的顯示順序無關 */}
          {floorPlan.landmarkAreas
            .filter((a) => visibleLayerIds.has(a.layerId))
            .map((area) => {
              const origCentroid = polygonCentroid(area.points);
              const moveLive = landmarkAreaMoveDrag.live?.id === area.id ? landmarkAreaMoveDrag.live : null;
              const groupShift = groupDragDelta && isGroupDragMember("landmarkArea", area.id) ? groupDragDelta : null;
              let points = area.points;
              if (groupShift) {
                points = area.points.map((pt) => ({ x: pt.x + groupShift.dx, y: pt.y + groupShift.dy }));
              } else if (moveLive) {
                const dx = moveLive.x - origCentroid.x;
                const dy = moveLive.y - origCentroid.y;
                points = area.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
              }
              points = points.map((pt, i) => {
                const vLive = landmarkAreaVertexDrag.live?.id === `${area.id}:${i}` ? landmarkAreaVertexDrag.live : null;
                return vLive ? { x: vLive.x, y: vLive.y } : pt;
              });
              const boxResizeLive = getBoxResizeLive("landmarkArea", area.id);
              const boxRotateLive = getBoxRotateLive("landmarkArea", area.id);
              if (boxResizeLive) {
                points = computePolygonResize(area.points, getFpItemLocalBox("landmarkArea", area), boxResizeLive.handle, boxResizeLive.pos, 4);
              } else if (boxRotateLive) {
                const rotBox = getFpItemLocalBox("landmarkArea", area);
                const angle = computeBoxRotationAngle({ x: rotBox.cx, y: rotBox.cy }, boxRotateLive, orthoEnabled, orthoStep);
                points = rotatePolygonPoints(area.points, { x: rotBox.cx, y: rotBox.cy }, angle);
              }
              const isSelected = fpSelected.some((s) => s.type === "landmarkArea" && s.id === area.id);
              const centroid = polygonCentroid(points);
              const areaStrokeFallback = isSelected ? "var(--accent)" : LANDMARK_FALLBACK_COLOR;
              const label = area.label || entryNameById.get(area.linkedEntryId ?? "") || t("fpItemType.landmarkArea");
              const body = (
                <>
                  <FloorPlanFillDefs objectId={area.id} style={area.style} fallbackColor={LANDMARK_FALLBACK_COLOR} />
                  <polygon
                    points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={resolveFillValue(area.style, LANDMARK_FALLBACK_COLOR, area.id)}
                    fillOpacity={area.style?.fillColor || area.style?.fillPattern ? undefined : isSelected ? 0.22 : 0.12}
                    stroke={resolveStrokeColor(area.style, areaStrokeFallback)}
                    strokeDasharray={resolveStrokeDasharray(area.style)}
                    strokeWidth={isSelected ? 2 : 1.5}
                  />
                  <text
                    x={centroid.x}
                    y={centroid.y}
                    fontSize={12}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--text)"
                    style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3 }}
                  >
                    {label}
                  </text>
                </>
              );
              const interactive = editing && tool === "select";
              if (!interactive) return <g key={area.id}>{body}</g>;
              return (
                <g key={area.id}>
                  <DraggableNode
                    id={area.id}
                    x={origCentroid.x}
                    y={origCentroid.y}
                    onDrag={(id, pos) => {
                      if (isGroupDragMember("landmarkArea", id)) startGroupDrag(pos.x - origCentroid.x, pos.y - origCentroid.y);
                      else {
                        const dx = pos.x - origCentroid.x;
                        const dy = pos.y - origCentroid.y;
                        resolveAlignmentSnap("landmarkArea", id, { ...area, points: area.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
                        landmarkAreaMoveDrag.onDrag(id, pos);
                      }
                    }}
                    onDragEnd={(id) => {
                      if (isGroupDragMember("landmarkArea", id)) commitGroupDrag();
                      else landmarkAreaMoveDrag.onDragEnd(id);
                      setFpAlignGuides({ x: [], y: [] });
                    }}
                    onClick={() => setFpSelected([{ type: "landmarkArea", id: area.id }])}
                  >
                    <g style={{ cursor: "grab" }}>{body}</g>
                  </DraggableNode>
                  {isSelected &&
                    points.map((pt, i) => (
                      <DraggableNode
                        key={i}
                        id={`${area.id}:${i}`}
                        x={pt.x}
                        y={pt.y}
                        onDrag={landmarkAreaVertexDrag.onDrag}
                        onDragEnd={landmarkAreaVertexDrag.onDragEnd}
                      >
                        <circle cx={pt.x} cy={pt.y} r={polygonVertexHandleR} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} style={{ cursor: "move" }} />
                      </DraggableNode>
                    ))}
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={getFpItemLocalBox("landmarkArea", { ...area, points })}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`landmarkArea:${area.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`landmarkArea:${area.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`landmarkArea:${area.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`landmarkArea:${area.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 地標點：跟符號一樣不分工具一律顯示，只有圖層關閉才不畫；標籤優先順序為自訂 label →
              連結地點的名稱 → 圖示的預設中文名稱。渲染順序放在最後，確保地標永遠疊在平面圖
              內容最上層 */}
          {floorPlan.landmarkPoints
            .filter((p) => visibleLayerIds.has(p.layerId))
            .map((point) => {
              const groupShift = groupDragDelta && isGroupDragMember("landmarkPoint", point.id) ? groupDragDelta : null;
              const live = landmarkPointMoveDrag.live?.id === point.id ? landmarkPointMoveDrag.live : null;
              const x = groupShift ? point.x + groupShift.dx : (live?.x ?? point.x);
              const y = groupShift ? point.y + groupShift.dy : (live?.y ?? point.y);
              const resizeLive = getBoxResizeLive("landmarkPoint", point.id);
              const scale = resizeLive
                ? Math.min(6, Math.max(0.2, (point.scale ?? 1) * computeUniformScaleFactor(getFpItemLocalBox("landmarkPoint", point), resizeLive.handle, resizeLive.pos)))
                : (point.scale ?? 1);
              const rotateLive = getBoxRotateLive("landmarkPoint", point.id);
              const rotation = rotateLive ? computeBoxRotationAngle({ x, y }, rotateLive, orthoEnabled, orthoStep) : (point.rotation ?? 0);
              const flipX = point.flipX ?? false;
              const isSelected = fpSelected.some((s) => s.type === "landmarkPoint" && s.id === point.id);
              const { iconType, label, color, iconTextColor, iconFillColor, iconCustomText } = resolveLandmarkPointDisplay(point);
              const body = (
                <g style={isSelected ? { filter: "drop-shadow(0 0 2px var(--accent))" } : undefined}>
                  <rect x={-LANDMARK_ICON_SIZE / 2} y={-LANDMARK_ICON_SIZE / 2} width={LANDMARK_ICON_SIZE} height={LANDMARK_ICON_SIZE} fill="transparent" />
                  <FloorPlanLandmarkIconGraphic
                    builtInKey={iconType?.builtInKey}
                    customImage={iconType?.customImage}
                    color={color}
                    textColor={iconTextColor}
                    fillColor={iconFillColor}
                    initial={iconCustomText}
                  />
                  {point.linkedEntryId && <circle cx={LANDMARK_ICON_SIZE * 0.32} cy={-LANDMARK_ICON_SIZE * 0.32} r={3.5} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1} />}
                  <text
                    x={0}
                    y={LANDMARK_ICON_SIZE * 0.42}
                    fontSize={11}
                    textAnchor="middle"
                    fill="var(--text)"
                    style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3, userSelect: "none" }}
                  >
                    {label}
                  </text>
                </g>
              );
              const transform = `translate(${x} ${y}) rotate(${rotation}) scale(${(flipX ? -1 : 1) * scale} ${scale})`;
              const interactive = editing && tool === "select";
              const wrapped = <g transform={transform}>{body}</g>;
              if (!interactive) return <g key={point.id}>{wrapped}</g>;
              return (
                <g key={point.id}>
                  <DraggableNode
                    id={point.id}
                    x={x}
                    y={y}
                    onDrag={(id, pos) => {
                      if (isGroupDragMember("landmarkPoint", id)) startGroupDrag(pos.x - point.x, pos.y - point.y);
                      else {
                        resolveAlignmentSnap("landmarkPoint", id, { ...point, x: pos.x, y: pos.y });
                        landmarkPointMoveDrag.onDrag(id, pos);
                      }
                    }}
                    onDragEnd={(id) => {
                      if (isGroupDragMember("landmarkPoint", id)) commitGroupDrag();
                      else landmarkPointMoveDrag.onDragEnd(id);
                      setFpAlignGuides({ x: [], y: [] });
                    }}
                    onClick={() => setFpSelected([{ type: "landmarkPoint", id: point.id }])}
                  >
                    <g transform={transform} style={{ cursor: "grab" }}>
                      {body}
                    </g>
                  </DraggableNode>
                  {isSelected && (
                    <FloorPlanTransformBox
                      box={{ cx: x, cy: y, w: LANDMARK_ICON_SIZE * scale, h: LANDMARK_ICON_SIZE * scale, rotation }}
                      viewScale={viewScale}
                      onResizeDrag={(handle, pos) => boxResizeDrag.onDrag(`landmarkPoint:${point.id}:${handle}`, pos)}
                      onResizeDragEnd={(handle) => boxResizeDrag.onDragEnd(`landmarkPoint:${point.id}:${handle}`)}
                      onRotateDrag={(pos) => boxRotateDrag.onDrag(`landmarkPoint:${point.id}`, pos)}
                      onRotateDragEnd={() => boxRotateDrag.onDragEnd(`landmarkPoint:${point.id}`)}
                    />
                  )}
                </g>
              );
            })}

          {/* 物件鎖點／格點吸附的落點提示：畫牆／房間／標註時，游標移到哪就先算出實際會落在
              哪個點（可能是吸附後的點），畫一個小圈提示使用者「點下去會落在這裡」 */}
          {editing && POINT_PLACEMENT_TOOLS.has(tool) && hoverPos && (
            <circle
              cx={fpSnap(hoverPos).x}
              cy={fpSnap(hoverPos).y}
              r={4 / viewScale}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={1.5 / viewScale}
              style={{ pointerEvents: "none" }}
            />
          )}

          {/* 畫牆進行中的即時預覽：已經點了第一點，線跟著游標走，套用跟正式放置同一套正交/吸附邏輯 */}
          {editing && tool === "wall" && wallStart && hoverPos && (
            <line
              x1={wallStart.x}
              y1={wallStart.y}
              x2={(orthoEnabled ? applyOrtho(wallStart, fpSnap(hoverPos), orthoStep) : fpSnap(hoverPos)).x}
              y2={(orthoEnabled ? applyOrtho(wallStart, fpSnap(hoverPos), orthoStep) : fpSnap(hoverPos)).y}
              stroke="var(--accent)"
              strokeWidth={3}
              strokeDasharray="6 4"
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* 畫房間進行中的即時預覽：跟著目前選的幾何形狀（roomShape）走，不是永遠畫矩形 */}
          {editing &&
            tool === "room" &&
            roomDraft &&
            renderRoomShape(
              roomShape,
              Math.min(roomDraft.x1, roomDraft.x2),
              Math.min(roomDraft.y1, roomDraft.y2),
              Math.abs(roomDraft.x2 - roomDraft.x1),
              Math.abs(roomDraft.y2 - roomDraft.y1),
              {
                fill: "var(--accent)",
                fillOpacity: 0.15,
                stroke: "var(--accent)",
                strokeWidth: 1.5,
                strokeDasharray: "6 4",
                style: { pointerEvents: "none" },
              }
            )}
          {/* 框選中的暫存框：純視覺，放開時才真的比對算出選取結果。刻意用實線＋比其他「畫到一半」
              預覽（房間/牆那些虛線）更粗的邊框、更高的填滿不透明度——這是一個「選取範圍」的框，
              跟「還沒畫完的形狀」語意不同，要一眼就看出目前框到的範圍，比照多數繪圖軟體框選時
              的視覺慣例（實線邊框、明顯的半透明填色） */}
          {editing && tool === "select" && selectBoxDraft && (
            <rect
              x={Math.min(selectBoxDraft.x1, selectBoxDraft.x2)}
              y={Math.min(selectBoxDraft.y1, selectBoxDraft.y2)}
              width={Math.abs(selectBoxDraft.x2 - selectBoxDraft.x1)}
              height={Math.abs(selectBoxDraft.y2 - selectBoxDraft.y1)}
              fill="var(--accent)"
              fillOpacity={0.18}
              stroke="var(--accent)"
              strokeWidth={2}
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* 拖曳智慧參考線：橫跨整張地圖內容範圍畫虛線，標示目前貼齊的座標值——x 陣列畫垂直線
              （提示水平方向對齊），y 陣列畫水平線（提示垂直方向對齊） */}
          {fpAlignGuides.x.map((x) => (
            <line
              key={`align-x-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={map.height}
              stroke="var(--accent)"
              strokeWidth={1 / viewScale}
              strokeDasharray={`${4 / viewScale} ${4 / viewScale}`}
              style={{ pointerEvents: "none" }}
            />
          ))}
          {fpAlignGuides.y.map((y) => (
            <line
              key={`align-y-${y}`}
              x1={0}
              y1={y}
              x2={map.width}
              y2={y}
              stroke="var(--accent)"
              strokeWidth={1 / viewScale}
              strokeDasharray={`${4 / viewScale} ${4 / viewScale}`}
              style={{ pointerEvents: "none" }}
            />
          ))}
          {/* 畫標註進行中的即時預覽：套用跟畫牆一樣的正交/吸附邏輯，先用臨時的量距離樣式的線＋文字
              預覽最終標註會長什麼樣子 */}
          {editing && tool === "dimension" && dimensionStart && hoverPos && (
            <MeasureLineGraphic
              a={dimensionStart}
              b={orthoEnabled ? applyOrtho(dimensionStart, fpSnap(hoverPos), orthoStep) : fpSnap(hoverPos)}
              label={formatDimensionLabel(
                Math.hypot(
                  (orthoEnabled ? applyOrtho(dimensionStart, fpSnap(hoverPos), orthoStep) : fpSnap(hoverPos)).x - dimensionStart.x,
                  (orthoEnabled ? applyOrtho(dimensionStart, fpSnap(hoverPos), orthoStep) : fpSnap(hoverPos)).y - dimensionStart.y
                ),
                map.scaleBar
              )}
            />
          )}
          {/* 放置符號的即時預覽：半透明的圖示跟著游標（吸附後的落點）走，先看清楚會放在哪、多大 */}
          {editing && tool === "symbol" && hoverPos && (
            <g transform={`translate(${fpSnap(hoverPos).x} ${fpSnap(hoverPos).y})`} opacity={0.5} style={{ pointerEvents: "none" }}>
              <FloorPlanSymbolIcon type={symbolType} />
            </g>
          )}
          {/* 畫多邊形進行中的即時預覽：已經點的頂點用折線連起來，加一段虛線連到目前游標位置；
              頂點數達到 3 個以上時，靠近起點會額外圈出來提示「點這裡可以封閉」 */}
          {editing && tool === "polygon" && polygonPoints && (
            <>
              <polyline
                points={polygonPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              {hoverPos && (
                <line
                  x1={polygonPoints[polygonPoints.length - 1].x}
                  y1={polygonPoints[polygonPoints.length - 1].y}
                  x2={fpSnap(hoverPos).x}
                  y2={fpSnap(hoverPos).y}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: "none" }}
                />
              )}
              {polygonPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3 / viewScale} fill="var(--accent)" style={{ pointerEvents: "none" }} />
              ))}
              {polygonPoints.length >= 3 && (
                <circle
                  cx={polygonPoints[0].x}
                  cy={polygonPoints[0].y}
                  r={POLYGON_CLOSE_SCREEN_PX / viewScale}
                  fill="none"
                  stroke="var(--accent)"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </>
          )}

          {editing && tool === "landmarkArea" && landmarkAreaPoints && (
            <>
              <polyline
                points={landmarkAreaPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                style={{ pointerEvents: "none" }}
              />
              {hoverPos && (
                <line
                  x1={landmarkAreaPoints[landmarkAreaPoints.length - 1].x}
                  y1={landmarkAreaPoints[landmarkAreaPoints.length - 1].y}
                  x2={fpSnap(hoverPos).x}
                  y2={fpSnap(hoverPos).y}
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  style={{ pointerEvents: "none" }}
                />
              )}
              {landmarkAreaPoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3 / viewScale} fill="var(--accent)" style={{ pointerEvents: "none" }} />
              ))}
              {landmarkAreaPoints.length >= 3 && (
                <circle
                  cx={landmarkAreaPoints[0].x}
                  cy={landmarkAreaPoints[0].y}
                  r={POLYGON_CLOSE_SCREEN_PX / viewScale}
                  fill="none"
                  stroke="var(--accent)"
                  strokeDasharray="2 2"
                  strokeWidth={1}
                  style={{ pointerEvents: "none" }}
                />
              )}
            </>
          )}

          {editing && isBrushTool && !measuring && hoverPos && (
            <circle
              cx={hoverPos.x}
              cy={hoverPos.y}
              r={brushRadius}
              fill="none"
              stroke="#fff"
              strokeWidth={1.5}
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* 比例尺／指北針是地圖本身內容（像圖例一樣），不分編輯／瀏覽都顯示；只有編輯模式才能拖曳，
              瀏覽模式單純顯示畫好的圖形，不掛 DraggableNode（沒有意義也不該讓瀏覽者不小心拖動它） */}
          {map.scaleBar &&
            (editing ? (
              <DraggableNode id="scaleBar" x={map.scaleBar.x} y={map.scaleBar.y} onDrag={scaleBarDrag.onDrag} onDragEnd={scaleBarDrag.onDragEnd}>
                <ScaleBarGraphic
                  x={scaleBarDrag.livePos?.x ?? map.scaleBar.x}
                  y={scaleBarDrag.livePos?.y ?? map.scaleBar.y}
                  lengthPx={map.scaleBar.lengthPx}
                  realDistance={map.scaleBar.realDistance}
                  unit={map.scaleBar.unit}
                />
              </DraggableNode>
            ) : (
              <ScaleBarGraphic
                x={map.scaleBar.x}
                y={map.scaleBar.y}
                lengthPx={map.scaleBar.lengthPx}
                realDistance={map.scaleBar.realDistance}
                unit={map.scaleBar.unit}
              />
            ))}
          {map.compass &&
            (editing ? (
              <DraggableNode id="compass" x={map.compass.x} y={map.compass.y} onDrag={compassDrag.onDrag} onDragEnd={compassDrag.onDragEnd}>
                <CompassGraphic
                  x={compassDrag.livePos?.x ?? map.compass.x}
                  y={compassDrag.livePos?.y ?? map.compass.y}
                  rotation={map.compass.rotation}
                  labels={map.compass.labels}
                  style={map.compass.style}
                />
              </DraggableNode>
            ) : (
              <CompassGraphic x={map.compass.x} y={map.compass.y} rotation={map.compass.rotation} labels={map.compass.labels} style={map.compass.style} />
            ))}
          {/* 量距離工具：點了 A 點還沒點 B 點時，用目前游標位置當即時預覽的 B 點；兩點都確定後
              顯示固定的線＋距離。距離一律用比例尺的 lengthPx/realDistance 反推，見 MapDecorations.tsx */}
          {measuring && measurePoints && map.scaleBar && (
            <MeasureLineGraphic
              a={measurePoints.a}
              b={measurePoints.b ?? hoverPos}
              label={
                (measurePoints.b ?? hoverPos)
                  ? formatRealDistance(
                      Math.hypot((measurePoints.b ?? hoverPos)!.x - measurePoints.a.x, (measurePoints.b ?? hoverPos)!.y - measurePoints.a.y),
                      map.scaleBar
                    )
                  : undefined
              }
            />
          )}
        </PannableCanvas>
        {showRuler && liveViewport && (
          <MapRulerOverlay view={liveViewport} canvasWidth={width} canvasHeight={height} calibration={map.scaleBar} />
        )}
        </div>
        )}
      </div>
      </CanvasWorkbench>
      {showHistory && <VersionHistoryDialog entityType="maps" entityId={map.id} onClose={() => setShowHistory(false)} />}
    </>
  );
}
