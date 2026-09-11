import type { WritingDoc, ScriptDoc } from "../types";
import type { ScriptLineType } from "../../components/script/scriptLineTypes";

export type ManuscriptAlign = "left" | "center" | "right" | "justify";

/** 一段文字＋格式（粗體/斜體/底線/刪除線/等寬碼/顏色/螢光筆/連結/字級），對應 TipTap text 節點
 * 的 marks 組合。highlight 存的是 rgba() 字串（比照 WritingDocViewPage.tsx 的 hexToRgba 慣例，
 * Highlight 套件本來就是這樣存的），不是色碼，個別 renderer 要自己決定怎麼處理透明度。
 * fontSize 存 px 數字（TextStyleKit 的 fontSize attr 是 px 字串，這裡先轉成數字），
 * 個別 renderer 各自換算成自己需要的單位（例如 PDF 要轉成 pt） */
export interface ManuscriptRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: string;
  highlight?: string;
  href?: string;
  fontSize?: number;
}

export interface ManuscriptTableCell {
  blocks: ManuscriptBlock[];
  colspan: number;
  rowspan: number;
  header?: boolean;
}

export interface ManuscriptTableRow {
  cells: ManuscriptTableCell[];
}

export type ManuscriptBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; runs: ManuscriptRun[]; align?: ManuscriptAlign }
  | { kind: "paragraph"; runs: ManuscriptRun[]; align?: ManuscriptAlign }
  | { kind: "bulletList" | "orderedList"; items: ManuscriptBlock[][] }
  | { kind: "blockquote"; blocks: ManuscriptBlock[] }
  | { kind: "horizontalRule" }
  | { kind: "codeBlock"; text: string }
  | { kind: "table"; rows: ManuscriptTableRow[] }
  | { kind: "image"; src: string }
  | { kind: "scriptLine"; lineType: ScriptLineType; runs: ManuscriptRun[] };

export interface ManuscriptDoc {
  title: string;
  author?: string;
  blocks: ManuscriptBlock[];
}

/** TipTap／ProseMirror 文件 JSON 裡用得到的節點形狀，只取這次轉換在意的欄位（比照
 * richTextText.ts 的既有慣例，不引入完整的 ProseMirror 型別） */
interface PMNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: PMNode[];
}

function readAlign(attrs: Record<string, unknown> | undefined): ManuscriptAlign | undefined {
  const v = attrs?.textAlign;
  return v === "left" || v === "center" || v === "right" || v === "justify" ? v : undefined;
}

/** 把一個 inline 節點（text／hardBreak）攤平成 runs；hardBreak 轉成一個純換行符的 run，
 * 交給各 renderer 自己決定怎麼在段落內斷行 */
function inlineToRuns(nodes: PMNode[] | undefined): ManuscriptRun[] {
  const runs: ManuscriptRun[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "hardBreak") {
      runs.push({ text: "\n" });
      continue;
    }
    if (n.type !== "text" || !n.text) continue;
    const run: ManuscriptRun = { text: n.text };
    for (const mark of n.marks ?? []) {
      switch (mark.type) {
        case "bold":
          run.bold = true;
          break;
        case "italic":
          run.italic = true;
          break;
        case "underline":
          run.underline = true;
          break;
        case "strike":
          run.strike = true;
          break;
        case "code":
          run.code = true;
          break;
        case "link":
          if (typeof mark.attrs?.href === "string") run.href = mark.attrs.href;
          break;
        case "highlight":
          if (typeof mark.attrs?.color === "string") run.highlight = mark.attrs.color;
          break;
        case "textStyle": {
          const color = mark.attrs?.color;
          if (typeof color === "string") run.color = color;
          const fontSize = mark.attrs?.fontSize;
          if (typeof fontSize === "string") {
            const px = parseFloat(fontSize);
            if (!Number.isNaN(px)) run.fontSize = px;
          }
          break;
        }
      }
    }
    runs.push(run);
  }
  return runs;
}

/** 遞迴走一份清單節點（bulletList／orderedList），每個 listItem 底下可能是純段落，
 * 也可能巢狀另一層清單（TipTap 預設 Tab/Shift+Tab 縮排仍可用，即使工具列沒有縮排按鈕） */
function listToItems(listNode: PMNode): ManuscriptBlock[][] {
  return (listNode.content ?? [])
    .filter((li) => li.type === "listItem")
    .map((li) => (li.content ?? []).flatMap(nodeToBlocks));
}

function tableToBlock(tableNode: PMNode): ManuscriptBlock {
  const rows: ManuscriptTableRow[] = (tableNode.content ?? [])
    .filter((r) => r.type === "tableRow")
    .map((r) => ({
      cells: (r.content ?? [])
        .filter((c) => c.type === "tableCell" || c.type === "tableHeader")
        .map((c) => ({
          blocks: (c.content ?? []).flatMap(nodeToBlocks),
          colspan: typeof c.attrs?.colspan === "number" ? c.attrs.colspan : 1,
          rowspan: typeof c.attrs?.rowspan === "number" ? c.attrs.rowspan : 1,
          header: c.type === "tableHeader",
        })),
    }));
  return { kind: "table", rows };
}

function nodeToBlocks(node: PMNode): ManuscriptBlock[] {
  switch (node.type) {
    case "heading": {
      const level = node.attrs?.level;
      const clamped = typeof level === "number" && level >= 1 && level <= 6 ? (level as 1 | 2 | 3 | 4 | 5 | 6) : 1;
      return [{ kind: "heading", level: clamped, runs: inlineToRuns(node.content), align: readAlign(node.attrs) }];
    }
    case "paragraph":
      return [{ kind: "paragraph", runs: inlineToRuns(node.content), align: readAlign(node.attrs) }];
    case "scriptLine": {
      const lineType = node.attrs?.lineType;
      const type: ScriptLineType = typeof lineType === "string" ? (lineType as ScriptLineType) : "action";
      return [{ kind: "scriptLine", lineType: type, runs: inlineToRuns(node.content) }];
    }
    case "bulletList":
      return [{ kind: "bulletList", items: listToItems(node) }];
    case "orderedList":
      return [{ kind: "orderedList", items: listToItems(node) }];
    case "blockquote":
      return [{ kind: "blockquote", blocks: (node.content ?? []).flatMap(nodeToBlocks) }];
    case "horizontalRule":
      return [{ kind: "horizontalRule" }];
    case "codeBlock":
      return [{ kind: "codeBlock", text: (node.content ?? []).map((n) => n.text ?? "").join("") }];
    case "table":
      return [tableToBlock(node)];
    case "image": {
      const src = node.attrs?.src;
      return typeof src === "string" ? [{ kind: "image", src }] : [];
    }
    default:
      // 未知節點型別（例如未來新增的擴充功能）：往下挖 content，盡量不遺失內容，
      // 而不是整個節點連同底下的文字都消失不見
      return (node.content ?? []).flatMap(nodeToBlocks);
  }
}

/** 把一份 TipTap／ProseMirror JSON 轉成 ManuscriptBlock[]；export 出來給 StoryChapter.body
 * （跟 WritingDoc.content 同一套 TipTap JSON 慣例）等非 WritingDoc/ScriptDoc 來源直接重用，
 * 不用另外重寫一次 walker */
export function docToBlocks(content: object | undefined): ManuscriptBlock[] {
  if (!content) return [];
  const root = content as PMNode;
  return (root.content ?? []).flatMap(nodeToBlocks);
}

export function writingDocToManuscript(doc: WritingDoc, author?: string): ManuscriptDoc {
  return { title: doc.name, author, blocks: docToBlocks(doc.content) };
}

export function scriptDocToManuscript(doc: ScriptDoc, author?: string): ManuscriptDoc {
  return { title: doc.name, author, blocks: docToBlocks(doc.content) };
}
