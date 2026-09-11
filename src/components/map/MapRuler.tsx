/** 尺規本身的厚度（頂端／左側橫條的寬度），供 MapViewPage 算外層留白用 */
export const RULER_SIZE = 22;

/** 目標刻度間距（畫面像素）：抓一個「看起來不會太密也不會太疏」的間距，實際刻度值再用
 * niceStep 換算成乾淨的整數，不是每次都剛好等於這個值 */
const TARGET_TICK_SPACING_PX = 70;

/** 把任意正數換算成「看起來乾淨」的刻度間隔（1／2／5 × 10 的次方），
 * 跟大多數繪圖軟體的尺規／格線刻度算法一樣，避免刻度值出現 37、183 這種不好讀的數字 */
function niceStep(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const niceBase = base < 1.5 ? 1 : base < 3.5 ? 2 : base < 7.5 ? 5 : 10;
  return niceBase * 10 ** exp;
}

interface Tick {
  screen: number;
  label: string;
}

/** 算一個軸向（水平或垂直，用同一套邏輯，呼叫端決定要用 x 還是 y 的 view 分量）要畫哪些刻度：
 * 有比例尺校準時刻度間隔換算成乾淨的實際距離（例如每 10 公里一格），沒有校準時退回乾淨的
 * 內容座標像素數（例如每 100px 一格），視覺上都落在畫面上差不多的間距 */
function computeTicks(
  viewOffset: number,
  scale: number,
  screenLength: number,
  calibration?: { lengthPx: number; realDistance: number; unit: string }
): Tick[] {
  let contentStep: number;
  let formatTick: (contentPos: number) => string;
  if (calibration && calibration.realDistance > 0 && calibration.lengthPx > 0) {
    const pxPerUnit = calibration.lengthPx / calibration.realDistance;
    const rawUnitStep = TARGET_TICK_SPACING_PX / scale / pxPerUnit;
    const niceUnitStep = niceStep(rawUnitStep);
    contentStep = niceUnitStep * pxPerUnit;
    formatTick = (contentPos) => {
      const units = Math.round((contentPos / pxPerUnit) * 100) / 100;
      return `${units}${calibration.unit}`;
    };
  } else {
    contentStep = niceStep(TARGET_TICK_SPACING_PX / scale);
    formatTick = (contentPos) => `${Math.round(contentPos)}`;
  }

  const minContent = -viewOffset / scale;
  const maxContent = (screenLength - viewOffset) / scale;
  const start = Math.floor(minContent / contentStep) * contentStep;
  const ticks: Tick[] = [];
  // 保險上限，避免 contentStep 算出極端小值時陷入近乎無窮迴圈（理論上 niceStep 不會產生這種值，
  // 但畫布尺寸／縮放比例是使用者可調的，多一層防呆比較安心）
  for (let c = start, guard = 0; c <= maxContent && guard < 500; c += contentStep, guard++) {
    const screen = viewOffset + c * scale;
    ticks.push({ screen, label: formatTick(c) });
  }
  return ticks;
}

/** 仿 Photoshop 的畫布尺規：固定貼在畫布左上角外側，水平／垂直兩條刻度尺會隨目前的縮放平移
 * 即時更新刻度位置與數值——純顯示用，不接收互動，所以整個疊層都關掉 pointer events。
 * 有比例尺校準時刻度顯示實際距離，沒有時退回內容座標像素數（跟純 Photoshop 的像素尺規一樣） */
export function MapRulerOverlay({
  view,
  canvasWidth,
  canvasHeight,
  calibration,
}: {
  view: { x: number; y: number; scale: number };
  canvasWidth: number;
  canvasHeight: number;
  calibration?: { lengthPx: number; realDistance: number; unit: string };
}) {
  const xTicks = computeTicks(view.x, view.scale, canvasWidth, calibration).filter((t) => t.screen >= 0 && t.screen <= canvasWidth);
  const yTicks = computeTicks(view.y, view.scale, canvasHeight, calibration).filter((t) => t.screen >= 0 && t.screen <= canvasHeight);

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: canvasWidth + RULER_SIZE, height: canvasHeight + RULER_SIZE, pointerEvents: "none" }}>
      {/* 左上角，兩條尺規交界處的空白方塊 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: RULER_SIZE,
          height: RULER_SIZE,
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      />
      {/* 頂端水平尺規 */}
      <div
        style={{
          position: "absolute",
          left: RULER_SIZE,
          top: 0,
          width: canvasWidth,
          height: RULER_SIZE,
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {xTicks.map((t) => (
          <div key={t.screen} style={{ position: "absolute", left: t.screen, top: 0, bottom: 0, borderLeft: "1px solid var(--text-faint)" }}>
            <span style={{ fontSize: 9, color: "var(--text-muted)", marginLeft: 2, whiteSpace: "nowrap" }}>{t.label}</span>
          </div>
        ))}
      </div>
      {/* 左側垂直尺規 */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: RULER_SIZE,
          width: RULER_SIZE,
          height: canvasHeight,
          background: "var(--bg-elevated)",
          borderRight: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {yTicks.map((t) => (
          <div key={t.screen} style={{ position: "absolute", top: t.screen, left: 0, right: 0, borderTop: "1px solid var(--text-faint)" }}>
            <span
              style={{
                fontSize: 9,
                color: "var(--text-muted)",
                position: "absolute",
                top: 1,
                left: 1,
                transform: "rotate(-90deg)",
                transformOrigin: "left top",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
