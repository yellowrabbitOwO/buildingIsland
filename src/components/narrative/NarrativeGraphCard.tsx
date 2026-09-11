import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { NarrativeGraph, NarrativeGraphFolder } from "../../data/types";
import { deleteNarrativeGraph, duplicateNarrativeGraph, moveNarrativeGraphsToFolder, toggleNarrativeGraphStar } from "../../data/repositories/narrativeGraph";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface NarrativeGraphCardProps {
  graph: NarrativeGraph;
  worldId: string;
  folders?: NarrativeGraphFolder[];
  dragProps?: DragSourceProps;
}

export default function NarrativeGraphCard({ graph, worldId, folders, dragProps }: NarrativeGraphCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("narrativeGraphCard.deleteConfirm.title"),
      message: t("narrativeGraphCard.deleteConfirm.message", { name: graph.name }),
    });
    if (ok) await deleteNarrativeGraph(graph.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => navigate(`/world/${worldId}/narrative/${graph.id}`)}
      {...dragProps}
    >
      {graph.tagColor && (
        <ResolvedColor value={graph.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{graph.name}</strong>
          {graph.description && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {graph.description}
            </p>
          )}
        </div>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "narrativeGraph", graphId: graph.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleNarrativeGraphStar(graph.id);
          }}
          style={{ color: graph.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {graph.starred ? "★" : "☆"}
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
            duplicateNarrativeGraph(graph.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("narrativeGraphCard.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!graph.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveNarrativeGraphsToFolder([graph.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={graph.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveNarrativeGraphsToFolder([graph.id], f.id);
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
