import type { FloorPlanStyle } from "./types";

/** 虛線樣式的 dash 陣列，SVG 的 strokeDasharray 與 Canvas 2D 的 setLineDash 共用同一組數字，
 * 確保畫布顯示跟匯出圖片的虛線長度一致 */
export const DASH_PATTERN = [8, 5];
export const DASH_PATTERN_SVG = DASH_PATTERN.join(" ");

/** 算出這個物件實際要用的線條顏色／虛線陣列；style 未設定或個別欄位未設定時，退回呼叫端給的
 * 預設色（維持這次改版之前的外觀，不用轉檔既有資料） */
export function resolveStrokeColor(style: FloorPlanStyle | undefined, fallbackColor: string): string {
  return style?.strokeColor || fallbackColor;
}

export function resolveStrokeDasharray(style: FloorPlanStyle | undefined): string | undefined {
  return style?.dashed ? DASH_PATTERN_SVG : undefined;
}

/** SVG `<pattern>` 的 id：用物件自己的 id 組出來保證唯一——房間／多邊形是在 `.map()` 裡渲染，
 * 不能呼叫 `useId()`，只能靠資料本身的 id 保證不重複 */
export function fillPatternId(objectId: string): string {
  return `fp-fill-${objectId}`;
}

/** 算出這個物件的 SVG fill 屬性值：純色直接回傳色碼，點狀／斜線回傳 `url(#pattern-id)` 參照
 * FloorPlanFillDefs 畫出來的 `<pattern>`（見 components/map/FloorPlanFillDefs.tsx） */
export function resolveFillValue(style: FloorPlanStyle | undefined, fallbackColor: string, objectId: string): string {
  const pattern = style?.fillPattern ?? "solid";
  if (pattern === "solid") return style?.fillColor || fallbackColor;
  return `url(#${fillPatternId(objectId)})`;
}

/** Canvas 2D 版本：套用線條顏色／虛線到 ctx（匯出圖片用，見 MapViewPage.tsx 的 handleExportImage） */
export function applyStrokeStyleToCanvas(ctx: CanvasRenderingContext2D, style: FloorPlanStyle | undefined, fallbackColor: string): void {
  ctx.strokeStyle = resolveStrokeColor(style, fallbackColor);
  ctx.setLineDash(style?.dashed ? DASH_PATTERN : []);
}

/** Canvas 2D 版本的填滿樣式：純色回傳色碼字串；點狀／斜線先畫一小張圖磚（tile）再用
 * `ctx.createPattern` 產生可重複貼齊的 CanvasPattern，磚塊尺寸／圖案畫法對應 FloorPlanFillDefs
 * 的 SVG `<pattern>`，讓匯出圖片與畫布顯示看起來一致 */
export function resolveFillStyleForCanvas(ctx: CanvasRenderingContext2D, style: FloorPlanStyle | undefined, fallbackColor: string): string | CanvasPattern {
  const pattern = style?.fillPattern ?? "solid";
  const color = style?.fillColor || fallbackColor;
  if (pattern === "solid") return color;

  const tile = document.createElement("canvas");
  const size = pattern === "dot" ? 10 : 8;
  tile.width = size;
  tile.height = size;
  const tctx = tile.getContext("2d");
  if (!tctx) return color;

  if (pattern === "dot") {
    tctx.fillStyle = color;
    tctx.beginPath();
    tctx.arc(size / 2, size / 2, 1.6, 0, Math.PI * 2);
    tctx.fill();
  } else {
    // 斜線：磚塊本身不轉 45°（canvas pattern 不支援 patternTransform），改成直接在磚塊裡畫一條
    // 對角線，磚塊重複貼齊後自然形成連續的 45° 斜線陣列
    tctx.strokeStyle = color;
    tctx.lineWidth = 2.5;
    tctx.beginPath();
    tctx.moveTo(-2, size + 2);
    tctx.lineTo(size + 2, -2);
    tctx.stroke();
  }
  return ctx.createPattern(tile, "repeat") ?? color;
}
