import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Modal from "../common/Modal";
import { listTimelines } from "../../data/repositories/timeline";
import type { Timeline } from "../../data/types";
import { useLanguage } from "../../i18n";

/** 挑一條同世界底下的其他時間線，把它的事件整條複製匯入成目前時間線的一條新分支（見 importTimeline）。
 * 用途是讓「角色時間線總表（全部角色）」之類的時間線也能被拉進其他非角色時間線裡對照著看，
 * 不限於角色時間線——同世界任何時間線都能互相匯入 */
export default function ImportTimelineDialog({
  worldId,
  excludeTimelineId,
  onClose,
  onSelect,
}: {
  worldId: string;
  excludeTimelineId: string;
  onClose: () => void;
  onSelect: (timeline: Timeline) => void;
}) {
  const [query, setQuery] = useState("");
  const { t } = useLanguage();
  const timelines = useLiveQuery(() => listTimelines(worldId), [worldId]) ?? [];
  const options = timelines.filter((tl) => tl.id !== excludeTimelineId);
  const filtered = options.filter((tl) => tl.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Modal title={t("importTimelineDialog.title")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
          {t("importTimelineDialog.hint")}
        </p>
        <input placeholder={t("importTimelineDialog.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <div style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
          {options.length === 0 && <p style={{ margin: 0, color: "var(--text-faint)", fontSize: 13 }}>{t("importTimelineDialog.noOtherTimelines")}</p>}
          {options.length > 0 && filtered.length === 0 && (
            <p style={{ margin: 0, color: "var(--text-faint)", fontSize: 13 }}>{t("importTimelineDialog.noMatch")}</p>
          )}
          {filtered.map((tl) => (
            <button
              key={tl.id}
              className="btn-ghost"
              style={{ textAlign: "left", justifyContent: "flex-start", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }}
              onClick={() => onSelect(tl)}
            >
              <span>
                {tl.name}
                {tl.isAllCharactersTimeline && " 👥"}
              </span>
              {tl.description && <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{tl.description}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
