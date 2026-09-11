import { dateToOrdinal, totalDaysInYear } from "./calendarMath";
import { eventDate } from "./repositories/timelineEvent";
import type { Calendar, DateFieldConfig, DateValueSingle, TimelineEvent } from "./types";
import type { TranslationKey } from "../i18n";
import zhTW from "../locales/zh-TW";

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** formatAge 沒收到 t 時的預設行為：固定顯示中文，與這個函式改動前的行為一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export type AgeResult =
  | { kind: "duringPregnancy" }
  | { kind: "beforeBirth"; yearsBefore: number }
  | { kind: "alive"; age: number }
  | { kind: "afterDeath"; yearsAfter: number }
  /** 查詢時間點早於推算出的受孕起點（若有設定孕期長度），或早於出生但沒開啟「顯示出生前的時間點」
   * ——這個時間點對這個角色來說沒有意義，呼叫端應該把這種結果直接濾掉，不顯示 */
  | { kind: "unknown" };

/** 算出一個角色在某個時間點的狀態（歲數／出生前／胎兒期／死後），純函式，被角色資訊卡摘要與
 * 角色時間線畫布共用。年齡用「已滿週歲」算法（整除，不進位），跟真實世界認定歲數的方式一致。
 * duringPregnancy 指的是這個角色自己還在母體內、尚未出生的階段，不是這個角色本身懷孕 */
export function computeAgeAt(
  calendar: Calendar,
  birth: DateValueSingle,
  config: DateFieldConfig,
  target: { year: number; monthIndex: number; day: number }
): AgeResult {
  const targetOrdinal = dateToOrdinal(calendar, target);
  const birthOrdinal = dateToOrdinal(calendar, birth);

  if (config.trackDeath && birth.death) {
    const deathOrdinal = dateToOrdinal(calendar, birth.death);
    if (targetOrdinal > deathOrdinal) {
      const yearsAfter = Math.floor((targetOrdinal - deathOrdinal) / totalDaysInYear(calendar));
      return { kind: "afterDeath", yearsAfter };
    }
  }

  if (targetOrdinal >= birthOrdinal) {
    const age = Math.floor((targetOrdinal - birthOrdinal) / totalDaysInYear(calendar));
    return { kind: "alive", age };
  }

  if (config.gestationDays) {
    const conceptionOrdinal = birthOrdinal - config.gestationDays;
    if (targetOrdinal >= conceptionOrdinal) return { kind: "duringPregnancy" };
    return { kind: "unknown" };
  }

  if (config.showBeforeBirth) {
    const yearsBefore = Math.ceil((birthOrdinal - targetOrdinal) / totalDaysInYear(calendar));
    return { kind: "beforeBirth", yearsBefore };
  }

  return { kind: "unknown" };
}

/** AgeResult 的顯示文字；"unknown" 對呼叫端沒有意義，回傳 null，由呼叫端決定要不要整行不顯示 */
export function formatAge(result: AgeResult, t: TFn = fallbackT): string | null {
  if (result.kind === "alive") return t("characterAge.ageInYears", { age: result.age });
  if (result.kind === "beforeBirth") return t("characterAge.yearsBeforeBirth", { years: result.yearsBefore });
  if (result.kind === "duringPregnancy") return t("characterAge.duringPregnancy");
  if (result.kind === "afterDeath") return t("characterAge.yearsAfterDeath", { years: result.yearsAfter });
  return null;
}

export interface CharacterLifeEndpoint {
  name: string;
  /** 這個角色的出生事件掛在哪條分支上——時間線畫布用這個決定生命階段底色要畫在哪一條車道，
   * 懸浮提示則不需要這個欄位 */
  branchId: string;
  birth: DateValueSingle;
  config: DateFieldConfig;
}

/** 依角色自動事件（birth/death/pregnancyStart，同一角色靠 relatedEntryIds 串起來）重建每個角色的
 * 出生/死亡/受孕端點，交給 computeAgeAt 算某個時間點當下每個角色的生命階段。直接用這條時間線
 * 自己已經載入的事件重建，不用另外查角色資訊卡——角色自己的時間線／全部角色彙整時間線／匯入了
 * 這些事件的其他時間線都適用，因為 autoKind／relatedEntryIds 在複製時都會保留（見 importTimeline）。
 * showBeforeBirth 固定開，讓「出生前」一定算得出來：這裡服務的是懸浮提示／生命階段底色，跟角色
 * 資訊卡欄位設定裡「顯示出生前的時間點」開關（只影響資訊卡本身要不要顯示這行）用途不同 */
export function buildCharacterEndpoints(calendar: Calendar, events: TimelineEvent[]): CharacterLifeEndpoint[] {
  const birthEvents = events.filter((e) => e.autoKind === "birth" && e.relatedEntryIds.length > 0);
  return birthEvents.map((be) => {
    const entryId = be.relatedEntryIds[0];
    const deathEvent = events.find((e) => e.autoKind === "death" && e.relatedEntryIds.includes(entryId));
    const pregnancyEvent = events.find((e) => e.autoKind === "pregnancyStart" && e.relatedEntryIds.includes(entryId));
    const birthDate = eventDate(be) as DateValueSingle;
    const deathDate = deathEvent ? (eventDate(deathEvent) as DateValueSingle) : undefined;
    const gestationDays = pregnancyEvent
      ? Math.round(dateToOrdinal(calendar, birthDate) - dateToOrdinal(calendar, eventDate(pregnancyEvent) as DateValueSingle))
      : undefined;
    return {
      name: be.name.replace(/\s*出生$/, ""),
      branchId: be.branchId,
      birth: { ...birthDate, mode: "single", death: deathDate },
      config: { calendarId: calendar.id, mode: "single", trackDeath: !!deathEvent, gestationDays, showBeforeBirth: true },
    };
  });
}
