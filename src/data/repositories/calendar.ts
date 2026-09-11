import { db, newId, nowISO } from "../db";
import { eventDate } from "./timelineEvent";
import type { Calendar, CalendarMonth, Scope } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** duplicateCalendar 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 比照 listGroups／listModules：世界層級（scope="world"）＋通用（scope="global"，含內建的「西元」）合併列出 */
export async function listCalendars(worldId: string): Promise<Calendar[]> {
  const all = await db.calendars.toArray();
  return all.filter((c) => c.scope === "global" || c.worldId === worldId);
}

export async function getCalendar(id: string): Promise<Calendar | undefined> {
  return db.calendars.get(id);
}

export type CalendarWeekSettings = Pick<Calendar, "weekLength" | "weekdayNames" | "weekendDayIndices" | "weekAnchor">;

export async function createCalendar(
  name: string,
  scope: Scope,
  worldId: string | undefined,
  months: CalendarMonth[],
  weekSettings?: Partial<CalendarWeekSettings>
): Promise<Calendar> {
  const calendar: Calendar = {
    id: newId(),
    worldId: scope === "world" ? worldId : undefined,
    scope,
    isBuiltIn: false,
    name,
    months,
    ...weekSettings,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.calendars.add(calendar);
  return calendar;
}

/** 名稱／月份結構／適用範圍是「結構性」欄位：改了可能讓既有事件日期變不合法，所以內建曆法
 * （例如「西元」）一律鎖住，只能複製一份再改。星期設定（一週幾天／週末／錨點）純粹疊加在月份
 * 結構之上，不會讓任何既有事件日期失效，所以就算是內建曆法也允許直接改——這是使用者明確要求的
 * 行為（管理>曆法>西元的星期設定也要能改） */
export async function updateCalendar(
  id: string,
  patch: Partial<Pick<Calendar, "name" | "months" | "scope" | "worldId" | "folderId">>
): Promise<void> {
  const existing = await db.calendars.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建曆法無法修改，請先複製一份");
  await db.calendars.update(id, { ...patch, updatedAt: nowISO() });
}

export async function updateCalendarWeekSettings(id: string, patch: Partial<CalendarWeekSettings>): Promise<void> {
  const existing = await db.calendars.get(id);
  if (!existing) throw new Error("找不到曆法");
  await db.calendars.update(id, { ...patch, updatedAt: nowISO() });
}

/** 刪除前呼叫端要先用 listTimelinesUsingCalendar 確認沒有時間線在用——曆法一旦被引用就不能刪，
 * 只能先改用其他曆法或刪掉引用它的時間線，不像分類刪除那樣連坐處理，因為換算過的事件日期
 * 一旦曆法憑空消失就沒有意義了 */
export async function deleteCalendar(id: string): Promise<void> {
  const existing = await db.calendars.get(id);
  if (!existing || existing.isBuiltIn) throw new Error("內建曆法無法刪除，請先複製一份");
  await db.calendars.delete(id);
}

export async function duplicateCalendar(id: string, worldId: string, folderId?: string, t: TFn = fallbackT): Promise<Calendar> {
  const original = await db.calendars.get(id);
  if (!original) throw new Error("找不到曆法");
  const copy: Calendar = {
    ...original,
    id: newId(),
    name: `${original.name}${t("templateManagerPage.copySuffix")}`,
    isBuiltIn: false,
    scope: "world",
    worldId,
    folderId: folderId ?? original.folderId,
    months: original.months.map((m) => ({ ...m, id: newId() })),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.calendars.add(copy);
  return copy;
}

/** calendarId 不是 timelines 表的索引欄位（用量低的管理頁操作，不值得為此多開一個索引），
 * 用 filter 全表掃描而非 where 查詢 */
export async function listTimelinesUsingCalendar(calendarId: string): Promise<{ id: string; name: string }[]> {
  const timelines = await db.timelines.filter((t) => t.calendarId === calendarId).toArray();
  return timelines.map((t) => ({ id: t.id, name: t.name }));
}

/** 單一日期點在新的月份結構下是否還合法：月份不存在，或日期超出該月新的天數上限 */
function pointInvalid(newMonths: CalendarMonth[], point: { monthIndex: number; day: number }): boolean {
  const month = newMonths[point.monthIndex];
  return !month || point.day > month.days;
}

/** 編輯曆法月份結構前呼叫，算出改成 newMonths 後有幾筆既有事件的日期會變成不合法——事件日期現在
 * 有單一時間／固定性／持續型三種模式（見 DateFieldValue），分別判斷：單一時間／持續型的起訖點
 * 直接比照月份不存在、日期超出天數上限；每年重複的固定性事件比照單一時間點判斷；每月重複的固定性
 * 事件沒有固定月份，只有「這個日期在任何一個月都排不進去」（超過所有月份的最大天數）才算不合法——
 * 不自動修正，只用來讓使用者存檔前知情 */
export async function countEventsInvalidatedByMonths(calendarId: string, newMonths: CalendarMonth[]): Promise<number> {
  const timelines = await listTimelinesUsingCalendar(calendarId);
  const maxDays = newMonths.reduce((max, m) => Math.max(max, m.days), 1);
  let count = 0;
  for (const t of timelines) {
    const events = await db.timelineEvents.where({ timelineId: t.id }).toArray();
    for (const e of events) {
      const d = eventDate(e);
      let invalid: boolean;
      if (d.mode === "single") invalid = pointInvalid(newMonths, d);
      else if (d.mode === "range") invalid = pointInvalid(newMonths, d.start) || (!!d.end && pointInvalid(newMonths, d.end));
      else if (d.frequency === "yearly") invalid = pointInvalid(newMonths, { monthIndex: d.monthIndex ?? 0, day: d.day });
      else invalid = d.day > maxDays;
      if (invalid) count++;
    }
  }
  return count;
}
