import { SEA_LEVEL_GRAY } from "./heightColorRamp";

/** 單一筆刷 dab 的疊加透明度：小於 1 讓「多畫幾次會更貼近目標高度，但不會超過」的漸進效果成立，
 * 太接近 1 會讓單次點擊就直接跳到目標值，失去筆刷的柔和手感 */
const DAB_ALPHA = 0.5;

/** 每個 dab 用幾個取樣點描出不規則輪廓；點數越多形狀越細緻，但也越接近正圓，12 點已經足夠看出手繪感 */
const BLOB_POINTS = 12;
/** 各取樣點半徑相對基準半徑的隨機範圍（0.7~1.3），讓筆刷邊緣有進有出，不是完美圓形 */
const BLOB_MIN_FACTOR = 0.7;
const BLOB_MAX_FACTOR = 1.3;

export function clearToSea(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = `rgb(${SEA_LEVEL_GRAY},${SEA_LEVEL_GRAY},${SEA_LEVEL_GRAY})`;
  ctx.fillRect(0, 0, width, height);
}

/** 把已存的高度圖 dataURL 畫回畫布；沒有 dataURL 時呼叫端應改呼叫 clearToSea */
export function loadHeightMapIntoCanvas(canvas: HTMLCanvasElement, dataUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = () => reject(new Error("高度圖載入失敗"));
    img.src = dataUrl;
  });
}

/** 把畫布內容縮放到新尺寸，用於調整地圖尺寸時保留既有地形（直接拉伸，不維持長寬比——
 * 尺寸本來就是使用者自己選的，拉伸伸縮是使用者可預期的結果） */
export function resizeHeightMapDataUrl(dataUrl: string, newWidth: number, newHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("無法取得畫布內容"));
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("高度圖載入失敗"));
    img.src = dataUrl;
  });
}

/** 讀取使用者選取的圖片檔案（匯入地形／底圖參考共用）：用 object URL 而非 FileReader 讀成 dataURL
 * 再指定給 <img>，避免大圖片先整個轉成 base64 字串常駐記憶體——載入完就馬上釋放 URL */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("圖片載入失敗"));
    };
    img.src = url;
  });
}

/** 把圖片拉伸畫進畫布（不維持長寬比，跟 resizeHeightMapDataUrl 一致，尺寸本來就是地圖既有的畫布尺寸）；
 * grayscale 時額外把每個像素轉成同亮度的灰階（R=G=B=亮度）——高度圖的等高線濾鏡假設輸入是灰階，
 * 三個色版數值相同才會套用同一條等高線，彩色圖片直接套用的話三個色版會各自套用不同色階表，
 * 顏色會整個跑掉，不是想要的「把圖片內容解讀成地形高度」效果 */
export function drawImageToCanvas(canvas: HTMLCanvasElement, img: HTMLImageElement, options?: { grayscale?: boolean }): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  if (!options?.grayscale) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    d[i] = gray;
    d[i + 1] = gray;
    d[i + 2] = gray;
  }
  ctx.putImageData(imgData, 0, 0);
}

/** 描出一個以 (cx,cy) 為中心、基準半徑 radius 的不規則輪廓路徑（不呼叫 fill/stroke，交給呼叫端決定）。
 * 每個取樣點半徑各自隨機微調＋用中點二次貝茲曲線連接，讓邊緣呈手繪筆刷般凹凸不平，而不是正圓 */
function blobPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < BLOB_POINTS; i++) {
    const angle = (i / BLOB_POINTS) * Math.PI * 2;
    const r = radius * (BLOB_MIN_FACTOR + Math.random() * (BLOB_MAX_FACTOR - BLOB_MIN_FACTOR));
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(points[BLOB_POINTS - 1], points[0]);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  for (let i = 0; i < BLOB_POINTS; i++) {
    const cur = points[i];
    const next = points[(i + 1) % BLOB_POINTS];
    const m = mid(cur, next);
    ctx.quadraticCurveTo(cur.x, cur.y, m.x, m.y);
  }
  ctx.closePath();
}

/** 畫一個筆刷 dab：中心 targetGray、依 falloff（0~1，內圈到邊緣的羽化範圍）淡出到透明的不規則色塊。
 * erasing 時 targetGray 固定為海平面灰階值——「擦除」等同「把這裡畫回海平面」，不需要另一個目標高度。
 * 漸層半徑刻意比基準半徑大（BLOB_MAX_FACTOR 倍），確保不規則輪廓超出基準半徑的凸起部分仍落在
 * 漸層還有顏色的範圍內，凹凸兩側都看得出形狀，而不是只有凹陷的一側可見 */
export function paintDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  falloff: number,
  targetGray: number,
  erasing: boolean
): void {
  const gray = Math.round(erasing ? SEA_LEVEL_GRAY : targetGray);
  const safeRadius = Math.max(1, radiusPx);
  const gradientRadius = safeRadius * BLOB_MAX_FACTOR;
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, gradientRadius);
  const innerStop = Math.min(0.98, Math.max(0, falloff));
  gradient.addColorStop(0, `rgba(${gray},${gray},${gray},${DAB_ALPHA})`);
  gradient.addColorStop(innerStop, `rgba(${gray},${gray},${gray},${DAB_ALPHA})`);
  gradient.addColorStop(1, `rgba(${gray},${gray},${gray},0)`);
  ctx.fillStyle = gradient;
  blobPath(ctx, x, y, safeRadius);
  ctx.fill();
}

/** 沿拖曳路徑等距補間呼叫 paintDab，避免游標移動快時筆畫斷開成一顆顆點 */
export function paintDabsAlong(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radiusPx: number,
  falloff: number,
  targetGray: number,
  erasing: boolean
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, radiusPx * 0.25);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    paintDab(ctx, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radiusPx, falloff, targetGray, erasing);
  }
}

/** 修剪筆刷的模糊取樣半徑（像素）：鄰域範圍固定不隨筆刷半徑縮放，只是局部箱型模糊的取樣窗大小 */
const TRIM_KERNEL = 2;

/** 修剪筆刷：對筆刷範圍內每個像素依鄰近像素平均值調整，strength 為正＝磨平（往平均值靠攏）、
 * 為負＝銳利化（往離平均值更遠的方向推，等同反向的非銳化遮罩），數值不分正負都依 falloff 中心到
 * 邊緣遞減。用來把不規則筆刷／隨機生成留下的鋸齒狀邊緣磨平，或反過來加強稜角分明的地形細節——
 * 這是目前唯一需要讀取既有像素值的筆刷（getImageData/putImageData），跟其餘筆刷都只用
 * 合成疊色（不讀像素）不同，因為這兩種效果本質上都要看鄰居的值來比較，無法只靠疊加半透明色塊做到。
 * 兩種效果共用同一條公式（next = src + (avg-src)*t）：t 為正時把像素拉向鄰域平均值（磨平），
 * t 為負時效果反向變成把像素推離平均值（銳利化），不需要另外分支處理。
 *
 * sampleSource：銳利化（strength<0）沿拖曳路徑會疊出大量互相重疊的 dab，若每次都拿「上一個
 * dab 已經銳利化過」的結果當這次的取樣來源，銳利化這種發散效果（把像素推離鄰域平均值）會一路
 * 疊加下去、越推越遠，放開滑鼠看到的就是失控的雜訊。傳入 sampleSource（畫線起點時凍結的快照）
 * 讓同一筆拖曳裡的每個 dab 都從同一份沒被修改過的像素取樣，效果就不會隨重疊次數發散；
 * 磨平（strength>=0）是收斂效果，疊越多次只會更平滑，不會失控，所以維持讀取即時畫布 */
export function trimDab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusPx: number,
  strength: number,
  sampleSource?: CanvasRenderingContext2D
): void {
  const safeRadius = Math.max(2, radiusPx);
  const left = Math.max(0, Math.floor(x - safeRadius - TRIM_KERNEL));
  const top = Math.max(0, Math.floor(y - safeRadius - TRIM_KERNEL));
  const right = Math.min(ctx.canvas.width, Math.ceil(x + safeRadius + TRIM_KERNEL));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(y + safeRadius + TRIM_KERNEL));
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return;
  const imgData = ctx.getImageData(left, top, w, h);
  // 沒有另外指定取樣來源時，複製一份當模糊取樣來源，避免邊算邊用到這次已經改過的像素
  const src = sampleSource ? sampleSource.getImageData(left, top, w, h).data : imgData.data.slice();
  const dst = imgData.data;
  const sampleGray = (px: number, py: number) => {
    const cx = Math.min(w - 1, Math.max(0, px));
    const cy = Math.min(h - 1, Math.max(0, py));
    return src[(cy * w + cx) * 4];
  };
  const effectiveStrength = Math.min(1, Math.max(-1, strength));
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = left + px - x;
      const dy = top + py - y;
      const dist = Math.hypot(dx, dy);
      if (dist > safeRadius) continue;
      let sum = 0;
      let count = 0;
      for (let ky = -TRIM_KERNEL; ky <= TRIM_KERNEL; ky++) {
        for (let kx = -TRIM_KERNEL; kx <= TRIM_KERNEL; kx++) {
          sum += sampleGray(px + kx, py + ky);
          count++;
        }
      }
      const avg = sum / count;
      const t = (1 - dist / safeRadius) * effectiveStrength;
      const idx = (py * w + px) * 4;
      const next = src[idx] + (avg - src[idx]) * t;
      dst[idx] = next;
      dst[idx + 1] = next;
      dst[idx + 2] = next;
    }
  }
  ctx.putImageData(imgData, left, top);
}

/** 沿拖曳路徑等距補間呼叫 trimDab，避免游標移動快時修剪範圍斷開 */
export function trimDabsAlong(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radiusPx: number,
  strength: number,
  sampleSource?: CanvasRenderingContext2D
): void {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, radiusPx * 0.4);
  const steps = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    trimDab(ctx, from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, radiusPx, strength, sampleSource);
  }
}

/** 清空回海平面後，用同一個 paintDab 沿隨機漫步路徑疊出一塊有機形狀的隨機大陸/群島——
 * 重用手繪筆刷本身的邏輯，不需要另外引入雜訊演算法或新的相依套件 */
export function generateRandomTerrain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  clearToSea(ctx, width, height);
  const baseRadius = Math.min(width, height) * 0.12;
  const count = 40 + Math.floor(Math.random() * 40);
  let x = width / 2 + (Math.random() - 0.5) * width * 0.2;
  let y = height / 2 + (Math.random() - 0.5) * height * 0.2;
  for (let i = 0; i < count; i++) {
    const radius = baseRadius * (0.5 + Math.random());
    const gray = 150 + Math.random() * 90;
    paintDab(ctx, x, y, radius, 0.5, gray, false);
    const angle = Math.random() * Math.PI * 2;
    // 少數步伐拉大距離，讓地形偶爾斷開成獨立的離岸小島，而不是永遠連成一整塊
    const step = baseRadius * (Math.random() < 0.15 ? 3 : 0.6);
    x = Math.min(width, Math.max(0, x + Math.cos(angle) * step));
    y = Math.min(height, Math.max(0, y + Math.sin(angle) * step));
  }
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}
