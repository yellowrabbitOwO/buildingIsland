import { newId } from "./db";
import type {
  FloorPlanData,
  FloorPlanDimension,
  FloorPlanLandmarkArea,
  FloorPlanLandmarkPoint,
  FloorPlanPolygonRoom,
  FloorPlanRoom,
  FloorPlanSymbol,
  FloorPlanText,
  FloorPlanWall,
  FpItemType,
} from "./types";
import { SYMBOL_SIZE } from "../components/map/FloorPlanSymbols";
import { LANDMARK_ICON_SIZE } from "../components/map/FloorPlanLandmarkIcons";
import { type TranslationKey } from "../i18n";
import zhTW from "../locales/zh-TW";

/** 文字標籤沒有另外設定字級時的預設值；跟畫布上「新增文字」工具、屬性面板的字級輸入框共用同一個
 * 常數，避免三處各自寫死 16 這個數字 */
export const DEFAULT_TEXT_FONT_SIZE = 16;

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** createDefaultFloorPlan 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 新平面圖的預設內容：一個空的預設圖層＋一個固定的「地標」系統圖層（見 FloorPlanLayer.
 * isLandmarkLayer），還沒有任何牆或房間。activeLayerId 指向一般圖層，地標圖層不會被設為作用中 */
export function createDefaultFloorPlan(t: TFn = fallbackT): FloorPlanData {
  const layerId = newId();
  return {
    layers: [
      { id: layerId, name: t("mapViewPage.newLayerDefaultName", { n: 1 }), visible: true },
      { id: newId(), name: t("mapViewPage.landmarkLayerName"), visible: true, isLandmarkLayer: true },
    ],
    activeLayerId: layerId,
    walls: [],
    rooms: [],
    dimensions: [],
    symbols: [],
    polygons: [],
    texts: [],
    landmarkPoints: [],
    landmarkAreas: [],
  };
}

/** 正交模式：把 to 點鎖到以 from 為圓心、stepDegrees 為間隔的方向上（預設 45°，即 0°/45°/90°.../315°），
 * 距離不變，只調整角度——畫牆最常用來確保牆是水平或垂直，不會歪一點點角度。stepDegrees 可由使用者
 * 在畫布上自訂（見 MapViewPage.tsx 的「卡角間隔」輸入框），不是只能固定 45° */
export function applyOrtho(
  from: { x: number; y: number },
  to: { x: number; y: number },
  stepDegrees: number = 45
): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return to;
  const angle = Math.atan2(dy, dx);
  const step = (stepDegrees * Math.PI) / 180;
  const snapped = Math.round(angle / step) * step;
  return { x: from.x + Math.cos(snapped) * dist, y: from.y + Math.sin(snapped) * dist };
}

/** 物件鎖點（CAD 的 OSNAP）：畫新牆／房間／標註時，如果游標點落在既有牆的端點／中點或房間角點
 * 附近（thresholdContentPx 內），直接吸附過去，不用完全靠滑鼠點準；找不到夠近的候選點就回傳
 * null，讓呼叫端退回格點吸附或原始座標。優先序看呼叫端怎麼串（見 MapViewPage.tsx 的 fpSnap），
 * 這裡只負責「找最近的候選點」 */
export function findObjectSnap(
  pos: { x: number; y: number },
  floorPlan: FloorPlanData,
  thresholdContentPx: number
): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestDist = thresholdContentPx;
  const consider = (p: { x: number; y: number }) => {
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  };
  for (const w of floorPlan.walls) {
    consider({ x: w.x1, y: w.y1 });
    consider({ x: w.x2, y: w.y2 });
    consider({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
  }
  for (const r of floorPlan.rooms) {
    consider({ x: r.x, y: r.y });
    consider({ x: r.x + r.width, y: r.y });
    consider({ x: r.x, y: r.y + r.height });
    consider({ x: r.x + r.width, y: r.y + r.height });
  }
  for (const poly of floorPlan.polygons) {
    for (const p of poly.points) consider(p);
  }
  // 地標區域的頂點跟多邊形一樣是吸附候選；地標點是單一定點標記，不是有意義的吸附目標，故不列入
  // （跟符號目前也不參與吸附一致）
  for (const area of floorPlan.landmarkAreas) {
    for (const p of area.points) consider(p);
  }
  return best;
}

/** 多邊形面積（鞋帶公式），永遠回傳正值——頂點是順時針或逆時針畫的都可能發生（使用者隨手點），
 * 鞋帶公式算出來的正負號只反映方向，跟「這個形狀多大」無關，這裡只在乎面積大小 */
export function polygonArea(points: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** 多邊形形心（頂點座標平均值）：拖曳搬移整個多邊形時當作 DraggableNode 的錨點座標——不需要
 * 真正的幾何形心（面積加權中心），頂點平均值夠用，算法也簡單很多 */
export function polygonCentroid(points: { x: number; y: number }[]): { x: number; y: number } {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** 牆／標註在「本地變形框」裡假想的厚度：這兩種物件本身是純線段、沒有厚度資料，統一外框需要一個
 * 非零的高度才能畫出方框，這個常數只影響外框的視覺呈現，不會被寫回任何資料欄位 */
const FP_LINE_LOCAL_THICKNESS = 8;

/** 統一變形外框的 8 個縮放控制點（4 角 + 4 邊中點）——放在 data 層而不是元件檔，因為
 * FloorPlanTransformBox（畫框的元件）跟這裡的縮放/旋轉幾何運算函式都要用同一份定義，
 * 避免元件檔跟 data 層互相 import 對方造成循環依賴 */
export type BoxHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export type FpItemUnion =
  | FloorPlanWall
  | FloorPlanRoom
  | FloorPlanDimension
  | FloorPlanSymbol
  | FloorPlanPolygonRoom
  | FloorPlanText
  | FloorPlanLandmarkPoint
  | FloorPlanLandmarkArea;

export type FpBounds = { minX: number; maxX: number; minY: number; maxY: number };

/** 統一變形外框的共用表示法：把任何物件換算成「本地未旋轉的中心點＋寬高＋旋轉角度」，畫外框控制點
 * 跟做旋轉/縮放座標轉換都靠這個表示法，旋轉角度沿用跟 FloorPlanRoom.rotation 相同的慣例（度，
 * 搭配 SVG 的 `rotate(角度 cx cy)`，正值＝順時針） */
export type FpLocalBox = { cx: number; cy: number; w: number; h: number; rotation: number };

/** 把一個點繞 center 旋轉 degrees 度（跟 SVG `rotate(degrees cx cy)` 同一個旋轉矩陣、同一個正負號慣例），
 * degrees 為 0 時直接回傳原點，避免無意義的浮點運算。統一變形外框（FloorPlanTransformBox）算控制點
 * 世界座標、以及各家族的縮放/旋轉提交邏輯都要用同一個公式，故意匯出成共用函式 */
export function rotatePoint(p: { x: number; y: number }, center: { x: number; y: number }, degrees: number): { x: number; y: number } {
  if (!degrees) return p;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

function boundsFromPoints(points: { x: number; y: number }[]): FpBounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/** 幫任何一種平面圖物件算出目前的外接矩形（世界座標）——集中取代過去框選（box-select）裡 8 段
 * 各自手算的版本，並且修正房間的既有簡化：改成先算旋轉前的 4 個角點，繞中心旋轉 rotation 角度，
 * 再取 min/max，得到真正準確的旋轉後外接矩形（符號／地標點現在也可能有 rotation，一併套用同一套
 * 算法）。框選命中判定、對齊工具、拖曳智慧參考線都共用這個函式，確保「這個物件的範圍」在全檔案
 * 只有一個定義 */
export function getFpItemBounds(type: FpItemType, item: FpItemUnion): FpBounds {
  switch (type) {
    case "wall": {
      const w = item as FloorPlanWall;
      return { minX: Math.min(w.x1, w.x2), maxX: Math.max(w.x1, w.x2), minY: Math.min(w.y1, w.y2), maxY: Math.max(w.y1, w.y2) };
    }
    case "dimension": {
      const d = item as FloorPlanDimension;
      return { minX: Math.min(d.x1, d.x2), maxX: Math.max(d.x1, d.x2), minY: Math.min(d.y1, d.y2), maxY: Math.max(d.y1, d.y2) };
    }
    case "room": {
      const r = item as FloorPlanRoom;
      const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const corners = [
        { x: r.x, y: r.y },
        { x: r.x + r.width, y: r.y },
        { x: r.x, y: r.y + r.height },
        { x: r.x + r.width, y: r.y + r.height },
      ].map((p) => rotatePoint(p, center, r.rotation ?? 0));
      return boundsFromPoints(corners);
    }
    case "symbol": {
      const s = item as FloorPlanSymbol;
      const half = (SYMBOL_SIZE * (s.scale ?? 1)) / 2;
      const center = { x: s.x, y: s.y };
      const corners = [
        { x: s.x - half, y: s.y - half },
        { x: s.x + half, y: s.y - half },
        { x: s.x - half, y: s.y + half },
        { x: s.x + half, y: s.y + half },
      ].map((p) => rotatePoint(p, center, s.rotation ?? 0));
      return boundsFromPoints(corners);
    }
    case "landmarkPoint": {
      const p = item as FloorPlanLandmarkPoint;
      const half = (LANDMARK_ICON_SIZE * (p.scale ?? 1)) / 2;
      const center = { x: p.x, y: p.y };
      const corners = [
        { x: p.x - half, y: p.y - half },
        { x: p.x + half, y: p.y - half },
        { x: p.x - half, y: p.y + half },
        { x: p.x + half, y: p.y + half },
      ].map((c) => rotatePoint(c, center, p.rotation ?? 0));
      return boundsFromPoints(corners);
    }
    case "text": {
      const t = item as FloorPlanText;
      const fontSize = t.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
      // 沿用既有「字級 × 字數」概略估寬的公式；文字沒有 textAnchor（左對齊）、dominantBaseline="middle"
      // （垂直置中），所以 t.x 是左邊界、t.y 是垂直中線，不是像其餘物件那樣的中心點
      const width = fontSize * t.text.length || fontSize;
      const halfH = fontSize / 2;
      const center = { x: t.x + width / 2, y: t.y };
      const corners = [
        { x: t.x, y: t.y - halfH },
        { x: t.x + width, y: t.y - halfH },
        { x: t.x, y: t.y + halfH },
        { x: t.x + width, y: t.y + halfH },
      ].map((c) => rotatePoint(c, center, t.rotation ?? 0));
      return boundsFromPoints(corners);
    }
    case "polygon": {
      const poly = item as FloorPlanPolygonRoom;
      return boundsFromPoints(poly.points);
    }
    case "landmarkArea": {
      const area = item as FloorPlanLandmarkArea;
      return boundsFromPoints(area.points);
    }
  }
}

/** 幫任何一種平面圖物件算出「統一變形外框」用的本地座標表示法（見 FpLocalBox 說明）。牆／標註
 * 沒有獨立的旋轉欄位，這裡即時用兩端點算出線段角度／長度，只用來畫外框控制點跟做拖曳換算，
 * 不會被寫回資料；多邊形／地標區域的旋轉固定回傳 0，因為這兩種物件的形狀就是 points[] 本身，
 * 旋轉/縮放/翻轉都是直接永久改寫頂點座標，不需要另外維護一個旋轉角欄位 */
export function getFpItemLocalBox(type: FpItemType, item: FpItemUnion): FpLocalBox {
  switch (type) {
    case "room": {
      const r = item as FloorPlanRoom;
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height, rotation: r.rotation ?? 0 };
    }
    case "symbol": {
      const s = item as FloorPlanSymbol;
      const size = SYMBOL_SIZE * (s.scale ?? 1);
      return { cx: s.x, cy: s.y, w: size, h: size, rotation: s.rotation ?? 0 };
    }
    case "landmarkPoint": {
      const p = item as FloorPlanLandmarkPoint;
      const size = LANDMARK_ICON_SIZE * (p.scale ?? 1);
      return { cx: p.x, cy: p.y, w: size, h: size, rotation: p.rotation ?? 0 };
    }
    case "text": {
      const t = item as FloorPlanText;
      const fontSize = t.fontSize ?? DEFAULT_TEXT_FONT_SIZE;
      const width = fontSize * t.text.length || fontSize;
      return { cx: t.x + width / 2, cy: t.y, w: width, h: fontSize, rotation: t.rotation ?? 0 };
    }
    case "wall": {
      const w = item as FloorPlanWall;
      const dx = w.x2 - w.x1;
      const dy = w.y2 - w.y1;
      return {
        cx: (w.x1 + w.x2) / 2,
        cy: (w.y1 + w.y2) / 2,
        w: Math.hypot(dx, dy),
        h: FP_LINE_LOCAL_THICKNESS,
        rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }
    case "dimension": {
      const d = item as FloorPlanDimension;
      const dx = d.x2 - d.x1;
      const dy = d.y2 - d.y1;
      return {
        cx: (d.x1 + d.x2) / 2,
        cy: (d.y1 + d.y2) / 2,
        w: Math.hypot(dx, dy),
        h: FP_LINE_LOCAL_THICKNESS,
        rotation: (Math.atan2(dy, dx) * 180) / Math.PI,
      };
    }
    case "polygon": {
      const poly = item as FloorPlanPolygonRoom;
      const b = boundsFromPoints(poly.points);
      return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY, rotation: 0 };
    }
    case "landmarkArea": {
      const area = item as FloorPlanLandmarkArea;
      const b = boundsFromPoints(area.points);
      return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, w: b.maxX - b.minX, h: b.maxY - b.minY, rotation: 0 };
    }
  }
}

export type FpAlignSnapResult = { dx: number; dy: number; guideX: number[]; guideY: number[] };

/** 拖曳智慧參考線：把正在拖曳的物件的邊界（左/水平中線/右、上/垂直中線/下 共 6 個座標值）
 * 分別跟每個候選物件的對應值比較，門檻內取最近的一組（x／y 兩軸各自獨立找，不要求同一個候選物件
 * 同時命中兩軸），回傳「要往哪個方向貼齊」的位移量＋要畫的參考線座標；完全沒有命中回傳 null。
 * 比照 findObjectSnap 的寫法風格（只負責找候選點/線，優先序由呼叫端決定） */
export function findAlignmentSnap(dragged: FpBounds, candidates: FpBounds[], thresholdContentPx: number): FpAlignSnapResult | null {
  const draggedXs = [dragged.minX, (dragged.minX + dragged.maxX) / 2, dragged.maxX];
  const draggedYs = [dragged.minY, (dragged.minY + dragged.maxY) / 2, dragged.maxY];
  let bestDx = 0;
  let bestDxDist = thresholdContentPx;
  let guideX: number[] = [];
  let bestDy = 0;
  let bestDyDist = thresholdContentPx;
  let guideY: number[] = [];
  for (const c of candidates) {
    const candidateXs = [c.minX, (c.minX + c.maxX) / 2, c.maxX];
    const candidateYs = [c.minY, (c.minY + c.maxY) / 2, c.maxY];
    for (const dx of draggedXs) {
      for (const cx of candidateXs) {
        const dist = Math.abs(dx - cx);
        if (dist < bestDxDist) {
          bestDxDist = dist;
          bestDx = cx - dx;
          guideX = [cx];
        } else if (dist === bestDxDist && !guideX.includes(cx)) {
          guideX.push(cx);
        }
      }
    }
    for (const dy of draggedYs) {
      for (const cy of candidateYs) {
        const dist = Math.abs(dy - cy);
        if (dist < bestDyDist) {
          bestDyDist = dist;
          bestDy = cy - dy;
          guideY = [cy];
        } else if (dist === bestDyDist && !guideY.includes(cy)) {
          guideY.push(cy);
        }
      }
    }
  }
  const hitX = bestDxDist < thresholdContentPx;
  const hitY = bestDyDist < thresholdContentPx;
  if (!hitX && !hitY) return null;
  return { dx: hitX ? bestDx : 0, dy: hitY ? bestDy : 0, guideX: hitX ? guideX : [], guideY: hitY ? guideY : [] };
}

// ---- 統一變形外框（FloorPlanTransformBox）共用的幾何運算 ----
// 這裡的函式都是純函式（不碰 React state），拖曳中即時預覽跟放開時真正寫入都呼叫同一份，
// 確保「畫面上看到的」跟「放開後套用的」永遠是同一個計算結果，不會兩處各自算一次結果對不上。

/** 把世界座標點換算成「相對某個中心點、反向旋轉 rotationDeg 度」的本地偏移量——統一外框的
 * 縮放計算都在這個「跟物件自己寬高軸對齊」的本地座標系裡進行，算完再用 localOffsetToWorld 換回去 */
export function worldToLocalOffset(
  worldPos: { x: number; y: number },
  center: { x: number; y: number },
  rotationDeg: number
): { x: number; y: number } {
  const rotated = rotatePoint(worldPos, center, -rotationDeg);
  return { x: rotated.x - center.x, y: rotated.y - center.y };
}

/** worldToLocalOffset 的反運算：本地偏移量＋中心點＋旋轉角，換回世界座標 */
export function localOffsetToWorld(
  localOffset: { x: number; y: number },
  center: { x: number; y: number },
  rotationDeg: number
): { x: number; y: number } {
  return rotatePoint({ x: center.x + localOffset.x, y: center.y + localOffset.y }, center, rotationDeg);
}

/** 統一外框 8 個控制點裡，哪幾個是「這一軸可以自由拖曳」、拖曳時對面那一側（錨點）在本地座標系
 * 的固定座標值是多少——4 個角兩軸都自由，上下邊只有 Y 自由，左右邊只有 X 自由；錨點永遠是拖曳方向
 * 的對面那一側，讓縮放呈現「固定住對角/對邊，拖動這一側」的直覺效果 */
function getResizeAxes(handle: BoxHandle, halfW: number, halfH: number) {
  const freeX = handle !== "n" && handle !== "s";
  const freeY = handle !== "e" && handle !== "w";
  const anchorX = handle.includes("w") ? halfW : handle.includes("e") ? -halfW : 0;
  const anchorY = handle.includes("n") ? halfH : handle.includes("s") ? -halfH : 0;
  return { freeX, freeY, anchorX, anchorY };
}

/** 家族 A（房間）縮放：支援旋轉過的房間（修正舊有「旋轉時直接隱藏縮放手把」的限制）——先把拖曳點
 * 反向旋轉回房間自己的本地座標系，用跟座標軸對齊的矩形數學算出新的寬高／中心，旋轉角度本身不變，
 * 最後才把新中心點換回世界座標寫回 x/y（房間的 x/y 是未旋轉時的左上角，見 FloorPlanRoom 型別說明） */
export function computeRoomResize(
  room: { x: number; y: number; width: number; height: number; rotation?: number },
  handle: BoxHandle,
  worldPos: { x: number; y: number },
  minSize: number
): { x: number; y: number; width: number; height: number } {
  const rotation = room.rotation ?? 0;
  const center = { x: room.x + room.width / 2, y: room.y + room.height / 2 };
  const halfW = room.width / 2;
  const halfH = room.height / 2;
  const localD = worldToLocalOffset(worldPos, center, rotation);
  const { freeX, freeY, anchorX, anchorY } = getResizeAxes(handle, halfW, halfH);
  const newW = freeX ? Math.max(minSize, Math.abs(localD.x - anchorX)) : room.width;
  const newH = freeY ? Math.max(minSize, Math.abs(localD.y - anchorY)) : room.height;
  const centerOffsetX = freeX ? (localD.x + anchorX) / 2 : 0;
  const centerOffsetY = freeY ? (localD.y + anchorY) / 2 : 0;
  const newCenter = localOffsetToWorld({ x: centerOffsetX, y: centerOffsetY }, center, rotation);
  return { x: newCenter.x - newW / 2, y: newCenter.y - newH / 2, width: newW, height: newH };
}

/** 家族 B（符號／地標點／文字）縮放：這三種物件都只有一個尺寸自由度（scale 或 fontSize），
 * 不管拖哪一個控制點，一律換算成「這個控制點離中心的距離變化比例」當作等比縮放倍率——
 * 用比例而不是直接量新的寬高，是因為 8 個控制點對這些物件來說意義相同，比例的算法唯一、不用
 * 依控制點分岔邏輯 */
export function computeUniformScaleFactor(box: FpLocalBox, handle: BoxHandle, worldPos: { x: number; y: number }): number {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const localHandle: Record<BoxHandle, { x: number; y: number }> = {
    nw: { x: -halfW, y: -halfH },
    n: { x: 0, y: -halfH },
    ne: { x: halfW, y: -halfH },
    e: { x: halfW, y: 0 },
    se: { x: halfW, y: halfH },
    s: { x: 0, y: halfH },
    sw: { x: -halfW, y: halfH },
    w: { x: -halfW, y: 0 },
  };
  const center = { x: box.cx, y: box.cy };
  const oldWorld = localOffsetToWorld(localHandle[handle], center, box.rotation);
  const oldDist = Math.hypot(oldWorld.x - box.cx, oldWorld.y - box.cy);
  const newDist = Math.hypot(worldPos.x - box.cx, worldPos.y - box.cy);
  if (oldDist < 1e-6) return 1;
  return newDist / oldDist;
}

/** 家族 C（多邊形房間／地標區域）縮放：這兩種物件的形狀就是 points[] 本身、box.rotation 固定是 0
 * （見 getFpItemLocalBox），本地座標系只是把世界座標平移到外框中心，不用另外處理旋轉。把每個
 * 頂點相對錨點的偏移量乘上這一軸的縮放比例，直接算出新的 points[]，永久覆寫（不是另外存一個
 * 縮放倍率欄位） */
export function computePolygonResize(
  points: { x: number; y: number }[],
  box: FpLocalBox,
  handle: BoxHandle,
  worldPos: { x: number; y: number },
  minExtent: number
): { x: number; y: number }[] {
  const halfW = box.w / 2;
  const halfH = box.h / 2;
  const localD = { x: worldPos.x - box.cx, y: worldPos.y - box.cy };
  const { freeX, freeY, anchorX, anchorY } = getResizeAxes(handle, halfW, halfH);
  const newExtentX = freeX ? Math.max(minExtent, Math.abs(localD.x - anchorX)) : halfW * 2;
  const newExtentY = freeY ? Math.max(minExtent, Math.abs(localD.y - anchorY)) : halfH * 2;
  const scaleX = halfW > 0 ? newExtentX / (halfW * 2) : 1;
  const scaleY = halfH > 0 ? newExtentY / (halfH * 2) : 1;
  return points.map((p) => {
    const lx = p.x - box.cx;
    const ly = p.y - box.cy;
    const nx = (lx - anchorX) * scaleX + anchorX;
    const ny = (ly - anchorY) * scaleY + anchorY;
    return { x: box.cx + nx, y: box.cy + ny };
  });
}

/** 統一外框的旋轉手把共用角度計算：跟房間/符號原本各自手刻的旋轉手把同一套「中心→拖曳點方向角，
 * 0°＝正上方、順時針」慣例（保留既有使用者操作習慣），正交模式開啟時鎖到 orthoStep 一格 */
export function computeBoxRotationAngle(
  center: { x: number; y: number },
  worldPos: { x: number; y: number },
  orthoEnabled: boolean,
  orthoStep: number
): number {
  let angle = (Math.atan2(worldPos.y - center.y, worldPos.x - center.x) * 180) / Math.PI + 90;
  if (orthoEnabled) angle = Math.round(angle / orthoStep) * orthoStep;
  return ((Math.round(angle) % 360) + 360) % 360;
}

/** 家族 C（多邊形房間／地標區域）旋轉：沒有獨立的旋轉欄位，直接把每個頂點繞外框中心旋轉
 * angleDeg 度後永久覆寫 points[]——呼叫端永遠傳「從原始（拖曳開始那一刻）points 算起」的完整
 * 角度，不是每次疊加的增量，這樣拖曳中間鬆手取消／中途調整方向才不會因為疊加順序出錯 */
export function rotatePolygonPoints(points: { x: number; y: number }[], center: { x: number; y: number }, angleDeg: number): { x: number; y: number }[] {
  return points.map((p) => rotatePoint(p, center, angleDeg));
}
