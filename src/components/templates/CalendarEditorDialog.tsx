import { useState } from "react";
import Modal from "../common/Modal";
import { newId } from "../../data/db";
import { useDragReorder } from "../../data/reorder";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import type { Calendar, CalendarMonth, Scope } from "../../data/types";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useLanguage } from "../../i18n";

export interface CalendarWeekSettingsInput {
  weekLength?: number;
  weekdayNames?: string[];
  weekendDayIndices?: number[];
  weekAnchor?: { year: number; monthIndex: number; day: number; weekdayIndex: number };
}

interface CalendarEditorDialogProps {
  /** 提供時為編輯／檢視模式，未提供則為新增模式 */
  calendar?: Calendar;
  /** 唯讀檢視（用於內建曆法）：名稱／適用範圍／月份不能改，只有關閉按鈕——但星期設定不受這個限制，
   * 內建曆法（例如「西元」）一樣可以另外設定/調整星期，因為星期只是疊加在既有月份結構上的週期，
   * 不會讓任何既有事件的日期變成不合法，不需要比照月份結構那樣鎖起來保護 */
  readOnly?: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; scope: Scope; months: CalendarMonth[] } & CalendarWeekSettingsInput) => void;
  /** 星期設定另外存檔（用於內建曆法：名稱/月份鎖定不能送出，只送星期設定） */
  onSubmitWeekSettings?: (input: CalendarWeekSettingsInput) => void;
}

/** 曆法編輯：名稱＋適用範圍＋月份清單（每列名稱＋天數＋刪除，可拖曳排序）＋星期設定（選填：一週幾天、
 * 每天名稱、哪幾天算週末、錨點日期對應第幾個星期幾），比照 CreateGroupDialog 的「適用範圍」欄位設計。
 * 存檔防呆在這裡做——月數為 0 或有任何一個月天數 < 1 就不能儲存，數學層（calendarMath.ts）假設收到
 * 的永遠是合法曆法 */
export default function CalendarEditorDialog({
  calendar,
  readOnly,
  onClose,
  onSubmit,
  onSubmitWeekSettings,
}: CalendarEditorDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(calendar?.name ?? "");
  const [scope, setScope] = useState<Scope>(calendar?.scope ?? "world");
  const [months, setMonths] = useState<CalendarMonth[]>(calendar?.months ?? []);

  const [weekEnabled, setWeekEnabled] = useState(!!calendar?.weekLength);
  const [weekLength, setWeekLength] = useState(calendar?.weekLength ?? 7);
  const [weekdayNames, setWeekdayNames] = useState<string[]>(
    calendar?.weekdayNames ?? Array.from({ length: calendar?.weekLength ?? 7 }, (_, i) => t("calendarEditorDialog.dayOrdinal", { n: i + 1 }))
  );
  const [weekendDayIndices, setWeekendDayIndices] = useState<number[]>(calendar?.weekendDayIndices ?? []);
  const [anchorYear, setAnchorYear] = useState(calendar?.weekAnchor?.year ?? 0);
  const [anchorMonthIndex, setAnchorMonthIndex] = useState(calendar?.weekAnchor?.monthIndex ?? 0);
  const [anchorDay, setAnchorDay] = useState(calendar?.weekAnchor?.day ?? 1);
  const [anchorWeekdayIndex, setAnchorWeekdayIndex] = useState(calendar?.weekAnchor?.weekdayIndex ?? 0);
  const [showHistory, setShowHistory] = useState(false);

  const { handleProps, rowProps, dragIndex, dropIndicatorStyle } = useDragReorder(
    months,
    setMonths,
    !readOnly && months.length > 1
  );

  const addMonth = () => {
    setMonths((prev) => [...prev, { id: newId(), name: t("calendarEditorDialog.monthOrdinal", { n: prev.length + 1 }), days: 30 }]);
  };
  const updateMonth = (id: string, patch: Partial<CalendarMonth>) => {
    setMonths((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };
  // 刪掉月份後，錨點選的月份索引／日期也要跟著夾回新的範圍內，不然錨點可能指到刪除後已經不存在的
  // 月份索引，往後所有星期計算都會用到那個「幽靈月份」算錯——跟 setWeekLengthSafe 是同一類防呆
  const removeMonth = (id: string) => {
    const next = months.filter((m) => m.id !== id);
    const clampedAnchorMonthIndex = Math.min(anchorMonthIndex, Math.max(0, next.length - 1));
    setMonths(next);
    setAnchorMonthIndex(clampedAnchorMonthIndex);
    setAnchorDay((d) => Math.min(d, next[clampedAnchorMonthIndex]?.days ?? 1));
  };

  // 一週幾天改變時，天數名稱／週末勾選／錨點對應星期都要跟著夾回新的範圍內，不然會殘留舊長度
  // 才有的索引（例如原本 10 天一週勾了第 9 天當週末，改成 7 天一週後那個索引就不存在了）
  const setWeekLengthSafe = (raw: number) => {
    const clamped = Math.max(1, raw);
    setWeekLength(clamped);
    setWeekdayNames((prev) => Array.from({ length: clamped }, (_, i) => prev[i] ?? t("calendarEditorDialog.dayOrdinal", { n: i + 1 })));
    setWeekendDayIndices((prev) => prev.filter((i) => i < clamped));
    setAnchorWeekdayIndex((prev) => Math.min(prev, clamped - 1));
  };
  const toggleWeekend = (i: number) => {
    setWeekendDayIndices((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)));
  };
  const anchorMonth = months[anchorMonthIndex] as CalendarMonth | undefined;

  const canSubmit = name.trim().length > 0 && months.length > 0 && months.every((m) => m.days >= 1);

  const weekSettingsPayload = (): CalendarWeekSettingsInput =>
    weekEnabled
      ? {
          weekLength,
          weekdayNames,
          weekendDayIndices,
          weekAnchor: { year: anchorYear, monthIndex: anchorMonthIndex, day: anchorDay, weekdayIndex: anchorWeekdayIndex },
        }
      : { weekLength: undefined, weekdayNames: undefined, weekendDayIndices: undefined, weekAnchor: undefined };

  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的送出按鈕；readOnly／一般模式各自對應
  // 下面兩顆不同的按鈕，兩者互斥（同一時間只會有一個 enabled），不會同時觸發兩邊
  useSaveShortcut(() => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), scope, months, ...weekSettingsPayload() });
  }, !readOnly);
  useSaveShortcut(() => onSubmitWeekSettings?.(weekSettingsPayload()), !!readOnly && !!onSubmitWeekSettings);

  const weekSection = (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: weekEnabled ? 10 : 0 }}>
        <input type="checkbox" checked={weekEnabled} onChange={(e) => setWeekEnabled(e.target.checked)} />
        {t("calendarEditorDialog.enableWeekCheckbox")}
      </label>
      {weekEnabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            {t("calendarEditorDialog.daysPerWeekLabel")}
            <input
              type="number"
              min={1}
              value={weekLength}
              onChange={(e) => setWeekLengthSafe(parseInt(e.target.value, 10) || 1)}
              style={{ width: 64 }}
            />
          </label>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>{t("calendarEditorDialog.dayNamesLabel")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {weekdayNames.map((wname, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    value={wname}
                    onChange={(e) => setWeekdayNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                    style={{ flex: 1 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={weekendDayIndices.includes(i)} onChange={() => toggleWeekend(i)} />
                    {t("calendarEditorDialog.weekendLabel")}
                  </label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 12, color: "var(--text-muted)" }}>
              {t("calendarEditorDialog.anchorHint")}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {t("dateValueEditor.yearLabel")}
                <input
                  type="number"
                  style={{ width: 90 }}
                  value={anchorYear}
                  onChange={(e) => setAnchorYear(parseInt(e.target.value, 10) || 0)}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {t("dateValueEditor.monthLabel")}
                <select
                  value={anchorMonthIndex}
                  onChange={(e) => {
                    const mi = parseInt(e.target.value, 10);
                    setAnchorMonthIndex(mi);
                    setAnchorDay((d) => Math.min(d, months[mi]?.days ?? 1));
                  }}
                >
                  {months.map((m, i) => (
                    <option key={m.id} value={i}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {t("dateValueEditor.dayLabel")}
                <input
                  type="number"
                  style={{ width: 70 }}
                  min={1}
                  max={anchorMonth?.days ?? 1}
                  value={anchorDay}
                  onChange={(e) =>
                    setAnchorDay(Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), anchorMonth?.days ?? 1))
                  }
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                {t("calendarEditorDialog.correspondingWeekdayLabel")}
                <select value={anchorWeekdayIndex} onChange={(e) => setAnchorWeekdayIndex(parseInt(e.target.value, 10))}>
                  {weekdayNames.map((wname, i) => (
                    <option key={i} value={i}>
                      {wname}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {readOnly && onSubmitWeekSettings && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button className="btn btn-primary" onClick={() => onSubmitWeekSettings(weekSettingsPayload())}>
                {t("calendarEditorDialog.saveWeekSettings")}
              </button>
            </div>
          )}
        </div>
      )}
      {readOnly && !weekEnabled && onSubmitWeekSettings && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button className="btn btn-primary" onClick={() => onSubmitWeekSettings(weekSettingsPayload())}>
            {t("calendarEditorDialog.saveWeekSettings")}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Modal title={readOnly ? t("calendarEditorDialog.viewTitle", { name: calendar?.name ?? "" }) : calendar ? t("calendarEditorDialog.editTitle") : t("calendarEditorDialog.newTitle")} onClose={onClose} width={480}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          autoFocus
          placeholder={t("calendarEditorDialog.namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
        />
        <label>
          {t("createFolderDialog.scopeLabel")}
          <select
            style={{ width: "100%", marginTop: 4 }}
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            disabled={readOnly}
          >
            <option value="world">{t("templateManagerPage.scopeSingleWorld")}</option>
            <option value="global">{t("managerFolder.globalScopeOption")}</option>
          </select>
        </label>
        <div>
          <div style={{ marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>
            {t("calendarEditorDialog.monthsHint")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {months.map((m, i) => (
              <div
                key={m.id}
                {...rowProps(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  opacity: dragIndex === i ? 0.5 : 1,
                  ...dropIndicatorStyle(i),
                }}
              >
                {!readOnly && (
                  <span {...handleProps(i)} style={{ cursor: "grab", color: "var(--text-faint)" }} title={t("common.dragToReorder")}>
                    ⠿
                  </span>
                )}
                <input
                  placeholder={t("calendarEditorDialog.monthNamePlaceholder")}
                  value={m.name}
                  onChange={(e) => updateMonth(m.id, { name: e.target.value })}
                  style={{ flex: 1 }}
                  disabled={readOnly}
                />
                <input
                  type="number"
                  min={1}
                  value={m.days}
                  onChange={(e) => updateMonth(m.id, { days: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                  style={{ width: 64 }}
                  title={t("calendarEditorDialog.daysInMonthTitle")}
                  disabled={readOnly}
                />
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{t("calendarEditorDialog.daysSuffix")}</span>
                {!readOnly && (
                  <button className="btn-ghost" onClick={() => removeMonth(m.id)} title={t("calendarEditorDialog.deleteMonthTitle")}>
                    🗑
                  </button>
                )}
              </div>
            ))}
          </div>
          {!readOnly && (
            <button className="btn" style={{ marginTop: 8 }} onClick={addMonth}>
              {t("calendarEditorDialog.addMonth")}
            </button>
          )}
        </div>
        {weekSection}
        <div style={{ display: "flex", justifyContent: calendar ? "space-between" : "flex-end", gap: 8 }}>
          {calendar && (
            <button className="btn" onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose}>
              {readOnly ? t("common.close") : t("common.cancel")}
            </button>
            {!readOnly && (
              <button
                className="btn btn-primary"
                disabled={!canSubmit}
                onClick={() => onSubmit({ name: name.trim(), scope, months, ...weekSettingsPayload() })}
              >
                {calendar ? t("common.save") : t("common.create")}
              </button>
            )}
          </div>
        </div>
      </div>
      {calendar && showHistory && <VersionHistoryDialog entityType="calendars" entityId={calendar.id} onClose={() => setShowHistory(false)} />}
    </Modal>
  );
}
