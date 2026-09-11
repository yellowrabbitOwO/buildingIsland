import type { FloorPlanSymbolType } from "../../data/types";
import type { TranslationKey } from "../../i18n";

/** 符號固定內容座標尺寸，不隨畫布縮放而維持螢幕大小——平面圖符號代表實際傢俱／門窗在圖上
 * 應該有的比例大小，縮放整張圖時應該跟牆、房間一樣等比縮放，不是像編輯手柄那樣要維持固定螢幕大小 */
export const SYMBOL_SIZE = 32;

/** 常見傢俱／門窗符號的候選清單，供符號工具的選擇面板列出；順序就是面板顯示順序 */
export const FLOOR_PLAN_SYMBOL_TYPES: { type: FloorPlanSymbolType; labelKey: TranslationKey }[] = [
  { type: "door", labelKey: "symbolType.door" },
  { type: "window", labelKey: "symbolType.window" },
  { type: "bed", labelKey: "symbolType.bed" },
  { type: "sofa", labelKey: "symbolType.sofa" },
  { type: "table", labelKey: "symbolType.table" },
  { type: "chair", labelKey: "symbolType.chair" },
  { type: "stairs", labelKey: "symbolType.stairs" },
  { type: "sink", labelKey: "symbolType.sink" },
];

const STROKE = "var(--text)";

/** 每種符號的線稿畫法：都以原點 (0,0) 為中心，供外層 <g transform="translate(x,y) rotate(角度)">
 * 統一定位／旋轉，圖示本身不需要知道自己實際被放在畫布的哪裡 */
function DoorIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <line x1={0} y1={0} x2={0} y2={-s} stroke={STROKE} strokeWidth={2} />
      <path d={`M ${s} 0 A ${s} ${s} 0 0 0 0 ${-s}`} fill="none" stroke={STROKE} strokeWidth={1} strokeDasharray="2 3" />
      <line x1={0} y1={0} x2={s} y2={0} stroke={STROKE} strokeWidth={2} />
    </>
  );
}

function WindowIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <rect x={-s / 2} y={-4} width={s} height={8} fill="var(--bg)" stroke={STROKE} strokeWidth={1.5} />
      <line x1={-s / 2} y1={0} x2={s / 2} y2={0} stroke={STROKE} strokeWidth={1} />
    </>
  );
}

function BedIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <rect x={-s / 2} y={-s * 0.7} width={s} height={s * 1.4} rx={2} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <rect x={-s / 2 + 4} y={-s * 0.7 + 4} width={s - 8} height={s * 0.32} rx={2} fill="none" stroke={STROKE} strokeWidth={1} />
      <line x1={-s / 2} y1={s * 0.15} x2={s / 2} y2={s * 0.15} stroke={STROKE} strokeWidth={1} />
    </>
  );
}

function SofaIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <rect x={-s / 2} y={-s * 0.35} width={s} height={s * 0.7} rx={4} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <rect x={-s / 2} y={-s * 0.55} width={s} height={s * 0.25} rx={3} fill="none" stroke={STROKE} strokeWidth={1} />
    </>
  );
}

function TableIcon() {
  const s = SYMBOL_SIZE;
  return <rect x={-s / 2} y={-s / 3} width={s} height={s * 0.66} rx={2} fill="none" stroke={STROKE} strokeWidth={1.5} />;
}

function ChairIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <rect x={-s * 0.3} y={-s * 0.3} width={s * 0.6} height={s * 0.6} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <line x1={-s * 0.3} y1={-s * 0.3} x2={s * 0.3} y2={-s * 0.3} stroke={STROKE} strokeWidth={3} />
    </>
  );
}

function StairsIcon() {
  const s = SYMBOL_SIZE;
  const steps = [0, 1, 2, 3, 4];
  return (
    <>
      {steps.map((i) => {
        const y = -s / 2 + (i / (steps.length - 1)) * s;
        return <line key={i} x1={-s / 2} y1={y} x2={s / 2} y2={y} stroke={STROKE} strokeWidth={1.5} />;
      })}
      <path d={`M ${-s * 0.15} ${s * 0.1} L 0 ${-s * 0.35} L ${s * 0.15} ${s * 0.1}`} fill="none" stroke={STROKE} strokeWidth={1.5} />
    </>
  );
}

function SinkIcon() {
  const s = SYMBOL_SIZE;
  return (
    <>
      <rect x={-s / 2} y={-s * 0.3} width={s} height={s * 0.6} rx={4} fill="none" stroke={STROKE} strokeWidth={1.5} />
      <ellipse cx={0} cy={0} rx={s * 0.3} ry={s * 0.18} fill="none" stroke={STROKE} strokeWidth={1} />
    </>
  );
}

const ICONS: Record<FloorPlanSymbolType, () => React.ReactNode> = {
  door: DoorIcon,
  window: WindowIcon,
  bed: BedIcon,
  sofa: SofaIcon,
  table: TableIcon,
  chair: ChairIcon,
  stairs: StairsIcon,
  sink: SinkIcon,
};

/** 依符號類型畫出對應線稿；未定位／未旋轉，呼叫端自己包一層 transform */
export function FloorPlanSymbolIcon({ type }: { type: FloorPlanSymbolType }) {
  const Icon = ICONS[type];
  return <Icon />;
}

/** 匯出成圖片用：跟上面各個 Icon 元件畫的是同一個形狀（座標比例照抄），只是換成 Canvas 2D API——
 * 畫布圖片沒有 SVG 可以掛，匯出時得用 canvas 原生指令重畫一次。呼叫前 ctx 應該已經
 * translate/rotate 到符號自己的位置／角度，這裡只在乎以原點為中心怎麼畫 */
export function drawFloorPlanSymbolToCanvas(ctx: CanvasRenderingContext2D, type: FloorPlanSymbolType, strokeColor: string, bgColor: string): void {
  const s = SYMBOL_SIZE;
  ctx.strokeStyle = strokeColor;
  ctx.fillStyle = "transparent";
  switch (type) {
    case "door": {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -s);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, s, -Math.PI / 2, 0);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(s, 0);
      ctx.stroke();
      break;
    }
    case "window": {
      ctx.fillStyle = bgColor;
      ctx.lineWidth = 1.5;
      ctx.fillRect(-s / 2, -4, s, 8);
      ctx.strokeRect(-s / 2, -4, s, 8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-s / 2, 0);
      ctx.lineTo(s / 2, 0);
      ctx.stroke();
      break;
    }
    case "bed": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s / 2, -s * 0.7, s, s * 1.4);
      ctx.lineWidth = 1;
      ctx.strokeRect(-s / 2 + 4, -s * 0.7 + 4, s - 8, s * 0.32);
      ctx.beginPath();
      ctx.moveTo(-s / 2, s * 0.15);
      ctx.lineTo(s / 2, s * 0.15);
      ctx.stroke();
      break;
    }
    case "sofa": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s / 2, -s * 0.35, s, s * 0.7);
      ctx.lineWidth = 1;
      ctx.strokeRect(-s / 2, -s * 0.55, s, s * 0.25);
      break;
    }
    case "table": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s / 2, -s / 3, s, s * 0.66);
      break;
    }
    case "chair": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-s * 0.3, -s * 0.3);
      ctx.lineTo(s * 0.3, -s * 0.3);
      ctx.stroke();
      break;
    }
    case "stairs": {
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const y = -s / 2 + (i / 4) * s;
        ctx.beginPath();
        ctx.moveTo(-s / 2, y);
        ctx.lineTo(s / 2, y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.1);
      ctx.lineTo(0, -s * 0.35);
      ctx.lineTo(s * 0.15, s * 0.1);
      ctx.stroke();
      break;
    }
    case "sink": {
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-s / 2, -s * 0.3, s, s * 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.3, s * 0.18, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
}
