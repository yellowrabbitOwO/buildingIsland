import { DraggableNode } from "../common/GraphPrimitives";
import { rotatePoint, type BoxHandle, type FpLocalBox } from "../../data/floorPlan";

/** 統一變形外框：任何平面圖物件選取後顯示的縮放/旋轉控制框，物件的實際幾何換算成
 * FpLocalBox（本地未旋轉的中心點＋寬高＋旋轉角，見 data/floorPlan.ts）後餵給這個共用元件畫控制點，
 * 不同物件家族各自的「拖到哪裡該怎麼寫回真正的資料欄位」邏輯留給呼叫端（MapViewPage.tsx）處理——
 * 這個元件只負責畫框、算控制點世界座標、把拖曳事件轉發出去，不知道也不在乎背後是房間還是符號 */

const HANDLE_SIZE_SCREEN = 8;
const ROTATE_HANDLE_DIST_SCREEN = 22;
const ROTATE_HANDLE_R_SCREEN = 6;

const HANDLE_CURSOR: Record<BoxHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

export function FloorPlanTransformBox({
  box,
  viewScale,
  showResizeHandles = true,
  onResizeDrag,
  onResizeDragEnd,
  onRotateDrag,
  onRotateDragEnd,
}: {
  box: FpLocalBox;
  /** 目前畫布縮放比例：手把大小／虛線間距都要除以這個值換算成內容座標尺寸，螢幕上才會維持固定
   * 大小（沿用房間/符號原本手刻手把的既有做法），呼叫端直接把自己已經算好的 viewScale 傳進來，
   * 不透過 CanvasScaleContext（該 context 沒有匯出，直接吃 prop 比較單純） */
  viewScale: number;
  /** Family D（牆／標註）不畫 8 個縮放控制點——線段沒有厚度資料可調，既有的端點拖曳已經能做到
   * 等效的「調整長度」，這裡只保留旋轉手把，避免呈現出看起來能用、實際上没有意義的縮放控制點 */
  showResizeHandles?: boolean;
  onResizeDrag?: (handle: BoxHandle, worldPos: { x: number; y: number }) => void;
  onResizeDragEnd?: (handle: BoxHandle) => void;
  onRotateDrag: (worldPos: { x: number; y: number }) => void;
  onRotateDragEnd: () => void;
}) {
  const hs = HANDLE_SIZE_SCREEN / viewScale;
  const rd = ROTATE_HANDLE_DIST_SCREEN / viewScale;
  const rr = ROTATE_HANDLE_R_SCREEN / viewScale;
  const { cx, cy, w, h, rotation } = box;
  const halfW = w / 2;
  const halfH = h / 2;
  const center = { x: cx, y: cy };
  const handlePositions: { key: BoxHandle; x: number; y: number }[] = [
    { key: "nw", x: -halfW, y: -halfH },
    { key: "n", x: 0, y: -halfH },
    { key: "ne", x: halfW, y: -halfH },
    { key: "e", x: halfW, y: 0 },
    { key: "se", x: halfW, y: halfH },
    { key: "s", x: 0, y: halfH },
    { key: "sw", x: -halfW, y: halfH },
    { key: "w", x: -halfW, y: 0 },
  ];
  const rotateHandleLocal = { x: 0, y: -halfH - rd };
  const rotateHandleWorld = rotatePoint({ x: cx + rotateHandleLocal.x, y: cy + rotateHandleLocal.y }, center, rotation);
  return (
    <g style={{ pointerEvents: "none" }}>
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <rect
          x={cx - halfW}
          y={cy - halfH}
          width={w}
          height={h}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1 / viewScale}
          strokeDasharray={`${4 / viewScale} ${4 / viewScale}`}
        />
        <line x1={cx} y1={cy - halfH} x2={cx} y2={cy - halfH - rd} stroke="var(--accent)" strokeWidth={1 / viewScale} />
        {showResizeHandles &&
          handlePositions.map((hp) => {
            const worldPos = rotatePoint({ x: cx + hp.x, y: cy + hp.y }, center, rotation);
            return (
              <DraggableNode
                key={hp.key}
                id={hp.key}
                x={worldPos.x}
                y={worldPos.y}
                onDrag={(_, pos) => onResizeDrag?.(hp.key, pos)}
                onDragEnd={() => onResizeDragEnd?.(hp.key)}
              >
                <rect
                  x={cx + hp.x - hs / 2}
                  y={cy + hp.y - hs / 2}
                  width={hs}
                  height={hs}
                  fill="var(--accent)"
                  stroke="var(--bg)"
                  strokeWidth={1 / viewScale}
                  style={{ cursor: HANDLE_CURSOR[hp.key], pointerEvents: "all" }}
                />
              </DraggableNode>
            );
          })}
      </g>
      <DraggableNode id="rotate" x={rotateHandleWorld.x} y={rotateHandleWorld.y} onDrag={(_, pos) => onRotateDrag(pos)} onDragEnd={onRotateDragEnd}>
        <circle
          cx={rotateHandleWorld.x}
          cy={rotateHandleWorld.y}
          r={rr}
          fill="var(--accent)"
          stroke="var(--bg)"
          strokeWidth={1 / viewScale}
          style={{ cursor: "grab", pointerEvents: "all" }}
        />
      </DraggableNode>
    </g>
  );
}
