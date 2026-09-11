import type { StoryChapter, StoryOutline } from "../types";
import type { MarkdownExportContext } from "../exportMarkdown";
import { fieldsToBlocks } from "./entryFieldsToManuscript";
import { docToBlocks } from "./manuscriptIR";
import type { ManuscriptBlock, ManuscriptDoc } from "./manuscriptIR";
import { type TranslationKey } from "../../i18n";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** 依 parentChapterId 分組、同層依 order 排序，深度優先走訪整棵篇章樹——扁平表＋parent 指標
 * 這個結構本身沒有現成的走訪函式可重用（worldExport.ts 只是原樣把整張表打包成 JSON），這裡新寫一個 */
function walkChapters(
  chapters: StoryChapter[],
  parentId: string | undefined,
  depth: number,
  ctx: MarkdownExportContext,
  out: ManuscriptBlock[],
  t: TFn | undefined
): void {
  const siblings = chapters.filter((c) => c.parentChapterId === parentId).sort((a, b) => a.order - b.order);
  for (const chapter of siblings) {
    out.push({ kind: "heading", level: Math.min(depth + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6, runs: [{ text: chapter.name }] });
    out.push(...fieldsToBlocks(chapter.fields, chapter.values, ctx, t));
    if (chapter.hasBody) out.push(...docToBlocks(chapter.body));
    walkChapters(chapters, chapter.id, depth + 1, ctx, out, t);
  }
}

/** 整份章節大綱（所有篇章）彙整成一本書——多章節彙整成一本書是上一輪成稿匯出功能規劃裡
 * 明確保留給未來的延伸，這裡就是那個延伸 */
export function storyChapterToManuscript(
  outline: StoryOutline,
  chapters: StoryChapter[],
  ctx: MarkdownExportContext,
  author?: string,
  t?: TFn
): ManuscriptDoc {
  const blocks: ManuscriptBlock[] = [];
  if (outline.description) blocks.push({ kind: "paragraph", runs: [{ text: outline.description, italic: true }] });
  walkChapters(chapters, undefined, 0, ctx, blocks, t);
  return { title: outline.name, author, blocks };
}
