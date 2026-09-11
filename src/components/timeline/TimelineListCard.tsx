import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import type { Timeline, TimelineFolder } from "../../data/types";
import { deleteTimeline, duplicateTimeline, moveTimelinesToFolder, toggleTimelineStar } from "../../data/repositories/timeline";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface TimelineListCardProps {
  timeline: Timeline;
  worldId: string;
  folders?: TimelineFolder[];
  dragProps?: DragSourceProps;
}

export default function TimelineListCard({ timeline, worldId, folders, dragProps }: TimelineListCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const { t } = useLanguage();

  const branchCount = useLiveQuery(
    () => db.timelineBranches.where({ timelineId: timeline.id }).count(),
    [timeline.id]
  );

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("timeline.deleteConfirm.title"),
      message: t("entryCard.deleteConfirm.message", { name: timeline.name }),
    });
    if (ok) await deleteTimeline(timeline.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => navigate(`/world/${worldId}/timeline/${timeline.id}`)}
      {...dragProps}
    >
      {timeline.tagColor && (
        <ResolvedColor value={timeline.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{timeline.name}</strong>
          {timeline.ownerEntryId && (
            <span className="builtin-badge" style={{ marginLeft: 8 }}>
              {t("timelineListCard.characterTimelineBadge")}
            </span>
          )}
          {timeline.isAllCharactersTimeline && (
            <span className="builtin-badge" style={{ marginLeft: 8 }}>
              {t("timelineListCard.allCharactersBadge")}
            </span>
          )}
          {timeline.description && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {timeline.description}
            </p>
          )}
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, flexShrink: 0 }}>{t("timelineListCard.branchCount", { count: branchCount ?? 0 })}</span>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "timeline", timelineId: timeline.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("entryCard.star")}
          onClick={(e) => {
            e.stopPropagation();
            toggleTimelineStar(timeline.id);
          }}
          style={{ color: timeline.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {timeline.starred ? "★" : "☆"}
        </button>
        <button
          className="btn-ghost"
          title={t("entryCard.moveToFolder")}
          onClick={(e) => {
            e.stopPropagation();
            setShowMove(true);
          }}
        >
          📁
        </button>
        <button
          className="btn-ghost"
          title={t("common.duplicate")}
          onClick={(e) => {
            e.stopPropagation();
            duplicateTimeline(timeline.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("timeline.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!timeline.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveTimelinesToFolder([timeline.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={timeline.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveTimelinesToFolder([timeline.id], f.id);
                  setShowMove(false);
                }}
              >
                {f.name}
              </button>
            ))}
            {(folders ?? []).length === 0 && (
              <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("timelineListCard.noFoldersHint")}</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
