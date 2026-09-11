import { useState } from "react";
import { dateToOrdinal } from "../../data/calendarMath";
import { weekdayOf, weekdayName, isWeekend } from "../../data/calendarMath";
import { eventDate } from "../../data/repositories/timelineEvent";
import { recurringOccurrenceOrdinals } from "../../data/timelineEventOrdinals";
import type { Calendar, TimelineBranch, TimelineEvent } from "../../data/types";
import { useLanguage } from "../../i18n";

interface TimelineCalendarViewProps {
  calendar: Calendar;
  branches: TimelineBranch[];
  events: TimelineEvent[];
  branchById: Map<string, TimelineBranch>;
  defaultYear: number;
  defaultMonthIndex: number;
  onOpenEvent: (eventId: string) => void;
  onAddEventAt: (branchId: string, date: { year: number; monthIndex: number; day: number }) => void;
}

/** 月曆模式：合併顯示同一條時間線底下所有分支/世界線的事件（用色點區分是哪個分支），
 * 用曆法的星期設定（見 Calendar.weekLength）對齊格子——沒設定星期概念的曆法就退回單純
 * 逐日排列、不特別對齊星期幾，一樣能用，只是沒有星期標頭跟週末網底。點空白格新增事件
 * （固定新增到主線——沒有 parentBranchId 的那條分支，沒有主線才退回第一條），點事件圖示開啟編輯器，
 * 跟畫布模式共用同一份 openEventId／新增事件邏輯（由外層 TimelineViewPage 傳入 callback） */
export default function TimelineCalendarView({
  calendar,
  branches,
  events,
  branchById,
  defaultYear,
  defaultMonthIndex,
  onOpenEvent,
  onAddEventAt,
}: TimelineCalendarViewProps) {
  const { t } = useLanguage();
  const [year, setYear] = useState(defaultYear);
  const [monthIndex, setMonthIndex] = useState(Math.min(Math.max(0, defaultMonthIndex), calendar.months.length - 1));

  const monthCount = calendar.months.length;
  const month = calendar.months[monthIndex];
  const daysInMonth = month?.days ?? 1;
  const hasWeek = !!calendar.weekLength && calendar.weekLength > 0;
  const columns = hasWeek ? calendar.weekLength! : 7;

  const goPrevMonth = () => {
    if (monthIndex === 0) {
      setYear((y) => y - 1);
      setMonthIndex(monthCount - 1);
    } else {
      setMonthIndex((m) => m - 1);
    }
  };
  const goNextMonth = () => {
    if (monthIndex === monthCount - 1) {
      setYear((y) => y + 1);
      setMonthIndex(0);
    } else {
      setMonthIndex((m) => m + 1);
    }
  };

  const mainBranch = branches.find((b) => !b.parentBranchId) ?? branches[0];

  const firstDayOrdinal = dateToOrdinal(calendar, { year, monthIndex, day: 1 });
  const leadingOffset = hasWeek ? (weekdayOf(calendar, firstDayOrdinal) ?? 0) : 0;
  const totalCells = Math.ceil((leadingOffset + daysInMonth) / columns) * columns;

  const eventsOnDay = (day: number): TimelineEvent[] => {
    const dayOrdinal = Math.floor(dateToOrdinal(calendar, { year, monthIndex, day }));
    return events.filter((e) => {
      const d = eventDate(e);
      if (d.mode === "single") return Math.floor(dateToOrdinal(calendar, d)) === dayOrdinal;
      if (d.mode === "range") {
        const s = Math.floor(dateToOrdinal(calendar, d.start));
        const en = d.end ? Math.floor(dateToOrdinal(calendar, d.end)) : Infinity;
        return dayOrdinal >= s && dayOrdinal <= en;
      }
      return recurringOccurrenceOrdinals(calendar, d, year, year).some((o) => Math.floor(o) === dayOrdinal);
    });
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button className="btn-ghost" onClick={goPrevMonth} title={t("timelineCalendarView.prevMonthTitle")}>
          ◀
        </button>
        <input
          type="number"
          style={{ width: 90 }}
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10) || 0)}
        />
        <select value={monthIndex} onChange={(e) => setMonthIndex(parseInt(e.target.value, 10))}>
          {calendar.months.map((m, i) => (
            <option key={m.id} value={i}>
              {m.name}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={goNextMonth} title={t("timelineCalendarView.nextMonthTitle")}>
          ▶
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--text-faint)" }}>
          {branches.map((b) => (
            <span key={b.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: b.color ?? "var(--accent)" }} />
              {b.name}
            </span>
          ))}
        </div>
      </div>

      {hasWeek && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 4, marginBottom: 4 }}>
          {Array.from({ length: columns }, (_, i) => (
            <div
              key={i}
              style={{
                textAlign: "center",
                fontSize: 12,
                color: (calendar.weekendDayIndices ?? []).includes(i) ? "var(--danger)" : "var(--text-faint)",
              }}
            >
              {weekdayName(calendar, i, t)}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 4 }}>
        {Array.from({ length: totalCells }, (_, i) => {
          const day = i - leadingOffset + 1;
          if (day < 1 || day > daysInMonth) return <div key={i} />;
          const dayOrdinal = Math.floor(dateToOrdinal(calendar, { year, monthIndex, day }));
          const weekend = hasWeek && isWeekend(calendar, dayOrdinal);
          const dayEvents = eventsOnDay(day);
          return (
            <div
              key={i}
              onClick={() => mainBranch && onAddEventAt(mainBranch.id, { year, monthIndex, day })}
              style={{
                minHeight: 76,
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 4,
                cursor: mainBranch ? "pointer" : "default",
                background: weekend ? "var(--bg-alt)" : "transparent",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{day}</div>
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onOpenEvent(e.id);
                  }}
                  title={e.name}
                  style={{
                    fontSize: 11,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    background: "var(--bg)",
                    borderRadius: 3,
                    padding: "1px 4px",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: e.color ?? branchById.get(e.branchId)?.color ?? "var(--accent)",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
