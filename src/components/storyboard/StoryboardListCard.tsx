import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { Storyboard, StoryboardFolder } from "../../data/types";
import { deleteStoryboard, duplicateStoryboard, moveStoryboardsToFolder, toggleStoryboardStar } from "../../data/repositories/storyboard";
import { listCards } from "../../data/repositories/storyboardCard";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface StoryboardListCardProps {
  board: Storyboard;
  worldId: string;
  folders?: StoryboardFolder[];
  dragProps?: DragSourceProps;
}

export default function StoryboardListCard({ board, worldId, folders, dragProps }: StoryboardListCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const cardCount = useLiveQuery(() => listCards(board.id), [board.id])?.length ?? 0;
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("storyboardListCard.deleteConfirm.title"),
      message: t("storyboardListCard.deleteConfirm.message", { name: board.name }),
    });
    if (ok) await deleteStoryboard(board.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => navigate(`/world/${worldId}/storyboard/${board.id}`)}
      {...dragProps}
    >
      {board.tagColor && (
        <ResolvedColor value={board.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{board.name}</strong>
          {board.description && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {board.description}
            </p>
          )}
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, flexShrink: 0 }}>{t("storyboardListCard.cardCount", { count: cardCount })}</span>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "storyboard", storyboardId: board.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleStoryboardStar(board.id);
          }}
          style={{ color: board.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {board.starred ? "★" : "☆"}
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
            duplicateStoryboard(board.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("storyboardListCard.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!board.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveStoryboardsToFolder([board.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={board.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveStoryboardsToFolder([board.id], f.id);
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
