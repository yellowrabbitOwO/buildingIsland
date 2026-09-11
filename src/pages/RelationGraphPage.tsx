import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createRelationGraph, listRelationGraphs, moveRelationGraphsToFolder } from "../data/repositories/relationGraph";
import { createRelationGraphFolder, deleteRelationGraphFolder } from "../data/repositories/relationGraphFolder";
import RelationGraphCard from "../components/relations/RelationGraphCard";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 關係圖目錄：列出這個世界所有已儲存的關係圖，可分資料夾、標星號；
 * 點擊卡片進入該張圖的畫布頁（RelationGraphViewPage） */
export default function RelationGraphPage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((viewId, folderId) => moveRelationGraphsToFolder([viewId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewGraph, setShowNewGraph] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.relationGraphFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const graphs = useLiveQuery(() => listRelationGraphs(world.id), [world.id]);

  if (!folders || !graphs) return null;

  const unfiled = graphs.filter((g) => !g.folderId);
  const byFolder = (fid: string) => graphs.filter((g) => g.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateGraph = async (input: { name: string; description?: string; tagColor?: string }) => {
    const view = await createRelationGraph(world.id, { ...input, folderId: activeFolderId });
    setShowNewGraph(false);
    navigate(`/world/${world.id}/relations/${view.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("relationGraphPage.deleteFolderConfirm.title"),
      message: t("relationGraphPage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteRelationGraphFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("relationGraphPage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("mapPage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewGraph(true);
            }}
          >
            {t("relationGraphPage.addGraph")}
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
                      setShowNewGraph(true);
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
                    {items.map((view) => (
                      <RelationGraphCard key={view.id} view={view} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(view.id)} />
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
        {unfiled.map((view) => (
          <RelationGraphCard key={view.id} view={view} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(view.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("relationGraphPage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createRelationGraphFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewGraph && (
        <NewFolderDialog
          worldId={world.id}
          title={t("relationGraphPage.newGraphTitle")}
          nameLabel={t("common.nameLabel")}
          submitLabel={t("common.create")}
          defaultTagColor={null}
          onClose={() => setShowNewGraph(false)}
          onSubmit={handleCreateGraph}
        />
      )}
    </div>
  );
}
