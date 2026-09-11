import { db, newId, nowISO } from "../db";
import type { DateFieldValue, TimelineEvent } from "../types";

export async function listEvents(timelineId: string): Promise<TimelineEvent[]> {
  return db.timelineEvents.where({ timelineId }).toArray();
}

export async function getEvent(id: string): Promise<TimelineEvent | undefined> {
  return db.timelineEvents.get(id);
}

/** 讀取事件日期的統一入口：這次改動前建立的事件還留著舊的扁平 year/monthIndex/day 欄位、沒有
 * date，這裡即時組成等價的 DateValueSingle 回傳，不用寫遷移腳本——比照 seed.ts 的
 * ensureCharacterBirthdayFieldIsDateType 既有的讀取端回溯相容慣例。所有需要事件日期的地方都應該
 * 呼叫這個函式，不要直接摸 event.date（可能是 undefined）或已經不存在的 event.year 等欄位 */
export function eventDate(event: TimelineEvent): DateFieldValue {
  if (event.date) return event.date;
  const legacy = event as unknown as { year?: number; monthIndex?: number; day?: number };
  if (legacy.year !== undefined && legacy.monthIndex !== undefined && legacy.day !== undefined) {
    return { mode: "single", year: legacy.year, monthIndex: legacy.monthIndex, day: legacy.day };
  }
  return { mode: "single", year: 0, monthIndex: 0, day: 1 };
}

export async function createEvent(
  worldId: string,
  timelineId: string,
  branchId: string,
  input: { name: string; date: DateFieldValue; color?: string; relatedEntryIds?: string[]; linkedEntryId?: string },
  /** 提供時代表這是系統為角色出生/死亡/受孕自動產生的事件，見 characterTimeline.ts */
  autoKind?: "birth" | "death" | "pregnancyStart"
): Promise<TimelineEvent> {
  const event: TimelineEvent = {
    id: newId(),
    worldId,
    timelineId,
    branchId,
    name: input.name,
    date: input.date,
    color: input.color,
    fields: [],
    values: {},
    relatedEntryIds: input.relatedEntryIds ?? [],
    autoKind,
    linkedEntryId: input.linkedEntryId,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.timelineEvents.add(event);
  return event;
}

/** 用 fetch→合併→put 而不是 Dexie 的 update()——TimelineEvent.fields 含 FieldDef 的遞迴巢狀選項型別
 * （NestedOptionNode），Dexie 的 UpdateSpec 型別推導在遞迴型別上會出現循環參照錯誤，
 * 比照 entry.ts（欄位結構跟這裡一樣含 FieldDef[]）已經採用的 put() 慣例 */
export async function updateEvent(
  id: string,
  patch: Partial<Pick<TimelineEvent, "name" | "date" | "color" | "branchId" | "fields" | "values" | "relatedEntryIds" | "linkedEntryId">>
): Promise<void> {
  const existing = await db.timelineEvents.get(id);
  if (!existing) return;
  await db.timelineEvents.put({ ...existing, ...patch, updatedAt: nowISO() });
}

export async function deleteEvent(id: string): Promise<void> {
  await db.timelineEvents.delete(id);
}
