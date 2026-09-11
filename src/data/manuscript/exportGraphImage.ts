import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** svgToRaster 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** GraphPrimitives.tsx 的 PannableCanvas 用到、需要在離線輸出時解析成實際色碼的 CSS 變數——
 * 沒有掛在文件上的 <img>/canvas 讀不到 var(--x)，離線序列化前要自己把這幾個解析成目前的實際值 */
const CSS_VARS_TO_RESOLVE = ["--border", "--bg-hover", "--bg", "--text", "--text-muted", "--text-faint", "--accent", "--danger"];

function resolveCssVarsStyle(): string {
  const style = getComputedStyle(document.documentElement);
  const lines = CSS_VARS_TO_RESOLVE.map((name) => `${name}: ${style.getPropertyValue(name).trim()};`);
  return `:root { ${lines.join(" ")} }`;
}

/** 把 PannableCanvas 目前畫面上的 <svg> 離線重繪成完整內容範圍（不受目前 pan/zoom 影響）的
 * PNG——複製 svgRef.current、把 viewBox 換成完整內容大小、把外層帶 pan/zoom transform 的 <g>
 * 重設回單位變換，並注入一段 <style> 把用到的 CSS 變數解析成目前實際色碼（見 CSS_VARS_TO_RESOLVE），
 * 再序列化成 SVG 字串→ blob URL → Image → 離屏 canvas，一次產出 PNG blob 與可直接嵌入 PDF 的 dataURL */
export async function svgToRaster(
  svg: SVGSVGElement,
  contentWidth: number,
  contentHeight: number,
  scale = 2,
  t: TFn = fallbackT
): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const outputWidth = Math.round(contentWidth * scale);
  const outputHeight = Math.round(contentHeight * scale);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${contentWidth} ${contentHeight}`);
  clone.setAttribute("width", String(outputWidth));
  clone.setAttribute("height", String(outputHeight));
  clone.removeAttribute("style");

  // PannableCanvas 目前的 pan/zoom 狀態掛在直接子層唯一的 <g transform="translate(...) scale(...)">
  // 上（見 GraphPrimitives.tsx:411），重設成單位變換讓輸出涵蓋完整內容而不是目前可視範圍
  for (const child of Array.from(clone.children)) {
    if (child.tagName.toLowerCase() === "g" && child.getAttribute("transform")?.startsWith("translate")) {
      child.setAttribute("transform", "translate(0,0) scale(1)");
    }
  }

  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = resolveCssVarsStyle();
  clone.insertBefore(styleEl, clone.firstChild);

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(t("imageExportDialog.svgImageLoadFailed")));
      image.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d")!;
    // 畫布背景先填目前主題的背景色，避免深色模式下較淺的文字/線條在透明背景輸出後放到白底環境（例如
    // PDF 頁面）裡對比度不足——輸出結果維持跟畫面上看到的一致，而不是「看情境變色」
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    ctx.fillStyle = bg || "#ffffff";
    ctx.fillRect(0, 0, outputWidth, outputHeight);
    ctx.drawImage(img, 0, 0, outputWidth, outputHeight);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(t("imageExportDialog.pngGenerationFailed")))), "image/png");
    });
    const dataUrl = canvas.toDataURL("image/png");
    return { blob, dataUrl, width: outputWidth, height: outputHeight };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
