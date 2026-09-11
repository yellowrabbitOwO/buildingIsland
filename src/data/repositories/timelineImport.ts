import { db, newId, nowISO } from "../db";
import { convertDate } from "./characterTimeline";
import { createBranch } from "./timelineBranch";
import type { Calendar, DateFieldValue, DateValueSingle, PlainDateTime, TimelineEvent } from "../types";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** importTimeline 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 把來源時間線上所有分支的事件攤平複製成目標時間線一條新分支上的事件快照（一次性複製，不是即時連動——
 * 之後來源時間線再變動不會回頭更新這裡，跟「匯入既有事件」單張資訊卡的匯入邏輯一致，只是這裡一次匯入
 * 整條時間線）。日期依來源／目標曆法換算；固定性事件（每年/每月重複）的月/日結構在不同曆法月數不同時
 * 換算後可能不再合法，這裡先直接沿用原始月/日，之後有需要再處理跨曆法固定性事件的轉換。
 * autoKind／relatedEntryIds 照原樣複製（不清掉）：時間軸游標懸浮提示的「角色當下生命階段」功能
 * （見 TimelineHoverOverlay.tsx 的 buildCharacterEndpoints）要靠 autoKind 認出出生/死亡/受孕事件，
 * 清掉的話複製過來的角色事件在來源以外的時間線上就再也顯示不出歲數／死後幾年這些狀態。副作用是
 * 在複製後的事件上改日期，存檔一樣會寫回角色資訊卡本身的出生/死亡日期（見
 * TimelineEventEditorModal.tsx 的 dateEditableForAutoSync）——這其實是合理的，改的本來就是同一個
 * 角色的出生/死亡紀錄；只是這裡這份「複製品」自己的日期不會跟著自動更新，要重新匯入一次才會同步，
 * 這是一次性快照本來就有的限制。回傳實際複製的事件數，供呼叫端顯示匯入結果 */
export async function importTimeline(
  worldId: string,
  targetTimelineId: string,
  sourceTimelineId: string,
  targetCalendar: Calendar,
  t: TFn = fallbackT
): Promise<number> {
  const sourceTimeline = await db.timelines.get(sourceTimelineId);
  if (!sourceTimeline) return 0;
  const sourceCalendar = await db.calendars.get(sourceTimeline.calendarId);
  if (!sourceCalendar) return 0;
  const sourceEvents = await db.timelineEvents.where({ timelineId: sourceTimelineId }).toArray();
  if (sourceEvents.length === 0) return 0;

  const branch = await createBranch(targetTimelineId, {
    name: t("timelineImport.branchNamePrefix", { name: sourceTimeline.name }),
  });
  const convertOne = (d: PlainDateTime) => convertDate(sourceCalendar, targetCalendar, d);

  const copies: TimelineEvent[] = sourceEvents.map((e) => {
    let date: DateFieldValue;
    if (e.date.mode === "single") {
      const single = e.date as DateValueSingle;
      date = { mode: "single", ...convertOne(single), death: single.death ? convertOne(single.death) : undefined };
    } else if (e.date.mode === "range") {
      date = { mode: "range", start: convertOne(e.date.start), end: e.date.end ? convertOne(e.date.end) : undefined };
    } else {
      date = e.date;
    }
    return {
      id: newId(),
      worldId,
      timelineId: targetTimelineId,
      branchId: branch.id,
      name: e.name,
      date,
      color: e.color,
      fields: e.fields,
      values: e.values,
      relatedEntryIds: e.relatedEntryIds,
      linkedEntryId: e.linkedEntryId,
      autoKind: e.autoKind,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  });

  await db.timelineEvents.bulkAdd(copies);
  return copies.length;
}
