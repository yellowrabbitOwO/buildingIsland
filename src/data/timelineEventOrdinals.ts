import { dateToOrdinal } from "./calendarMath";
import type { Calendar, DateFieldValue, DateValueRecurring } from "./types";

/** 事件排序/定位用的代表性 ordinal：單一時間直接算；持續型用起始日期；固定性沒有單一對應的
 * 時間點，用「year 0」當參考年份、只取月/日部分，單純供排序使用，不代表真實日期 */
export function eventPrimaryOrdinal(calendar: Calendar, date: DateFieldValue): number {
  if (date.mode === "single") return dateToOrdinal(calendar, date);
  if (date.mode === "range") return dateToOrdinal(calendar, date.start);
  return dateToOrdinal(calendar, { year: 0, monthIndex: date.monthIndex ?? 0, day: date.day });
}

/** 供畫布可視範圍自動擴張使用：單一時間／持續型事件有明確的日期邊界，回傳其 ordinal；
 * 固定性事件沒有內在邊界（永遠重複下去），不參與自動擴張，回傳空陣列 */
export function eventOrdinalsForViewRange(calendar: Calendar, date: DateFieldValue): number[] {
  if (date.mode === "single") return [dateToOrdinal(calendar, date)];
  if (date.mode === "range") {
    const ords = [dateToOrdinal(calendar, date.start)];
    if (date.end) ords.push(dateToOrdinal(calendar, date.end));
    return ords;
  }
  return [];
}

/** 展開固定性事件在 [minYear, maxYear] 可視範圍內的每次發生日期（ordinal）。每月重複的事件在
 * 幾十年範圍裡會展開出成百上千個發生點，全部畫出來會讓畫布爆版——超過 capCount 時等間隔抽樣，
 * 只畫代表性的一部分，視覺上仍讀得出「這是重複事件」 */
export function recurringOccurrenceOrdinals(
  calendar: Calendar,
  date: DateValueRecurring,
  minYear: number,
  maxYear: number,
  capCount = 60
): number[] {
  const all: number[] = [];
  if (date.frequency === "yearly") {
    for (let y = minYear; y <= maxYear; y++) {
      all.push(dateToOrdinal(calendar, { year: y, monthIndex: date.monthIndex ?? 0, day: date.day, hour: date.hour, minute: date.minute, second: date.second }));
    }
  } else {
    for (let y = minYear; y <= maxYear; y++) {
      for (let m = 0; m < calendar.months.length; m++) {
        const maxDay = calendar.months[m]?.days ?? 1;
        const day = Math.min(date.day, maxDay);
        all.push(dateToOrdinal(calendar, { year: y, monthIndex: m, day, hour: date.hour, minute: date.minute, second: date.second }));
      }
    }
  }
  if (all.length <= capCount) return all;
  const stride = all.length / capCount;
  const sampled: number[] = [];
  for (let i = 0; i < capCount; i++) sampled.push(all[Math.floor(i * stride)]);
  return sampled;
}
