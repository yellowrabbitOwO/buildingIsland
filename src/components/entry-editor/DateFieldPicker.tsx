import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import DateValueEditor, { PlainDateTimeInputs, defaultValueFor, formatDate } from "../common/DateValueEditor";
import type { Calendar, DateFieldConfig, DateFieldValue, DateValueSingle, PlainDateTime } from "../../data/types";
import { useLanguage } from "../../i18n";

interface DateFieldPickerProps {
  config: DateFieldConfig;
  value: unknown;
  editing: boolean;
  onChange: (value: DateFieldValue) => void;
}

/** 可留空的日期列（死亡日期）：勾選才會出現輸入框，取消勾選＝清空該日期 */
function OptionalDateRow({
  label,
  calendar,
  precision,
  date,
  onChange,
}: {
  label: string;
  calendar: Calendar;
  precision: DateFieldConfig["precision"];
  date: PlainDateTime | undefined;
  onChange: (date: PlainDateTime | undefined) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
        <input
          type="checkbox"
          checked={!!date}
          onChange={(e) => onChange(e.target.checked ? { year: 0, monthIndex: 0, day: 1 } : undefined)}
        />
        {label}
      </label>
      {date && <PlainDateTimeInputs calendar={calendar} precision={precision} date={date} onChange={onChange} />}
    </div>
  );
}

/** 時間欄位的值編輯／唯讀顯示：日期本體（單一時間／固定性／持續型三種模式）委派給共用的
 * DateValueEditor；這裡只額外處理 role==="birth" 才有的「死亡日期」子欄位——受孕不再是使用者
 * 填的值，改由 config.gestationDays 從出生日期自動推算，不在這裡輸入 */
export default function DateFieldPicker({ config, value, editing, onChange }: DateFieldPickerProps) {
  const calendar = useLiveQuery(() => (config.calendarId ? db.calendars.get(config.calendarId) : undefined), [config.calendarId]);
  const { t } = useLanguage();

  if (!config.calendarId) {
    return <span style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("dateFieldPicker.noCalendarHint")}</span>;
  }
  if (!calendar) return null; // 查詢中，或曆法已被刪除——後者留給使用者自行到欄位設定重新選擇，這裡不特別報錯

  const raw = value as DateFieldValue | undefined;
  const isSet = raw && raw.mode === config.mode;

  const showDeathRow = config.mode === "single" && config.role === "birth" && config.trackDeath;

  if (!editing) {
    const base = <DateValueEditor calendar={calendar} mode={config.mode} precision={config.precision} value={raw} editing={false} onChange={onChange} />;
    if (!showDeathRow || !isSet) return base;
    const single = raw as DateValueSingle;
    if (!single.death) return base;
    return (
      <span>
        {formatDate(calendar, single, config.precision, t)}
        {t("dateFieldPicker.deathSuffix", { date: formatDate(calendar, single.death, config.precision, t) })}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <DateValueEditor calendar={calendar} mode={config.mode} precision={config.precision} value={raw} editing onChange={onChange} />
      {showDeathRow &&
        (() => {
          const single = (isSet ? raw : defaultValueFor("single")) as DateValueSingle;
          return (
            <OptionalDateRow
              label={t("dateFieldPicker.deathDateLabel")}
              calendar={calendar}
              precision={config.precision}
              date={single.death}
              onChange={(death) => onChange({ ...single, death })}
            />
          );
        })()}
    </div>
  );
}
