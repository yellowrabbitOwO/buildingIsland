import { db, newId, nowISO } from "../db";
import { buildInitialValues } from "../fieldDefaults";
import { resolveStoryChapterTemplateFields } from "./storyChapterTemplate";
import type { FieldValue, StoryChapter } from "../types";

export async function listChapters(outlineId: string): Promise<StoryChapter[]> {
  return db.storyChapters.where({ outlineId }).toArray();
}

async function getSiblings(outlineId: string, parentChapterId: string | undefined): Promise<StoryChapter[]> {
  const all = await db.storyChapters.where({ outlineId }).toArray();
  return all.filter((c) => c.parentChapterId === parentChapterId).sort((a, b) => a.order - b.order);
}

/** 新篇章附加到目標層級（同一個 outlineId + parentChapterId）尾端；若所屬大綱有設定
 * chapterTemplateId，自動套用該範本展開出的預設欄位（比照 createEntry 依範本代入預設欄位的既有慣例），
 * 沒設定範本就是空白篇章，欄位之後靠 FieldsList 自行新增 */
export async function createChapter(
  outlineId: string,
  worldId: string,
  parentChapterId?: string,
  name?: string
): Promise<StoryChapter> {
  const [siblings, outline] = await Promise.all([getSiblings(outlineId, parentChapterId), db.storyOutlines.get(outlineId)]);
  const template = outline?.chapterTemplateId ? await db.storyChapterTemplates.get(outline.chapterTemplateId) : undefined;
  const fields = template ? await resolveStoryChapterTemplateFields(template, outline?.calendarId) : [];
  const values: Record<string, FieldValue> = buildInitialValues(fields);
  const chapter: StoryChapter = {
    id: newId(),
    worldId,
    outlineId,
    parentChapterId,
    order: siblings.length,
    name: name?.trim() || "未命名篇章",
    fields,
    values,
    hasBody: false,
    bodyWordCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.storyChapters.add(chapter);
  return chapter;
}

export async function updateChapter(
  id: string,
  patch: Partial<Pick<StoryChapter, "name" | "fields" | "values" | "hasBody" | "body" | "bodyWordCount">>
): Promise<void> {
  // Dexie 的 UpdateSpec 對 NestedOptionNode 這種自我遞迴型別會觸發 TS 型別循環錯誤，改以 any 繞過型別推導
  // （fields 裡巢狀選項欄位的型別跟 Entry.fields 同源，比照 entry.ts/template.ts 既有的既有做法）
  await (db.storyChapters as any).update(id, { ...patch, updatedAt: nowISO() });
}

/** 遞迴找出一個篇章的所有子孫篇章 id（含自己）——一份大綱底下的篇章數量不會多到需要資料庫層級
 * 遞迴查詢，一次抓全部篇章在 JS 裡建父子關係表最簡單（比照 timelineBranch.ts 的既有做法） */
async function collectDescendantChapterIds(outlineId: string, rootId: string): Promise<string[]> {
  const all = await db.storyChapters.where({ outlineId }).toArray();
  const byParent = new Map<string, StoryChapter[]>();
  for (const c of all) {
    if (!c.parentChapterId) continue;
    if (!byParent.has(c.parentChapterId)) byParent.set(c.parentChapterId, []);
    byParent.get(c.parentChapterId)!.push(c);
  }
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    result.push(id);
    for (const child of byParent.get(id) ?? []) stack.push(child.id);
  }
  return result;
}

/** 刪除篇章前呼叫，回報會連坐刪除的子孫篇章數（含自己），供確認對話框顯示 */
export async function countChapterDeletionImpact(outlineId: string, chapterId: string): Promise<number> {
  const ids = await collectDescendantChapterIds(outlineId, chapterId);
  return ids.length;
}

export async function deleteChapterCascade(outlineId: string, chapterId: string): Promise<void> {
  await db.transaction("rw", db.storyChapters, async () => {
    const ids = await collectDescendantChapterIds(outlineId, chapterId);
    await db.storyChapters.bulkDelete(ids);
  });
}

/** 跟同一層前一個兄弟交換 order；已經是該層第一個就不動作。讀-算-寫包在同一個交易裡，避免快速
 * 連續操作時競態互相蓋掉（這次會話稍早在故事板 lane／關係圖節點隱藏上修過同一類問題） */
export async function moveChapterUp(id: string): Promise<void> {
  await db.transaction("rw", db.storyChapters, async () => {
    const chapter = await db.storyChapters.get(id);
    if (!chapter) return;
    const siblings = await getSiblings(chapter.outlineId, chapter.parentChapterId);
    const index = siblings.findIndex((c) => c.id === id);
    if (index <= 0) return;
    const prev = siblings[index - 1];
    await (db.storyChapters as any).update(chapter.id, { order: prev.order, updatedAt: nowISO() });
    await (db.storyChapters as any).update(prev.id, { order: chapter.order, updatedAt: nowISO() });
  });
}

/** 跟同一層後一個兄弟交換 order；已經是該層最後一個就不動作 */
export async function moveChapterDown(id: string): Promise<void> {
  await db.transaction("rw", db.storyChapters, async () => {
    const chapter = await db.storyChapters.get(id);
    if (!chapter) return;
    const siblings = await getSiblings(chapter.outlineId, chapter.parentChapterId);
    const index = siblings.findIndex((c) => c.id === id);
    if (index === -1 || index >= siblings.length - 1) return;
    const next = siblings[index + 1];
    await (db.storyChapters as any).update(chapter.id, { order: next.order, updatedAt: nowISO() });
    await (db.storyChapters as any).update(next.id, { order: chapter.order, updatedAt: nowISO() });
  });
}

/** 縮排：把這個節點過繼給「同一層前一個兄弟」當它最後一個子節點；沒有前一個兄弟（已經是該層第一個）
 * 就不動作。原本那層剩下的兄弟重新從 0 編號補上空缺 */
export async function indentChapter(id: string): Promise<void> {
  await db.transaction("rw", db.storyChapters, async () => {
    const chapter = await db.storyChapters.get(id);
    if (!chapter) return;
    const siblings = await getSiblings(chapter.outlineId, chapter.parentChapterId);
    const index = siblings.findIndex((c) => c.id === id);
    if (index <= 0) return;
    const newParent = siblings[index - 1];
    const newSiblings = await getSiblings(chapter.outlineId, newParent.id);

    await (db.storyChapters as any).update(chapter.id, { parentChapterId: newParent.id, order: newSiblings.length, updatedAt: nowISO() });
    const remaining = siblings.filter((c) => c.id !== id);
    await Promise.all(remaining.map((c, i) => (db.storyChapters as any).update(c.id, { order: i, updatedAt: nowISO() })));
  });
}

/** 提升：把這個節點升到「目前父節點」的同一層，插在父節點後面；已經是頂層（沒有父節點）就不動作。
 * 新層級裡插入點之後的兄弟、原本那層剩下的兄弟都要重新編號 */
export async function outdentChapter(id: string): Promise<void> {
  await db.transaction("rw", db.storyChapters, async () => {
    const chapter = await db.storyChapters.get(id);
    if (!chapter || !chapter.parentChapterId) return;
    const parent = await db.storyChapters.get(chapter.parentChapterId);
    if (!parent) return;

    const oldSiblings = await getSiblings(chapter.outlineId, chapter.parentChapterId);
    const newSiblings = await getSiblings(chapter.outlineId, parent.parentChapterId);
    const parentIndex = newSiblings.findIndex((c) => c.id === parent.id);
    const insertAt = parentIndex + 1;

    await (db.storyChapters as any).update(chapter.id, { parentChapterId: parent.parentChapterId, order: insertAt, updatedAt: nowISO() });
    const toShift = newSiblings.slice(insertAt);
    await Promise.all(toShift.map((c, i) => (db.storyChapters as any).update(c.id, { order: insertAt + 1 + i, updatedAt: nowISO() })));

    const remainingOld = oldSiblings.filter((c) => c.id !== id);
    await Promise.all(remainingOld.map((c, i) => (db.storyChapters as any).update(c.id, { order: i, updatedAt: nowISO() })));
  });
}
