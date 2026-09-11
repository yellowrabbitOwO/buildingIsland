import { db, nowISO } from "../db";
import { dateToOrdinal, ordinalToDate } from "../calendarMath";
import type { Calendar, DateFieldConfig, DateFieldValue, DateValueSingle, Entry, PlainDateTime, TimelineEvent } from "../types";
import { createTimeline, deleteTimeline, getAllCharactersTimeline, getTimelineByOwnerEntry, updateTimelineCalendar } from "./timeline";
import { getOrCreateCharacterTimelineFolder } from "./timelineFolder";
import { listBranches } from "./timelineBranch";
import { createEvent, deleteEvent, listEvents, updateEvent } from "./timelineEvent";

/** 找出 entry.fields 裡標記為「出生日期」語意的時間欄位；理論上一張資訊卡只會有一個
 * （UI 層防呆），這裡防呆抓第一個找到的 */
function findBirthField(entry: Entry) {
  return entry.fields.find((f) => f.type === "date" && f.dateConfig?.role === "birth");
}

type AutoEventSpec = { kind: "birth" | "death" | "pregnancyStart"; name: string; date: PlainDateTime };

/** 把一個曆法底下的日期換算成另一個曆法底下、代表同一個絕對時間點的日期——用絕對天數序號
 * （ordinal）當中介，兩套曆法的年/月/日結構就算不同也能正確對齊。「全部角色」彙整時間線只用
 * 一套固定曆法，但各角色出生日期欄位可能各自選了不同曆法，寫入彙整時間線前要先轉換，
 * 否則同一組 (year, monthIndex, day) 數字在不同曆法下代表的實際天數會不一樣，位置會算錯 */
export function convertDate(fromCalendar: Calendar, toCalendar: Calendar, date: PlainDateTime): PlainDateTime {
  if (fromCalendar.id === toCalendar.id) return date;
  return ordinalToDate(toCalendar, dateToOrdinal(fromCalendar, date));
}

/** 找出 timelineId 這條時間線上，屬於這個角色（relatedEntryIds 含 entryId）的自動事件，依 specs
 * 新增/更新，並把不再需要的種類（開關關閉、值被清空）刪掉。抽成共用函式是因為「角色自己的時間線」
 * 跟「全部角色彙整時間線」都要做同一件事，差別只在寫到哪條時間線——用 relatedEntryIds 篩選既有事件
 * 而非（像角色自己時間線那樣）直接假設整條時間線只有一組自動事件，因為彙整時間線上每個角色各有
 * 一組，篩不篩對事關會不會誤刪/誤蓋到別的角色的事件 */
async function syncAutoEventsForEntry(
  worldId: string,
  timelineId: string,
  branchId: string,
  entryId: string,
  specs: AutoEventSpec[]
): Promise<void> {
  const existingEvents = (await listEvents(timelineId)).filter((e) => e.relatedEntryIds.includes(entryId));
  const activeKinds = new Set(specs.map((s) => s.kind));

  for (const spec of specs) {
    const existing = existingEvents.find((e) => e.autoKind === spec.kind);
    if (existing) {
      await updateEvent(existing.id, { name: spec.name, date: { mode: "single", ...spec.date } });
    } else {
      await createEvent(worldId, timelineId, branchId, { name: spec.name, date: { mode: "single", ...spec.date }, relatedEntryIds: [entryId] }, spec.kind);
    }
  }
  for (const existing of existingEvents) {
    if (existing.autoKind && !activeKinds.has(existing.autoKind)) await deleteEvent(existing.id);
  }
}

/** 取得（必要時建立）timeline 的主線分支 id——平行線加入後，主線可能不再是 branches 陣列裡第一個
 * 找到的 parentBranchId===undefined 分支，固定用 order 排序取最早建立（order 0）的那條 */
async function getMainBranchId(timelineId: string): Promise<string | undefined> {
  const branches = await listBranches(timelineId);
  return branches.filter((b) => b.parentBranchId === undefined).sort((a, b) => a.order - b.order)[0]?.id;
}

/** 依角色資訊卡的出生日期欄位，自動建立/更新/清除一條「角色時間線」（主線上的出生／死亡／受孕
 * 自動事件），並把同一組自動事件同步進這個世界共用的「全部角色」彙整時間線，供一次比較所有角色
 * 的生日／相對位置——受孕事件也一併同步，讓懸浮提示（TimelineHoverOverlay）能算出「胎兒期」區間，
 * 不是只有出生/死亡兩個端點。存檔時整個 Entry 一次性同步（saveEntry 是唯一的存檔進入點，
 * 沒有逐欄位變更事件，所以這裡沒辦法只針對「剛好變動的那個欄位」精準判斷，只能整體重算一次）。
 *
 * 找不到出生日期欄位、或欄位還沒有值時，刻意「不刪除」已存在的角色時間線——避免使用者不小心
 * 清空出生日期，就把先前手動加了很多分支/事件的時間線整個消失，只是不再自動同步新的出生/死亡事件。 */
export async function syncCharacterTimeline(entry: Entry): Promise<void> {
  const birthField = findBirthField(entry);
  if (!birthField) return;
  const config = birthField.dateConfig as DateFieldConfig | undefined;
  if (!config?.calendarId) return;
  const rawValue = entry.values[birthField.id]?.current as DateFieldValue | undefined;
  if (!rawValue || rawValue.mode !== "single") return;
  const birth = rawValue as DateValueSingle;

  const calendar = await db.calendars.get(config.calendarId);
  if (!calendar) return;

  // 保留 hour/minute/second，不只複製年/月/日——否則有時間精度的出生日期存成事件後會少了
  // 時分秒，ordinal 比原本的出生時刻早，讓「出生當下」被誤判成還在胎兒期
  const specs: AutoEventSpec[] = [
    {
      kind: "birth",
      name: `${entry.name} 出生`,
      date: { year: birth.year, monthIndex: birth.monthIndex, day: birth.day, hour: birth.hour, minute: birth.minute, second: birth.second },
    },
  ];
  if (config.trackDeath && birth.death) {
    specs.push({ kind: "death", name: `${entry.name} 死亡`, date: birth.death });
  }
  if (config.gestationDays) {
    const conceptionDate = ordinalToDate(calendar, dateToOrdinal(calendar, birth) - config.gestationDays);
    specs.push({ kind: "pregnancyStart", name: `${entry.name} 受孕`, date: conceptionDate });
  }

  // 角色自己的時間線；第一次建立時歸檔進「角色時間線」資料夾方便整理，之後使用者若手動搬到別的
  // 資料夾就不再強制搬回去（只在建立當下設定，不是每次同步都覆寫 folderId）
  let timeline = await getTimelineByOwnerEntry(entry.id);
  if (!timeline) {
    const folder = await getOrCreateCharacterTimelineFolder(entry.worldId);
    timeline = await createTimeline(entry.worldId, {
      name: `${entry.name} 的時間線`,
      calendarId: config.calendarId,
      ownerEntryId: entry.id,
      folderId: folder.id,
    });
  } else if (timeline.calendarId !== config.calendarId) {
    await updateTimelineCalendar(timeline.id, config.calendarId);
  }
  const mainBranchId = await getMainBranchId(timeline.id);
  if (mainBranchId) await syncAutoEventsForEntry(entry.worldId, timeline.id, mainBranchId, entry.id, specs);

  // 全部角色彙整時間線（同一世界只有一條，各角色各自的出生/死亡/受孕事件都同步到這條主線上——
  // 受孕事件也同步進來，讓懸浮提示能算出「胎兒期」區間，見 TimelineHoverOverlay），同樣歸檔進
  // 「角色時間線」資料夾，跟每個角色自己的時間線放在一起
  let roster = await getAllCharactersTimeline(entry.worldId);
  if (!roster) {
    const folder = await getOrCreateCharacterTimelineFolder(entry.worldId);
    roster = await createTimeline(entry.worldId, {
      name: "全部角色",
      calendarId: config.calendarId,
      isAllCharactersTimeline: true,
      folderId: folder.id,
    });
  }
  const rosterCalendar = roster.calendarId === config.calendarId ? calendar : await db.calendars.get(roster.calendarId);
  if (rosterCalendar) {
    const rosterSpecs = specs.map((s) => ({ ...s, date: convertDate(calendar, rosterCalendar, s.date) }));
    const rosterMainBranchId = await getMainBranchId(roster.id);
    if (rosterMainBranchId) await syncAutoEventsForEntry(entry.worldId, roster.id, rosterMainBranchId, entry.id, rosterSpecs);
  }
}

/** 從時間線的出生/死亡事件編輯器直接改日期時呼叫（TimelineEventEditorModal）：把新日期換算回
 * 角色資訊卡出生日期欄位使用的曆法（懸浮提示／個人時間線／全部角色彙整時間線可能各自用不同
 * 曆法，這裡沿用彙整同步的換算邏輯），寫回 Entry 後整個重跑一次 syncCharacterTimeline——這樣
 * 角色自己的時間線、全部角色彙整時間線都會用新日期重新同步，不用另外手動更新那兩條時間線上的
 * 事件。sourceCalendar 是使用者當下在哪條時間線上編輯（可能是角色自己的，也可能是彙整的）所用
 * 的曆法，不一定等於角色欄位本身設定的曆法 */
export async function updateCharacterBirthOrDeathDate(
  entryId: string,
  kind: "birth" | "death",
  sourceCalendar: Calendar,
  date: PlainDateTime
): Promise<void> {
  const entry = await db.entries.get(entryId);
  if (!entry) return;
  const birthField = findBirthField(entry);
  if (!birthField?.dateConfig?.calendarId) return;
  const targetCalendar = await db.calendars.get(birthField.dateConfig.calendarId);
  if (!targetCalendar) return;
  const converted = convertDate(sourceCalendar, targetCalendar, date);

  const raw = entry.values[birthField.id]?.current as DateFieldValue | undefined;
  if (!raw || raw.mode !== "single") return;
  const current = raw as DateValueSingle;
  const updatedValue: DateValueSingle = kind === "birth" ? { ...current, ...converted } : { ...current, death: converted };

  const updatedEntry: Entry = {
    ...entry,
    values: { ...entry.values, [birthField.id]: { ...entry.values[birthField.id], current: updatedValue } },
    updatedAt: nowISO(),
  };
  await db.entries.put(updatedEntry);
  await syncCharacterTimeline(updatedEntry);
}

/** Entry 被刪除時呼叫：清除其擁有的角色時間線（分支/事件都會被 deleteTimeline 連坐刪除），
 * 並把它在「全部角色」彙整時間線上留下的事件一併清掉，避免刪掉的角色還留著幽靈事件 */
export async function deleteCharacterTimelineForEntry(entryId: string, worldId: string): Promise<void> {
  const timeline = await getTimelineByOwnerEntry(entryId);
  if (timeline) await deleteTimeline(timeline.id);

  const roster = await getAllCharactersTimeline(worldId);
  if (roster) {
    const ownEvents = (await listEvents(roster.id)).filter((e) => e.autoKind && e.relatedEntryIds.includes(entryId));
    for (const e of ownEvents) await deleteEvent(e.id);
  }
}

/** 找出所有關聯到這個角色（relatedEntryIds 包含 entryId）的時間線事件——不限這個角色自己的角色
 * 時間線，任何時間線上的事件都算，供角色資訊卡摘要一次列出所有相關的時間點。排除「全部角色」
 * 彙整時間線上的事件：那些是角色自己時間線上出生/死亡/受孕事件的鏡像副本（見 syncCharacterTimeline），
 * 不排除的話，角色資訊卡摘要會看到同一個出生事件出現兩次（自己的時間線一份、彙整時間線一份）。
 * relatedEntryIds 不是索引欄位，全表掃描（跟 calendarId／ownerEntryId 一樣的既有慣例） */
export async function listEventsRelatedToEntry(entryId: string, worldId: string): Promise<TimelineEvent[]> {
  const roster = await getAllCharactersTimeline(worldId);
  return db.timelineEvents.filter((e) => e.relatedEntryIds.includes(entryId) && e.timelineId !== roster?.id).toArray();
}
