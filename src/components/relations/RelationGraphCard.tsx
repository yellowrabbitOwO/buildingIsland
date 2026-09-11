import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { RelationGraphFolder, RelationGraphView } from "../../data/types";
import {
  deleteRelationGraph,
  duplicateRelationGraph,
  moveRelationGraphsToFolder,
  toggleRelationGraphStar,
  updateRelationGraphMeta,
} from "../../data/repositories/relationGraph";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import NewFolderDialog from "../entries/NewFolderDialog";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface RelationGraphCardProps {
  view: RelationGraphView;
  worldId: string;
  folders?: RelationGraphFolder[];
  dragProps?: DragSourceProps;
}

export default function RelationGraphCard({ view, worldId, folders, dragProps }: RelationGraphCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("relationGraphViewPage.deleteGraphConfirm.title"),
      message: t("relationGraphViewPage.deleteGraphConfirm.message", { name: view.name }),
    });
    if (ok) await deleteRelationGraph(view.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => navigate(`/world/${worldId}/relations/${view.id}`)}
      {...dragProps}
    >
      {view.tagColor && (
        <ResolvedColor value={view.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{view.name}</strong>
          {view.description && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {view.description}
            </p>
          )}
        </div>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "relationGraph", graphId: view.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleRelationGraphStar(view.id);
          }}
          style={{ color: view.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {view.starred ? "★" : "☆"}
        </button>
        <button
          className="btn-ghost"
          title={t("common.edit")}
          onClick={(e) => {
            e.stopPropagation();
            setShowEdit(true);
          }}
        >
          ✎
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
            duplicateRelationGraph(view.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("relationGraphViewPage.deleteGraphConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!view.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveRelationGraphsToFolder([view.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={view.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveRelationGraphsToFolder([view.id], f.id);
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
      {showEdit && (
        <div onClick={(e) => e.stopPropagation()}>
          <NewFolderDialog
            worldId={worldId}
            title={t("relationGraphPage.editGraphTitle")}
            nameLabel={t("common.nameLabel")}
            submitLabel={t("common.save")}
            initial={{ name: view.name, description: view.description, tagColor: view.tagColor }}
            onClose={() => setShowEdit(false)}
            onSubmit={async (input) => {
              await updateRelationGraphMeta(view.id, input);
              setShowEdit(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
