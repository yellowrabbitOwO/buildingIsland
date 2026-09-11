import type { Calendar, DateFieldValue, DateTimePrecision, Timeline, TimelineBranch, TimelineEvent } from "../types";
import type { MarkdownExportContext } from "../exportMarkdown";
import { formatDate } from "../../components/common/DateValueEditor";
import { eventDate } from "../repositories/timelineEvent";
import { eventPrimaryOrdinal } from "../timelineEventOrdinals";
import { fieldsToBlocks } from "./entryFieldsToManuscript";
import type { ManuscriptBlock, ManuscriptDoc } from "./manuscriptIR";
import { type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** formatEventDate 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

/** 事件自己的 DateFieldValue 轉成顯示文字，邏輯比照 exportMarkdown.ts 的 formatDateValue，
 * 只是這裡沒有 FieldDef 包著（Timeline/TimelineEvent 的日期是頂層欄位，不是通用欄位系統的一部分） */
function formatEventDate(calendar: Calendar, date: DateFieldValue, precision: DateTimePrecision, t: TFn = fallbackT): string {
  if (date.mode === "single") {
    let text = formatDate(calendar, date, precision);
    if (date.death) text += t("dateFieldPicker.deathSuffix", { date: formatDate(calendar, date.death, precision) });
    return text;
  }
  if (date.mode === "range") {
    const start = formatDate(calendar, date.start, precision);
    const end = date.end ? formatDate(calendar, date.end, precision) : t("exportMarkdown.ongoing");
    return `${start} ～ ${end}`;
  }
  if (date.frequency === "yearly" && date.monthIndex !== undefined) {
    return t("characterTimelineSummary.yearlyRecurrence", { month: calendar.months[date.monthIndex]?.name ?? "?", day: date.day });
  }
  return t("characterTimelineSummary.monthlyRecurrence", { day: date.day });
}

/** 依 parentBranchId 深度優先走訪分支樹（同層依 order 排序，比照 StoryChapter 的
 * parentChapterId 走法），每個分支底下的事件依 eventPrimaryOrdinal（既有的排序/定位用 ordinal，
 * TimelineViewPage.tsx 畫布本身也是用這個排事件位置，固定性事件沒有單一真實日期，
 * 這個既有函式用 year 0 當參考年份取月/日排序，這裡直接沿用同一套邏輯而不是另外設計
 * 「重複事件獨立分節」，比較一致也比較省工） */
function walkBranches(
  branches: TimelineBranch[],
  parentId: string | undefined,
  depth: number,
  calendar: Calendar,
  precision: DateTimePrecision,
  eventsByBranch: Map<string, TimelineEvent[]>,
  ctx: MarkdownExportContext,
  out: ManuscriptBlock[],
  t: TFn
): void {
  const siblings = branches.filter((b) => b.parentBranchId === parentId).sort((a, b) => a.order - b.order);
  for (const branch of siblings) {
    out.push({ kind: "heading", level: Math.min(depth + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6, runs: [{ text: branch.name }] });
    const events = (eventsByBranch.get(branch.id) ?? [])
      .slice()
      .sort((a, b) => eventPrimaryOrdinal(calendar, eventDate(a)) - eventPrimaryOrdinal(calendar, eventDate(b)));
    for (const event of events) {
      out.push({ kind: "heading", level: Math.min(depth + 2, 6) as 1 | 2 | 3 | 4 | 5 | 6, runs: [{ text: event.name }] });
      out.push({ kind: "paragraph", runs: [{ text: formatEventDate(calendar, eventDate(event), precision, t), italic: true }] });
      out.push(...fieldsToBlocks(event.fields, event.values, ctx, t));
    }
    walkBranches(branches, branch.id, depth + 1, calendar, precision, eventsByBranch, ctx, out, t);
  }
}

export function timelineToManuscript(
  timeline: Timeline,
  branches: TimelineBranch[],
  events: TimelineEvent[],
  calendar: Calendar,
  ctx: MarkdownExportContext,
  author?: string,
  t: TFn = fallbackT
): ManuscriptDoc {
  const blocks: ManuscriptBlock[] = [];
  if (timeline.description) blocks.push({ kind: "paragraph", runs: [{ text: timeline.description, italic: true }] });

  const eventsByBranch = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    if (!eventsByBranch.has(e.branchId)) eventsByBranch.set(e.branchId, []);
    eventsByBranch.get(e.branchId)!.push(e);
  }
  walkBranches(branches, undefined, 0, calendar, timeline.timePrecision ?? "day", eventsByBranch, ctx, blocks, t);

  return { title: timeline.name, author, blocks };
}
