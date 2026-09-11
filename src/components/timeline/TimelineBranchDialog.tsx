import { useState } from "react";
import Modal from "../common/Modal";
import ColorInput from "../common/ColorInput";
import { PALETTE } from "../common/GraphPrimitives";
import VersionHistoryDialog from "../common/VersionHistoryDialog";
import { useSaveShortcut } from "../../data/useSaveShortcut";
import type { Calendar, TimelineBranch } from "../../data/types";
import { useLanguage } from "../../i18n";

interface TimelineBranchDialogProps {
  worldId: string;
  calendar: Calendar;
  branches: TimelineBranch[];
  /** 提供時為編輯模式（僅能改名稱／顏色／結束日期，不能改父分支跟起始日期——起始日期決定了車道的
   * 分岔／起點位置，事後改動語意複雜，V1 先不開放，要換起始日期的話刪掉重建） */
  branch?: TimelineBranch;
  /** 新增模式必填：fork＝從既有分支分岔（父分支下拉＋起始日期，必填）；independent＝獨立並存的新
   * 世界線（起始日期選填，不填就跟主線一樣從可視範圍最左端開始）。改由呼叫端用兩顆分開的按鈕決定，
   * 不再是同一個表單裡的單選切換——「新增時間線」是獨立入口，不該讓使用者先點進「新增分支」才發現
   * 裡面還有一個切換選項。編輯模式下不使用（起始日期鎖定不可改） */
  variant?: "fork" | "independent";
  /** 新增模式下起始日期輸入框的預設年份（例如時間線目前的可視範圍起點），單純省去使用者手動輸入 */
  defaultDivergeYear?: number;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    color?: string;
    parentBranchId?: string;
    divergeYear?: number;
    divergeMonthIndex?: number;
    divergeDay?: number;
    endYear?: number;
    endMonthIndex?: number;
    endDay?: number;
  }) => void;
}

/** 一組「年／月／日」輸入框，起始日期與結束日期共用同一個排版——月份下拉切換時連動夾住日期，
 * 不讓日期停留在新月份不存在的天數上 */
function DateInputRow({
  calendar,
  year,
  monthIndex,
  day,
  onChange,
}: {
  calendar: Calendar;
  year: number;
  monthIndex: number;
  day: number;
  onChange: (date: { year: number; monthIndex: number; day: number }) => void;
}) {
  const month = calendar.months[monthIndex] as (typeof calendar.months)[number] | undefined;
  const { t } = useLanguage();
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {t("dateValueEditor.yearLabel")}
        <input
          type="number"
          style={{ width: 100 }}
          value={year}
          onChange={(e) => onChange({ year: parseInt(e.target.value, 10) || 0, monthIndex, day })}
        />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {t("dateValueEditor.monthLabel")}
        <select
          value={monthIndex}
          onChange={(e) => {
            const newMonthIndex = parseInt(e.target.value, 10);
            const maxDays = calendar.months[newMonthIndex]?.days ?? 1;
            onChange({ year, monthIndex: newMonthIndex, day: Math.min(day, maxDays) });
          }}
        >
          {calendar.months.map((m, i) => (
            <option key={m.id} value={i}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {t("dateValueEditor.dayLabel")}
        <input
          type="number"
          style={{ width: 80 }}
          min={1}
          max={month?.days ?? 1}
          value={day}
          onChange={(e) => {
            const maxDays = month?.days ?? 1;
            onChange({ year, monthIndex, day: Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), maxDays) });
          }}
        />
      </label>
    </div>
  );
}

/** 新增/編輯分支或世界線：名稱、顏色，新增時依 variant 決定是「從既有分支分岔」（父分支下拉＋
 * 起始日期，必填，比照事件編輯器的日期選擇器，依所選曆法的月份限制天數範圍）還是「獨立並存的新
 * 世界線」（起始日期選填，不填就跟主線一樣從可視範圍最左端開始）。起始日期直接輸入日期而非挑選
 * 既有事件，讓分支不依賴父分支已經有事件——父分支即使還沒有任何事件，也能先決定「從什麼時候開始
 * 分岔」。另外可選填結束日期，設定後車道的線只會畫到那個日期就停住，不會一路無限延伸下去——用於
 * 「舊時代到此結束、新世界線接續新時代」這種需要明確劃出起訖範圍的情境；結束日期在編輯模式下也能改，
 * 起始日期則跟父分支一樣鎖定不可改 */
export default function TimelineBranchDialog({
  worldId,
  calendar,
  branches,
  branch,
  variant = "fork",
  defaultDivergeYear,
  onClose,
  onSubmit,
}: TimelineBranchDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(branch?.name ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const [color, setColor] = useState<string | undefined>(branch?.color);
  const independent = !branch && variant === "independent";
  const [parentBranchId, setParentBranchId] = useState(branch?.parentBranchId ?? branches[0]?.id ?? "");

  // 起始日期：fork 一定要填；independent 選填（勾選才顯示/送出），編輯模式下兩者都鎖定不可改
  const [hasCustomStart, setHasCustomStart] = useState(!independent && branch?.divergeYear !== undefined);
  const [divergeYear, setDivergeYear] = useState(branch?.divergeYear ?? defaultDivergeYear ?? 0);
  const [divergeMonthIndex, setDivergeMonthIndex] = useState(branch?.divergeMonthIndex ?? 0);
  const [divergeDay, setDivergeDay] = useState(branch?.divergeDay ?? 1);
  const showStartInputs = !branch && (!independent || hasCustomStart);

  // 結束日期：任何分支/世界線都能選填，新增/編輯模式都能設定
  const [hasEnd, setHasEnd] = useState(branch?.endYear !== undefined);
  const [endYear, setEndYear] = useState(branch?.endYear ?? defaultDivergeYear ?? 0);
  const [endMonthIndex, setEndMonthIndex] = useState(branch?.endMonthIndex ?? 0);
  const [endDay, setEndDay] = useState(branch?.endDay ?? 1);

  const canSubmit = name.trim().length > 0 && (independent || parentBranchId.length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      name: name.trim(),
      color,
      ...(independent ? {} : { parentBranchId }),
      ...(showStartInputs ? { divergeYear, divergeMonthIndex, divergeDay } : {}),
      ...(hasEnd ? { endYear, endMonthIndex, endDay } : {}),
    });
  };
  // Ctrl/Cmd+S：對話框開著時直接送出，行為等同按下方的「儲存／建立」按鈕
  useSaveShortcut(handleSubmit, true);

  const title = branch ? t("timelineBranchDialog.editTitle") : independent ? t("newTimelineDialog.title") : t("timelineBranchDialog.newBranchTitle");

  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {t("common.nameLabel")}
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <ColorInput
          label={t("timelineBranchDialog.colorLabel")}
          value={color}
          onChange={(c) => setColor(c || undefined)}
          allowClear
          worldId={worldId}
          fallbackColor={PALETTE[0]}
          fallbackLabel={t("timelineBranchDialog.defaultColorLabel")}
        />
        {!branch && !independent && (
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {t("timelineBranchDialog.parentBranchLabel")}
            <select value={parentBranchId} onChange={(e) => setParentBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {!branch && independent && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={hasCustomStart} onChange={(e) => setHasCustomStart(e.target.checked)} />
            {t("timelineBranchDialog.customStartCheckbox")}
          </label>
        )}
        {showStartInputs && (
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: "var(--text-muted)" }}>
              {independent ? t("timelineBranchDialog.independentStartLabel") : t("timelineBranchDialog.forkStartLabel")}
            </div>
            <DateInputRow
              calendar={calendar}
              year={divergeYear}
              monthIndex={divergeMonthIndex}
              day={divergeDay}
              onChange={(d) => {
                setDivergeYear(d.year);
                setDivergeMonthIndex(d.monthIndex);
                setDivergeDay(d.day);
              }}
            />
          </div>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={hasEnd} onChange={(e) => setHasEnd(e.target.checked)} />
          {t("timelineBranchDialog.endDateCheckbox")}
        </label>
        {hasEnd && (
          <DateInputRow
            calendar={calendar}
            year={endYear}
            monthIndex={endMonthIndex}
            day={endDay}
            onChange={(d) => {
              setEndYear(d.year);
              setEndMonthIndex(d.monthIndex);
              setEndDay(d.day);
            }}
          />
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {branch && (
            <button className="btn" style={{ marginRight: "auto" }} onClick={() => setShowHistory(true)}>
              {t("common.versionHistory")}
            </button>
          )}
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" disabled={!canSubmit} onClick={handleSubmit}>
            {branch ? t("common.save") : t("common.create")}
          </button>
        </div>
      </div>
      {branch && showHistory && (
        <VersionHistoryDialog entityType="timelineBranches" entityId={branch.id} onClose={() => setShowHistory(false)} />
      )}
    </Modal>
  );
}
