import type { FloorPlanLandmarkIcon } from "../../data/types";

/** 地標圖示固定內容座標尺寸，跟 FloorPlanSymbols.tsx 的 SYMBOL_SIZE 概念上各自獨立（雖然目前
 * 數值相同），縮放整張圖時跟牆、房間一樣等比縮放，不是像編輯手柄那樣要維持固定螢幕大小 */
export const LANDMARK_ICON_SIZE = 32;

/** 內建地標圖示類型的種子資料，依聚落／建築地標／自然地貌／遺跡四大類排序，最後多一個「通用」——
 * 這個沒有 type（builtInKey 留空），退回「通用圖釘＋文字」的畫法，文字預設是名稱首字（「通」），
 * 也可以在管理頁另外設定 customText 顯示別的文字／符號。只給 ensureBuiltInLandmarkIconTypes
 * （src/data/repositories/landmarkIconType.ts）在建立世界／回填缺少的內建類型時讀取，UI 不會
 * 直接拿這份清單畫選單（選單改讀 Dexie 的即時清單，因為使用者可以改名稱、也可以自己新增更多類型） */
export const BUILTIN_LANDMARK_ICON_SEEDS: { type?: FloorPlanLandmarkIcon; label: string }[] = [
  { type: "town", label: "城鎮／村莊" },
  { type: "landmark", label: "地標建築／紀念碑" },
  { type: "castle", label: "城堡／要塞" },
  { type: "temple", label: "神殿／廟宇" },
  { type: "mountain", label: "山脈" },
  { type: "forest", label: "森林" },
  { type: "water", label: "水域" },
  { type: "cave", label: "洞穴" },
  { type: "ruins", label: "遺跡" },
  { label: "通用" },
];

/** 圖示線條顏色沒有另外設定時的預設值——地標點可以個別自訂圖示顏色（見 FloorPlanLandmarkPoint.color），
 * 這裡只是「使用者完全沒選過顏色」時的退回值 */
export const DEFAULT_LANDMARK_ICON_COLOR = "var(--text)";

/** 每種圖示的線稿畫法：都以原點 (0,0) 為中心，供外層 <g transform="translate(x,y)"> 統一定位，
 * 圖示本身不需要知道自己實際被放在畫布的哪裡（地標點不支援旋轉，比符號簡單一階）。顏色透過
 * color prop 傳入而不是寫死，讓地標點可以個別套用自訂顏色 */
function TownIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <rect x={-s * 0.5} y={s * 0.05} width={s * 0.32} height={s * 0.3} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path d={`M ${-s * 0.56} ${s * 0.05} L ${-s * 0.34} ${-s * 0.25} L ${-s * 0.12} ${s * 0.05} Z`} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <rect x={s * 0.06} y={-s * 0.08} width={s * 0.44} height={s * 0.43} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path d={`M ${-s * 0.02} ${-s * 0.08} L ${s * 0.28} ${-s * 0.42} L ${s * 0.58} ${-s * 0.08} Z`} fill="none" stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function LandmarkIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <path
        d={`M ${-s * 0.12} ${s * 0.4} L ${-s * 0.16} ${-s * 0.1} L 0 ${-s * 0.5} L ${s * 0.16} ${-s * 0.1} L ${s * 0.12} ${s * 0.4} Z`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <line x1={-s * 0.34} y1={s * 0.4} x2={s * 0.34} y2={s * 0.4} stroke={STROKE} strokeWidth={2} />
    </>
  );
}

function CastleIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <rect x={-s * 0.42} y={-s * 0.05} width={s * 0.84} height={s * 0.45} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path
        d={`M ${-s * 0.42} ${-s * 0.05} V ${-s * 0.28} H ${-s * 0.26} V ${-s * 0.16} H ${-s * 0.08} V ${-s * 0.28} H ${s * 0.08} V ${-s * 0.16} H ${s * 0.26} V ${-s * 0.28} H ${s * 0.42} V ${-s * 0.05}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <rect x={-s * 0.09} y={s * 0.12} width={s * 0.18} height={s * 0.28} fill="none" stroke={STROKE} strokeWidth={1} />
    </>
  );
}

function TempleIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <path d={`M ${-s * 0.52} ${-s * 0.08} L 0 ${-s * 0.42} L ${s * 0.52} ${-s * 0.08} Z`} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <line x1={-s * 0.44} y1={s * 0.38} x2={s * 0.44} y2={s * 0.38} stroke={STROKE} strokeWidth={2} />
      {[-0.32, -0.12, 0.12, 0.32].map((f) => (
        <line key={f} x1={s * f} y1={-s * 0.02} x2={s * f} y2={s * 0.32} stroke={STROKE} strokeWidth={1.5} />
      ))}
    </>
  );
}

function MountainIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <path d={`M ${-s * 0.5} ${s * 0.32} L ${-s * 0.12} ${-s * 0.28} L ${s * 0.14} ${s * 0.32} Z`} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path d={`M ${-s * 0.02} ${s * 0.32} L ${s * 0.28} ${-s * 0.1} L ${s * 0.5} ${s * 0.32} Z`} fill="none" stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function ForestIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  const tree = (cx: number, scale: number) => (
    <g key={cx}>
      <path
        d={`M ${cx} ${-s * 0.42 * scale} L ${cx - s * 0.24 * scale} ${s * 0.12 * scale} L ${cx + s * 0.24 * scale} ${s * 0.12 * scale} Z`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <line x1={cx} y1={s * 0.12 * scale} x2={cx} y2={s * 0.34 * scale} stroke={STROKE} strokeWidth={1.5} />
    </g>
  );
  return (
    <>
      {tree(-s * 0.3, 0.8)}
      {tree(s * 0.06, 1)}
    </>
  );
}

function WaterIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  const wave = (y: number) => `M ${-s * 0.5} ${y} Q ${-s * 0.25} ${y - s * 0.12} 0 ${y} Q ${s * 0.25} ${y + s * 0.12} ${s * 0.5} ${y}`;
  return (
    <>
      <path d={wave(-s * 0.15)} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path d={wave(s * 0.15)} fill="none" stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function CaveIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <path
        d={`M ${-s * 0.46} ${s * 0.38} L ${-s * 0.46} 0 A ${s * 0.46} ${s * 0.46} 0 0 1 ${s * 0.46} 0 L ${s * 0.46} ${s * 0.38}`}
        fill="none"
        stroke={STROKE}
        strokeWidth={1.5}
      />
      <path d={`M ${-s * 0.24} ${s * 0.38} L ${-s * 0.24} ${s * 0.02} A ${s * 0.24} ${s * 0.24} 0 0 1 ${s * 0.24} ${s * 0.02} L ${s * 0.24} ${s * 0.38} Z`} fill={STROKE} opacity={0.55} />
    </>
  );
}

function RuinsIcon({ color: STROKE }: { color: string }) {
  const s = LANDMARK_ICON_SIZE;
  return (
    <>
      <path d={`M ${-s * 0.34} ${s * 0.4} L ${-s * 0.34} ${-s * 0.3} L ${-s * 0.2} ${-s * 0.42} L ${-s * 0.2} ${s * 0.4}`} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <path d={`M ${s * 0.08} ${s * 0.4} L ${s * 0.08} ${-s * 0.08} L ${s * 0.22} ${-s * 0.18} L ${s * 0.22} ${s * 0.4}`} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <line x1={-s * 0.48} y1={s * 0.4} x2={s * 0.48} y2={s * 0.4} stroke={STROKE} strokeWidth={2} />
    </>
  );
}

/** 通用圖釘：使用者自訂的地標圖示類型沒有上傳圖片時的退回畫法（圓形「釘頭」＋尖端），
 * 釘頭中心固定在 GENERIC_PIN_HEAD_CY，供呼叫端在同樣位置疊一個文字（類型名稱首字）*/
export const GENERIC_PIN_HEAD_CY = -LANDMARK_ICON_SIZE * 0.1;
const GENERIC_PIN_HEAD_R = LANDMARK_ICON_SIZE * 0.3;
function GenericPinIcon({ color, fillColor = "none" }: { color: string; fillColor?: string }) {
  const s = LANDMARK_ICON_SIZE;
  const r = GENERIC_PIN_HEAD_R;
  const cy = GENERIC_PIN_HEAD_CY;
  return (
    <path
      d={`M ${-r} ${cy} A ${r} ${r} 0 1 1 ${r * 0.999} ${cy} L 0 ${s * 0.42} Z`}
      fill={fillColor}
      stroke={color}
      strokeWidth={1.5}
      strokeLinejoin="round"
    />
  );
}

const ICONS: Record<FloorPlanLandmarkIcon, (props: { color: string }) => React.ReactNode> = {
  town: TownIcon,
  landmark: LandmarkIcon,
  castle: CastleIcon,
  temple: TempleIcon,
  mountain: MountainIcon,
  forest: ForestIcon,
  water: WaterIcon,
  cave: CaveIcon,
  ruins: RuinsIcon,
};

/** 依解析後的地標圖示資訊畫出對應線稿；未定位，呼叫端自己包一層 transform。
 * 優先序：customImage（使用者上傳的圖）→ builtInKey（9 種手繪線稿之一）→ 通用圖釘＋
 * initial（類型名稱首字，置於圖釘釘頭中心）。color 未提供時退回 DEFAULT_LANDMARK_ICON_COLOR */
export function FloorPlanLandmarkIconGraphic({
  builtInKey,
  customImage,
  color = DEFAULT_LANDMARK_ICON_COLOR,
  textColor,
  fillColor,
  initial,
}: {
  builtInKey?: FloorPlanLandmarkIcon;
  customImage?: string;
  color?: string;
  /** 通用圖釘釘頭裡 initial 文字的顏色；未提供時退回 color（線條同色，維持舊版外觀） */
  textColor?: string;
  /** 通用圖釘釘頭的填滿顏色；未提供時維持鏤空（維持舊版外觀） */
  fillColor?: string;
  initial?: string;
}) {
  if (customImage) {
    const s = LANDMARK_ICON_SIZE;
    return <image href={customImage} x={-s / 2} y={-s / 2} width={s} height={s} preserveAspectRatio="xMidYMid slice" />;
  }
  if (builtInKey) {
    const Icon = ICONS[builtInKey];
    return <Icon color={color} />;
  }
  return (
    <>
      <GenericPinIcon color={color} fillColor={fillColor} />
      {initial && (
        <text
          x={0}
          y={GENERIC_PIN_HEAD_CY}
          fontSize={LANDMARK_ICON_SIZE * 0.32}
          textAnchor="middle"
          dominantBaseline="central"
          fill={textColor ?? color}
          style={{ userSelect: "none" }}
        >
          {initial}
        </text>
      )}
    </>
  );
}

/** 內建 9 種圖示的 Canvas 2D 畫法：跟上面各個 Icon 元件畫的是同一個形狀（座標比例照抄）。
 * 呼叫前 ctx 應該已經 translate 到圖示自己的位置，這裡只在乎以原點為中心怎麼畫 */
function drawBuiltInLandmarkIconToCanvas(ctx: CanvasRenderingContext2D, type: FloorPlanLandmarkIcon, strokeColor: string): void {
  const s = LANDMARK_ICON_SIZE;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = "transparent";
  ctx.setLineDash([]);
  switch (type) {
    case "town": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.5, s * 0.05, s * 0.32, s * 0.3);
      ctx.beginPath();
      ctx.moveTo(-s * 0.56, s * 0.05);
      ctx.lineTo(-s * 0.34, -s * 0.25);
      ctx.lineTo(-s * 0.12, s * 0.05);
      ctx.closePath();
      ctx.stroke();
      ctx.strokeRect(s * 0.06, -s * 0.08, s * 0.44, s * 0.43);
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, -s * 0.08);
      ctx.lineTo(s * 0.28, -s * 0.42);
      ctx.lineTo(s * 0.58, -s * 0.08);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "landmark": {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.12, s * 0.4);
      ctx.lineTo(-s * 0.16, -s * 0.1);
      ctx.lineTo(0, -s * 0.5);
      ctx.lineTo(s * 0.16, -s * 0.1);
      ctx.lineTo(s * 0.12, s * 0.4);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, s * 0.4);
      ctx.lineTo(s * 0.34, s * 0.4);
      ctx.stroke();
      break;
    }
    case "castle": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.42, -s * 0.05, s * 0.84, s * 0.45);
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -s * 0.05);
      ctx.lineTo(-s * 0.42, -s * 0.28);
      ctx.lineTo(-s * 0.26, -s * 0.28);
      ctx.lineTo(-s * 0.26, -s * 0.16);
      ctx.lineTo(-s * 0.08, -s * 0.16);
      ctx.lineTo(-s * 0.08, -s * 0.28);
      ctx.lineTo(s * 0.08, -s * 0.28);
      ctx.lineTo(s * 0.08, -s * 0.16);
      ctx.lineTo(s * 0.26, -s * 0.16);
      ctx.lineTo(s * 0.26, -s * 0.28);
      ctx.lineTo(s * 0.42, -s * 0.28);
      ctx.lineTo(s * 0.42, -s * 0.05);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeRect(-s * 0.09, s * 0.12, s * 0.18, s * 0.28);
      break;
    }
    case "temple": {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.52, -s * 0.08);
      ctx.lineTo(0, -s * 0.42);
      ctx.lineTo(s * 0.52, -s * 0.08);
      ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.44, s * 0.38);
      ctx.lineTo(s * 0.44, s * 0.38);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      for (const f of [-0.32, -0.12, 0.12, 0.32]) {
        ctx.beginPath();
        ctx.moveTo(s * f, -s * 0.02);
        ctx.lineTo(s * f, s * 0.32);
        ctx.stroke();
      }
      break;
    }
    case "mountain": {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.32);
      ctx.lineTo(-s * 0.12, -s * 0.28);
      ctx.lineTo(s * 0.14, s * 0.32);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.02, s * 0.32);
      ctx.lineTo(s * 0.28, -s * 0.1);
      ctx.lineTo(s * 0.5, s * 0.32);
      ctx.closePath();
      ctx.stroke();
      break;
    }
    case "forest": {
      ctx.lineWidth = 1.5;
      for (const [cx, scale] of [
        [-s * 0.3, 0.8],
        [s * 0.06, 1],
      ] as const) {
        ctx.beginPath();
        ctx.moveTo(cx, -s * 0.42 * scale);
        ctx.lineTo(cx - s * 0.24 * scale, s * 0.12 * scale);
        ctx.lineTo(cx + s * 0.24 * scale, s * 0.12 * scale);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, s * 0.12 * scale);
        ctx.lineTo(cx, s * 0.34 * scale);
        ctx.stroke();
      }
      break;
    }
    case "water": {
      ctx.lineWidth = 1.5;
      for (const y of [-s * 0.15, s * 0.15]) {
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, y);
        ctx.quadraticCurveTo(-s * 0.25, y - s * 0.12, 0, y);
        ctx.quadraticCurveTo(s * 0.25, y + s * 0.12, s * 0.5, y);
        ctx.stroke();
      }
      break;
    }
    case "cave": {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.46, s * 0.38);
      ctx.lineTo(-s * 0.46, 0);
      ctx.arc(0, 0, s * 0.46, Math.PI, 0, false);
      ctx.lineTo(s * 0.46, s * 0.38);
      ctx.stroke();
      ctx.fillStyle = strokeColor;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(-s * 0.24, s * 0.38);
      ctx.lineTo(-s * 0.24, s * 0.02);
      ctx.arc(0, s * 0.02, s * 0.24, Math.PI, 0, false);
      ctx.lineTo(s * 0.24, s * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    }
    case "ruins": {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, s * 0.4);
      ctx.lineTo(-s * 0.34, -s * 0.3);
      ctx.lineTo(-s * 0.2, -s * 0.42);
      ctx.lineTo(-s * 0.2, s * 0.4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s * 0.08, s * 0.4);
      ctx.lineTo(s * 0.08, -s * 0.08);
      ctx.lineTo(s * 0.22, -s * 0.18);
      ctx.lineTo(s * 0.22, s * 0.4);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.48, s * 0.4);
      ctx.lineTo(s * 0.48, s * 0.4);
      ctx.stroke();
      break;
    }
  }
}

/** 通用圖釘的 Canvas 2D 畫法，跟 GenericPinIcon 是同一個形狀；fillColor 省略時維持鏤空（跟舊版一致） */
function drawGenericPinToCanvas(ctx: CanvasRenderingContext2D, color: string, fillColor?: string): void {
  const s = LANDMARK_ICON_SIZE;
  const r = GENERIC_PIN_HEAD_R;
  const cy = GENERIC_PIN_HEAD_CY;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(0, cy, r, Math.PI, 0, false);
  ctx.lineTo(0, s * 0.42);
  ctx.closePath();
  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
  ctx.stroke();
}

/** 匯出成圖片用：跟 FloorPlanLandmarkIconGraphic 是同一套「customImage → builtInKey → 通用
 * 圖釘＋首字」優先序，只是換成 Canvas 2D API。customImage 要傳已經預先載入好的 HTMLImageElement
 * （呼叫端在迴圈開始前用 loadImageFromDataUrl 載一次、多個地標點共用同一張圖不用重複載入）。
 * 呼叫前 ctx 應該已經 translate 到圖示自己的位置，這裡只在乎以原點為中心怎麼畫 */
export function drawFloorPlanLandmarkIconToCanvas(
  ctx: CanvasRenderingContext2D,
  options: {
    builtInKey?: FloorPlanLandmarkIcon;
    customImage?: HTMLImageElement;
    color: string;
    /** 通用圖釘釘頭裡 initial 文字的顏色；未提供時退回 color */
    textColor?: string;
    /** 通用圖釘釘頭的填滿顏色；未提供時維持鏤空 */
    fillColor?: string;
    initial?: string;
  }
): void {
  const s = LANDMARK_ICON_SIZE;
  if (options.customImage) {
    ctx.drawImage(options.customImage, -s / 2, -s / 2, s, s);
    return;
  }
  if (options.builtInKey) {
    drawBuiltInLandmarkIconToCanvas(ctx, options.builtInKey, options.color);
    return;
  }
  drawGenericPinToCanvas(ctx, options.color, options.fillColor);
  if (options.initial) {
    ctx.fillStyle = options.textColor ?? options.color;
    ctx.font = `${Math.round(LANDMARK_ICON_SIZE * 0.32)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(options.initial, 0, GENERIC_PIN_HEAD_CY);
  }
}
