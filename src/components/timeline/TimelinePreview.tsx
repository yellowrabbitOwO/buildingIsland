import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { Timeline } from "../../data/types";
import { listBranches } from "../../data/repositories/timelineBranch";
import { eventDate, listEvents } from "../../data/repositories/timelineEvent";
import { eventPrimaryOrdinal } from "../../data/timelineEventOrdinals";
import { assignLanes } from "../../data/timelineLayout";
import { useLanguage } from "../../i18n";

/** 主世界首頁「★ 重點內容」用的唯讀縮圖，比照 StoryboardPreview：不掛整個可縮放畫布，
 * 每條分支（依車道分配順序，跟畫布本身的視覺分組一致）一行「{分支名}・{N} 個事件」，
 * 底下接最多 3 個依日期排序的事件名稱 */
export default function TimelinePreview({ timeline }: { timeline: Timeline }) {
  const { t } = useLanguage();
  const calendar = useLiveQuery(() => db.calendars.get(timeline.calendarId), [timeline.calendarId]);
  const branches = useLiveQuery(() => listBranches(timeline.id), [timeline.id]);
  const events = useLiveQuery(() => listEvents(timeline.id), [timeline.id]);
  if (!calendar || !branches || !events) return null;

  if (branches.length === 0) {
    return <p style={{ color: "var(--text-muted)", fontSize: 13 }}>{t("timelinePreview.noBranches")}</p>;
  }

  const lanes = assignLanes(branches);
  const sortedBranches = [...branches].sort((a, b) => (lanes.get(a.id) ?? 0) - (lanes.get(b.id) ?? 0));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sortedBranches.map((branch) => {
        const branchEvents = events
          .filter((e) => e.branchId === branch.id)
          .sort((a, b) => eventPrimaryOrdinal(calendar, eventDate(a)) - eventPrimaryOrdinal(calendar, eventDate(b)));
        return (
          <div key={branch.id} style={{ fontSize: 13 }}>
            <strong>{branch.name}</strong>
            <span style={{ color: "var(--text-faint)" }}> ・ {t("timeline.eventCount", { count: branchEvents.length })}</span>
            {branchEvents.length > 0 && (
              <p
                style={{
                  margin: "2px 0 0",
                  color: "var(--text-muted)",
                  fontSize: 12,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {branchEvents
                  .slice(0, 3)
                  .map((e) => e.name)
                  .join(t("entryLinkPicker.separator"))}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
