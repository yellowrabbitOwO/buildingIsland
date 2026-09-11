import type { Calendar, PlainDateTime } from "./types";
import { type TranslationKey } from "../i18n";
import zhTW from "../locales/zh-TW";

const SECONDS_PER_DAY = 86400;

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** weekdayName 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export function totalDaysInYear(calendar: Calendar): number {
  return calendar.months.reduce((sum, m) => sum + m.days, 0);
}

export function daysBeforeMonth(calendar: Calendar, monthIndex: number): number {
  return calendar.months.slice(0, monthIndex).reduce((sum, m) => sum + m.days, 0);
}

/** 把曆法內的一個日期換算成單一可比較/可排序的整數（絕對天數序號），用於時間線排序與
 * 畫布上的 x 座標比例定位。year 可為負數（代表紀元之前）：只要 totalDaysInYear 固定，
 * 每一年就佔據連續、不重疊的一段整數區間，負數年份一樣單調遞增，不需要特殊處理西元前後的斷點。
 * 假設收到的一定是合法日期（monthIndex 在範圍內、day 不超過該月天數）——防呆在輸入端（曆法編輯器、
 * 事件日期選擇器）做，這裡不重驗，比照 ScaleFieldConfig 的 min/max 也是輸入端擋的既有慣例 */
/** hour/minute/second 缺省視為 0（純日期，跟改用 PlainDateTime 之前的行為一致），有值時換算成
 * 「一天內的小數部分」疊加在整數天序號上，讓有時分秒的日期一樣能線性比較大小、定位畫布 x 座標 */
export function dateToOrdinal(
  calendar: Calendar,
  date: { year: number; monthIndex: number; day: number; hour?: number; minute?: number; second?: number }
): number {
  const dayOrdinal = date.year * totalDaysInYear(calendar) + daysBeforeMonth(calendar, date.monthIndex) + (date.day - 1);
  const secondsOfDay = (date.hour ?? 0) * 3600 + (date.minute ?? 0) * 60 + (date.second ?? 0);
  return dayOrdinal + secondsOfDay / SECONDS_PER_DAY;
}

/** dateToOrdinal 的反函式：把絕對天數序號（可能帶小數＝一天內的時分秒）換算回年/月/日/時/分/秒，
 * 供時間軸畫布「點擊線段上的某個位置→換算成那個位置對應的日期」使用。Math.floor 對負數 ordinal
 * 也會正確取整（往負無限大捨去），讓 remaining 穩定落在 [0, totalDaysInYear) 範圍內，負數年份
 * 不需要特殊處理。回傳的 hour/minute/second 一律有值（純日期時全為 0），是否顯示交給呼叫端依
 * precision 決定 */
export function ordinalToDate(calendar: Calendar, ordinal: number): PlainDateTime {
  const dayOrdinal = Math.floor(ordinal);
  const totalSeconds = Math.min(Math.round((ordinal - dayOrdinal) * SECONDS_PER_DAY), SECONDS_PER_DAY - 1);
  const hour = Math.floor(totalSeconds / 3600);
  const minute = Math.floor((totalSeconds % 3600) / 60);
  const second = totalSeconds % 60;

  const daysPerYear = totalDaysInYear(calendar);
  const year = Math.floor(dayOrdinal / daysPerYear);
  let remaining = dayOrdinal - year * daysPerYear;
  for (let i = 0; i < calendar.months.length; i++) {
    if (remaining < calendar.months[i].days) return { year, monthIndex: i, day: remaining + 1, hour, minute, second };
    remaining -= calendar.months[i].days;
  }
  const lastIndex = calendar.months.length - 1;
  return { year, monthIndex: lastIndex, day: calendar.months[lastIndex]?.days ?? 1, hour, minute, second };
}

/** 星期是獨立於月份結構之外、單純每隔 weekLength 天重複一次的週期，不受月份邊界影響——
 * 用錨點日期（已知對應第幾個星期幾）跟目標日期的絕對天數差去推算，錨點前後的日期一樣適用
 * （差值為負數時用雙重取餘正規化回 [0, weekLength) 範圍）。曆法沒設定 weekLength（或 <1）
 * 代表不追蹤星期概念，回傳 undefined，呼叫端（時間線／月曆模式）要能處理 */
export function weekdayOf(calendar: Calendar, ordinal: number): number | undefined {
  if (!calendar.weekLength || calendar.weekLength < 1) return undefined;
  const anchor = calendar.weekAnchor ?? { year: 0, monthIndex: 0, day: 1, weekdayIndex: 0 };
  const anchorOrdinal = Math.floor(dateToOrdinal(calendar, anchor));
  const diff = Math.floor(ordinal) - anchorOrdinal;
  return (((anchor.weekdayIndex + diff) % calendar.weekLength) + calendar.weekLength) % calendar.weekLength;
}

/** 某個日期是不是週末；曆法沒設定星期概念時一律回傳 false（不是「不知道」，是這套曆法根本沒有
 * 週末的概念,呼叫端不用另外判斷 undefined） */
export function isWeekend(calendar: Calendar, ordinal: number): boolean {
  const wd = weekdayOf(calendar, ordinal);
  if (wd === undefined) return false;
  return (calendar.weekendDayIndices ?? []).includes(wd);
}

/** 星期幾的顯示名稱；沒特別命名就退回「第 N 天」，不會因為使用者沒填名稱就顯示空字串 */
export function weekdayName(calendar: Calendar, weekdayIndex: number, t: TFn = fallbackT): string {
  return calendar.weekdayNames?.[weekdayIndex] ?? t("calendarEditorDialog.dayOrdinal", { n: weekdayIndex + 1 });
}
