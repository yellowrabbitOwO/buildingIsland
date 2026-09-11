import { db, newId, nowISO } from "../db";
import { convertDate } from "./characterTimeline";
import { resolveTemplateFields } from "./template";
import { buildInitialValues } from "../fieldDefaults";
import type { Calendar, DateFieldConfig, DateFieldValue, DateValueSingle, Entry, TimelineEvent } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** checkEntryImportability 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 找出這個世界的「事件」內建分類 id；理論上一定存在（每個世界建立時都會自動建六大內建分類），
 * 找不到就代表分類被使用者刪掉了，呼叫端要能處理 undefined */
async function getEventCategoryId(worldId: string): Promise<string | undefined> {
  const cat = await db.categories.filter((c) => c.worldId === worldId && c.builtInKey === "event").first();
  return cat?.id;
}

/** 條目上第一個時間型別欄位——標準事件範本固定叫「時間」（key="time"），但使用者可能自訂過
 * 範本或改過欄位名稱，用型別找而不是用 key/label 找，才不會在自訂範本上失效 */
function findEntryDateField(entry: Entry) {
  return entry.fields.find((f) => f.type === "date");
}

/** 檢查一張資訊卡能不能被匯入成時間線事件（見 createEventFromEntry），回傳不通過的原因；
 * ImportEventEntryDialog 用這個在清單上直接標示「無法匯入」，不用等使用者點了匯入才發現失敗 */
export function checkEntryImportability(entry: Entry, t: TFn = fallbackT): { ok: true } | { ok: false; reason: string } {
  const dateField = findEntryDateField(entry);
  if (!dateField) return { ok: false, reason: t("importEventEntryDialog.reasonNoDateField") };
  const config = dateField.dateConfig as DateFieldConfig | undefined;
  if (!config?.calendarId) return { ok: false, reason: t("importEventEntryDialog.reasonNoCalendar") };
  const raw = entry.values[dateField.id]?.current as DateFieldValue | undefined;
  if (!raw || raw.mode !== "single") return { ok: false, reason: t("importEventEntryDialog.reasonNoDateValue") };
  return { ok: true };
}

/** 把時間線事件的名稱／日期同步進（或建立）「事件」分類裡對應的資訊卡，供時間線與資訊卡雙向串連。
 * checked 為 false 時只解除連結（回傳 undefined，呼叫端會把 TimelineEvent.linkedEntryId 存回 undefined），
 * 不刪除已經建立的資訊卡本身——使用者只是不想再讓這個事件繼續同步，資訊卡的其他欄位／內容應該保留。
 * 只同步名稱與日期，資訊卡本身其他欄位（類型/地點/描述/人物…）留給使用者自己在資訊卡編輯，
 * 這裡不動，避免每次存時間線事件就把使用者在資訊卡填的內容蓋掉 */
export async function syncTimelineEventToEntry(
  worldId: string,
  event: { name: string; date: DateFieldValue; linkedEntryId?: string },
  checked: boolean
): Promise<string | undefined> {
  if (!checked) return undefined;

  const categoryId = await getEventCategoryId(worldId);
  if (!categoryId) return event.linkedEntryId;

  if (event.linkedEntryId) {
    const existing = await db.entries.get(event.linkedEntryId);
    if (existing) {
      const dateField = findEntryDateField(existing);
      const values = { ...existing.values };
      if (dateField) values[dateField.id] = { ...values[dateField.id], current: event.date };
      await db.entries.put({ ...existing, name: event.name, values, updatedAt: nowISO() });
      return event.linkedEntryId;
    }
    // 連結的資訊卡已經被刪掉了，當作沒連結過，往下建立一張新的
  }

  const category = await db.categories.get(categoryId);
  const template = category?.defaultTemplateId ? await db.templates.get(category.defaultTemplateId) : undefined;
  const fields = template ? await resolveTemplateFields(template, worldId) : [];
  const values = buildInitialValues(fields);
  const dateField = fields.find((f) => f.type === "date");
  if (dateField) values[dateField.id] = { current: event.date };

  const entry: Entry = {
    id: newId(),
    worldId,
    categoryId,
    name: event.name,
    starred: false,
    starredFieldIds: [],
    templateId: template?.id,
    fields,
    values,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.entries.add(entry);
  return entry.id;
}

/** 從既有的「事件」分類資訊卡匯入成時間線上的一個事件：讀出該資訊卡時間欄位的日期，換算成
 * 目標時間線使用的曆法（資訊卡的時間欄位可能用了跟目標時間線不同的曆法），建立一個連結回這張
 * 資訊卡（linkedEntryId）的新事件。資訊卡沒有時間型別欄位、或欄位還沒填值時回傳 undefined，
 * 呼叫端要能處理（提示使用者先去資訊卡把時間填好） */
export async function createEventFromEntry(
  worldId: string,
  timelineId: string,
  branchId: string,
  entry: Entry,
  targetCalendar: Calendar
): Promise<TimelineEvent | undefined> {
  if (!checkEntryImportability(entry).ok) return undefined;
  const dateField = findEntryDateField(entry)!;
  const config = dateField.dateConfig as DateFieldConfig;
  const sourceCalendar = await db.calendars.get(config.calendarId);
  if (!sourceCalendar) return undefined;
  const raw = entry.values[dateField.id]!.current as DateValueSingle;

  const converted = convertDate(sourceCalendar, targetCalendar, raw);
  const event: TimelineEvent = {
    id: newId(),
    worldId,
    timelineId,
    branchId,
    name: entry.name,
    date: { mode: "single", ...converted },
    fields: [],
    values: {},
    relatedEntryIds: [],
    linkedEntryId: entry.id,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.timelineEvents.add(event);
  return event;
}
