/** 地圖裝飾：比例尺／指北針的純視覺 SVG 圖形，供 MapViewPage 搭配 DraggableNode 使用（位置由外部傳入，
 * 這裡不處理拖曳，只負責畫）。文字加白／深色描邊（依主題背景色）是為了在任何地形顏色上都看得清楚。 */

import type { CompassStyle, FloorPlanStyle } from "../../data/types";
import { resolveStrokeColor, resolveStrokeDasharray } from "../../data/floorPlanStyle";

/** 依中心點、半徑、角度（0＝正上方，順時針）算出圓周上一點的座標 */
function pointAt(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

const LABEL_TEXT_STYLE = {
  paintOrder: "stroke",
  stroke: "var(--bg)",
  strokeWidth: 3,
  strokeLinejoin: "round",
} as const;

/** 指北針統一入口，依 style 分流給三種款式各自的畫法（未設定時視為 "classic"，即這個功能上線前
 * 就存在的唯一款式，讓舊資料不用轉檔）。PNG 匯出（MapViewPage.tsx 的 handleExportImage）用 Canvas 2D
 * 手繪同樣三種款式，兩邊的角度／半徑數字要保持一致，畫布顯示跟匯出圖片才會對得起來 */
export function CompassGraphic({
  x,
  y,
  rotation,
  labels,
  style = "classic",
}: {
  x: number;
  y: number;
  rotation: number;
  labels: { n: string; e: string; s: string; w: string };
  style?: CompassStyle;
}) {
  if (style === "rose") return <CompassRoseGraphic x={x} y={y} rotation={rotation} labels={labels} />;
  if (style === "arrow") return <CompassArrowGraphic x={x} y={y} rotation={rotation} labels={labels} />;
  return <CompassClassicGraphic x={x} y={y} rotation={rotation} labels={labels} />;
}

function CompassClassicGraphic({
  x,
  y,
  rotation,
  labels,
}: {
  x: number;
  y: number;
  rotation: number;
  labels: { n: string; e: string; s: string; w: string };
}) {
  const R = 26;
  const dirs: { angle: number; label: string; primary?: boolean }[] = [
    { angle: 0, label: labels.n, primary: true },
    { angle: 90, label: labels.e },
    { angle: 180, label: labels.s },
    { angle: 270, label: labels.w },
  ];
  return (
    <g>
      <circle cx={x} cy={y} r={R} fill="var(--bg-elevated)" fillOpacity={0.85} stroke="var(--border)" strokeWidth={1.5} />
      {dirs.map(({ angle, label, primary }) => {
        const a = angle + rotation;
        const tip = pointAt(x, y, R - 5, a);
        const labelPos = pointAt(x, y, R + 13, a);
        return (
          <g key={angle}>
            <line x1={x} y1={y} x2={tip.x} y2={tip.y} stroke={primary ? "var(--accent)" : "var(--text-faint)"} strokeWidth={primary ? 2.5 : 1.5} />
            <text
              x={labelPos.x}
              y={labelPos.y}
              fontSize={12}
              fontWeight={primary ? 700 : 400}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--text)"
              style={LABEL_TEXT_STYLE}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** 八角羅盤玫瑰：4 個主方位長刺（南北東西）＋4 個對角短刺，每根刺是從中心點岔開兩側的細三角形，
 * 主方位跟對角分開兩種長度/寬度，視覺上才有「長短交錯」的羅盤玫瑰既定印象 */
function CompassRoseGraphic({
  x,
  y,
  rotation,
  labels,
}: {
  x: number;
  y: number;
  rotation: number;
  labels: { n: string; e: string; s: string; w: string };
}) {
  const spikeTriangle = (tipR: number, baseR: number, baseHalfWidthDeg: number, angle: number) => {
    const tip = pointAt(x, y, tipR, angle);
    const b1 = pointAt(x, y, baseR, angle - baseHalfWidthDeg);
    const b2 = pointAt(x, y, baseR, angle + baseHalfWidthDeg);
    return `${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`;
  };
  const cardinals: { angle: number; label: string; primary?: boolean }[] = [
    { angle: 0, label: labels.n, primary: true },
    { angle: 90, label: labels.e },
    { angle: 180, label: labels.s },
    { angle: 270, label: labels.w },
  ];
  const diagonals = [45, 135, 225, 315];
  return (
    <g>
      {diagonals.map((angle) => (
        <polygon key={angle} points={spikeTriangle(17, 3, 5, angle + rotation)} fill="var(--border)" />
      ))}
      {cardinals.map(({ angle, primary }) => (
        <polygon
          key={angle}
          points={spikeTriangle(30, 3, 7, angle + rotation)}
          fill={primary ? "var(--accent)" : "var(--text-faint)"}
        />
      ))}
      <circle cx={x} cy={y} r={3} fill="var(--text)" />
      {cardinals.map(({ angle, label, primary }) => {
        const labelPos = pointAt(x, y, 30 + 14, angle + rotation);
        return (
          <text
            key={angle}
            x={labelPos.x}
            y={labelPos.y}
            fontSize={12}
            fontWeight={primary ? 700 : 400}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--text)"
            style={LABEL_TEXT_STYLE}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

/** 簡約指北箭頭：只有一支指向北方的箭頭＋一個「北」字標籤，沒有圓底、沒有其他三個方位——
 * 給不想在地圖上放一個顯眼裝飾、只需要「哪邊是北」這個最基本資訊的使用者 */
function CompassArrowGraphic({
  x,
  y,
  rotation,
  labels,
}: {
  x: number;
  y: number;
  rotation: number;
  labels: { n: string; e: string; s: string; w: string };
}) {
  const tipR = 28;
  const baseR = 4;
  const tip = pointAt(x, y, tipR, rotation);
  const b1 = pointAt(x, y, baseR, rotation - 16);
  const b2 = pointAt(x, y, baseR, rotation + 16);
  const tail = pointAt(x, y, baseR, rotation + 180);
  const labelPos = pointAt(x, y, tipR + 13, rotation);
  return (
    <g>
      <line x1={tail.x} y1={tail.y} x2={x} y2={y} stroke="var(--text-faint)" strokeWidth={1.5} />
      <polygon points={`${tip.x},${tip.y} ${b1.x},${b1.y} ${b2.x},${b2.y}`} fill="var(--accent)" />
      <text
        x={labelPos.x}
        y={labelPos.y}
        fontSize={12}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--text)"
        style={LABEL_TEXT_STYLE}
      >
        {labels.n}
      </text>
    </g>
  );
}

export function ScaleBarGraphic({
  x,
  y,
  lengthPx,
  realDistance,
  unit,
}: {
  x: number;
  y: number;
  lengthPx: number;
  realDistance: number;
  unit: string;
}) {
  const tick = 6;
  return (
    <g>
      <line x1={x} y1={y} x2={x + lengthPx} y2={y} stroke="var(--text)" strokeWidth={2} />
      <line x1={x} y1={y - tick} x2={x} y2={y + tick} stroke="var(--text)" strokeWidth={2} />
      <line x1={x + lengthPx} y1={y - tick} x2={x + lengthPx} y2={y + tick} stroke="var(--text)" strokeWidth={2} />
      <text x={x + lengthPx / 2} y={y - tick - 5} fontSize={12} textAnchor="middle" fill="var(--text)" style={LABEL_TEXT_STYLE}>
        {realDistance} {unit}
      </text>
    </g>
  );
}

/** 依比例尺換算內容座標距離成實際距離文字，供量距離工具／尺規共用同一套換算，不需要各自重算一次 */
export function formatRealDistance(contentPx: number, calibration: { lengthPx: number; realDistance: number; unit: string }): string {
  const distance = (contentPx / calibration.lengthPx) * calibration.realDistance;
  const rounded = distance >= 100 || distance === 0 ? Math.round(distance) : Math.round(distance * 100) / 100;
  return `${rounded} ${calibration.unit}`;
}

/** 尺寸標註的標籤文字：地圖有設定比例尺（calibration）就換算成實際距離，平面圖多半是室內
 * 格局，不見得會另外設定地圖等級的比例尺，沒有時就直接顯示畫布像素距離，總比完全沒有數字好 */
export function formatDimensionLabel(contentPx: number, calibration?: { lengthPx: number; realDistance: number; unit: string }): string {
  if (calibration) return formatRealDistance(contentPx, calibration);
  return `${Math.round(contentPx)} px`;
}

/** 多邊形房間面積標籤：比例尺是「長度」的換算比例，面積要換算成實際單位得把比例平方
 * （邊長縮小 k 倍，面積就縮小 k² 倍）——沒設定比例尺時退回畫布像素平方，跟 formatDimensionLabel
 * 沒有比例尺時的退回方式一致 */
export function formatAreaLabel(pxArea: number, calibration?: { lengthPx: number; realDistance: number; unit: string }): string {
  if (!calibration) return `${Math.round(pxArea)} px²`;
  const scale = calibration.realDistance / calibration.lengthPx;
  const area = pxArea * scale * scale;
  const rounded = area >= 100 || area === 0 ? Math.round(area) : Math.round(area * 100) / 100;
  return `${rounded} ${calibration.unit}²`;
}

/** 量距離工具的視覺：A 點＋（有 B 點時）連線到 B 點並在中點標實際距離。只點了 A、還沒點 B 時
 * 只畫 A 點標記，供使用者確認起點位置 */
export function MeasureLineGraphic({
  a,
  b,
  label,
}: {
  a: { x: number; y: number };
  b?: { x: number; y: number } | null;
  label?: string;
}) {
  return (
    <g style={{ pointerEvents: "none" }}>
      <circle cx={a.x} cy={a.y} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} />
      {b && (
        <>
          <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="6 4" />
          <circle cx={b.x} cy={b.y} r={4} fill="var(--accent)" stroke="var(--bg)" strokeWidth={1.5} />
          {label && (
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 8}
              fontSize={13}
              fontWeight={700}
              textAnchor="middle"
              fill="var(--accent)"
              style={LABEL_TEXT_STYLE}
            >
              {label}
            </text>
          )}
        </>
      )}
    </g>
  );
}

/** 永久尺寸標註線（CAD 常見的標註樣式）：兩端加短短的垂直刻度、標籤沿垂直於線段的方向偏移顯示，
 * 不管線段本身是什麼角度都能看清楚——跟 MeasureLineGraphic（量距離工具的臨時預覽）外觀類似，
 * 差別是這個會永久存在圖上，且刻度／文字偏移方向會跟著線段角度算，不是固定水平 */
export function DimensionGraphic({
  x1,
  y1,
  x2,
  y2,
  label,
  selected,
  style,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  selected?: boolean;
  style?: FloorPlanStyle;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const tick = 5;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const color = resolveStrokeColor(style, selected ? "var(--accent)" : "var(--text-muted)");
  const dashArray = resolveStrokeDasharray(style);
  return (
    <g style={{ pointerEvents: "none" }}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={selected ? 2 : 1.5} strokeDasharray={dashArray} />
      <line x1={x1 - nx * tick} y1={y1 - ny * tick} x2={x1 + nx * tick} y2={y1 + ny * tick} stroke={color} strokeWidth={1.5} />
      <line x1={x2 - nx * tick} y1={y2 - ny * tick} x2={x2 + nx * tick} y2={y2 + ny * tick} stroke={color} strokeWidth={1.5} />
      <text x={midX + nx * 11} y={midY + ny * 11} fontSize={12} textAnchor="middle" dominantBaseline="middle" fill={color} style={LABEL_TEXT_STYLE}>
        {label}
      </text>
    </g>
  );
}
