import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { db } from "../../data/db";
import type { Calendar, DateFieldConfig, DateFieldValue, DateValueSingle, Entry } from "../../data/types";
import { getTimelineByOwnerEntry } from "../../data/repositories/timeline";
import { listEventsRelatedToEntry } from "../../data/repositories/characterTimeline";
import { eventDate } from "../../data/repositories/timelineEvent";
import { eventPrimaryOrdinal } from "../../data/timelineEventOrdinals";
import { formatDate } from "../common/DateValueEditor";
import { computeAgeAt, formatAge } from "../../data/characterAge";
import { useSidePanel } from "../common/SidePanelProvider";
import TimelineViewPage from "../../pages/TimelineViewPage";
import { useLanguage, type TranslationKey } from "../../i18n";

function findBirthField(entry: Entry) {
  return entry.fields.find((f) => f.type === "date" && f.dateConfig?.role === "birth");
}

/** 相關事件的日期顯示：只有單一時間模式才跟出生日期比較算歲數（computeAgeAt 本身是針對單一
 * 時間點的對比）；固定性/持續型事件照樣列出日期/名稱，但不顯示歲數 */
function formatRelatedEventDate(
  calendar: Calendar,
  date: DateFieldValue,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (date.mode === "single") return formatDate(calendar, date, "day", t);
  if (date.mode === "range")
    return `${formatDate(calendar, date.start, "day", t)} ～ ${date.end ? formatDate(calendar, date.end, "day", t) : t("characterTimelineSummary.presentLabel")}`;
  const month = calendar.months[date.monthIndex ?? 0];
  return date.frequency === "yearly"
    ? t("characterTimelineSummary.yearlyRecurrence", { month: month?.name ?? "?", day: date.day })
    : t("characterTimelineSummary.monthlyRecurrence", { day: date.day });
}

/** 死亡當下的歲數——直接對死亡日期本身呼叫 computeAgeAt：target 等於 death 時 targetOrdinal
 * 不會大於 deathOrdinal，afterDeath 分支不會被觸發，會自然落到 alive 分支算出「享年」 */
function ageAtDeath(calendar: Calendar, birth: DateValueSingle, config: DateFieldConfig): number | null {
  if (!birth.death) return null;
  const result = computeAgeAt(calendar, birth, config, birth.death);
  return result.kind === "alive" ? result.age : null;
}

/** 角色資訊卡下方的唯讀摘要：出生（可選死亡）日期＋所有連結到這個角色的時間線事件與當時歲數。
 * 找不到「出生日期」時間欄位或欄位還沒有值時完全不渲染。比照 TimelinePreview 的簡潔唯讀清單風格，
 * 複雜的畫布瀏覽/手動加事件/分岔都交給既有 TimelineViewPage，這裡只做一覽 */
export default function CharacterTimelineSummary({ entry, embedded }: { entry: Entry; embedded?: boolean }) {
  const navigate = useNavigate();
  const { openPanel } = useSidePanel();
  const { t } = useLanguage();

  const birthField = findBirthField(entry);
  const rawValue = birthField ? (entry.values[birthField.id]?.current as DateFieldValue | undefined) : undefined;

  const timeline = useLiveQuery(() => getTimelineByOwnerEntry(entry.id), [entry.id]);
  const calendar = useLiveQuery(() => (timeline ? db.calendars.get(timeline.calendarId) : undefined), [timeline?.calendarId]);
  const relatedEvents = useLiveQuery(() => listEventsRelatedToEntry(entry.id, entry.worldId), [entry.id, entry.worldId]);

  if (!birthField || !rawValue || rawValue.mode !== "single") return null;
  const birth = rawValue as DateValueSingle;
  const config = birthField.dateConfig as DateFieldConfig;
  // timeline／calendar 還在查詢中，或出生日期剛填入、存檔時的自動同步還沒跑完——先不渲染，
  // 下一次 useLiveQuery 更新（同步完成後）就會自然補上
  if (!timeline || !calendar) return null;

  const sortedEvents = (relatedEvents ?? [])
    .slice()
    .sort((a, b) => eventPrimaryOrdinal(calendar, eventDate(a)) - eventPrimaryOrdinal(calendar, eventDate(b)));
  const death = config.trackDeath ? birth.death : undefined;
  const deathAge = death ? ageAtDeath(calendar, birth, config) : null;

  return (
    <div style={{ marginTop: 28 }}>
      <h3 style={{ marginBottom: 10 }}>{t("characterTimelineSummary.title")}</h3>
      <div className="card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{t("characterTimelineSummary.birthLine", { date: formatDate(calendar, birth, config.precision, t) })}</span>
          {death && (
            <span>
              {t("characterTimelineSummary.deathLine", { date: formatDate(calendar, death, config.precision, t) })}
              {deathAge !== null && t("characterTimelineSummary.deathAgeSuffix", { age: deathAge })}
            </span>
          )}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
          <TimelineViewPage key={timeline.id} timelineIdOverride={timeline.id} worldIdOverride={entry.worldId} embedded />
        </div>
        {sortedEvents.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sortedEvents.map((e) => {
              const d = eventDate(e);
              const ageText = d.mode === "single" ? formatAge(computeAgeAt(calendar, birth, config, d), t) : null;
              return (
                <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13 }}>
                  <span>{t("characterTimelineSummary.eventLine", { date: formatRelatedEventDate(calendar, d, t), name: e.name })}</span>
                  {ageText && <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{ageText}</span>}
                </div>
              );
            })}
          </div>
        )}
        <button
          className="btn-ghost"
          style={{ alignSelf: "flex-start" }}
          onClick={() =>
            embedded ? openPanel({ kind: "timeline", timelineId: timeline.id }) : navigate(`/world/${entry.worldId}/timeline/${timeline.id}`)
          }
        >
          {t("characterTimelineSummary.viewFullTimeline")}
        </button>
      </div>
    </div>
  );
}
