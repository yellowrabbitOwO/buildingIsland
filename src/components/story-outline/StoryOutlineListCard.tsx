import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import type { StoryOutline, StoryOutlineFolder } from "../../data/types";
import { deleteStoryOutline, duplicateStoryOutline, moveStoryOutlinesToFolder, toggleStoryOutlineStar } from "../../data/repositories/storyOutline";
import { listChapters } from "../../data/repositories/storyChapter";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface StoryOutlineListCardProps {
  outline: StoryOutline;
  worldId: string;
  folders?: StoryOutlineFolder[];
  dragProps?: DragSourceProps;
}

export default function StoryOutlineListCard({ outline, worldId, folders, dragProps }: StoryOutlineListCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const chapterCount = useLiveQuery(() => listChapters(outline.id), [outline.id])?.length ?? 0;
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("storyOutlineListCard.deleteConfirm.title"),
      message: t("storyOutlineListCard.deleteConfirm.message", { name: outline.name }),
    });
    if (ok) await deleteStoryOutline(outline.id);
  };

  return (
    <div className="card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => navigate(`/world/${worldId}/outline/${outline.id}`)} {...dragProps}>
      {outline.tagColor && (
        <ResolvedColor value={outline.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{outline.name}</strong>
          {outline.description && (
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {outline.description}
            </p>
          )}
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, flexShrink: 0 }}>{t("storyOutlineListCard.chapterCount", { count: chapterCount })}</span>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "storyOutline", outlineId: outline.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleStoryOutlineStar(outline.id);
          }}
          style={{ color: outline.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {outline.starred ? "★" : "☆"}
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
            duplicateStoryOutline(outline.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("storyOutlineListCard.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!outline.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveStoryOutlinesToFolder([outline.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={outline.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveStoryOutlinesToFolder([outline.id], f.id);
                  setShowMove(false);
                }}
              >
                {f.name}
              </button>
            ))}
            {(folders ?? []).length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("timelineListCard.noFoldersHint")}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
