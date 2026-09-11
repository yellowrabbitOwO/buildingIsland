import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { WritingDoc, WritingFolder } from "../../data/types";
import { deleteWritingDoc, duplicateWritingDoc, moveWritingDocsToFolder, toggleWritingDocStar } from "../../data/repositories/writingDoc";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface WritingDocCardProps {
  doc: WritingDoc;
  worldId: string;
  folders?: WritingFolder[];
  dragProps?: DragSourceProps;
}

export default function WritingDocCard({ doc, worldId, folders, dragProps }: WritingDocCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("writingDocCard.deleteConfirm.title"),
      message: t("writingDocCard.deleteConfirm.message", { name: doc.name }),
    });
    if (ok) await deleteWritingDoc(doc.id);
  };

  return (
    <div
      className="card"
      style={{ overflow: "hidden", cursor: "pointer" }}
      onClick={() => navigate(`/world/${worldId}/writing/${doc.id}`)}
      {...dragProps}
    >
      {doc.tagColor && (
        <ResolvedColor value={doc.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{doc.name}</strong>
          {doc.description && (
            <p
              style={{
                margin: "4px 0 0",
                color: "var(--text-muted)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {doc.description}
            </p>
          )}
        </div>
        <span style={{ color: "var(--text-faint)", fontSize: 12, flexShrink: 0 }}>
          {doc.wordCount} {doc.targetWordCount ? `/ ${doc.targetWordCount} ` : ""}{t("writingDocCard.wordsUnit")}
        </span>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "writingDoc", docId: doc.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleWritingDocStar(doc.id);
          }}
          style={{ color: doc.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {doc.starred ? "★" : "☆"}
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
            duplicateWritingDoc(doc.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("writingDocCard.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!doc.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveWritingDocsToFolder([doc.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={doc.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveWritingDocsToFolder([doc.id], f.id);
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
