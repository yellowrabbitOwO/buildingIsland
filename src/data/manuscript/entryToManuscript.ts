import type { Entry } from "../types";
import type { MarkdownExportContext } from "../exportMarkdown";
import { fieldsToBlocks } from "./entryFieldsToManuscript";
import type { ManuscriptBlock, ManuscriptDoc } from "./manuscriptIR";
import { type TranslationKey } from "../../i18n";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** 單一條目（資訊卡）轉成成稿——結構比照 exportMarkdown.ts 的 entryToMarkdown：標題＝條目名稱、
 * 簡述（斜體段落），接著依 entry.fields 既有順序輸出每個欄位 */
export function entryToManuscript(entry: Entry, ctx: MarkdownExportContext, author?: string, t?: TFn): ManuscriptDoc {
  const blocks: ManuscriptBlock[] = [];
  if (entry.summary) blocks.push({ kind: "paragraph", runs: [{ text: entry.summary, italic: true }] });
  blocks.push(...fieldsToBlocks(entry.fields, entry.values, ctx, t));
  return { title: entry.name, author, blocks };
}
