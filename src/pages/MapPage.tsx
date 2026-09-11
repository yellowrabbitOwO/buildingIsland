import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createMap, listMaps, moveMapsToFolder } from "../data/repositories/map";
import { createMapFolder, deleteMapFolder } from "../data/repositories/mapFolder";
import MapCard from "../components/map/MapCard";
import MapCreateDialog from "../components/map/MapCreateDialog";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 地圖目錄：列出這個世界所有已儲存的地圖，可分資料夾、標星號；
 * 點擊卡片進入該張地圖的畫布頁（MapViewPage） */
export default function MapPage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((mapId, folderId) => moveMapsToFolder([mapId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewMap, setShowNewMap] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.mapFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const maps = useLiveQuery(() => listMaps(world.id), [world.id]);

  if (!folders || !maps) return null;

  const unfiled = maps.filter((m) => !m.folderId);
  const byFolder = (fid: string) => maps.filter((m) => m.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateMap = async (input: { name: string; description?: string; tagColor?: string; width: number; height: number }) => {
    const map = await createMap(world.id, { ...input, folderId: activeFolderId });
    setShowNewMap(false);
    navigate(`/world/${world.id}/map/${map.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("mapPage.deleteFolderConfirm.title"),
      message: t("mapPage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteMapFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("mapPage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("mapPage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewMap(true);
            }}
          >
            {t("mapPage.addMap")}
          </button>
        </div>
      </div>

      {folders.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {folders.map((folder) => {
            const items = byFolder(folder.id);
            const collapsed = collapsedFolderIds.has(folder.id);
            return (
              <div key={folder.id}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 8,
                    borderRadius: 6,
                    ...dragMove.folderHighlightStyle(folder.id),
                  }}
                  {...dragMove.folderDropProps(folder.id)}
                >
                  <button className="btn-ghost" style={{ padding: 0 }} onClick={() => toggleFolderCollapsed(folder.id)}>
                    {collapsed ? "▸" : "▾"}
                  </button>
                  <ResolvedColor value={folder.tagColor}>
                    {(hex) => <span className="tag-dot" style={{ background: hex ?? "var(--accent)" }} />}
                  </ResolvedColor>
                  <strong>{folder.name}</strong>
                  <span style={{ color: "var(--text-faint)", fontSize: 12 }}>{t("categoryPage.itemCount", { count: items.length })}</span>
                  {folder.description && (
                    <span style={{ color: "var(--text-muted)", fontSize: 12 }}>— {folder.description}</span>
                  )}
                  <button
                    className="btn-ghost"
                    style={{ marginLeft: "auto" }}
                    onClick={() => {
                      setActiveFolderId(folder.id);
                      setShowNewMap(true);
                    }}
                  >
                    {t("mapPage.addToFolder")}
                  </button>
                  <button className="btn-ghost" onClick={() => handleDeleteFolder(folder.id, folder.name)}>
                    {t("common.delete")}
                  </button>
                </div>
                {!collapsed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18 }}>
                    {items.map((map) => (
                      <MapCard key={map.id} map={map} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(map.id)} />
                    ))}
                    {items.length === 0 && <p style={{ color: "var(--text-faint)", fontSize: 13 }}>{t("categoryPage.folderEmpty")}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 8, borderRadius: 6, ...dragMove.folderHighlightStyle(undefined) }}
        {...dragMove.folderDropProps(undefined)}
      >
        {unfiled.map((map) => (
          <MapCard key={map.id} map={map} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(map.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("mapPage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createMapFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewMap && <MapCreateDialog worldId={world.id} onClose={() => setShowNewMap(false)} onSubmit={handleCreateMap} />}
    </div>
  );
}
