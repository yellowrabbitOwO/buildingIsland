import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
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

// docx 的度量單位是 twip（1/20 pt）；app 存的是 CSS px，換算比照 exportPdf.ts 的 px→pt(*0.75) 慣例，
// 再乘 20 變 twip；字級（半點單位）額外再乘 2
const PX_TO_TWIP = 15; // 0.75 * 20
const PX_TO_HALF_PT = 1.5; // 0.75 * 2
// 劇本各 lineType 的邊界比例（見 theme.css:248-282）沒有真正的頁寬可以換算百分比，
// 抓一個常見的內文寬度基準（6.5in＝9360 twip）折算成固定縮排值
const CONTENT_WIDTH_TWIP = 9360;

const BODY_FONT = { eastAsia: "微軟正黑體" };
const SCRIPT_FONT = { ascii: "Courier New", eastAsia: "微軟正黑體" };

function hexNoHash(hex: string): string {
  return hex.replace("#", "");
}

/** highlight mark 存的是 rgba() 字串，docx 的 shading 沒有透明度概念，
 * 疊在白底上算出等效色碼（比照 exportEpub.ts／exportDocx.ts 共用的既有慣例說明） */
function rgbaToHex(rgba: string): string | undefined {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\)/.exec(rgba);
  if (!m) return undefined;
  const [, rs, gs, bs, as] = m;
  const alpha = as !== undefined ? parseFloat(as) : 1;
  const blend = (c: number) => Math.round(c * alpha + 255 * (1 - alpha));
  const r = blend(parseInt(rs, 10));
  const g = blend(parseInt(gs, 10));
  const b = blend(parseInt(bs, 10));
  return [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/** 一個 run 可能因為內嵌換行（hardBreak）而要拆成好幾個 TextRun，中間插入 break */
function runToChildren(run: ManuscriptRun, font: { ascii?: string; eastAsia?: string }): ParagraphChild[] {
  const segments = run.text.split("\n");
  const children: ParagraphChild[] = [];
  segments.forEach((segment, i) => {
    if (i > 0) children.push(new TextRun({ text: "", break: 1 }));
    if (segment === "") return;
    const highlightFill = run.highlight ? rgbaToHex(run.highlight) : undefined;
    const options: IRunOptions = {
      text: segment,
      bold: run.bold,
      italics: run.italic,
      strike: run.strike,
      underline: run.underline ? {} : undefined,
      font,
      color: run.color ? hexNoHash(run.color) : undefined,
      size: run.fontSize ? Math.round(run.fontSize * PX_TO_HALF_PT) : undefined,
      shading: highlightFill ? { type: ShadingType.CLEAR, fill: highlightFill } : undefined,
    };
    const textRun = new TextRun(options);
    children.push(run.href ? new ExternalHyperlink({ link: run.href, children: [textRun] }) : textRun);
  });
  return children;
}

function runsToChildren(runs: ManuscriptRun[], font: { ascii?: string; eastAsia?: string } = BODY_FONT): ParagraphChild[] {
  return runs.flatMap((r) => runToChildren(r, font));
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
] as const;

const SUPPORTED_IMAGE_TYPES: Record<string, "jpg" | "png" | "gif" | "bmp"> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/bmp": "bmp",
};

function parseDataUrl(src: string): { mime: string; base64: string } | undefined {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(src);
  if (!m) return undefined;
  return { mime: m[1], base64: m[2] };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = dataUrl;
  });
}

const MAX_IMAGE_WIDTH_PX = 500;

async function imageBlockToParagraph(src: string, t: TFn): Promise<Paragraph> {
  const parsed = parseDataUrl(src);
  const type = parsed ? SUPPORTED_IMAGE_TYPES[parsed.mime] : undefined;
  if (!parsed || !type) {
    return new Paragraph({ children: [new TextRun({ text: t("exportMarkdown.unsupportedImageFormat"), italics: true, color: "888888" })] });
  }
  const natural = await loadImageDimensions(src).catch(() => ({ width: MAX_IMAGE_WIDTH_PX, height: MAX_IMAGE_WIDTH_PX }));
  const scale = natural.width > MAX_IMAGE_WIDTH_PX ? MAX_IMAGE_WIDTH_PX / natural.width : 1;
  return new Paragraph({
    children: [
      new ImageRun({
        type,
        data: base64ToBytes(parsed.base64),
        transformation: { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) },
      }),
    ],
  });
}

/** 劇本各 lineType 對應的段落屬性，比照 theme.css:248-282 的視覺規則換算成 docx 的縮排／對齊／
 * 大寫（OOXML 沒有 text-transform，這裡直接把要顯示的文字轉大寫，不影響來源資料本身） */
function scriptLineParagraphOptions(lineType: ScriptLineType): { indent?: { left?: number; right?: number }; alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]; spacingBefore?: number; uppercase: boolean; bold: boolean; italic: boolean } {
  switch (lineType) {
    case "sceneHeading":
      return { uppercase: true, bold: true, italic: false, spacingBefore: 18 * PX_TO_TWIP };
    case "character":
      return { uppercase: true, bold: false, italic: false, indent: { left: Math.round(CONTENT_WIDTH_TWIP * 0.35) }, spacingBefore: 14 * PX_TO_TWIP };
    case "parenthetical":
      return {
        uppercase: false,
        bold: false,
        italic: true,
        indent: { left: Math.round(CONTENT_WIDTH_TWIP * 0.28), right: Math.round(CONTENT_WIDTH_TWIP * (1 - 0.28 - 0.45)) },
      };
    case "dialogue":
      return {
        uppercase: false,
        bold: false,
        italic: false,
        indent: { left: Math.round(CONTENT_WIDTH_TWIP * 0.2), right: Math.round(CONTENT_WIDTH_TWIP * (1 - 0.2 - 0.6)) },
      };
    case "transition":
      return { uppercase: true, bold: false, italic: false, alignment: AlignmentType.RIGHT };
    case "centered":
      return { uppercase: false, bold: false, italic: false, alignment: AlignmentType.CENTER };
    case "action":
    default:
      return { uppercase: false, bold: false, italic: false };
  }
}

/** 清單項目的第一個段落／標題／劇本行才需要掛項目符號或編號，項目裡其餘內容（例如巢狀清單）
 * 正常遞迴渲染即可；ORDERED_LIST_REFERENCE 是文件內所有 orderedList 共用的同一份編號設定
 * （見 buildDocxBlob 的 numbering config）——已知限制：同一份文件裡兩個不相鄰的 orderedList
 * 會共用同一組計數器接續編號，不會各自從 1 開始，成稿內容以敘事/劇本為主、少用多組獨立編號清單，
 * 這個簡化不影響大部分使用情境 */
type ListMarker = { kind: "bullet"; level: number } | { kind: "ordered"; level: number };
const ORDERED_LIST_REFERENCE = "manuscript-ordered-list";

function scriptLineToParagraph(lineType: ScriptLineType, runs: ManuscriptRun[], marker?: ListMarker, indentLeft = 0): Paragraph {
  const opts = scriptLineParagraphOptions(lineType);
  const effectiveRuns = opts.uppercase ? runs.map((r) => ({ ...r, text: r.text.toUpperCase() })) : runs;
  const indent = { left: (opts.indent?.left ?? 0) + indentLeft, right: opts.indent?.right };
  return new Paragraph({
    children: runsToChildren(
      effectiveRuns.map((r) => ({ ...r, bold: r.bold || opts.bold, italic: r.italic || opts.italic })),
      SCRIPT_FONT
    ),
    alignment: opts.alignment,
    indent: indent.left || indent.right ? indent : undefined,
    spacing: opts.spacingBefore ? { before: opts.spacingBefore } : undefined,
    bullet: marker?.kind === "bullet" ? { level: marker.level } : undefined,
    numbering: marker?.kind === "ordered" ? { reference: ORDERED_LIST_REFERENCE, level: marker.level } : undefined,
  });
}

/** ctx.marker 只套用在一個 block 陣列的「第一個」段落型 block（呼叫端負責只在需要的那一次傳入），
 * ctx.indentLevel 則是整條渲染路徑共用的縮排層級（blockquote 巢狀時累加），兩者關注點不同，
 * 分開兩個參數比塞進同一個物件更好理解 */
async function blockToElements(block: ManuscriptBlock, t: TFn, indentLeft = 0, marker?: ListMarker): Promise<(Paragraph | Table)[]> {
  switch (block.kind) {
    case "heading":
      return [
        new Paragraph({
          heading: HEADING_LEVELS[block.level - 1],
          alignment: block.align ? ALIGN_MAP[block.align] : undefined,
          indent: indentLeft ? { left: indentLeft } : undefined,
          children: runsToChildren(block.runs),
          bullet: marker?.kind === "bullet" ? { level: marker.level } : undefined,
          numbering: marker?.kind === "ordered" ? { reference: ORDERED_LIST_REFERENCE, level: marker.level } : undefined,
        }),
      ];
    case "paragraph":
      return [
        new Paragraph({
          alignment: block.align ? ALIGN_MAP[block.align] : undefined,
          indent: indentLeft ? { left: indentLeft } : undefined,
          children: runsToChildren(block.runs),
          bullet: marker?.kind === "bullet" ? { level: marker.level } : undefined,
          numbering: marker?.kind === "ordered" ? { reference: ORDERED_LIST_REFERENCE, level: marker.level } : undefined,
        }),
      ];
    case "scriptLine":
      return [scriptLineToParagraph(block.lineType, block.runs, marker, indentLeft)];
    case "bulletList":
      return (
        await Promise.all(
          block.items.map(async (item) => {
            const [first, ...rest] = item;
            if (!first) return [];
            const firstEls = await blockToElements(first, t, indentLeft, { kind: "bullet", level: marker ? marker.level + 1 : 0 });
            const restEls = (
              await Promise.all(
                rest.map((b) =>
                  b.kind === "bulletList" || b.kind === "orderedList"
                    ? blockToElements(b, t, indentLeft, marker)
                    : blockToElements(b, t, indentLeft)
                )
              )
            ).flat();
            return [...firstEls, ...restEls];
          })
        )
      ).flat();
    case "orderedList":
      return (
        await Promise.all(
          block.items.map(async (item) => {
            const [first, ...rest] = item;
            if (!first) return [];
            const firstEls = await blockToElements(first, t, indentLeft, { kind: "ordered", level: marker ? marker.level + 1 : 0 });
            const restEls = (
              await Promise.all(
                rest.map((b) =>
                  b.kind === "bulletList" || b.kind === "orderedList"
                    ? blockToElements(b, t, indentLeft, marker)
                    : blockToElements(b, t, indentLeft)
                )
              )
            ).flat();
            return [...firstEls, ...restEls];
          })
        )
      ).flat();
    case "blockquote":
      return (await Promise.all(block.blocks.map((b) => blockToElements(b, t, indentLeft + 720)))).flat();
    case "horizontalRule":
      return [new Paragraph({ border: { bottom: { style: "single", size: 6, color: "888888" } } })];
    case "codeBlock":
      return [
        new Paragraph({
          shading: { type: ShadingType.CLEAR, fill: "F2F2F2" },
          indent: indentLeft ? { left: indentLeft } : undefined,
          children: block.text.split("\n").flatMap((line, i) => {
            const run = new TextRun({ text: line, font: { ascii: "Consolas", eastAsia: "Consolas" } });
            return i === 0 ? [run] : [new TextRun({ text: "", break: 1 }), run];
          }),
        }),
      ];
    case "table": {
      const rows = await Promise.all(
        block.rows.map(async (row) => {
          const cells = await Promise.all(
            row.cells.map(async (cell) => {
              const children = (await Promise.all(cell.blocks.map((b) => blockToElements(b, t)))).flat();
              return new TableCell({
                children: children.length > 0 ? children : [new Paragraph({})],
                columnSpan: cell.colspan > 1 ? cell.colspan : undefined,
                rowSpan: cell.rowspan > 1 ? cell.rowspan : undefined,
                shading: cell.header ? { type: ShadingType.CLEAR, fill: "EEEEEE" } : undefined,
              });
            })
          );
          return new TableRow({ children: cells });
        })
      );
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
    }
    case "image":
      return [await imageBlockToParagraph(block.src, t)];
  }
}

async function blocksToElements(blocks: ManuscriptBlock[], t: TFn): Promise<(Paragraph | Table)[]> {
  const results = await Promise.all(blocks.map((b) => blockToElements(b, t)));
  return results.flat();
}

export async function buildDocxBlob(doc: ManuscriptDoc, t: TFn = fallbackT): Promise<Blob> {
  const titlePage = [
    new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.title, font: BODY_FONT })] }),
    ...(doc.author
      ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: doc.author, color: "666666", font: BODY_FONT })] })]
      : []),
    new Paragraph({}),
  ];
  const body = await blocksToElements(doc.blocks, t);
  const document = new Document({
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ children: [...titlePage, ...body] }],
  });
  return Packer.toBlob(document);
}
