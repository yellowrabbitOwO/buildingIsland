import { db, newId, nowISO } from "../db";
import type { Timeline, TimelineBranch, TimelineEvent } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** createTimeline 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export async function listTimelines(worldId: string): Promise<Timeline[]> {
  return db.timelines.where({ worldId }).toArray();
}

export async function getTimeline(id: string): Promise<Timeline | undefined> {
  return db.timelines.get(id);
}

/** ownerEntryId 不是 timelines 表的索引欄位（跟 calendarId 一樣，用量低不值得為此多開一個索引），
 * 用 filter 全表掃描而非 where 查詢 */
export async function getTimelineByOwnerEntry(entryId: string): Promise<Timeline | undefined> {
  return db.timelines.filter((t) => t.ownerEntryId === entryId).first();
}

/** 找出這個世界的「全部角色」彙整時間線（同一世界至多一條），見 characterTimeline.ts。
 * isAllCharactersTimeline 同樣不是索引欄位，先用 where({worldId}) 縮小範圍再過濾 */
export async function getAllCharactersTimeline(worldId: string): Promise<Timeline | undefined> {
  return db.timelines.where({ worldId }).filter((t) => t.isAllCharactersTimeline === true).first();
}

/** 新時間線建立時自動連帶建一條主線分支（parentBranchId 為 undefined），
 * 讓使用者一開始就有地方可以掛事件，不用先手動建立分支才能開始用 */
export async function createTimeline(
  worldId: string,
  input: {
    name: string;
    description?: string;
    tagColor?: string;
    folderId?: string;
    calendarId: string;
    /** 提供時代表這是系統為某個角色 Entry 自動建立的角色時間線，見 characterTimeline.ts */
    ownerEntryId?: string;
    /** 提供時代表這是系統自動建立的「全部角色」彙整時間線，見 characterTimeline.ts */
    isAllCharactersTimeline?: boolean;
  },
  t: TFn = fallbackT
): Promise<Timeline> {
  const timeline: Timeline = {
    id: newId(),
    worldId,
    folderId: input.folderId,
    name: input.name,
    description: input.description,
    tagColor: input.tagColor,
    starred: false,
    calendarId: input.calendarId,
    ownerEntryId: input.ownerEntryId,
    isAllCharactersTimeline: input.isAllCharactersTimeline,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  const mainBranch: TimelineBranch = {
    id: newId(),
    timelineId: timeline.id,
    name: t("timeline.mainBranchDefaultName"),
    parentBranchId: undefined,
    order: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.transaction("rw", [db.timelines, db.timelineBranches], async () => {
    await db.timelines.add(timeline);
    await db.timelineBranches.add(mainBranch);
  });
  return timeline;
}

/** 只給 characterTimeline.ts 的自動同步流程用：出生日期欄位換了曆法時，角色時間線要跟著換。
 * 不驗證既有事件日期在新曆法下是否還合法（跟一般手動編輯曆法月份結構那種需要跳警告的情境不同，
 * 這裡是自動化流程，範圍先收斂，不做防呆） */
export async function updateTimelineCalendar(id: string, calendarId: string): Promise<void> {
  await db.timelines.update(id, { calendarId, updatedAt: nowISO() });
}

export async function updateTimelineMeta(
  id: string,
  patch: Partial<
    Pick<Timeline, "name" | "description" | "tagColor" | "folderId" | "viewStartYear" | "viewEndYear" | "timePrecision" | "focusYear" | "focusEndYear">
  >
): Promise<void> {
  await db.timelines.update(id, { ...patch, updatedAt: nowISO() });
}

/** 分支跟事件是時間線自己的一手內容，刪除時間線要連坐刪除底下所有分支與事件 */
export async function deleteTimeline(id: string): Promise<void> {
  await db.transaction("rw", [db.timelines, db.timelineBranches, db.timelineEvents], async () => {
    await db.timelineEvents.where({ timelineId: id }).delete();
    await db.timelineBranches.where({ timelineId: id }).delete();
    await db.timelines.delete(id);
  });
}

export async function toggleTimelineStar(id: string): Promise<void> {
  const timeline = await db.timelines.get(id);
  if (!timeline) return;
  const starred = !timeline.starred;
  const patch: Partial<Timeline> = { starred, updatedAt: nowISO() };
  if (starred && timeline.starOrder === undefined) patch.starOrder = Date.now();
  await db.timelines.update(id, patch);
}

/** 分支跟事件是時間線自己的一手內容，複製時要連坐複製底下所有分支與事件——分支之間的
 * parentBranchId、事件的 branchId 都要重新對應到複製出來的新分支 id，不能原樣沿用舊 id */
export async function duplicateTimeline(id: string, folderId?: string, t: TFn = fallbackT): Promise<Timeline> {
  const original = await db.timelines.get(id);
  if (!original) throw new Error("找不到時間線");
  const branches = await db.timelineBranches.where({ timelineId: id }).toArray();
  const events = await db.timelineEvents.where({ timelineId: id }).toArray();
  const now = nowISO();
  const newTimelineId = newId();
  const branchIdMap = new Map<string, string>(branches.map((b) => [b.id, newId()]));

  const copy: Timeline = {
    ...original,
    id: newTimelineId,
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    folderId: folderId ?? original.folderId,
    starred: false,
    starOrder: undefined,
    createdAt: now,
    updatedAt: now,
  };
  const newBranches: TimelineBranch[] = branches.map((b) => ({
    ...b,
    id: branchIdMap.get(b.id)!,
    timelineId: newTimelineId,
    parentBranchId: b.parentBranchId ? branchIdMap.get(b.parentBranchId) : undefined,
    createdAt: now,
    updatedAt: now,
  }));
  const newEvents: TimelineEvent[] = events.map((e) => ({
    ...e,
    id: newId(),
    timelineId: newTimelineId,
    branchId: branchIdMap.get(e.branchId)!,
    createdAt: now,
    updatedAt: now,
  }));

  await db.transaction("rw", [db.timelines, db.timelineBranches, db.timelineEvents], async () => {
    await db.timelines.add(copy);
    await db.timelineBranches.bulkAdd(newBranches);
    if (newEvents.length) await db.timelineEvents.bulkAdd(newEvents);
  });
  return copy;
}

export async function moveTimelinesToFolder(ids: string[], folderId: string | undefined): Promise<void> {
  const timelines = await db.timelines.bulkGet(ids);
  const updated = timelines.filter((t): t is Timeline => !!t).map((t) => ({ ...t, folderId, updatedAt: nowISO() }));
  await db.timelines.bulkPut(updated);
}

export async function listStarredTimelines(worldId: string): Promise<Timeline[]> {
  const all = await listTimelines(worldId);
  return all.filter((t) => t.starred);
}
