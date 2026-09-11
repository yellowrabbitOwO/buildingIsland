/** 陸地色彩停駐點（低地→高地→山峰），固定不受使用者調整——目前只開放調整海洋顏色（見 DEFAULT_SEA_COLOR）。
 * 相鄰停駐點刻意拉開明度／彩度差距（不只是換色相），等高線圖才看得出一階一階的分層，而不是
 * 幾種深淺相近的顏色糊在一起分不出高度（使用者反應顏色差異太小，這裡加大） */
const LAND_STOPS: { at: number; color: [number, number, number] }[] = [
  { at: 0.52, color: [0xb8, 0x7a, 0x36] }, // 低地（海平面交界，緊接著淺海之後）——加深加飽和，跟淺海／平原都拉開差距
  { at: 0.68, color: [0x8d, 0xa8, 0x52] }, // 平原——轉成明確的草綠，不再跟低地一樣偏黃褐
  { at: 0.85, color: [0xd9, 0xbc, 0x82] }, // 高地——調亮調暖，跟平原、山峰都有明顯落差
  { at: 1, color: [0xfa, 0xf9, 0xf5] }, // 山峰——趨近純白，跟高地的落差是全段最大的
];

export const DEFAULT_SEA_COLOR = "#2f7ca0";

/** 灰階 0~255 對應「高度」訊號 -100（最深海溝）~100（最高山峰），128 正好是海平面（高度 0）——
 * 陸地／海面下用同一條色帶＋同一個灰階值域表示，筆刷畫的目標灰階只是換算方式不同，色帶不需要另外切換 */
export const SEA_LEVEL_GRAY = 128;

/** 依海平面上下切出「等高線地形圖」風格的色帶：一律用 discrete（階梯式）取樣，
 * 讓相鄰高度落在同一個色塊、邊界分明，比照真實地形圖的分層設色，而非平滑漸層。
 * 海面下也分四層（深淵→深海→大陸棚→淺海），跟陸地的四層對稱，兩者才有足夠的層次可以分辨；
 * 深淺全部從使用者選的海洋顏色算出（越深越暗），陸地色階固定不可調 */
const CONTOUR_BANDS = 14;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function darken(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c * (1 - amount))) as [number, number, number];
}

function lighten(rgb: [number, number, number], amount: number): [number, number, number] {
  return rgb.map((c) => Math.round(c + (255 - c) * amount)) as [number, number, number];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildRamp(seaColor: string): { at: number; color: [number, number, number] }[] {
  const sea = hexToRgb(seaColor);
  return [
    { at: 0, color: darken(sea, 0.55) }, // 深淵
    { at: 0.17, color: darken(sea, 0.32) }, // 深海
    { at: 0.34, color: darken(sea, 0.12) }, // 大陸棚
    { at: 0.48, color: lighten(sea, 0.15) }, // 淺海（銜接海岸線）
    ...LAND_STOPS,
  ];
}

function sampleRamp(ramp: { at: number; color: [number, number, number] }[], t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < ramp.length - 1; i++) {
    const a = ramp[i];
    const b = ramp[i + 1];
    if (clamped >= a.at && clamped <= b.at) {
      const span = b.at - a.at || 1;
      const localT = (clamped - a.at) / span;
      return [
        lerp(a.color[0], b.color[0], localT),
        lerp(a.color[1], b.color[1], localT),
        lerp(a.color[2], b.color[2], localT),
      ];
    }
  }
  return ramp[ramp.length - 1].color;
}

/** 取樣成 SVG <feFuncR/G/B type="discrete"> 需要的 tableValues 字串（0~1 之間，逗號分隔）。
 * 灰階來源圖的 R/G/B 三個 channel 數值相同，各自套用不同的 discrete table 就能把同一個灰階值
 * 映射成不同的階梯狀輸出顏色——discrete（而非 table 的平滑內插）會讓相鄰高度落在同一個色塊，
 * 呈現等高線地形圖那種一階一階、邊界分明的分層設色風格。
 * SVG 規格裡 discrete 是把輸入 0~1 切成 steps 個等寬區間，每個區間對應 tableValues 裡同一個值，
 * 取樣點要用「區間中點」((i+0.5)/steps) 而不是頭尾對齊的 i/(steps-1)，才會跟瀏覽器實際分桶的
 * 位置對齊，色帶邊界才會落在預期的高度上 */
export function heightRampTableValues(seaColor: string = DEFAULT_SEA_COLOR, steps = CONTOUR_BANDS): { r: string; g: string; b: string } {
  const ramp = buildRamp(seaColor);
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const [cr, cg, cb] = sampleRamp(ramp, t);
    r.push(cr / 255);
    g.push(cg / 255);
    b.push(cb / 255);
  }
  const fmt = (arr: number[]) => arr.map((v) => v.toFixed(3)).join(" ");
  return { r: fmt(r), g: fmt(g), b: fmt(b) };
}

/** 匯出成圖片用：直接在 canvas 像素資料上套用跟 HeightMapImage 的 SVG feComponentTransfer 濾鏡
 * 完全一樣的離散色帶（見上面 heightRampTableValues 的說明），把畫布上已經畫好的灰階高度圖原地
 * 轉成等高線地形圖顏色——SVG 濾鏡只在畫面上顯示時套用，匯出的圖片是純像素圖，沒有濾鏡可以掛，
 * 要匯出正確顏色只能自己重算一次同一套色帶查表 */
export function applyHeightRampToCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, seaColor: string = DEFAULT_SEA_COLOR): void {
  const ramp = buildRamp(seaColor);
  const steps = CONTOUR_BANDS;
  const table: [number, number, number][] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    table.push(sampleRamp(ramp, t));
  }
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] / 255;
    const bin = Math.min(steps - 1, Math.floor(gray * steps));
    const [r, g, b] = table[bin];
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}
