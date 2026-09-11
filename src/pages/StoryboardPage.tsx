import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import type { World } from "../data/types";
import { createStoryboard, listStoryboards, moveStoryboardsToFolder } from "../data/repositories/storyboard";
import { createStoryboardFolder, deleteStoryboardFolder } from "../data/repositories/storyboardFolder";
import StoryboardListCard from "../components/storyboard/StoryboardListCard";
import NewFolderDialog from "../components/entries/NewFolderDialog";
import { useConfirm } from "../components/common/ConfirmProvider";
import ResolvedColor from "../components/common/ResolvedColor";
import { useLanguage } from "../i18n";
import { useDragToFolder } from "../data/reorder";

/** 故事板目錄：列出這個世界所有已儲存的故事板，可分資料夾、標星號；
 * 點擊卡片進入該塊板的編輯頁（StoryboardViewPage） */
export default function StoryboardPage() {
  const { world } = useOutletContext<{ world: World }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();
  const dragMove = useDragToFolder((boardId, folderId) => moveStoryboardsToFolder([boardId], folderId));

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewBoard, setShowNewBoard] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>(undefined);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set());

  const folders = useLiveQuery(() => db.storyboardFolders.where({ worldId: world.id }).toArray(), [world.id]);
  const boards = useLiveQuery(() => listStoryboards(world.id), [world.id]);

  if (!folders || !boards) return null;

  const unfiled = boards.filter((b) => !b.folderId);
  const byFolder = (fid: string) => boards.filter((b) => b.folderId === fid);

  const toggleFolderCollapsed = (folderId: string) => {
    setCollapsedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const handleCreateBoard = async (input: { name: string; description?: string; tagColor?: string }) => {
    const board = await createStoryboard(world.id, { ...input, folderId: activeFolderId }, t);
    setShowNewBoard(false);
    navigate(`/world/${world.id}/storyboard/${board.id}`);
  };

  const handleDeleteFolder = async (folderId: string, folderName: string) => {
    const ok = await confirm({
      title: t("storyboardPage.deleteFolderConfirm.title"),
      message: t("storyboardPage.deleteFolderConfirm.message", { name: folderName }),
    });
    if (!ok) return;
    await deleteStoryboardFolder(folderId);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2>{t("storyboardPage.title")}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowNewFolder(true)}>
            {t("mapPage.addFolder")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setActiveFolderId(undefined);
              setShowNewBoard(true);
            }}
          >
            {t("storyboardPage.addBoard")}
          </button>
        </div>
      </div>
      <p style={{ color: "var(--text-faint)", fontSize: 13, marginBottom: 16 }}>
        {t("storyboardPage.description")}
      </p>

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
                      setShowNewBoard(true);
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
                    {items.map((board) => (
                      <StoryboardListCard key={board.id} board={board} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(board.id)} />
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
        {unfiled.map((board) => (
          <StoryboardListCard key={board.id} board={board} worldId={world.id} folders={folders} dragProps={dragMove.itemDragProps(board.id)} />
        ))}
        {unfiled.length === 0 && folders.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>{t("storyboardPage.emptyState")}</p>
        )}
      </div>

      {showNewFolder && (
        <NewFolderDialog
          worldId={world.id}
          onClose={() => setShowNewFolder(false)}
          onSubmit={async (input) => {
            await createStoryboardFolder(world.id, input.name, input.description, input.tagColor);
            setShowNewFolder(false);
          }}
        />
      )}
      {showNewBoard && (
        <NewFolderDialog
          worldId={world.id}
          title={t("storyboardPage.newBoardTitle")}
          nameLabel={t("common.nameLabel")}
          submitLabel={t("common.create")}
          defaultTagColor={null}
          onClose={() => setShowNewBoard(false)}
          onSubmit={handleCreateBoard}
        />
      )}
    </div>
  );
}
