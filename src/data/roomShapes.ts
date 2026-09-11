import type { RoomShape } from "./types";
import type { TranslationKey } from "../i18n";

/** 各幾何形狀的頂點角度表（度，0°＝正右方，順時針遞增到剛好對齊 SVG/Canvas 的角度慣例；
 * 這裡刻意讓每個形狀的「第一個頂點」都朝正上方，畫出來的三角形／五角形／六角形視覺上比較正）。
 * 星形額外交錯外／內半徑，另外處理，不共用這張表 */
const SHAPE_VERTEX_ANGLES: Partial<Record<RoomShape, number[]>> = {
  rect: [-135, -45, 45, 135],
  triangle: [-90, 30, 150],
  pentagon: [-90, -18, 54, 126, 198],
  hexagon: [-90, -30, 30, 90, 150, 210],
};

/** 星形內半徑相對外半徑的比例：太小會太尖銳、太大會看起來接近十邊形，0.45 是視覺上「像星星」的常見取值 */
const STAR_INNER_RATIO = 0.45;
const STAR_POINTS = 5;

/** 依形狀＋外框中心/半徑算出這個形狀的多邊形頂點（內容座標）；"circle" 回傳 null，呼叫端改用
 * `<ellipse>`／`ctx.ellipse` 畫圓（圓不是多邊形，沒有頂點可言）。"rect" 雖然也有回傳值（四個角），
 * 但畫布渲染／匯出圖片目前仍用原本的 `<rect>`／`fillRect`／`strokeRect`（比較簡單、也不用改
 * 既有的矩形專屬邏輯），這裡回傳完整定義只是讓這個函式對每種形狀都行為一致，供未來需要「矩形也走
 * 多邊形路徑」時使用（例如統一的點擊測試）。rx/ry 各自對應外框半寬／半高，形狀本身以此橢圓縮放
 * （不是永遠正圓/正多邊形）——想要正圓/正星形等比例，靠呼叫端在拖曳繪製/縮放時鎖 rx===ry（見
 * MapViewPage.tsx 的 Shift 鎖比例說明），這個函式本身不強制等比 */
export function getRoomShapePoints(shape: RoomShape, cx: number, cy: number, rx: number, ry: number): { x: number; y: number }[] | null {
  if (shape === "circle") return null;
  if (shape === "star") {
    const points: { x: number; y: number }[] = [];
    const step = 360 / (STAR_POINTS * 2);
    for (let i = 0; i < STAR_POINTS * 2; i++) {
      const angleDeg = -90 + i * step;
      const angle = (angleDeg * Math.PI) / 180;
      const scale = i % 2 === 0 ? 1 : STAR_INNER_RATIO;
      points.push({ x: cx + Math.cos(angle) * rx * scale, y: cy + Math.sin(angle) * ry * scale });
    }
    return points;
  }
  const angles = SHAPE_VERTEX_ANGLES[shape] ?? SHAPE_VERTEX_ANGLES.rect!;
  return angles.map((deg) => {
    const angle = (deg * Math.PI) / 180;
    return { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
  });
}

export const ROOM_SHAPES: { type: RoomShape; labelKey: TranslationKey }[] = [
  { type: "rect", labelKey: "roomShape.rect" },
  { type: "circle", labelKey: "roomShape.circle" },
  { type: "triangle", labelKey: "roomShape.triangle" },
  { type: "pentagon", labelKey: "roomShape.pentagon" },
  { type: "hexagon", labelKey: "roomShape.hexagon" },
  { type: "star", labelKey: "roomShape.star" },
];
