import type { FieldDef, FieldValue } from "../types";
import type { MarkdownExportContext } from "../exportMarkdown";
import { formatFieldValue } from "../exportMarkdown";
import type { ManuscriptBlock } from "./manuscriptIR";
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

/** 單一欄位轉成 block：image 型別直接組成 image block（formatFieldValue 對 image 回傳的是
 * Markdown 語法 `![](dataURL)`，這裡改用實際的 image block），其餘型別重用
 * exportMarkdown.ts 的 formatFieldValue 產生文字，包成一個 paragraph */
export function fieldToBlocks(field: FieldDef, value: FieldValue | undefined, ctx: MarkdownExportContext, t: TFn = fallbackT): ManuscriptBlock[] {
  const current = value?.current;
  if (field.type === "image") {
    return typeof current === "string" && current
      ? [{ kind: "image", src: current }]
      : [{ kind: "paragraph", runs: [{ text: t("exportMarkdown.notFilled") }] }];
  }
  return [{ kind: "paragraph", runs: [{ text: formatFieldValue(field, value, ctx, t) }] }];
}

/** 一組 fields/values（Entry／StoryChapter／TimelineEvent 共用同一套系統）轉成 block 序列，
 * 邏輯比照 exportMarkdown.ts 的 entryToMarkdown：連續且 groupInstanceId 相同的欄位聚成一個
 * 子標題底下的清單，其餘欄位各自一個標題＋內容 */
export function fieldsToBlocks(
  fields: FieldDef[],
  values: Record<string, FieldValue>,
  ctx: MarkdownExportContext,
  t: TFn = fallbackT
): ManuscriptBlock[] {
  const blocks: ManuscriptBlock[] = [];
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (field.groupInstanceId) {
      const groupId = field.groupInstanceId;
      const items: ManuscriptBlock[][] = [];
      while (i < fields.length && fields[i].groupInstanceId === groupId) {
        const f = fields[i];
        if (f.type === "image") {
          items.push([{ kind: "paragraph", runs: [{ text: f.label + "：", bold: true }] }, ...fieldToBlocks(f, values[f.id], ctx, t)]);
        } else {
          items.push([{ kind: "paragraph", runs: [{ text: f.label + "：", bold: true }, { text: formatFieldValue(f, values[f.id], ctx, t) }] }]);
        }
        i++;
      }
      blocks.push({ kind: "heading", level: 3, runs: [{ text: field.groupLabel || t("common.group") }] });
      blocks.push({ kind: "bulletList", items });
    } else {
      blocks.push({ kind: "heading", level: 2, runs: [{ text: field.label }] });
      blocks.push(...fieldToBlocks(field, values[field.id], ctx, t));
      i++;
    }
  }
  return blocks;
}
