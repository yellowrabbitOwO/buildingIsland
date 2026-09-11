import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MapFolder, MapView } from "../../data/types";
import { deleteMap, duplicateMap, moveMapsToFolder, toggleMapStar, updateMapMeta } from "../../data/repositories/map";
import { useConfirm } from "../common/ConfirmProvider";
import { useSidePanel } from "../common/SidePanelProvider";
import ResolvedColor from "../common/ResolvedColor";
import Modal from "../common/Modal";
import NewFolderDialog from "../entries/NewFolderDialog";
import { useLanguage } from "../../i18n";
import type { DragSourceProps } from "../../data/reorder";

interface MapCardProps {
  map: MapView;
  worldId: string;
  folders?: MapFolder[];
  dragProps?: DragSourceProps;
}

export default function MapCard({ map, worldId, folders, dragProps }: MapCardProps) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { openPanel } = useSidePanel();
  const [showMove, setShowMove] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const { t } = useLanguage();

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: t("mapCard.deleteConfirm.title"),
      message: t("mapCard.deleteConfirm.message", { name: map.name }),
    });
    if (ok) await deleteMap(map.id);
  };

  return (
    <div className="card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => navigate(`/world/${worldId}/map/${map.id}`)} {...dragProps}>
      {map.tagColor && (
        <ResolvedColor value={map.tagColor}>{(hex) => <div style={{ height: 5, background: hex }} />}</ResolvedColor>
      )}
      <div style={{ padding: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{map.name}</strong>
          {map.description && (
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {map.description}
            </p>
          )}
        </div>
        <button
          className="btn-ghost"
          title={t("sidebar.openBeside")}
          onClick={(e) => {
            e.stopPropagation();
            openPanel({ kind: "map", mapId: map.id });
          }}
        >
          ⇲
        </button>
        <button
          className="btn-ghost"
          title={t("mapViewPage.starToggleTitle")}
          onClick={(e) => {
            e.stopPropagation();
            toggleMapStar(map.id);
          }}
          style={{ color: map.starred ? "var(--accent)" : "var(--text-faint)", fontSize: 16 }}
        >
          {map.starred ? "★" : "☆"}
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
            duplicateMap(map.id, undefined, t);
          }}
        >
          ⧉
        </button>
        <button className="btn-ghost" title={t("mapCard.deleteConfirm.title")} onClick={handleDelete}>
          🗑
        </button>
      </div>
      {showMove && (
        <Modal title={t("entryCard.moveToFolder")} onClose={() => setShowMove(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }} onClick={(e) => e.stopPropagation()}>
            <button
              className={!map.folderId ? "btn btn-primary" : "btn"}
              onClick={async () => {
                await moveMapsToFolder([map.id], undefined);
                setShowMove(false);
              }}
            >
              {t("entryCard.unfiled")}
            </button>
            {(folders ?? []).map((f) => (
              <button
                key={f.id}
                className={map.folderId === f.id ? "btn btn-primary" : "btn"}
                onClick={async () => {
                  await moveMapsToFolder([map.id], f.id);
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
      {showEdit && (
        <div onClick={(e) => e.stopPropagation()}>
          <NewFolderDialog
            worldId={worldId}
            title={t("mapCard.editMapTitle")}
            nameLabel={t("common.nameLabel")}
            submitLabel={t("common.save")}
            initial={{ name: map.name, description: map.description, tagColor: map.tagColor }}
            onClose={() => setShowEdit(false)}
            onSubmit={async (input) => {
              await updateMapMeta(map.id, input);
              setShowEdit(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
