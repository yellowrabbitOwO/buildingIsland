import { db, newId, nowISO } from "../db";
import type { StoryChapter, StoryOutline } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateStoryOutline 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listStoryOutlines(worldId: string): Promise<StoryOutline[]> {
  return db.storyOutlines.where({ worldId }).toArray();
}

export async function getStoryOutline(id: string): Promise<StoryOutline | undefined> {
  return db.storyOutlines.get(id);
}

export async function createStoryOutline(
  worldId: string,
  input: {
    name: string;
    description?: string;
    tagColor?: string;
    folderId?: string;
    calendarId?: string;
    chapterTemplateId?: string;
  }
): Promise<StoryOutline> {
  const outline: StoryOutline = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    calendarId: input.calendarId,
    chapterTemplateId: input.chapterTemplateId,
    starred: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.storyOutlines.add(outline);
  return outline;
}

/** calendarId 不開放透過這裡改——見 StoryOutline.calendarId 的欄位說明，建立後鎖定；
 * chapterTemplateId 可以隨時換（只影響之後新增的篇章，不影響既有篇章已經填好的欄位資料） */
export async function updateStoryOutlineMeta(
  id: string,
  patch: Partial<Pick<StoryOutline, "name" | "description" | "tagColor" | "folderId" | "chapterTemplateId">>
): Promise<void> {
  await db.storyOutlines.update(id, { ...patch, updatedAt: nowISO() });
}

/** 章節大綱底下的篇章是自己的一手內容（不像關係圖節點是借用條目），刪大綱要連坐刪除底下所有篇章 */
export async function deleteStoryOutline(id: string): Promise<void> {
  await db.transaction("rw", [db.storyOutlines, db.storyChapters], async () => {
    await db.storyChapters.where({ outlineId: id }).delete();
    await db.storyOutlines.delete(id);
  });
}

export async function toggleStoryOutlineStar(id: string): Promise<void> {
  const outline = await db.storyOutlines.get(id);
  if (!outline) return;
  const starred = !outline.starred;
  const patch: Partial<StoryOutline> = { starred, updatedAt: nowISO() };
  if (starred && outline.starOrder === undefined) patch.starOrder = Date.now();
  await db.storyOutlines.update(id, patch);
}

/** 篇章是大綱自己的一手內容，複製時要連坐複製底下所有篇章——篇章之間的 parentChapterId
 * 要重新對應到複製出來的新篇章 id，比照 duplicateTimeline 的分支複製邏輯 */
export async function duplicateStoryOutline(id: string, folderId?: string, t: TFn = fallbackT): Promise<StoryOutline> {
  const original = await db.storyOutlines.get(id);
  if (!original) throw new Error("找不到章節大綱");
  const chapters = await db.storyChapters.where({ outlineId: id }).toArray();
  const now = nowISO();
  const newOutlineId = newId();
  const chapterIdMap = new Map<string, string>(chapters.map((c) => [c.id, newId()]));

  const copy: StoryOutline = {
    ...original,
    id: newOutlineId,
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const newChapters: StoryChapter[] = chapters.map((c) => ({
    ...c,
    id: chapterIdMap.get(c.id)!,
    outlineId: newOutlineId,
    parentChapterId: c.parentChapterId ? chapterIdMap.get(c.parentChapterId) : undefined,
    fields: c.fields.map((f) => ({ ...f })),
    values: { ...c.values },
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction("rw", [db.storyOutlines, db.storyChapters], async () => {
    await db.storyOutlines.add(copy);
    if (newChapters.length) await db.storyChapters.bulkAdd(newChapters);
  });
  return copy;
}

export async function moveStoryOutlinesToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const outlines = await db.storyOutlines.bulkGet(ids);
  const updated = outlines.filter((o): o is StoryOutline => !!o).map((o) => ({ ...o, folderId, updatedAt: nowISO() }));
  await db.storyOutlines.bulkPut(updated);
}

export async function listStarredStoryOutlines(worldId: string): Promise<StoryOutline[]> {
  const all = await listStoryOutlines(worldId);
  return all.filter((o) => o.starred);
}
