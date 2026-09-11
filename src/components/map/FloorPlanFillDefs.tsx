import type { FloorPlanStyle } from "../../data/types";
import { fillPatternId } from "../../data/floorPlanStyle";

/** 依物件的填滿樣式畫出對應的 SVG `<pattern>` 定義（點狀／45° 斜線），純色（"solid"，或沒設定）
 * 時不需要 pattern，直接回傳 null——呼叫端 fill 屬性一律用 resolveFillValue() 算出來的值，純色
 * 情況那個值就是色碼本身，不會參照這裡的 pattern id。放在物件自己的 `<g>` 裡面（緊接在會用到它
 * 的 `<rect>`/`<polygon>`/`<ellipse>` 之前）即可，不用集中放到全域的 `<defs>` */
export function FloorPlanFillDefs({
  objectId,
  style,
  fallbackColor,
}: {
  objectId: string;
  style: FloorPlanStyle | undefined;
  fallbackColor: string;
}) {
  const pattern = style?.fillPattern ?? "solid";
  if (pattern === "solid") return null;
  const color = style?.fillColor || fallbackColor;
  const id = fillPatternId(objectId);
  if (pattern === "dot") {
    return (
      <defs>
        <pattern id={id} width={10} height={10} patternUnits="userSpaceOnUse">
          <circle cx={5} cy={5} r={1.6} fill={color} />
        </pattern>
      </defs>
    );
  }
  return (
    <defs>
      <pattern id={id} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2.5} />
      </pattern>
    </defs>
  );
}
