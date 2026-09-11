import type { ManuscriptBlock, ManuscriptDoc, ManuscriptRun } from "./manuscriptIR";
import type { ScriptLineType } from "../../components/script/scriptLineTypes";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** 這個檔案裡的函式沒收到 t 時的預設行為：固定顯示中文，與這批函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

// pdfmake 用 pt，app 存的是 CSS px，換算比照 exportDocx.ts 的既有慣例（*0.75）
const PX_TO_PT = 0.75;
// pdfmake 預設 A4 直向、每邊 40pt 邊界，內容寬度約 515pt——劇本各 lineType 的邊界比例（見
// theme.css:248-282）沒有真正的頁寬可以換算百分比，抓這個當基準折算成固定縮排值，跟 exportDocx.ts
// 的 CONTENT_WIDTH_TWIP 是同一個目的、只是單位不同
const CONTENT_WIDTH_PT = 515;

let pdfMakeSingleton: any;
let fontsRegistered = false;

/** pdfmake 的瀏覽器 bundle 很重（含 pdfkit），加上這次要嵌入的兩份 CJK 字型檔各 7MB，
 * 一律動態載入、只有真的按下「下載 PDF」才會抓，不要打進主 bundle */
async function loadPdfMake(): Promise<any> {
  if (pdfMakeSingleton) return pdfMakeSingleton;
  const mod = await import("pdfmake/build/pdfmake");
  pdfMakeSingleton = (mod as any).default ?? mod;
  return pdfMakeSingleton;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const FONT_NAME = "NotoSansTC";

/** 字型檔只需要真的匯出 PDF 時抓一次；CJK 字型通常沒有斜體變體，italics/bolditalics
 * 直接指到同一份正常字重的檔案（不會有真的斜體效果，但至少不會因為指定的字型變體不存在而出錯） */
async function ensureFontsRegistered(pdfMake: any): Promise<void> {
  if (fontsRegistered) return;
  const [regularBuf, boldBuf] = await Promise.all([
    fetch("/fonts/NotoSansTC-Regular.ttf").then((r) => r.arrayBuffer()),
    fetch("/fonts/NotoSansTC-Bold.ttf").then((r) => r.arrayBuffer()),
  ]);
  const vfs = {
    "NotoSansTC-Regular.ttf": arrayBufferToBase64(regularBuf),
    "NotoSansTC-Bold.ttf": arrayBufferToBase64(boldBuf),
  };
  if (typeof pdfMake.addVirtualFileSystem === "function") pdfMake.addVirtualFileSystem(vfs);
  else pdfMake.vfs = vfs;
  pdfMake.fonts = {
    [FONT_NAME]: {
      normal: "NotoSansTC-Regular.ttf",
      bold: "NotoSansTC-Bold.ttf",
      italics: "NotoSansTC-Regular.ttf",
      bolditalics: "NotoSansTC-Bold.ttf",
    },
  };
  fontsRegistered = true;
}

function hexToRgba(rgba: string): { hex: string } | undefined {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/.exec(rgba);
  if (!m) return undefined;
  const [, rs, gs, bs, as] = m;
  const alpha = as !== undefined ? parseFloat(as) : 1;
  const blend = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  const r = blend(parseInt(rs, 10));
  const g = blend(parseInt(gs, 10));
  const b = blend(parseInt(bs, 10));
  return { hex: "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("") };
}

/** 一個 run 拆成 pdfmake 的 inline text 節點；hardBreak（run.text 內嵌的 "\n"）pdfmake 的
 * text 字串本身就支援換行，不用特別拆節點 */
function runToTextNode(run: ManuscriptRun): Record<string, unknown> {
  const node: Record<string, unknown> = { text: run.text };
  if (run.bold) node.bold = true;
  if (run.italic) node.italics = true;
  const decorations: string[] = [];
  if (run.underline) decorations.push("underline");
  if (run.strike) decorations.push("lineThrough");
  if (decorations.length > 0) node.decoration = decorations;
  if (run.code) node.font = FONT_NAME; // 沒有內嵌等寬字型，至少維持可讀
  if (run.color) node.color = run.color;
  if (run.highlight) {
    const blended = hexToRgba(run.highlight);
    if (blended) node.background = blended.hex;
  }
  if (run.fontSize) node.fontSize = Math.round(run.fontSize * PX_TO_PT);
  if (run.href) {
    node.link = run.href;
    node.color = node.color ?? "#0563c1";
    node.decoration = ["underline"];
  }
  return node;
}

function runsToTextNode(runs: ManuscriptRun[]): Record<string, unknown> {
  return { text: runs.map(runToTextNode) };
}

const HEADING_SIZES = [24, 20, 18, 16, 14, 13];

/** 劇本各 lineType 的排版規則，跟 theme.css:248-282／exportDocx.ts 的 scriptLineParagraphOptions
 * 是同一套規則、換算成 pdfmake 的 margin/alignment 寫法 */
function scriptLineToNode(lineType: ScriptLineType, runs: ManuscriptRun[]): Record<string, unknown> {
  const uppercase = lineType === "sceneHeading" || lineType === "character" || lineType === "transition";
  const effectiveRuns = uppercase ? runs.map((r) => ({ ...r, text: r.text.toUpperCase() })) : runs;
  const node = runsToTextNode(effectiveRuns) as Record<string, unknown> & { text: unknown[] };
  switch (lineType) {
    case "sceneHeading":
      node.bold = true;
      node.margin = [0, 12, 0, 4];
      break;
    case "character":
      node.margin = [Math.round(CONTENT_WIDTH_PT * 0.35), 10, 0, 0];
      break;
    case "parenthetical":
      node.italics = true;
      node.margin = [Math.round(CONTENT_WIDTH_PT * 0.28), 0, Math.round(CONTENT_WIDTH_PT * (1 - 0.28 - 0.45)), 0];
      break;
    case "dialogue":
      node.margin = [Math.round(CONTENT_WIDTH_PT * 0.2), 0, Math.round(CONTENT_WIDTH_PT * (1 - 0.2 - 0.6)), 0];
      break;
    case "transition":
      node.alignment = "right";
      break;
    case "centered":
      node.alignment = "center";
      break;
  }
  return node;
}

const SUPPORTED_IMAGE_PREFIX = /^data:image\/(png|jpe?g);base64,/;

function blockToContent(block: ManuscriptBlock, t: TFn): Record<string, unknown> {
  switch (block.kind) {
    case "heading": {
      const node = runsToTextNode(block.runs) as Record<string, unknown>;
      node.fontSize = HEADING_SIZES[block.level - 1];
      node.bold = true;
      node.margin = [0, 10, 0, 6];
      if (block.align) node.alignment = block.align;
      return node;
    }
    case "paragraph": {
      const node = runsToTextNode(block.runs) as Record<string, unknown>;
      node.margin = [0, 0, 0, 6];
      if (block.align) node.alignment = block.align;
      return node;
    }
    case "scriptLine":
      return scriptLineToNode(block.lineType, block.runs);
    case "bulletList":
      return { ul: block.items.map((item) => ({ stack: item.map((b) => blockToContent(b, t)) })) };
    case "orderedList":
      return { ol: block.items.map((item) => ({ stack: item.map((b) => blockToContent(b, t)) })) };
    case "blockquote":
      return { stack: block.blocks.map((b) => blockToContent(b, t)), margin: [16, 4, 0, 4], italics: true, color: "#555555" };
    case "horizontalRule":
      return { canvas: [{ type: "line", x1: 0, y1: 4, x2: CONTENT_WIDTH_PT, y2: 4, lineWidth: 1, lineColor: "#888888" }], margin: [0, 8, 0, 8] };
    case "codeBlock":
      return { text: block.text, background: "#f2f2f2", margin: [4, 4, 4, 4] };
    case "table": {
      const colCount = Math.max(...block.rows.map((r) => r.cells.reduce((sum, c) => sum + c.colspan, 0)), 1);
      const body: unknown[][] = [];
      const rowSpanFill: (number | undefined)[] = new Array(colCount).fill(undefined);
      for (const row of block.rows) {
        const outRow: unknown[] = [];
        let col = 0;
        for (const cell of row.cells) {
          while (rowSpanFill[col]) {
            outRow.push({});
            col++;
          }
          const cellNode: Record<string, unknown> = {
            stack: cell.blocks.length > 0 ? cell.blocks.map((b) => blockToContent(b, t)) : [{ text: "" }],
          };
          if (cell.header) cellNode.fillColor = "#eeeeee";
          if (cell.colspan > 1) cellNode.colSpan = cell.colspan;
          if (cell.rowspan > 1) cellNode.rowSpan = cell.rowspan;
          outRow.push(cellNode);
          for (let i = 1; i < cell.colspan; i++) outRow.push({});
          if (cell.rowspan > 1) rowSpanFill[col] = cell.rowspan - 1;
          col += cell.colspan;
        }
        body.push(outRow);
        for (let i = 0; i < colCount; i++) {
          if (rowSpanFill[i]) rowSpanFill[i] = (rowSpanFill[i] as number) - 1 || undefined;
        }
      }
      return { table: { body, widths: new Array(colCount).fill("*") }, margin: [0, 4, 0, 8] };
    }
    case "image": {
      if (!SUPPORTED_IMAGE_PREFIX.test(block.src)) {
        return { text: t("exportMarkdown.unsupportedImageFormat"), italics: true, color: "#888888" };
      }
      return { image: block.src, fit: [CONTENT_WIDTH_PT, 700], margin: [0, 4, 0, 4] };
    }
  }
}

export async function buildPdfBlob(doc: ManuscriptDoc, t: TFn = fallbackT): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  await ensureFontsRegistered(pdfMake);

  const content: unknown[] = [
    { text: doc.title, fontSize: 22, bold: true, alignment: "center", margin: [0, 0, 0, 4] },
    ...(doc.author ? [{ text: doc.author, alignment: "center", color: "#666666", margin: [0, 0, 0, 16] }] : []),
    ...doc.blocks.map((b) => blockToContent(b, t)),
  ];

  const docDefinition = {
    content,
    defaultStyle: { font: FONT_NAME },
    pageMargins: [40, 40, 40, 40],
  };

  const pdfDocGenerator = pdfMake.createPdf(docDefinition);
  return pdfDocGenerator.getBlob();
}

/** 極簡的一頁 PDF：標題＋滿版置中圖片——給地圖／關係圖／分支敘事圖這類視覺化內容的「嵌入 PDF」
 * 選項用，不建立新的 ManuscriptBlock 種類，直接組 pdfmake docDefinition */
export async function buildImagePdfBlob(title: string, author: string | undefined, imageDataUrl: string): Promise<Blob> {
  const pdfMake = await loadPdfMake();
  await ensureFontsRegistered(pdfMake);

  const content: unknown[] = [
    { text: title, fontSize: 22, bold: true, alignment: "center", margin: [0, 0, 0, 4] },
    ...(author ? [{ text: author, alignment: "center", color: "#666666", margin: [0, 0, 0, 16] }] : []),
    { image: imageDataUrl, fit: [CONTENT_WIDTH_PT, 700], alignment: "center" },
  ];

  const docDefinition = {
    content,
    defaultStyle: { font: FONT_NAME },
    pageMargins: [40, 40, 40, 40],
  };

  const pdfDocGenerator = pdfMake.createPdf(docDefinition);
  return pdfDocGenerator.getBlob();
}
