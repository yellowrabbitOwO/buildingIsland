import { RECURRENCE_FREQUENCY_LABELS } from "../../data/fieldTypeLabels";
import type {
  Calendar,
  DateFieldMode,
  DateFieldValue,
  DateTimePrecision,
  DateValueRange,
  DateValueRecurring,
  DateValueSingle,
  PlainDateTime,
  RecurrenceFrequency,
} from "../../data/types";
import { useLanguage, type TranslationKey } from "../../i18n";
import zhTW from "../../locales/zh-TW";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

type TFn = (key: TranslationKey, vars?: Record<string, string | number>) => string;

/** formatDate 沒收到 t（如匯出成稿等尚未接語言切換的呼叫端）時的預設行為：固定顯示中文，
 * 與這個函式改動前的行為完全一致 */
function fallbackT(key: TranslationKey, vars?: Record<string, string | number>): string {
  let text: string = zhTW[key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
  }
  return text;
}

export function defaultValueFor(mode: DateFieldMode): DateFieldValue {
  if (mode === "single") return { mode: "single", year: 0, monthIndex: 0, day: 1 };
  if (mode === "recurring") return { mode: "recurring", frequency: "yearly", monthIndex: 0, day: 1 };
  return { mode: "range", start: { year: 0, monthIndex: 0, day: 1 } };
}

/** 依 precision 決定日期字串要顯示到哪一層——年/月/日依序疊加，時/分/秒依序疊加在後面；
 * 缺省的 monthIndex/day/hour/minute/second 一律當 0（day 當 1），但精度不到那一層就不顯示，
 * 避免「只到年」的日期還是印出一整串「1 月 1 日 00:00」 */
export function formatDate(calendar: Calendar, d: PlainDateTime, precision: DateTimePrecision = "day", t: TFn = fallbackT): string {
  let text = t("dateValueEditor.yearUnit", { year: d.year });
  if (precision === "year") return text;
  const month = calendar.months[d.monthIndex];
  text += ` ${month?.name ?? "?"}`;
  if (precision === "month") return text;
  text += t("dateValueEditor.dayUnit", { day: d.day });
  if (precision === "hour") text += t("dateValueEditor.hourUnit", { hour: pad(d.hour ?? 0) });
  else if (precision === "minute") text += ` ${pad(d.hour ?? 0)}:${pad(d.minute ?? 0)}`;
  else if (precision === "second") text += ` ${pad(d.hour ?? 0)}:${pad(d.minute ?? 0)}:${pad(d.second ?? 0)}`;
  return text;
}

/** 曆法裡所有月份的最大天數；月循環（每月固定 N 號）沒有特定月份可依循，用這個當輸入端的合理上限 */
export function maxDayInCalendar(calendar: Calendar): number {
  return calendar.months.reduce((max, m) => Math.max(max, m.days), 1);
}

/** 單一日期（可選帶時分秒）的輸入框，日輸入依所選月份天數上限夾住；年/月/日/時/分/秒依 precision
 * 漸進顯示（year＝只顯示年；month＝加月；day＝加日；hour＝再加時；minute＝時+分；second＝時+分+秒）——
 * 比照 TimelineEventEditorModal 既有的日期選擇器 pattern */
export function PlainDateTimeInputs({
  calendar,
  precision = "day",
  date,
  onChange,
}: {
  calendar: Calendar;
  precision?: DateTimePrecision;
  date: PlainDateTime;
  onChange: (date: PlainDateTime) => void;
}) {
  const month = calendar.months[date.monthIndex];
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
        {t("dateValueEditor.yearLabel")}
        <input
          type="number"
          style={{ width: 80 }}
          value={date.year}
          onChange={(e) => onChange({ ...date, year: parseInt(e.target.value, 10) || 0 })}
        />
      </label>
      {precision !== "year" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.monthLabel")}
          <select
            value={date.monthIndex}
            onChange={(e) => {
              const monthIndex = parseInt(e.target.value, 10);
              const maxDays = calendar.months[monthIndex]?.days ?? 1;
              onChange({ ...date, monthIndex, day: Math.min(date.day, maxDays) });
            }}
          >
            {calendar.months.map((m, i) => (
              <option key={m.id} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {precision !== "year" && precision !== "month" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.dayLabel")}
          <input
            type="number"
            style={{ width: 64 }}
            min={1}
            max={month?.days ?? 1}
            value={date.day}
            onChange={(e) => {
              const maxDays = month?.days ?? 1;
              onChange({ ...date, day: Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), maxDays) });
            }}
          />
        </label>
      )}
      {(precision === "hour" || precision === "minute" || precision === "second") && (
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.hourLabel")}
          <input
            type="number"
            style={{ width: 56 }}
            min={0}
            max={23}
            value={date.hour ?? 0}
            onChange={(e) => onChange({ ...date, hour: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 23) })}
          />
        </label>
      )}
      {(precision === "minute" || precision === "second") && (
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.minuteLabel")}
          <input
            type="number"
            style={{ width: 56 }}
            min={0}
            max={59}
            value={date.minute ?? 0}
            onChange={(e) => onChange({ ...date, minute: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 59) })}
          />
        </label>
      )}
      {precision === "second" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.secondLabel")}
          <input
            type="number"
            style={{ width: 56 }}
            min={0}
            max={59}
            value={date.second ?? 0}
            onChange={(e) => onChange({ ...date, second: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 59) })}
          />
        </label>
      )}
    </div>
  );
}

interface DateValueEditorProps {
  calendar: Calendar;
  mode: DateFieldMode;
  precision?: DateTimePrecision;
  value: DateFieldValue | undefined;
  editing: boolean;
  onChange: (value: DateFieldValue) => void;
}

/** 日期值的編輯／唯讀顯示，跟「這個值屬於哪個欄位/事件」無關，只認 mode／precision——
 * 供通用時間欄位（DateFieldPicker）與時間線事件（TimelineEventEditorModal）共用，避免兩邊
 * 各自重複實作單一時間／固定性／持續型三種模式的輸入邏輯。角色出生日期的死亡等額外子欄位
 * 由呼叫端（DateFieldPicker）自己在外面加，不屬於這個共用元件的職責 */
export default function DateValueEditor({ calendar, mode, precision = "day", value, editing, onChange }: DateValueEditorProps) {
  const { t } = useLanguage();
  const isSet = value && value.mode === mode;

  if (!editing) {
    if (!isSet) return <span style={{ color: "var(--text-faint)" }}>{t("common.notSet")}</span>;
    const current = value;
    if (current.mode === "single") {
      return <span>{formatDate(calendar, current as DateValueSingle, precision, t)}</span>;
    }
    if (current.mode === "recurring") {
      const recurring = current as DateValueRecurring;
      const timeSuffix =
        precision === "hour"
          ? t("dateValueEditor.hourUnit", { hour: pad(recurring.hour ?? 0) })
          : precision === "minute"
            ? ` ${pad(recurring.hour ?? 0)}:${pad(recurring.minute ?? 0)}`
            : precision === "second"
              ? ` ${pad(recurring.hour ?? 0)}:${pad(recurring.minute ?? 0)}:${pad(recurring.second ?? 0)}`
              : "";
      if (recurring.frequency === "yearly") {
        const month = calendar.months[recurring.monthIndex ?? 0];
        return (
          <span>
            {t("dateValueEditor.yearlyDisplay", { month: month?.name ?? "?", day: recurring.day, timeSuffix })}
          </span>
        );
      }
      return (
        <span>
          {t("dateValueEditor.monthlyDisplay", { day: recurring.day, timeSuffix })}
        </span>
      );
    }
    const range = current as DateValueRange;
    return (
      <span>
        {formatDate(calendar, range.start, precision, t)} ～ {range.end ? formatDate(calendar, range.end, precision, t) : t("common.present")}
      </span>
    );
  }

  // 編輯模式：尚未設定值時，用 mode 的預設起始值讓輸入框有東西可以填，而不是空白/報錯
  const current = isSet ? value : defaultValueFor(mode);

  if (current.mode === "single") {
    const single = current as DateValueSingle;
    return (
      <PlainDateTimeInputs
        calendar={calendar}
        precision={precision}
        date={single}
        onChange={(date) => onChange({ ...single, ...date })}
      />
    );
  }

  if (current.mode === "recurring") {
    const recurring = current as DateValueRecurring;
    const dayMax = recurring.frequency === "yearly" ? calendar.months[recurring.monthIndex ?? 0]?.days ?? 1 : maxDayInCalendar(calendar);
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.frequencyLabel")}
          <select
            value={recurring.frequency}
            onChange={(e) => {
              const frequency = e.target.value as RecurrenceFrequency;
              const monthIndex = frequency === "yearly" ? recurring.monthIndex ?? 0 : undefined;
              const maxDays = frequency === "yearly" ? calendar.months[monthIndex ?? 0]?.days ?? 1 : maxDayInCalendar(calendar);
              onChange({ ...recurring, frequency, monthIndex, day: Math.min(recurring.day, maxDays) });
            }}
          >
            {(Object.entries(RECURRENCE_FREQUENCY_LABELS) as [RecurrenceFrequency, TranslationKey][]).map(([freq, key]) => (
              <option key={freq} value={freq}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        {recurring.frequency === "yearly" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            {t("dateValueEditor.monthLabel")}
            <select
              value={recurring.monthIndex ?? 0}
              onChange={(e) => {
                const monthIndex = parseInt(e.target.value, 10);
                const maxDays = calendar.months[monthIndex]?.days ?? 1;
                onChange({ ...recurring, monthIndex, day: Math.min(recurring.day, maxDays) });
              }}
            >
              {calendar.months.map((m, i) => (
                <option key={m.id} value={i}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          {t("dateValueEditor.dayLabel")}
          <input
            type="number"
            style={{ width: 64 }}
            min={1}
            max={dayMax}
            value={recurring.day}
            onChange={(e) => onChange({ ...recurring, day: Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), dayMax) })}
          />
        </label>
        {(precision === "hour" || precision === "minute" || precision === "second") && (
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            {t("dateValueEditor.hourLabel")}
            <input
              type="number"
              style={{ width: 56 }}
              min={0}
              max={23}
              value={recurring.hour ?? 0}
              onChange={(e) => onChange({ ...recurring, hour: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 23) })}
            />
          </label>
        )}
        {(precision === "minute" || precision === "second") && (
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            {t("dateValueEditor.minuteLabel")}
            <input
              type="number"
              style={{ width: 56 }}
              min={0}
              max={59}
              value={recurring.minute ?? 0}
              onChange={(e) => onChange({ ...recurring, minute: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 59) })}
            />
          </label>
        )}
        {precision === "second" && (
          <label style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
            {t("dateValueEditor.secondLabel")}
            <input
              type="number"
              style={{ width: 56 }}
              min={0}
              max={59}
              value={recurring.second ?? 0}
              onChange={(e) => onChange({ ...recurring, second: Math.min(Math.max(0, parseInt(e.target.value, 10) || 0), 59) })}
            />
          </label>
        )}
      </div>
    );
  }

  const range = current as DateValueRange;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{t("dateValueEditor.startLabel")}</div>
        <PlainDateTimeInputs
          calendar={calendar}
          precision={precision}
          date={range.start}
          onChange={(start) => onChange({ ...range, start })}
        />
      </div>
      <div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={!range.end}
            onChange={(e) => onChange({ ...range, end: e.target.checked ? undefined : { ...range.start } })}
          />
          {t("dateValueEditor.ongoingLabel")}
        </label>
        {range.end && (
          <PlainDateTimeInputs
            calendar={calendar}
            precision={precision}
            date={range.end}
            onChange={(end) => onChange({ ...range, end })}
          />
        )}
      </div>
    </div>
  );
}
